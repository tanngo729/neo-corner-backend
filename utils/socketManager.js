// utils/socketManager.js
const Notification = require('../models/Notification');
let io;

const currentAdminOperations = new Map();
const userSocketMap = new Map();

const recentNotifications = new Map();

const notificationConfig = {
  THROTTLE_TIME: {
    'new-order': 10000,
    'order-status-update': 5000,
    'cancelled-by-user': 5000,
    'system': 20000
  },
  MAX_NOTIFICATIONS: {
    'new-order': 5,
    'order-status-update': 10,
    'cancelled-by-user': 3,
    'system': 3
  },
  GROUP_WINDOW: 60000,
};

const groupedNotifications = {
  'new-order': [],
  'order-status-update': [],
  'cancelled-by-user': [],
  'system': []
};

const lastGroupSentTime = {
  'new-order': 0,
  'order-status-update': 0,
  'cancelled-by-user': 0,
  'system': 0
};

exports.initialize = (socketIO) => {
  io = socketIO;

  io.on('connection', (socket) => {
    console.log(`Socket kết nối mới: ${socket.id}`);

    socket.on('check-connection', (data) => {
      console.log(`[SOCKET] Kiểm tra kết nối từ ${socket.id}:`, data);

      socket.emit('connection-verified', {
        received: true,
        timestamp: new Date(),
        socketId: socket.id,
        serverTime: new Date().toISOString()
      });
    });

    socket.on('reconnect_attempt', () => {
      console.log(`Socket ${socket.id} đang cố gắng kết nối lại`);
    });

    socket.on('reconnect', () => {
      console.log(`Socket ${socket.id} đã kết nối lại thành công`);
    });

    socket.on('admin-login', (adminId, extraData = {}) => {
      if (!adminId) return;

      console.log(`[SOCKET] Admin ${adminId} đăng nhập socket - ID: ${socket.id}`, extraData);

      const rooms = [...socket.rooms];
      rooms.forEach(room => {
        if (room !== socket.id && room.startsWith('admin:')) {
          socket.leave(room);
        }
      });

      socket.join(`admin:${adminId}`);
      socket.join('admin-channel');
      userSocketMap.set(`admin:${adminId}`, socket.id);

      socket.emit('admin-authenticated', {
        success: true,
        adminId,
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });

      sendPendingNotifications(socket);

      const adminRoom = io.sockets.adapter.rooms.get('admin-channel');
      const adminCount = adminRoom ? adminRoom.size : 0;
      console.log(`[SOCKET] Phòng admin-channel có ${adminCount} người`);
    });

    socket.on('customer-login', (customerId, extraData = {}) => {
      if (!customerId) return;

      console.log(`[SOCKET] Khách hàng ${customerId} đăng nhập socket - ID: ${socket.id}`, extraData);

      const rooms = [...socket.rooms];
      rooms.forEach(room => {
        if (room !== socket.id && room.startsWith('customer:')) {
          socket.leave(room);
        }
      });

      const customerRoom = `customer:${customerId}`;
      socket.join(customerRoom);

      userSocketMap.set(customerRoom, socket.id);

      socket.emit('customer-authenticated', {
        success: true,
        customerId,
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });

      const customerRoomExists = io.sockets.adapter.rooms.get(customerRoom);
      const customerCount = customerRoomExists ? customerRoomExists.size : 0;
      console.log(`[SOCKET] Khách hàng ${customerId} đã vào phòng ${customerRoom}, số người: ${customerCount}`);
    });

    socket.on('mark-notification-read', async (data) => {
      try {
        const { notificationId, userId, isAdmin } = data;

        if (!notificationId) {
          return socket.emit('notification-read-error', { message: 'Thiếu thông tin thông báo' });
        }

        const query = { _id: notificationId };

        if (isAdmin) {
          query.forAdmin = true;
        } else if (userId) {
          query.customerId = userId;
          query.forAdmin = false;
        }

        const result = await Notification.findOneAndUpdate(
          query,
          { read: true },
          { new: true }
        );

        if (!result) {
          return socket.emit('notification-read-error', { message: 'Không tìm thấy thông báo' });
        }

        socket.emit('notification-marked-read', {
          id: notificationId,
          success: true,
          timestamp: new Date().toISOString()
        });

        if (isAdmin) {
          socket.to('admin-channel').emit('admin-notification-read', {
            id: notificationId,
            readBy: userId
          });
        }

        console.log(`[SOCKET] Đã đánh dấu thông báo ${notificationId} đã đọc bởi ${isAdmin ? 'admin' : 'khách hàng'} ${userId}`);
      } catch (error) {
        console.error('Lỗi khi đánh dấu thông báo đã đọc:', error);
        socket.emit('notification-read-error', { message: 'Lỗi xử lý' });
      }
    });

    socket.on('mark-all-notifications-read', async (data) => {
      try {
        const { userId, isAdmin } = data;

        if (!userId) {
          return socket.emit('notification-read-error', { message: 'Thiếu thông tin người dùng' });
        }

        const query = { read: false };

        if (isAdmin) {
          query.forAdmin = true;
        } else {
          query.customerId = userId;
          query.forAdmin = false;
        }

        const result = await Notification.updateMany(query, { read: true });

        socket.emit('all-notifications-marked-read', {
          success: true,
          count: result.modifiedCount,
          timestamp: new Date().toISOString()
        });
        if (isAdmin) {
          socket.to('admin-channel').emit('admin-all-notifications-read', {
            readBy: userId
          });
        }

        console.log(`[SOCKET] Đã đánh dấu tất cả (${result.modifiedCount}) thông báo đã đọc bởi ${isAdmin ? 'admin' : 'khách hàng'} ${userId}`);
      } catch (error) {
        console.error('Lỗi khi đánh dấu tất cả thông báo đã đọc:', error);
        socket.emit('notification-read-error', { message: 'Lỗi xử lý' });
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`Socket ngắt kết nối: ${socket.id}, lý do: ${reason}`);
      for (const [key, value] of userSocketMap.entries()) {
        if (value === socket.id) {
          userSocketMap.delete(key);
          console.log(`[SOCKET] Đã xóa socket mapping cho ${key}`);
        }
      }
    });
  });

  return io;
};

