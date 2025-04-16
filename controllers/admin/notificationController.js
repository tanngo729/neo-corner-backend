// controllers/admin/notificationController.js
const Notification = require('../../models/Notification');
const ApiResponse = require('../../utils/apiResponder');

exports.getAdminNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, after } = req.query;

    const query = { forAdmin: true };

    // Nếu có timestamp, lấy các thông báo sau timestamp đó
    if (after) {
      query.createdAt = { $gt: new Date(after) };
    }

    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    return ApiResponse.paginated(
      res,
      notifications,
      parseInt(page),
      parseInt(limit),
      total,
      'Lấy thông báo thành công'
    );
  } catch (error) {
    next(error);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids)) {
      throw new ApiError(400, 'Vui lòng cung cấp danh sách ID thông báo');
    }

    await Notification.updateMany(
      { _id: { $in: ids }, forAdmin: true },
      { $set: { read: true } }
    );

    return ApiResponse.success(res, 200, null, 'Đánh dấu thông báo đã đọc thành công');
  } catch (error) {
    next(error);
  }
};