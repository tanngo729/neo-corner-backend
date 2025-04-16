// routes/admin/notificationRoutes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../../controllers/admin/notificationController');
const { authenticate } = require('../../middlewares/authMiddleware');

router.use(authenticate);

// Lấy danh sách thông báo
router.get('/', notificationController.getAdminNotifications);

// Đếm số thông báo chưa đọc
router.get('/unread', notificationController.countUnread);

// Đánh dấu thông báo đã đọc
router.put('/read', notificationController.markAsRead);

// Đánh dấu tất cả thông báo đã đọc
router.post('/read-all', notificationController.markAllAsRead);

// Xóa thông báo
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;