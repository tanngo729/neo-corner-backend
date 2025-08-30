// routes/client/checkoutRoutes.js
const express = require('express');
const router = express.Router();
const checkoutController = require('../../controllers/client/checkoutController');
const { authenticateCustomer, requireVerifiedEmail } = require('../../middlewares/customerAuthMiddleware');

router.use(authenticateCustomer);

// Lấy phương thức vận chuyển khả dụng - không cần xác thực email
router.get('/shipping-methods', checkoutController.getShippingMethods);

// Lấy phương thức thanh toán khả dụng - không cần xác thực email
router.get('/payment-methods', checkoutController.getPaymentMethods);

// Tính phí vận chuyển - không cần xác thực email
router.post('/calculate-shipping', checkoutController.calculateShippingFee);

// Lấy thông tin checkout - không cần xác thực email
router.get('/info', checkoutController.getCheckoutInfo);

// Xử lý checkout - yêu cầu email đã xác thực 
router.post('/process', requireVerifiedEmail, checkoutController.processCheckout);

router.post('/apply-coupon', authenticateCustomer, checkoutController.applyCoupon);

module.exports = router;