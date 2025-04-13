// backend/middlewares/customerAuthMiddleware.js
const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');
const { ApiError } = require('../utils/errorHandler');

// Middleware xác thực khách hàng thông qua JWT token
const authenticateCustomer = async (req, res, next) => {
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

    // Kiểm tra type là customer
    if (decoded.type !== 'customer') {
      throw new ApiError(401, 'Token không hợp lệ cho khách hàng');
    }

    // Tìm khách hàng từ id trong token
    const customer = await Customer.findById(decoded.id).select('-password');

    if (!customer) {
      throw new ApiError(401, 'Token không hợp lệ hoặc khách hàng không tồn tại');
    }

    if (customer.status !== 'active') {
      throw new ApiError(403, 'Tài khoản đã bị khóa hoặc vô hiệu hóa');
    }

    // Gắn thông tin khách hàng vào request
    req.user = customer;
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

// Middleware xác thực email (tùy chọn) - dùng cho các route yêu cầu email đã xác thực
const requireVerifiedEmail = (req, res, next) => {
  if (!req.user.isVerified) {
    return next(new ApiError(403, 'Email chưa được xác thực, vui lòng xác thực email trước'));
  }
  next();
};

// Middleware xác thực tùy chọn - cho phép khách không đăng nhập vẫn truy cập được
const optionalCustomerAuth = async (req, res, next) => {
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

      if (decoded.type !== 'customer') {
        return next();
      }

      // Tìm khách hàng từ id trong token
      const customer = await Customer.findById(decoded.id).select('-password');

      if (customer && customer.status === 'active') {
        // Gắn thông tin khách hàng vào request nếu tìm thấy
        req.user = customer;
      }
    } catch (tokenError) {
      // Không báo lỗi, chỉ không gắn thông tin customer
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  authenticateCustomer,
  requireVerifiedEmail,
  optionalCustomerAuth
};