// routes/client/notificationRoutes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../../controllers/client/notificationController');
const { authenticateCustomer } = require('../../middlewares/customerAuthMiddleware');

// Tất cả các routes cần xác thực
router.use(authenticateCustomer);

// Lấy danh sách thông báo
router.get('/', notificationController.getNotifications);

// Đếm số thông báo chưa đọc
router.get('/unread', notificationController.countUnread);

// Đánh dấu thông báo đã đọc
router.post('/read', notificationController.markAsRead);

// Đánh dấu tất cả thông báo đã đọc
router.post('/read-all', notificationController.markAllAsRead);

// Xóa thông báo
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;