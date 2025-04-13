// backend/services/loggingService.js
const ActivityLog = require('../models/ActivityLog');

/**
 * Ghi log hoạt động
 * @param {Object} req - Request object
 * @param {String} action - Hành động: 'create', 'update', 'delete'
 * @param {String} entity - Loại đối tượng: 'product', 'category', etc.
 * @param {Object} entityObject - Đối tượng thao tác
 * @param {Object} details - Chi tiết bổ sung
 */
exports.logActivity = async (req, action, entity, entityObject, details = {}) => {
  try {
    if (!req.user) return; // Không log nếu không có user

    const log = new ActivityLog({
      user: req.user._id,
      action,
      entity,
      entityId: entityObject._id,
      entityName: entityObject.name || entityObject.title || entityObject._id.toString(),
      details,
      ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress
    });

    await log.save();
    console.log(`Activity logged: ${action} ${entity} ${entityObject._id}`);
  } catch (error) {
    console.error('Error logging activity:', error);
    // Không throw lỗi để tránh ảnh hưởng đến luồng chính
  }
};