function createNotificationKey(data) {
  if (!data) return null;

  const type = data.type || 'unknown';

  if (data.orderId) {
    return `${type}-${data.orderId}-${data.status || ''}`;
  } else {
    return `${type}-${Date.now()}`;
  }
}

async function sendGroupedNotifications(type) {
  if (groupedNotifications[type].length === 0) return;

  try {
    const count = groupedNotifications[type].length;
    const firstItem = groupedNotifications[type][0];

    let title, description;

    switch (type) {
      case 'new-order':
        title = `${count} đơn hàng mới`;
        description = `Có ${count} đơn hàng mới cần xử lý`;
        break;
      case 'order-status-update':
        title = `${count} cập nhật trạng thái đơn hàng`;
        description = 'Có nhiều đơn hàng được cập nhật trạng thái';
        break;
      case 'cancelled-by-user':
        title = `${count} đơn hàng bị hủy`;
        description = 'Có nhiều đơn hàng bị hủy bởi khách hàng';
        break;
      default:
        title = `${count} thông báo mới`;
        description = 'Có nhiều thông báo mới';
    }

    const notification = new Notification({
      type: 'grouped',
      title,
      description,
      forAdmin: true,
      read: false,
      metadata: {
        count,
        type,
        items: groupedNotifications[type].map(item => ({
          orderId: item.orderId,
          orderCode: item.orderCode,
          status: item.status
        }))
      }
    });

    await notification.save();

    io.to('admin-channel').emit('grouped-notification', {
      id: notification._id.toString(),
      title,
      description,
      type: 'grouped',
      originalType: type,
      count,
      items: groupedNotifications[type].map(item => ({
        orderId: item.orderId,
        orderCode: item.orderCode,
        status: item.status
      })),
      timestamp: new Date().toISOString()
    });

    console.log(`[SOCKET] Đã gửi ${count} thông báo gom nhóm loại ${type}`);

    groupedNotifications[type] = [];
    lastGroupSentTime[type] = Date.now();
  } catch (error) {
    console.error('Lỗi khi gửi thông báo gom nhóm:', error);
  }
}

