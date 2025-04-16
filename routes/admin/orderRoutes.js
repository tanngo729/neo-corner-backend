// routes/admin/orderRoutes.js
const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/admin/orderController');
const { authenticate, authorize } = require('../../middlewares/authMiddleware');

router.use(authenticate);

// Lấy danh sách đơn hàng
router.get('/', authorize('orders.view'), orderController.getAllOrders);

// Lấy chi tiết đơn hàng
router.get('/:id', authorize('orders.view'), orderController.getOrderDetail);

// Cập nhật trạng thái đơn hàng
router.put('/:id/status', authorize('orders.edit'), orderController.updateOrderStatus);
router.patch('/:id/status', authorize('orders.edit'), orderController.updateOrderStatus);

module.exports = router;