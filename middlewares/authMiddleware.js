// backend/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { ApiError } = require('../utils/errorHandler');

// Middleware xác thực người dùng thông qua JWT token
const authenticate = async (req, res, next) => {
  try {
    // Lấy token từ header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;

    if (!token) {
      throw new ApiError(401, 'Không tìm thấy token xác thực, vui lòng đăng nhập');
    }

    // Xác thực token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Tìm người dùng từ id trong token
    const user = await User.findById(decoded.id)
      .select('-password')
      .populate('role', 'name permissions');

    if (!user) {
      throw new ApiError(401, 'Token không hợp lệ hoặc người dùng không tồn tại');
    }

    if (user.status !== 'active') {
      throw new ApiError(403, 'Tài khoản đã bị khóa hoặc vô hiệu hóa');
    }

    // Gắn thông tin người dùng vào request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      next(new ApiError(401, 'Token không hợp lệ'));
    } else if (error.name === 'TokenExpiredError') {
      next(new ApiError(401, 'Token đã hết hạn, vui lòng đăng nhập lại'));
    } else {
      next(error);
    }
  }
};

// Middleware kiểm tra quyền truy cập
const authorize = (...requiredPermissions) => {
  return (req, res, next) => {
    try {
      // Kiểm tra đã xác thực chưa
      if (!req.user) {
        throw new ApiError(401, 'Vui lòng đăng nhập');
      }

      // Lấy danh sách quyền của người dùng
      const userPermissions = req.user.role?.permissions || [];

      // Kiểm tra người dùng có tất cả các quyền cần thiết
      const hasAllPermissions = requiredPermissions.every(permission =>
        userPermissions.includes(permission)
      );

      if (!hasAllPermissions) {
        throw new ApiError(403, 'Bạn không có quyền thực hiện hành động này');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Middleware xác thực tùy chọn - cho phép request tiếp tục ngay cả khi không có token
const optionalAuth = async (req, res, next) => {
  try {
    // Lấy token từ header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : null;

    if (!token) {
      return next();
    }

    try {
      // Xác thực token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Tìm người dùng từ id trong token
      const user = await User.findById(decoded.id)
        .select('-password')
        .populate('role', 'name permissions');

      if (user && user.status === 'active') {
        // Gắn thông tin người dùng vào request nếu tìm thấy
        req.user = user;
      }
    } catch (tokenError) {
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth
};