async function createNotification(data) {
  const type = data.type || 'new-order';

  const notification = new Notification({
    type,
    orderId: data.orderId || data._id,
    orderCode: data.orderCode,
    title: data.title || `Đơn hàng mới #${data.orderCode}`,
    description: data.description || `Đơn hàng mới với giá trị ${data.total?.toLocaleString() || 0} VND`,
    status: data.status,
    forAdmin: true,
    read: false
  });

  await notification.save();
  return notification;
}

async function sendPendingNotifications(socket) {
  try {
    const notifications = await Notification.find({
      forAdmin: true,
      read: false
    }).sort({ createdAt: -1 }).limit(20);

    if (notifications.length > 0) {
      socket.emit('pending-notifications', notifications);
    }
  } catch (error) {
    console.error('Lỗi khi lấy thông báo chưa đọc:', error);
  }
}

exports.registerAdminOperation = (adminId, operationType, targetId) => {
  if (!adminId || !operationType || !targetId) {
    console.error('Thiếu thông tin để đăng ký hoạt động admin');
    return false;
  }

  const key = `${adminId}-${operationType}-${targetId}`;
  currentAdminOperations.set(key, new Date().getTime());

  console.log(`[SOCKET] Đã đăng ký hoạt động admin: ${key}`);

  setTimeout(() => {
    currentAdminOperations.delete(key);
    console.log(`[SOCKET] Đã xóa hoạt động admin: ${key}`);
  }, 10000);

  return true;
};

// HÀM ĐÃ ĐƯỢC CẬP NHẬT
exports.notifyNewOrder = async (orderData) => {
  if (!io) {
    console.error(`[${new Date().toISOString()}] IO chưa được khởi tạo, không thể gửi thông báo`);
    return null;
  }

  try {
    if (!orderData || !orderData.orderCode) {
      console.error('Dữ liệu đơn hàng không hợp lệ:', orderData);
      return null;
    }
    const notificationKey = createNotificationKey(orderData);
    const now = Date.now();
    const type = orderData.type || 'new-order';

    // Kiểm tra đã gửi thông báo này gần đây chưa để tránh trùng lặp
    if (recentNotifications.has(notificationKey)) {
      const lastTime = recentNotifications.get(notificationKey);
      if (now - lastTime < notificationConfig.THROTTLE_TIME[type]) {
        console.log(`[SOCKET] Bỏ qua thông báo trùng lặp: ${notificationKey} - Đã gửi cách đây ${(now - lastTime) / 1000}s`);
        return null;
      }
    }

    // Đánh dấu đã xử lý thông báo này
    recentNotifications.set(notificationKey, now);

    // Tự động xóa khỏi danh sách sau 5 phút để tránh memory leak
    setTimeout(() => {
      recentNotifications.delete(notificationKey);
    }, 300000);

    const shouldGroup = groupedNotifications[type].length > 0 &&
      now - lastGroupSentTime[type] < notificationConfig.GROUP_WINDOW;

    if (shouldGroup && groupedNotifications[type].length < notificationConfig.MAX_NOTIFICATIONS[type]) {
      // Thêm vào nhóm để gửi gộp sau
      groupedNotifications[type].push(orderData);
      console.log(`[SOCKET] Thêm thông báo vào nhóm ${type}, hiện có ${groupedNotifications[type].length} thông báo`);

      if (groupedNotifications[type].length >= notificationConfig.MAX_NOTIFICATIONS[type]) {
        sendGroupedNotifications(type);
      }
    } else {
      // Gửi các thông báo nhóm còn tồn đọng (nếu có)
      if (groupedNotifications[type].length > 0) {
        sendGroupedNotifications(type);
      }

      // Gửi thông báo riêng lẻ mới
      let notification;

      // Sử dụng notificationId có sẵn nếu được truyền vào
      if (orderData.notificationId) {
        notification = { _id: orderData.notificationId };
        console.log(`[SOCKET] Sử dụng thông báo có sẵn: ${notification._id}`);
      } else {
        // Nếu không có, tạo thông báo mới trong DB
        notification = await createNotification(orderData);
        console.log(`[SOCKET] Đã lưu thông báo mới: ${notification._id}`);
      }

      // Gửi thông báo qua socket - CHÚNG TA CHỈ GỬI MỘT LẦN Ở ĐÂY
      io.to('admin-channel').emit('new-order', {
        ...orderData,
        notificationId: notification._id.toString(),
        timestamp: new Date().toISOString()
      });

      groupedNotifications[type] = [];
      lastGroupSentTime[type] = now;
    }

    const adminRoom = io.sockets.adapter.rooms.get('admin-channel');
    const adminCount = adminRoom ? adminRoom.size : 0;
    console.log(`[SOCKET] Số admin online: ${adminCount}`);

    return true;
  } catch (error) {
    console.error('Lỗi khi gửi thông báo đơn hàng mới:', error);
    return null;
  }
};

