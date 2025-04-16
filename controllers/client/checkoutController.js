// controllers/client/checkoutController.js
const Order = require('../../models/Order');
const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const PaymentMethod = require('../../models/PaymentMethod');
const ShippingMethod = require('../../models/ShippingMethod');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');
const shippingService = require('../../services/shippingService');
const mongoose = require('mongoose');

// THÊM IMPORT CHO THÔNG BÁO
const Notification = require('../../models/Notification');
const socketManager = require('../../utils/socketManager');

// Lấy phương thức vận chuyển khả dụng
exports.getShippingMethods = async (req, res, next) => {
  try {
    const shippingMethods = await ShippingMethod.find({ isActive: true })
      .select('code name description baseFee freeShippingThreshold estimatedDeliveryDays')
      .sort({ position: 1 });
    return ApiResponse.success(res, 200, shippingMethods, 'Lấy danh sách phương thức vận chuyển thành công');
  } catch (error) {
    next(error);
  }
};

// Lấy phương thức thanh toán khả dụng
exports.getPaymentMethods = async (req, res, next) => {
  try {
    const paymentMethods = await PaymentMethod.find({ isActive: true })
      .select('code name description icon position')
      .sort({ position: 1 });
    return ApiResponse.success(res, 200, paymentMethods, 'Lấy danh sách phương thức thanh toán thành công');
  } catch (error) {
    next(error);
  }
};

// Tính phí vận chuyển
exports.calculateShippingFee = async (req, res, next) => {
  try {
    const { shippingMethodCode, regionCode } = req.body;
    if (!shippingMethodCode) {
      throw new ApiError(400, 'Vui lòng chọn phương thức vận chuyển');
    }
    const cart = await Cart.findOne({ user: req.user.id })
      .populate({
        path: 'items.product',
        select: 'name price stock mainImage status'
      });
    if (!cart || !cart.items || cart.items.length === 0) {
      throw new ApiError(400, 'Giỏ hàng trống');
    }
    const orderTotal = cart.subtotal;
    let finalRegionCode = regionCode;
    if (!finalRegionCode && req.body.city) {
      finalRegionCode = shippingService.getRegionCodeFromCity(req.body.city);
    }
    const shippingFee = await shippingService.calculateShippingFee(
      shippingMethodCode,
      finalRegionCode,
      orderTotal
    );
    const deliveryEstimate = await shippingService.estimateDeliveryTime(
      shippingMethodCode,
      finalRegionCode
    );
    return ApiResponse.success(res, 200, {
      shippingFee,
      deliveryEstimate
    }, 'Tính phí vận chuyển thành công');
  } catch (error) {
    next(error);
  }
};

// Hàm tạo mã đơn hàng
const generateOrderCode = () => {
  const date = new Date();
  const year = date.getFullYear().toString().substr(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000).toString();
  return `DH${year}${month}${day}${random}`;
};

