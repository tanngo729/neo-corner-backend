// controllers/admin/notificationController.js
const Notification = require('../../models/Notification');
const ApiResponse = require('../../utils/apiResponder');
const { ApiError } = require('../../utils/errorHandler');
const socketManager = require('../../utils/socketManager');

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
    const adminId = req.user.id;

    if (!ids || !Array.isArray(ids)) {
      throw new ApiError(400, 'Vui lòng cung cấp danh sách ID thông báo');
    }

    // Cập nhật trong database
        const { Types } = require('mongoose');
    const validIds = ids.filter(id => Types.ObjectId.isValid(id));
    if (validIds.length > 0) {
      await Notification.updateMany(
        { _id: { $in: validIds }, forAdmin: true },
        { $set: { read: true } }
      );
    }

    // Đồng bộ trạng thái với các admin khác
    ids.forEach(notificationId => {
      socketManager.markNotificationRead(notificationId, adminId, true);
    });

    return ApiResponse.success(res, 200, null, 'Đánh dấu thông báo đã đọc thành công');
  } catch (error) {
    next(error);
  }
};

// Đếm số thông báo chưa đọc
exports.countUnread = async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({
      forAdmin: true,
      read: false
    });

    return ApiResponse.success(res, 200, { count }, 'Lấy số thông báo chưa đọc thành công');
  } catch (error) {
    next(error);
  }
};

// Đánh dấu tất cả thông báo đã đọc
exports.markAllAsRead = async (req, res, next) => {
  try {
    const adminId = req.user.id;

    const result = await Notification.updateMany(
      {
        forAdmin: true,
        read: false
      },
      { read: true }
    );

    // Thông báo cho tất cả admin đã đọc
    if (socketManager.getIO()) {
      socketManager.getIO().to('admin-channel').emit('admin-all-notifications-read', {
        readBy: adminId,
        timestamp: new Date().toISOString()
      });
    }

    return ApiResponse.success(res, 200, {
      modifiedCount: result.modifiedCount
    }, 'Đánh dấu tất cả thông báo đã đọc thành công');
  } catch (error) {
    next(error);
  }
};

// Xóa thông báo
exports.deleteNotification = async (req, res, next) => {
  try {
    const notificationId = req.params.id;
    const adminId = req.user.id;

    const { Types } = require('mongoose');
    if (!Types.ObjectId.isValid(notificationId)) {
      if (socketManager.getIO()) {
        socketManager.getIO().to('admin-channel').emit('admin-notification-deleted', {
          id: notificationId,
          deletedBy: adminId,
          timestamp: new Date().toISOString()
        });
      }
      return ApiResponse.success(res, 200, null, 'Xóa thông báo thành công');
    }

    const notification = await Notification.findOne({
      _id: notificationId,
      forAdmin: true
    });

    if (!notification) {
      throw new ApiError(404, 'Không tìm thấy thông báo');
    }

    await notification.deleteOne();

    // Thông báo cho tất cả admin
    if (socketManager.getIO()) {
      socketManager.getIO().to('admin-channel').emit('admin-notification-deleted', {
        id: notificationId,
        deletedBy: adminId,
        timestamp: new Date().toISOString()
      });
    }

    return ApiResponse.success(res, 200, null, 'Xóa thông báo thành công');
  } catch (error) {
    next(error);
  }
};