exports.notifyOrderStatusUpdate = async (order, adminId = null) => {
  if (!io) {
    console.error('IO chưa được khởi tạo, không thể gửi thông báo');
    return;
  }

  if (!order) {
    console.error('Đơn hàng không hợp lệ, không thể gửi thông báo');
    return;
  }

  try {
    if (order.user) {
      const customerId = order.user.toString();
      const customerRoom = `customer:${customerId}`;

      const notificationData = {
        orderId: order._id.toString(),
        orderCode: order.orderCode,
        status: order.status,
        type: 'order-status-update',
        timestamp: new Date().toISOString()
      };

      const customerRoomExists = io.sockets.adapter.rooms.get(customerRoom);
      const customerCount = customerRoomExists ? customerRoomExists.size : 0;

      console.log(`[SOCKET] Gửi thông báo cập nhật đơn hàng #${order.orderCode} đến phòng ${customerRoom}`);
      console.log(`[SOCKET] Số khách hàng online trong phòng ${customerRoom}: ${customerCount}`);

      const customerNotificationKey = `customer-${customerId}-order-${order._id.toString()}-status-${order.status}`;
      const now = Date.now();

      const shouldSendToCustomer = !recentNotifications.has(customerNotificationKey) ||
        (now - recentNotifications.get(customerNotificationKey) >=
          notificationConfig.THROTTLE_TIME['order-status-update']);

      if (customerCount > 0 && shouldSendToCustomer) {
        io.to(customerRoom).emit('order-status-update', notificationData);

        recentNotifications.set(customerNotificationKey, now);

        console.log(`[SOCKET] Đã gửi thông báo cập nhật đơn hàng #${order.orderCode} đến khách hàng ${customerId}`);
      } else {
        console.log(`[SOCKET] ${!shouldSendToCustomer ? 'Bỏ qua thông báo trùng lặp' : 'Khách hàng không online'}, tạo thông báo trong DB`);


        try {
          const notification = new Notification({
            type: 'order-status-update',
            orderId: order._id,
            orderCode: order.orderCode,
            title: `Cập nhật đơn hàng #${order.orderCode}`,
            description: `Đơn hàng của bạn đã được cập nhật sang trạng thái mới`,
            status: order.status,
            forAdmin: false,
            customerId: order.user,
            read: false
          });

          await notification.save();
          console.log(`[SOCKET] Đã lưu thông báo cập nhật đơn hàng cho khách hàng: ${notification._id}`);
        } catch (notifyError) {
          console.error(`[SOCKET] Lỗi lưu thông báo cho khách hàng:`, notifyError);
        }
      }
    }

    let skipAdminNotification = false;

    if (adminId) {
      const operationKey = `${adminId}-update-${order._id.toString()}`;
      skipAdminNotification = currentAdminOperations.has(operationKey);
    }

    if (!skipAdminNotification) {
      const adminNotificationData = {
        _id: order._id.toString(),
        orderId: order._id.toString(),
        orderCode: order.orderCode,
        status: order.status,
        type: 'order-status-update',
        timestamp: new Date().toISOString()
      };
      const adminNotificationKey = `admin-order-${order._id.toString()}-status-${order.status}`;
      const now = Date.now();

      if (recentNotifications.has(adminNotificationKey) &&
        (now - recentNotifications.get(adminNotificationKey) < notificationConfig.THROTTLE_TIME['order-status-update'])) {
        console.log(`[SOCKET] Bỏ qua thông báo admin trùng lặp cho đơn hàng #${order.orderCode}`);
        return;
      }

      recentNotifications.set(adminNotificationKey, now);

      const type = 'order-status-update';
      const shouldGroup = groupedNotifications[type].length > 0 &&
        (now - lastGroupSentTime[type] < notificationConfig.GROUP_WINDOW);

      if (shouldGroup && groupedNotifications[type].length < notificationConfig.MAX_NOTIFICATIONS[type]) {
        groupedNotifications[type].push(adminNotificationData);
        console.log(`[SOCKET] Thêm thông báo cập nhật đơn hàng vào nhóm, hiện có ${groupedNotifications[type].length} thông báo`);

        if (groupedNotifications[type].length >= notificationConfig.MAX_NOTIFICATIONS[type]) {
          sendGroupedNotifications(type);
        }
      } else {
        if (groupedNotifications[type].length > 0) {
          sendGroupedNotifications(type);
        }

        io.to('admin-channel').emit('admin-notification', adminNotificationData);

        const notification = new Notification({
          type: 'order-status-update',
          orderId: order._id,
          orderCode: order.orderCode,
          title: `Cập nhật đơn hàng #${order.orderCode}`,
          description: `Đơn hàng đã cập nhật sang trạng thái: ${order.status}`,
          status: order.status,
          forAdmin: true,
          read: false
        });

        await notification.save();
        console.log(`[SOCKET] Đã lưu thông báo cập nhật đơn hàng cho admin: ${notification._id}`);

        groupedNotifications[type] = [];
        lastGroupSentTime[type] = now;
      }

      console.log(`[SOCKET] Đã gửi thông báo cập nhật trạng thái đơn hàng #${order.orderCode} đến admin-channel`);
    }
  } catch (error) {
    console.error('Lỗi khi gửi thông báo cập nhật trạng thái:', error);
  }
};