// Xử lý checkout và tạo đơn hàng
exports.processCheckout = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      shippingAddress,
      paymentMethod,
      shippingMethod,
      notes
    } = req.body;

    if (!shippingAddress || !paymentMethod) {
      throw new ApiError(400, 'Vui lòng cung cấp đầy đủ thông tin');
    }

    if (!shippingAddress.fullName || !shippingAddress.phone ||
      !shippingAddress.street || !shippingAddress.ward ||
      !shippingAddress.district || !shippingAddress.city) {
      throw new ApiError(400, 'Vui lòng cung cấp đầy đủ thông tin địa chỉ giao hàng');
    }

    const paymentMethodData = await PaymentMethod.findOne({
      code: paymentMethod,
      isActive: true
    }).session(session);

    if (!paymentMethodData) {
      throw new ApiError(400, 'Phương thức thanh toán không hợp lệ');
    }

    const cart = await Cart.findOne({ user: req.user.id })
      .populate({
        path: 'items.product',
        select: 'name price stock mainImage status slug'
      })
      .session(session);

    if (!cart || !cart.items || cart.items.length === 0) {
      throw new ApiError(400, 'Giỏ hàng trống');
    }

    const outOfStockItems = [];
    for (const item of cart.items) {
      if (!item.product || item.product.status !== 'active') {
        outOfStockItems.push(item.name || 'Sản phẩm không xác định');
        continue;
      }
      if (item.quantity > item.product.stock) {
        outOfStockItems.push(item.product.name || 'Sản phẩm không xác định');
      }
    }
    if (outOfStockItems.length > 0) {
      throw new ApiError(400, `Sản phẩm ${outOfStockItems.join(', ')} đã hết hàng hoặc không khả dụng`);
    }

    let shippingFee = 0;
    if (shippingMethod) {
      const regionCode = shippingService.getRegionCodeFromCity(shippingAddress.city);
      shippingFee = await shippingService.calculateShippingFee(
        shippingMethod,
        regionCode,
        cart.subtotal
      );
    }

    let codFee = 0;
    if (paymentMethod === 'COD' && paymentMethodData.config && paymentMethodData.config.codExtraFee) {
      codFee = paymentMethodData.config.codExtraFee;
    }

    const total = cart.subtotal + shippingFee + codFee - (cart.couponDiscount || 0);
    const orderCode = generateOrderCode();

    const orderItems = cart.items.map(item => ({
      product: item.product._id,
      quantity: item.quantity,
      price: item.price,
      name: item.product.name,
      image: item.product.mainImage ? item.product.mainImage.url : null
    }));

    // Xác định trạng thái đơn hàng và thanh toán ban đầu
    let initialOrderStatus = 'PENDING';
    let paymentStatus = 'PENDING';
    if (paymentMethod === 'MOMO' || paymentMethod === 'VNPAY') {
      initialOrderStatus = 'AWAITING_PAYMENT';
      paymentStatus = 'AWAITING';
    }

    const order = new Order({
      user: req.user.id,
      orderCode: orderCode,
      items: orderItems,
      shippingAddress,
      subtotal: cart.subtotal,
      shippingFee,
      codFee,
      discount: cart.couponDiscount || 0,
      couponCode: cart.couponCode,
      total,
      paymentMethod,
      paymentMethodId: paymentMethodData._id,
      status: initialOrderStatus,
      payment: { status: paymentStatus },
      notes,
      stockUpdated: false
    });

    await order.save({ session });

    // Chỉ cập nhật tồn kho cho các phương thức thanh toán tức thời (COD, chuyển khoản)
    if (paymentMethod === 'COD' || paymentMethod === 'BANK_TRANSFER') {
      const productUpdatePromises = cart.items.map(item =>
        Product.findByIdAndUpdate(
          item.product._id,
          { $inc: { stock: -item.quantity, sold: item.quantity || 0 } },
          { session }
        )
      );
      await Promise.all(productUpdatePromises);
      order.stockUpdated = true;
      await order.save({ session });
      cart.items = [];
      cart.couponCode = null;
      cart.couponDiscount = 0;
      await cart.save({ session });
    }

    // Commit transaction & end session
    await session.commitTransaction();
    session.endSession();

    // ------------------- THÊM MỚI: Code gửi thông báo đơn hàng (CẬP NHẬT) -------------------
    try {
      // TẠO DỮ LIỆU THÔNG BÁO CHUẨN HÓA
      const notificationData = {
        _id: order._id.toString(),
        orderId: order._id.toString(),
        orderCode: order.orderCode,
        total: order.total,
        status: order.status,
        type: 'new-order',
        timestamp: new Date(),
        // Thêm các thông tin chi tiết khác
        customerName: shippingAddress.fullName,
        customerPhone: shippingAddress.phone,
        paymentMethod: paymentMethod
      };

      console.log(`[THÔNG BÁO ĐƠN HÀNG] Đơn hàng mới #${order.orderCode} - Đang gửi thông báo qua socket`);

      // LƯU THÔNG BÁO VÀO DATABASE
      const notification = new Notification({
        type: 'new-order',
        orderId: order._id,
        orderCode: order.orderCode,
        title: `Đơn hàng mới #${order.orderCode}`,
        description: `Đơn hàng từ ${shippingAddress.fullName} - ${order.total.toLocaleString()} VND`,
        status: order.status,
        forAdmin: true,
        read: false
      });
      await notification.save();
      console.log(`[THÔNG BÁO ĐƠN HÀNG] Đã lưu thông báo vào database: ${notification._id}`);

      // CHỈ SỬ DỤNG MỘT PHƯƠNG THỨC GỬI THÔNG BÁO DUY NHẤT
      await socketManager.notifyNewOrder({
        ...notificationData,
        notificationId: notification._id.toString()
      });

      // KHÔNG SỬ DỤNG EMIT TRỰC TIẾP NỮA ĐỂ TRÁNH THÔNG BÁO KÉP
      // if (socketManager.getIO()) {
      //   socketManager.getIO().emit('new-order', {
      //     ...notificationData,
      //     urgent: true
      //   });
      //   console.log(`[THÔNG BÁO ĐƠN HÀNG] Đã gửi broadcast thông báo khẩn cấp cho đơn hàng #${order.orderCode}`);
      // }
    } catch (notifyError) {
      console.error('Lỗi khi gửi thông báo đơn hàng:', notifyError);
      // Vẫn tiếp tục xử lý, không ảnh hưởng đến việc tạo đơn hàng
    }
    // ------------------- KẾT THÚC PHẦN THÔNG BÁO -------------------

    return ApiResponse.success(res, 201, {
      order: {
        _id: order._id,
        orderCode: order.orderCode,
        total: order.total,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.payment.status,
        createdAt: order.createdAt
      }
    }, 'Tạo đơn hàng thành công');
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Lỗi khi xử lý đơn hàng:', error);
    next(error);
  }
};

// Lấy thông tin checkout (tóm tắt giỏ hàng, địa chỉ, phí vận chuyển)
exports.getCheckoutInfo = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id })
      .populate({
        path: 'items.product',
        select: 'name price stock mainImage status'
      });
    if (!cart || !cart.items || cart.items.length === 0) {
      throw new ApiError(400, 'Giỏ hàng trống');
    }
    let hasStockIssue = false;
    const cartItems = cart.items.map(item => {
      const stockIssue = !item.product ||
        item.product.status !== 'active' ||
        item.quantity > item.product.stock;
      if (stockIssue) hasStockIssue = true;
      return {
        _id: item._id,
        productId: item.product ? item.product._id : null,
        name: item.product ? item.product.name : item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.product && item.product.mainImage ? item.product.mainImage.url : null,
        stockIssue: stockIssue
      };
    });
    const shippingMethods = await ShippingMethod.find({ isActive: true })
      .select('code name description baseFee freeShippingThreshold estimatedDeliveryDays')
      .sort({ position: 1 });
    const paymentMethods = await PaymentMethod.find({ isActive: true })
      .select('code name description icon position')
      .sort({ position: 1 });
    const checkoutInfo = {
      cart: {
        items: cartItems,
        totalItems: cart.totalItems,
        subtotal: cart.subtotal,
        couponCode: cart.couponCode,
        couponDiscount: cart.couponDiscount,
        total: cart.total
      },
      shippingMethods,
      paymentMethods,
      hasStockIssue
    };
    return ApiResponse.success(res, 200, checkoutInfo, 'Lấy thông tin checkout thành công');
  } catch (error) {
    next(error);
  }
};