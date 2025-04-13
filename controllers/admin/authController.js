// backend/controllers/admin/authController.js
const User = require('../../models/User');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');
const { logActivity } = require('../../services/loggingService');

// Đăng nhập
exports.login = async (req, res, next) => {
  try {
    console.log('Đang xử lý đăng nhập với dữ liệu:', req.body);
    const { username, password } = req.body;

    // Kiểm tra các trường bắt buộc
    if (!username || !password) {
      throw new ApiError(400, 'Vui lòng cung cấp tên đăng nhập và mật khẩu');
    }

    // Tìm người dùng theo tên đăng nhập hoặc email
    const user = await User.findOne({
      $or: [
        { username: username },
        { email: username }
      ]
    }).select('+password').populate('role', 'name permissions');

    console.log('Đã tìm thấy user:', user ? user._id : 'không tìm thấy');

    // Kiểm tra người dùng và mật khẩu
    if (!user || !(await user.matchPassword(password))) {
      console.log('Mật khẩu không khớp hoặc không tìm thấy user');
      throw new ApiError(401, 'Tên đăng nhập hoặc mật khẩu không chính xác');
    }

    // Kiểm tra trạng thái tài khoản
    if (user.status !== 'active') {
      throw new ApiError(403, 'Tài khoản đã bị khóa hoặc vô hiệu hóa');
    }

    // Cập nhật thời gian đăng nhập cuối
    user.lastLogin = Date.now();
    await user.save();

    // Tạo token JWT
    const token = user.generateAuthToken();
    console.log('Đã tạo token thành công');

    // Bỏ mật khẩu khỏi đối tượng người dùng trước khi trả về
    const userObj = user.toObject();
    delete userObj.password;

    // Ghi log hoạt động đăng nhập
    await logActivity(req, 'login', 'user', user);

    return ApiResponse.success(res, 200, {
      user: userObj,
      token
    }, 'Đăng nhập thành công');
  } catch (error) {
    console.error('Lỗi trong quá trình đăng nhập:', error);
    next(error);
  }
};

// Đăng xuất
exports.logout = async (req, res, next) => {
  try {
    // Ghi log hoạt động đăng xuất
    await logActivity(req, 'logout', 'user', req.user);

    return ApiResponse.success(res, 200, null, 'Đăng xuất thành công');
  } catch (error) {
    next(error);
  }
};