exports.markNotificationRead = async (notificationId, userId, isAdmin) => {
  if (!io) {
    console.error('IO chưa được khởi tạo, không thể đánh dấu thông báo');
    return null;
  }

  try {
    const query = { _id: notificationId };

    if (isAdmin) {
      query.forAdmin = true;
    } else if (userId) {
      query.customerId = userId;
      query.forAdmin = false;
    }

    const result = await Notification.findOneAndUpdate(
      query,
      { read: true },
      { new: true }
    );

    if (!result) return null;

    if (isAdmin) {
      io.to('admin-channel').emit('admin-notification-read', {
        id: notificationId,
        readBy: userId
      });
    } else {
      io.to(`customer:${userId}`).emit('notification-marked-read', {
        id: notificationId,
        success: true
      });
    }

    return result;
  } catch (error) {
    console.error('Lỗi khi đánh dấu thông báo đã đọc:', error);
    return null;
  }
};

setInterval(() => {
  for (const type in groupedNotifications) {
    if (groupedNotifications[type].length > 0) {
      const now = Date.now();
      if (now - lastGroupSentTime[type] >= notificationConfig.GROUP_WINDOW) {
        sendGroupedNotifications(type);
      }
    }
  }
}, 15000);

// Lấy socket instance
exports.getIO = () => io;

exports.isUserConnected = (userId, isAdmin = false) => {
  const roomKey = isAdmin ? `admin:${userId}` : `customer:${userId}`;
  return userSocketMap.has(roomKey);
};