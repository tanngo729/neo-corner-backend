// backend/routes/admin/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../../controllers/admin/authController');
const User = require('../../models/User');
const bcrypt = require('bcryptjs');

// Routes không cần xác thực
router.post('/login', authController.login);
router.post('/logout', authController.logout);

// Route reset mật khẩu admin (chỉ sử dụng trong môi trường dev)
if (process.env.NODE_ENV === 'development') {
  router.post('/reset-admin', async (req, res) => {
    try {
      // Tìm user admin
      const admin = await User.findOne({ username: 'admin' });

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Không tìm thấy tài khoản admin'
        });
      }

      // Tạo mật khẩu mới
      const salt = await bcrypt.genSalt(10);
      const newPassword = 'admin123';
      admin.password = await bcrypt.hash(newPassword, salt);
      admin.status = 'active';

      await admin.save();

      return res.json({
        success: true,
        message: 'Đã reset mật khẩu admin thành: admin123'
      });
    } catch (error) {
      console.error('Lỗi reset mật khẩu:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server: ' + error.message
      });
    }
  });
}

module.exports = router;