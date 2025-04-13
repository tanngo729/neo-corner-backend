// backend/controllers/admin/settingsController.js
const ApiResponse = require('../../utils/apiResponder');

// Lấy cài đặt hệ thống
exports.getSettings = async (req, res, next) => {
  try {
    // Giả lập dữ liệu cài đặt cơ bản
    const settings = {
      siteName: 'E-Commerce System',
      logo: null,
      currency: 'VND',
      emailContact: 'contact@example.com',
      address: 'Hà Nội, Việt Nam',
      phone: '0123456789'
    };

    return ApiResponse.success(res, 200, settings, 'Lấy cài đặt thành công');
  } catch (error) {
    next(error);
  }
};

// Cập nhật cài đặt
exports.updateSettings = async (req, res, next) => {
  try {
    // Giả lập cập nhật cài đặt (chưa lưu vào database)
    const updatedSettings = req.body;

    return ApiResponse.success(res, 200, updatedSettings, 'Cập nhật cài đặt thành công');
  } catch (error) {
    next(error);
  }
};