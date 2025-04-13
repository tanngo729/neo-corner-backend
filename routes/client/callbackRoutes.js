// routes/client/callbackRoutes.js
const express = require('express');
const router = express.Router();
const paymentCallbackController = require('../../controllers/client/paymentCallbackController');

// Callback từ MoMo
router.post('/momo', paymentCallbackController.momoCallback);

// Callback từ VNPAY
router.get('/vnpay', paymentCallbackController.vnpayCallback);

module.exports = router;