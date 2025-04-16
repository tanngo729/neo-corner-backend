// controllers/admin/orderController.js
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');
const socketManager = require('../../utils/socketManager');

// Lấy danh sách đơn hàng (có filter)
exports.getAllOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const query = {};

    // Filter theo status
    if (status) {
      query.status = status;
    }

    // Search theo orderCode hoặc thông tin người nhận
    if (search) {
      query.$or = [
        { orderCode: { $regex: search, $options: 'i' } },
        { 'shippingAddress.fullName': { $regex: search, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Order.countDocuments(query);

    // Sắp xếp
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const orders = await Order.find(query)
      .sort(sortOptions)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('user', 'fullName email');

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
    const order = await Order.findById(req.params.id)
      .populate('user', 'fullName email phone')
      .populate('items.product', 'name slug');

    if (!order) {
      throw new ApiError(404, 'Không tìm thấy đơn hàng');
    }

    return ApiResponse.success(res, 200, order, 'Lấy chi tiết đơn hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Cập nhật trạng thái đơn hàng
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      throw new ApiError(404, 'Không tìm thấy đơn hàng');
    }

    // Kiểm tra trạng thái hợp lệ
    const validStatuses = ['PENDING', 'AWAITING_PAYMENT', 'PROCESSING', 'SHIPPING', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'];
    if (!validStatuses.includes(status)) {
      throw new ApiError(400, 'Trạng thái đơn hàng không hợp lệ');
    }

    // Xử lý logic khi chuyển sang trạng thái đã hủy
    if (status === 'CANCELLED' && order.status !== 'CANCELLED') {
      if (order.stockUpdated) {
        // Hoàn lại tồn kho
        for (const item of order.items) {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { stock: item.quantity, sold: -item.quantity }
          });
        }
      }
      order.cancelReason = note || 'Hủy bởi quản trị viên';
      order.cancelledAt = Date.now();
    }

    // Lưu trạng thái cũ để kiểm tra sự thay đổi
    const oldStatus = order.status;

    // Cập nhật trạng thái đơn hàng
    order.status = status;

    // Nếu đang chờ thanh toán và đổi sang trạng thái khác, cập nhật payment.status
    if (oldStatus === 'AWAITING_PAYMENT' && status !== 'AWAITING_PAYMENT' && status !== 'CANCELLED') {
      order.payment.status = 'COMPLETED';
      order.payment.paidAt = Date.now();
    }

    // Nếu chưa cập nhật tồn kho và đang xử lý đơn hàng
    if (!order.stockUpdated && (status === 'PROCESSING' || status === 'SHIPPING')) {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: -item.quantity, sold: item.quantity }
        });
      }
      order.stockUpdated = true;
    }

    // Thêm thông tin vận chuyển nếu chuyển sang trạng thái vận chuyển
    if (status === 'SHIPPING' && oldStatus !== 'SHIPPING') {
      if (!order.deliveryInfo) order.deliveryInfo = {};
      order.deliveryInfo.shippedAt = Date.now();
    }

    // Thêm thông tin giao hàng nếu chuyển sang trạng thái đã giao
    if (status === 'DELIVERED' && oldStatus !== 'DELIVERED') {
      if (!order.deliveryInfo) order.deliveryInfo = {};
      order.deliveryInfo.deliveredAt = Date.now();
    }

    // Thêm ghi chú admin nếu có
    if (note) {
      if (!order.adminNotes) order.adminNotes = [];
      order.adminNotes.push({
        content: note,
        createdBy: req.user.id,
        createdAt: Date.now()
      });
    }

    await order.save();

    // Đăng ký hoạt động admin trước khi gửi thông báo
    const adminId = req.user.id;
    const operationKey = `${adminId}-update-${order._id.toString()}`;
    socketManager.registerAdminOperation(adminId, 'update', order._id.toString());

    console.log(`[API] Admin ${adminId} cập nhật đơn hàng ${order.orderCode} từ ${oldStatus} thành ${status}`);

    // Gửi thông báo với adminId
    socketManager.notifyOrderStatusUpdate(order, adminId);

    return ApiResponse.success(res, 200, order, 'Cập nhật trạng thái đơn hàng thành công');
  } catch (error) {
    next(error);
  }
};