// routes/admin/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const dashboardController = require('../../controllers/admin/dashboardController');
const { authenticate, authorize } = require('../../middlewares/authMiddleware');

// Áp dụng middleware xác thực cho tất cả routes
router.use(authenticate);

// Lấy thống kê tổng quan
router.get('/stats', dashboardController.getStats);

// Lấy dữ liệu biểu đồ doanh thu
router.get('/sales-chart', dashboardController.getSalesChart);

// Lấy danh sách đơn hàng gần đây
router.get('/recent-orders', dashboardController.getRecentOrders);

// Lấy danh sách sản phẩm bán chạy
router.get('/top-products', dashboardController.getTopProducts);

// Lấy danh sách khách hàng tiềm năng
router.get('/top-customers', dashboardController.getTopCustomers);

// Lấy dữ liệu phân bố trạng thái đơn hàng
router.get('/order-status-distribution', dashboardController.getOrderStatusDistribution);

// Lấy tất cả dữ liệu dashboard một lần
router.get('/', dashboardController.getDashboardData);

module.exports = router;