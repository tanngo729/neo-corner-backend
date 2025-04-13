// backend/controllers/client/orderController.js
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');

// Tạo đơn hàng mới
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

    return ApiResponse.success(res, 201, order, 'Đặt hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Lấy danh sách đơn hàng của người dùng
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

// Lấy chi tiết đơn hàng
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

// Hủy đơn hàng
exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!order) {
      throw new ApiError(404, 'Không tìm thấy đơn hàng');
    }

    if (order.status !== 'PENDING' && order.status !== 'PROCESSING' && order.status !== 'AWAITING_PAYMENT') {
      throw new ApiError(400, 'Không thể hủy đơn hàng ở trạng thái hiện tại');
    }

    order.status = 'CANCELLED';
    order.cancelReason = req.body.reason || 'Người dùng hủy đơn';
    order.cancelledAt = Date.now();

    await order.save();

    // Chỉ hoàn lại tồn kho nếu đã cập nhật trước đó
    if (order.stockUpdated) {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity, sold: -item.quantity }
        });
      }
    }

    return ApiResponse.success(res, 200, order, 'Hủy đơn hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Kiểm tra đơn hàng bằng số đơn hàng (cho khách hàng không đăng nhập)
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

// Hàm tạo mã đơn hàng
const generateOrderCode = () => {
  const date = new Date();
  const year = date.getFullYear().toString().substr(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(10000 + Math.random() * 90000).toString();

  return `DH${year}${month}${day}${random}`;
};