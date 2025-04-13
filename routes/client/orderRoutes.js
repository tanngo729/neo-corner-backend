// backend/routes/client/orderRoutes.js
const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/client/orderController');
const { authenticateCustomer, optionalCustomerAuth } = require('../../middlewares/customerAuthMiddleware');

// Routes không cần xác thực hoặc xác thực tùy chọn
router.post('/check', orderController.checkOrderByNumber);
router.post('/', optionalCustomerAuth, orderController.createOrder);

// Routes cần xác thực
router.use(authenticateCustomer);
router.get('/', orderController.getMyOrders);
router.get('/:id', orderController.getOrderDetail);
router.patch('/:id/cancel', orderController.cancelOrder);

module.exports = router;