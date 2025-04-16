// backend/controllers/client/orderController.js - Enhanced version
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Notification = require('../../models/Notification');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');
const socketManager = require('../../utils/socketManager');

// Create new order - IMPROVED
exports.createOrder = async (req, res, next) => {
  try {
    const {
      items, shippingInfo, paymentMethod,
      note, couponCode
    } = req.body;

    if (!items || items.length === 0) {
      throw new ApiError(400, 'Vui lòng thêm sản phẩm vào đơn hàng');
    }

    if (!shippingInfo) {
      throw new ApiError(400, 'Vui lòng cung cấp thông tin giao hàng');
    }

    let totalAmount = 0;
    let totalItems = 0;

    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product);

      if (!product) {
        throw new ApiError(404, `Không tìm thấy sản phẩm: ${item.product}`);
      }

      if (product.status !== 'active') {
        throw new ApiError(400, `Sản phẩm ${product.name} hiện không khả dụng`);
      }

      if (product.stock < item.quantity) {
        throw new ApiError(400, `Sản phẩm ${product.name} chỉ còn ${product.stock} sản phẩm`);
      }

      const itemPrice = item.price || product.price;
      const itemTotal = itemPrice * item.quantity;

      orderItems.push({
        product: product._id,
        name: product.name,
        price: itemPrice,
        quantity: item.quantity,
        totalPrice: itemTotal,
        image: product.mainImage?.url || ''
      });

      totalAmount += itemTotal;
      totalItems += item.quantity;
    }

    const shippingFee = totalAmount >= 300000 ? 0 : 30000;

    let discount = 0;

    const grandTotal = totalAmount + shippingFee - discount;

    // Xác định trạng thái đơn hàng ban đầu dựa trên phương thức thanh toán
    let initialOrderStatus = 'PENDING';
    let paymentStatus = 'PENDING';

    // Nếu là phương thức thanh toán online, chuyển trạng thái thành "đang chờ thanh toán"
    if (paymentMethod === 'MOMO' || paymentMethod === 'VNPAY') {
      initialOrderStatus = 'AWAITING_PAYMENT';
      paymentStatus = 'AWAITING';
    }

    const order = new Order({
      user: req.user?.id,
      items: orderItems,
      shippingAddress: shippingInfo,
      paymentMethod,
      subtotal: totalAmount,
      shippingFee,
      discount,
      total: grandTotal,
      status: initialOrderStatus,
      payment: {
        status: paymentStatus
      },
      totalItems,
      notes: note,
      couponCode,
      orderCode: generateOrderCode(),
      stockUpdated: false,
      isGuest: !req.user
    });

    await order.save();

    // Chỉ cập nhật tồn kho cho các phương thức thanh toán tức thời (COD, chuyển khoản)
    if (paymentMethod === 'COD' || paymentMethod === 'BANK_TRANSFER') {
      for (const item of orderItems) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: -item.quantity, sold: item.quantity }
        });
      }

      order.stockUpdated = true;
      await order.save();
    }

    // Phần gửi thông báo đã được cập nhật
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
        customerName: shippingInfo.fullName,
        customerPhone: shippingInfo.phone,
        paymentMethod: paymentMethod
      };

      console.log(`[THÔNG BÁO ĐƠN HÀNG] Đơn hàng mới #${order.orderCode} - Đang gửi thông báo qua socket`);

      // LƯU THÔNG BÁO VÀO DATABASE
      const notification = new Notification({
        type: 'new-order',
        orderId: order._id,
        orderCode: order.orderCode,
        title: `Đơn hàng mới #${order.orderCode}`,
        description: `Đơn hàng từ ${shippingInfo.fullName} - ${order.total.toLocaleString()} VND`,
        status: order.status,
        forAdmin: true,
        read: false
      });

      await notification.save();
      console.log(`[THÔNG BÁO ĐƠN HÀNG] Đã lưu thông báo vào database: ${notification._id}`);

      // CHỈ GỬI MỘT THÔNG BÁO DUY NHẤT QUA SOCKET
      await socketManager.notifyNewOrder({
        ...notificationData,
        notificationId: notification._id.toString()
      });

      // XÓA HOẶC COMMENT ĐOẠN CODE NÀY
      // // GỬI THÔNG BÁO BROADCAST KHẨN CẤP (để đảm bảo có thông báo)
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

    return ApiResponse.success(res, 201, order, 'Đặt hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Get user's orders
exports.getMyOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const query = { user: req.user.id };

    if (status) {
      query.status = status;
    }

    const total = await Order.countDocuments(query);

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    return ApiResponse.paginated(
      res,
      orders,
      parseInt(page),
      parseInt(limit),
      total,
      'Lấy danh sách đơn hàng thành công'
    );
  } catch (error) {
    next(error);
  }
};

