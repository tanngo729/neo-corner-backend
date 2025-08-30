/**
 * Class định nghĩa lỗi API
 */
class ApiError extends Error {
  /**
   * Tạo một ApiError
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Thông báo lỗi
   * @param {boolean} isOperational - Có phải lỗi hoạt động hay không (true cho user-facing errors)
   * @param {string} stack - Stack trace
   */
  constructor(statusCode, message, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Middleware xử lý lỗi
 */
const errorConverter = (err, req, res, next) => {
  let error = err;

  // Nếu không phải ApiError, chuyển đổi thành ApiError
  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || (error instanceof SyntaxError ? 400 : 500);
    const message = error.message || 'Lỗi hệ thống';
    error = new ApiError(statusCode, message, false, err.stack);
  }

  next(error);
};

/**
 * Middleware xử lý lỗi cuối cùng
 */
const errorHandler = (err, req, res, next) => {
  const { statusCode, message } = err;

  // Đặt locals trong môi trường development
  res.locals.errorMessage = err.message;

  const response = {
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  if (process.env.NODE_ENV === 'development') {
    console.error(err);
  }

  res.status(statusCode || 500).json(response);
};

module.exports = {
  ApiError,
  errorConverter,
  errorHandler
};
