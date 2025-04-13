// controllers/client/paymentController.js
const Order = require('../../models/Order');
const PaymentMethod = require('../../models/PaymentMethod');
const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');
const MomoService = require('../../services/payment/momoService');
const VnpayService = require('../../services/payment/vnpayService');
const mongoose = require('mongoose');

// Lấy danh sách phương thức thanh toán khả dụng
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

// Tạo URL thanh toán MoMo
exports.createMomoPayment = async (req, res, next) => {
  try {
    const { orderCode } = req.body;

    if (!orderCode) {
      throw new ApiError(400, 'Vui lòng cung cấp mã đơn hàng');
    }

    // Tìm đơn hàng
    const order = await Order.findOne({
      orderCode,
      user: req.user.id,
      status: 'AWAITING_PAYMENT',
      payment: { status: 'AWAITING' },
      paymentMethod: 'MOMO'
    });

    if (!order) {
      throw new ApiError(404, 'Không tìm thấy đơn hàng hợp lệ cần thanh toán');
    }

    // Lấy cấu hình MOMO
    const momoConfig = await PaymentMethod.findOne({ code: 'MOMO', isActive: true });
    if (!momoConfig) {
      throw new ApiError(400, 'Phương thức thanh toán MOMO không khả dụng');
    }

    // Khởi tạo MomoService
    const momoService = new MomoService(momoConfig.config);

    // Chuẩn bị dữ liệu cho MoMo
    const momoOrderData = {
      _id: order._id,
      orderCode: order.orderCode,
      total: order.total
    };

    // Tạo URL thanh toán
    const paymentUrl = await momoService.createPaymentUrl(momoOrderData);

    // Cập nhật thông tin thanh toán
    order.payment.paymentUrl = paymentUrl;
    order.payment.requestedAt = new Date();
    await order.save();

    return ApiResponse.success(res, 200, { paymentUrl }, 'Tạo URL thanh toán thành công');
  } catch (error) {
    console.error('Lỗi khi tạo URL thanh toán MoMo:', error);
    next(error);
  }
};

// Tạo URL thanh toán VNPAY
exports.createVnpayPayment = async (req, res, next) => {
  try {
    const { orderCode } = req.body;
    const ipAddr = req.headers['x-forwarded-for'] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.connection.socket.remoteAddress ||
      '127.0.0.1';

    if (!orderCode) {
      throw new ApiError(400, 'Vui lòng cung cấp mã đơn hàng');
    }

    // Tìm đơn hàng
    const order = await Order.findOne({
      orderCode,
      user: req.user.id,
      status: 'AWAITING_PAYMENT',
      payment: { status: 'AWAITING' },
      paymentMethod: 'VNPAY'
    });

    if (!order) {
      throw new ApiError(404, 'Không tìm thấy đơn hàng hợp lệ cần thanh toán');
    }

    // Lấy cấu hình VNPAY
    const vnpayConfig = await PaymentMethod.findOne({ code: 'VNPAY', isActive: true });
    if (!vnpayConfig) {
      throw new ApiError(400, 'Phương thức thanh toán VNPAY không khả dụng');
    }

    // Khởi tạo VnpayService
    const vnpayService = new VnpayService(vnpayConfig.config);

    // Chuẩn bị dữ liệu cho VNPAY
    const vnpayOrderData = {
      _id: order._id,
      orderCode: order.orderCode,
      total: order.total
    };

    // Tạo URL thanh toán
    const paymentUrl = await vnpayService.createPaymentUrl(vnpayOrderData, ipAddr);

    // Cập nhật thông tin thanh toán
    order.payment.paymentUrl = paymentUrl;
    order.payment.requestedAt = new Date();
    await order.save();

    return ApiResponse.success(res, 200, { paymentUrl }, 'Tạo URL thanh toán thành công');
  } catch (error) {
    console.error('Lỗi khi tạo URL thanh toán VNPAY:', error);
    next(error);
  }
};

// Lấy kết quả thanh toán theo mã đơn hàng
exports.getPaymentResult = async (req, res, next) => {
  try {
    const { orderCode } = req.params;

    if (!orderCode) {
      throw new ApiError(400, 'Vui lòng cung cấp mã đơn hàng');
    }

    // Tìm đơn hàng
    const order = await Order.findOne({ orderCode });

    if (!order) {
      throw new ApiError(404, 'Không tìm thấy đơn hàng');
    }

    // Thêm thông tin phương thức thanh toán nếu là chuyển khoản
    let paymentMethodDetails = null;
    if (order.paymentMethod === 'BANK_TRANSFER') {
      const paymentMethodData = await PaymentMethod.findOne({ code: 'BANK_TRANSFER' });

      if (paymentMethodData && paymentMethodData.config && paymentMethodData.config.bankAccounts) {
        const defaultAccount = paymentMethodData.config.bankAccounts.find(account => account.isDefault) ||
          paymentMethodData.config.bankAccounts[0];

        if (defaultAccount) {
          paymentMethodDetails = {
            bankName: defaultAccount.bankName,
            accountNumber: defaultAccount.accountNumber,
            accountName: defaultAccount.accountName,
            branch: defaultAccount.branch,
            transferContent: `Thanh toan don hang ${order.orderCode}`
          };
        }
      }
    }

    return ApiResponse.success(res, 200, {
      order,
      paymentMethodDetails
    }, 'Lấy kết quả thanh toán thành công');
  } catch (error) {
    next(error);
  }
};