// Get order details
exports.getOrderDetail = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!order) {
      throw new ApiError(404, 'Không tìm thấy đơn hàng');
    }

    return ApiResponse.success(res, 200, order, 'Lấy chi tiết đơn hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Cancel order - IMPROVED
exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!order) {
      throw new ApiError(404, 'Không tìm thấy đơn hàng');
    }

    // Constraint: can only cancel orders with status PENDING, AWAITING_PAYMENT, or PROCESSING
    const cancelableStatuses = ['PENDING', 'AWAITING_PAYMENT', 'PROCESSING'];
    if (!cancelableStatuses.includes(order.status)) {
      throw new ApiError(400, 'Không thể hủy đơn hàng ở trạng thái hiện tại');
    }

    // If order is already in SHIPPING or later status, don't allow cancellation
    if (['SHIPPING', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'].includes(order.status)) {
      throw new ApiError(400, 'Không thể hủy đơn hàng đã vận chuyển, đã giao hoặc đã hoàn thành');
    }

    const oldStatus = order.status; // Save old status for notification
    order.status = 'CANCELLED';
    order.cancelReason = req.body.reason || 'Người dùng hủy đơn';
    order.cancelledAt = Date.now();

    await order.save();

    // Only restore inventory if previously updated
    if (order.stockUpdated) {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity, sold: -item.quantity }
        });
      }
    }

    // Notify customer of order status update
    socketManager.notifyOrderStatusUpdate(order);

    // IMPROVED: Create detailed notification for admin about cancelled order
    try {
      // Create database notification
      const notification = new Notification({
        type: 'cancelled-by-user',
        orderId: order._id,
        orderCode: order.orderCode,
        title: `Đơn hàng bị hủy #${order.orderCode}`,
        description: `${order.cancelReason} - ${order.total.toLocaleString()} VND`,
        status: 'CANCELLED',
        forAdmin: true,
        read: false
      });

      await notification.save();

      // Notify admin through socket
      socketManager.notifyNewOrder({
        _id: order._id.toString(),
        orderId: order._id.toString(),
        orderCode: order.orderCode,
        total: order.total,
        status: 'CANCELLED',
        type: 'cancelled-by-user',
        reason: order.cancelReason,
        previousStatus: oldStatus,
        customerName: order.shippingAddress.fullName,
        timestamp: new Date(),
        notificationId: notification._id.toString()
      });

      console.log(`[${new Date().toISOString()}] Order cancellation notification sent: ${order.orderCode}`);
    } catch (notificationError) {
      console.error(`[${new Date().toISOString()}] Error sending cancellation notification:`, notificationError);
    }

    return ApiResponse.success(res, 200, order, 'Hủy đơn hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Check order by number (for guests)
exports.checkOrderByNumber = async (req, res, next) => {
  try {
    const { orderCode, phone } = req.body;

    if (!orderCode || !phone) {
      throw new ApiError(400, 'Vui lòng cung cấp mã đơn hàng và số điện thoại');
    }

    const order = await Order.findOne({
      orderCode,
      'shippingAddress.phone': phone
    });

    if (!order) {
      throw new ApiError(404, 'Không tìm thấy đơn hàng');
    }

    return ApiResponse.success(res, 200, order, 'Lấy thông tin đơn hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Function to generate order code
const generateOrderCode = () => {
  const date = new Date();
  const year = date.getFullYear().toString().substr(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(10000 + Math.random() * 90000).toString();

  return `DH${year}${month}${day}${random}`;
};