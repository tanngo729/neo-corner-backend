// controllers/client/notificationController.js
const Notification = require('../../models/Notification');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');
const socketManager = require('../../utils/socketManager');

// Lấy thông báo của khách hàng
exports.getNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, read } = req.query;
    const customerId = req.user.id;

    const query = {
      customerId,
      forAdmin: false
    };

    if (read !== undefined) {
      query.read = read === 'true';
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
      'Lấy danh sách thông báo thành công'
    );
  } catch (error) {
    next(error);
  }
};

// Đánh dấu thông báo đã đọc
exports.markAsRead = async (req, res, next) => {
  try {
    const { notificationIds } = req.body;
    const customerId = req.user.id;

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      throw new ApiError(400, 'Danh sách ID thông báo không hợp lệ');
    }

    const result = await Notification.updateMany(
      {
        _id: { $in: notificationIds },
        customerId,
        forAdmin: false
      },
      { read: true }
    );

    // Đồng bộ trạng thái đã đọc
    notificationIds.forEach(notificationId => {
      socketManager.markNotificationRead(notificationId, customerId, false);
    });

    return ApiResponse.success(res, 200, {
      modifiedCount: result.modifiedCount
    }, 'Đánh dấu thông báo đã đọc thành công');
  } catch (error) {
    next(error);
  }
};

// Đánh dấu tất cả thông báo đã đọc
exports.markAllAsRead = async (req, res, next) => {
  try {
    const customerId = req.user.id;

    const result = await Notification.updateMany(
      {
        customerId,
        forAdmin: false,
        read: false
      },
      { read: true }
    );

    // Gửi thông báo về đã đọc tất cả
    if (socketManager.getIO()) {
      socketManager.getIO().to(`customer:${customerId}`).emit('all-notifications-marked-read', {
        success: true,
        count: result.modifiedCount,
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
    const customerId = req.user.id;

    const notification = await Notification.findOne({
      _id: notificationId,
      customerId,
      forAdmin: false
    });

    if (!notification) {
      throw new ApiError(404, 'Không tìm thấy thông báo');
    }

    await notification.deleteOne();

    // Gửi thông báo xóa về client
    if (socketManager.getIO()) {
      socketManager.getIO().to(`customer:${customerId}`).emit('notification-deleted', {
        id: notificationId,
        timestamp: new Date().toISOString()
      });
    }

    return ApiResponse.success(res, 200, null, 'Xóa thông báo thành công');
  } catch (error) {
    next(error);
  }
};

// Đếm số thông báo chưa đọc
exports.countUnread = async (req, res, next) => {
  try {
    const customerId = req.user.id;

    const count = await Notification.countDocuments({
      customerId,
      forAdmin: false,
      read: false
    });

    return ApiResponse.success(res, 200, { count }, 'Lấy số thông báo chưa đọc thành công');
  } catch (error) {
    next(error);
  }
};