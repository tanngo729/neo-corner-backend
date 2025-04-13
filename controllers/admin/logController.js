// backend/controllers/admin/logController.js
const ActivityLog = require('../../models/ActivityLog');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');

// Lấy danh sách logs (có phân trang, filter)
exports.getLogs = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, entity, action, search, startDate, endDate } = req.query;

    // Xây dựng query
    const query = {};

    // Lọc theo loại đối tượng
    if (entity) {
      query.entity = entity;
    }

    // Lọc theo hành động
    if (action) {
      query.action = action;
    }

    // Lọc theo khoảng thời gian
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Tìm kiếm theo tên
    if (search) {
      query.entityName = { $regex: search, $options: 'i' };
    }

    // Đếm tổng số logs
    const total = await ActivityLog.countDocuments(query);

    // Lấy danh sách logs
    const logs = await ActivityLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('user', 'username fullName');

    // Trả về kết quả
    return ApiResponse.paginated(
      res,
      logs,
      parseInt(page),
      parseInt(limit),
      total,
      'Lấy danh sách logs thành công'
    );
  } catch (error) {
    next(error);
  }
};