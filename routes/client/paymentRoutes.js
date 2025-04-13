// routes/client/paymentRoutes.js
const express = require('express');
const router = express.Router();
const paymentController = require('../../controllers/client/paymentController');
const { authenticateCustomer, requireVerifiedEmail } = require('../../middlewares/customerAuthMiddleware');

// Lấy phương thức thanh toán khả dụng - không cần xác thực
router.get('/methods', paymentController.getPaymentMethods);

// Các route yêu cầu xác thực
router.use(authenticateCustomer);

// Tạo URL thanh toán MOMO
router.post('/momo', requireVerifiedEmail, paymentController.createMomoPayment);

// Tạo URL thanh toán VNPAY
router.post('/vnpay', requireVerifiedEmail, paymentController.createVnpayPayment);

// Lấy kết quả thanh toán theo mã đơn hàng
router.get('/result/:orderCode', paymentController.getPaymentResult);

// Kiểm tra trạng thái thanh toán
router.get('/status/:orderCode', paymentController.checkPaymentStatus);

// Thực hiện lại thanh toán cho đơn hàng
router.post('/retry', requireVerifiedEmail, paymentController.retryPayment);

module.exports = router;