// backend/routes/admin/profileRoutes.js
const express = require('express');
const router = express.Router();
const profileController = require('../../controllers/admin/profileController');
const { authenticate } = require('../../middlewares/authMiddleware');
const { uploadAvatarImage } = require('../../services/cloudinaryService');

// Tất cả các routes trong profile đều cần xác thực
router.use(authenticate);

// Lấy thông tin cá nhân
router.get('/', profileController.getProfile);

// Cập nhật thông tin cá nhân
router.patch('/update', uploadAvatarImage, profileController.updateProfile);

// Đổi mật khẩu
router.patch('/change-password', profileController.changePassword);

module.exports = router;