// Kiểm tra trạng thái thanh toán
exports.checkPaymentStatus = async (req, res, next) => {
  try {
    const { orderCode } = req.params;

    if (!orderCode) {
      throw new ApiError(400, 'Vui lòng cung cấp mã đơn hàng');
    }

    // Tìm đơn hàng
    const order = await Order.findOne({ orderCode });

    if (!order) {
      throw new ApiError(404, 'Không tìm thấy đơn hàng');
    }

    // Nếu đơn hàng đang trong trạng thái chờ thanh toán và phương thức là online
    // thì kiểm tra trạng thái với cổng thanh toán
    let updatedPaymentStatus = false;
    if (order.status === 'AWAITING_PAYMENT' &&
      order.payment.status === 'AWAITING' &&
      (order.paymentMethod === 'MOMO' || order.paymentMethod === 'VNPAY')) {

      try {
        // Lấy cấu hình phương thức thanh toán
        const paymentMethodConfig = await PaymentMethod.findOne({
          code: order.paymentMethod,
          isActive: true
        });

        if (paymentMethodConfig) {
          // Kiểm tra với cổng thanh toán (nếu có)
          if (order.paymentMethod === 'MOMO' && order.payment.transactionId) {
            const momoService = new MomoService(paymentMethodConfig.config);
            // Thử kiểm tra với MOMO bằng transactionId nếu có
            // Đây là giải pháp tạm thời vì MOMO API có thể không hỗ trợ kiểm tra
            console.log('Kiểm tra trạng thái thanh toán MOMO cho đơn hàng:', orderCode);
          } else if (order.paymentMethod === 'VNPAY' && order.payment.transactionId) {
            // VNPAY thường không có API kiểm tra trạng thái
            console.log('Kiểm tra trạng thái thanh toán VNPAY cho đơn hàng:', orderCode);
          }
        }
      } catch (err) {
        console.error('Lỗi khi kiểm tra trạng thái thanh toán với cổng thanh toán:', err);
      }
    }

    // Thêm thông tin chi tiết về phương thức thanh toán nếu là chuyển khoản
    let paymentMethodDetails = null;
    if (order.paymentMethod === 'BANK_TRANSFER') {
      const paymentMethodData = await PaymentMethod.findOne({ code: 'BANK_TRANSFER' });

      if (paymentMethodData && paymentMethodData.config && paymentMethodData.config.bankAccounts) {
        const defaultAccount = paymentMethodData.config.bankAccounts.find(account => account.isDefault) ||
          paymentMethodData.config.bankAccounts[0];

        if (defaultAccount) {
          paymentMethodDetails = {
            bankName: defaultAccount.bankName,
            accountNumber: defaultAccount.accountNumber,
            accountName: defaultAccount.accountName,
            branch: defaultAccount.branch,
            transferContent: `Thanh toan don hang ${order.orderCode}`
          };
        }
      }
    }

    // Nếu đã cập nhật trạng thái, cập nhật lại thông tin đơn hàng
    if (updatedPaymentStatus) {
      await order.save();
    }

    return ApiResponse.success(res, 200, {
      orderCode: order.orderCode,
      status: order.status,
      paymentStatus: order.payment.status,
      paymentMethod: order.paymentMethod,
      paymentMethodDetails,
      total: order.total,
      paidAt: order.payment.paidAt,
      updatedFromPaymentGateway: updatedPaymentStatus
    }, 'Lấy trạng thái thanh toán thành công');
  } catch (error) {
    next(error);
  }
};

// Thử lại thanh toán cho đơn hàng
exports.retryPayment = async (req, res, next) => {
  try {
    const { orderCode, paymentMethod } = req.body;

    if (!orderCode || !paymentMethod) {
      throw new ApiError(400, 'Vui lòng cung cấp mã đơn hàng và phương thức thanh toán');
    }

    if (!['MOMO', 'VNPAY'].includes(paymentMethod)) {
      throw new ApiError(400, 'Phương thức thanh toán không hợp lệ');
    }

    // Tìm đơn hàng
    const order = await Order.findOne({
      orderCode,
      user: req.user.id,
      status: { $ne: 'CANCELLED' }
    });

    if (!order) {
      throw new ApiError(404, 'Không tìm thấy đơn hàng');
    }

    if (order.payment.status === 'COMPLETED') {
      throw new ApiError(400, 'Đơn hàng này đã được thanh toán');
    }

    // Cập nhật phương thức thanh toán và trạng thái
    order.paymentMethod = paymentMethod;
    order.status = 'AWAITING_PAYMENT';
    order.payment.status = 'AWAITING';

    await order.save();

    return ApiResponse.success(res, 200, {
      orderCode: order.orderCode,
      _id: order._id
    }, 'Cập nhật phương thức thanh toán thành công');
  } catch (error) {
    next(error);
  }
};