/**
 * Tạo response chuẩn cho API
 */
class ApiResponse {
  /**
   * Tạo định dạng response thành công
   * @param {Object} res - Express response object
   * @param {number} statusCode - HTTP status code
   * @param {*} data - Dữ liệu trả về
   * @param {string} message - Thông báo thành công
   * @returns {Object} Response object
   */
  static success(res, statusCode = 200, data = null, message = 'Thành công') {
    const responseBody = {
      success: true,
      message,
      data
    };

    return res.status(statusCode).json(responseBody);
  }

  /**
   * Tạo định dạng response thất bại
   * @param {Object} res - Express response object
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Thông báo lỗi
   * @param {*} errors - Chi tiết lỗi (nếu có)
   * @returns {Object} Response object
   */
  static error(res, statusCode = 400, message = 'Lỗi', errors = null) {
    const responseBody = {
      success: false,
      message,
      errors: errors || null
    };

    return res.status(statusCode).json(responseBody);
  }

  /**
   * Response với dữ liệu phân trang
   * @param {Object} res - Express response object
   * @param {Array} items - Danh sách items
   * @param {number} page - Trang hiện tại
   * @param {number} limit - Số lượng mỗi trang
   * @param {number} total - Tổng số bản ghi
   * @param {string} message - Thông báo
   * @returns {Object} Response object
   */
  static paginated(res, items, page = 1, limit = 10, total = 0, message = 'Thành công') {
    const totalPages = Math.ceil(total / limit);

    const pagination = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      total,
      totalPages
    };

    const responseBody = {
      success: true,
      message,
      data: items,
      pagination
    };

    return res.status(200).json(responseBody);
  }
}

module.exports = ApiResponse;