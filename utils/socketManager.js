// utils/socketManager.js
const Notification = require('../models/Notification');
let io;

// Thêm biến Map để theo dõi hoạt động admin
const currentAdminOperations = new Map();
// Theo dõi socket của người dùng
const userSocketMap = new Map();

exports.initialize = (socketIO) => {
  io = socketIO;

  io.on('connection', (socket) => {
    console.log(`Socket kết nối mới: ${socket.id}`);

    // Xử lý kiểm tra kết nối
    socket.on('check-connection', (data) => {
      console.log(`[SOCKET] Kiểm tra kết nối từ ${socket.id}:`, data);

      socket.emit('connection-verified', {
        received: true,
        timestamp: new Date(),
        socketId: socket.id,
        serverTime: new Date().toISOString()
      });
    });

    // Xử lý đăng nhập admin
    socket.on('admin-login', (adminId, extraData = {}) => {
      if (!adminId) return;

      console.log(`[SOCKET] Admin ${adminId} đăng nhập socket - ID: ${socket.id}`, extraData);

      // Rời các phòng cũ nếu cần
      const rooms = [...socket.rooms];
      rooms.forEach(room => {
        if (room !== socket.id && room.startsWith('admin:')) {
          socket.leave(room);
        }
      });

      // Tham gia phòng admin
      socket.join(`admin:${adminId}`);
      socket.join('admin-channel');

      // Lưu socket ID vào userSocketMap
      userSocketMap.set(`admin:${adminId}`, socket.id);

      // Gửi xác nhận rõ ràng
      socket.emit('admin-authenticated', {
        success: true,
        adminId,
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });

      // Gửi thông báo chưa đọc
      sendPendingNotifications(socket);

      // Kiểm tra và log phòng admin
      const adminRoom = io.sockets.adapter.rooms.get('admin-channel');
      const adminCount = adminRoom ? adminRoom.size : 0;
      console.log(`[SOCKET] Phòng admin-channel có ${adminCount} người`);
    });

    // Xử lý đăng nhập khách hàng
    socket.on('customer-login', (customerId, extraData = {}) => {
      if (!customerId) return;

      console.log(`[SOCKET] Khách hàng ${customerId} đăng nhập socket - ID: ${socket.id}`, extraData);

      // Rời các phòng cũ nếu cần
      const rooms = [...socket.rooms];
      rooms.forEach(room => {
        if (room !== socket.id && room.startsWith('customer:')) {
          socket.leave(room);
        }
      });

      const customerRoom = `customer:${customerId}`;
      socket.join(customerRoom);

      // Lưu socket ID vào userSocketMap
      userSocketMap.set(customerRoom, socket.id);

      // Gửi xác nhận rõ ràng
      socket.emit('customer-authenticated', {
        success: true,
        customerId,
        socketId: socket.id,
        timestamp: new Date().toISOString()
      });

      // Kiểm tra lại phòng
      const customerRoomExists = io.sockets.adapter.rooms.get(customerRoom);
      const customerCount = customerRoomExists ? customerRoomExists.size : 0;
      console.log(`[SOCKET] Khách hàng ${customerId} đã vào phòng ${customerRoom}, số người: ${customerCount}`);
    });

    // Xử lý sự kiện ngắt kết nối
    socket.on('disconnect', (reason) => {
      console.log(`Socket ngắt kết nối: ${socket.id}, lý do: ${reason}`);
      // Xóa socket ID khỏi userSocketMap
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

// Lấy thông báo chưa đọc
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

// Phương thức đăng ký hoạt động của admin
exports.registerAdminOperation = (adminId, operationType, targetId) => {
  if (!adminId || !operationType || !targetId) {
    console.error('Thiếu thông tin để đăng ký hoạt động admin');
    return false;
  }

  const key = `${adminId}-${operationType}-${targetId}`;
  currentAdminOperations.set(key, new Date().getTime());

  console.log(`[SOCKET] Đã đăng ký hoạt động admin: ${key}`);

  // Tự động xóa sau 10 giây để tránh memory leak
  setTimeout(() => {
    currentAdminOperations.delete(key);
    console.log(`[SOCKET] Đã xóa hoạt động admin: ${key}`);
  }, 10000);

  return true;
};

// Thông báo đơn hàng mới
exports.notifyNewOrder = async (orderData) => {
  if (!io) {
    console.error(`[${new Date().toISOString()}] IO chưa được khởi tạo, không thể gửi thông báo`);
    return null;
  }

  try {
    // Kiểm tra dữ liệu
    if (!orderData || !orderData.orderCode) {
      console.error('Dữ liệu đơn hàng không hợp lệ:', orderData);
      return null;
    }

    // Kiểm tra số lượng admin online
    const adminRoom = io.sockets.adapter.rooms.get('admin-channel');
    const adminCount = adminRoom ? adminRoom.size : 0;
    console.log(`[SOCKET] Số admin online: ${adminCount}`);

    // Lưu thông báo vào DB với userId đúng
    const notification = new Notification({
      type: orderData.type || 'new-order',
      orderId: orderData.orderId || orderData._id,
      orderCode: orderData.orderCode,
      title: `Đơn hàng mới #${orderData.orderCode}`,
      description: `Đơn hàng mới với giá trị ${orderData.total?.toLocaleString() || 0} VND`,
      status: orderData.status,
      forAdmin: true,
      read: false
    });

    await notification.save();
    console.log(`[SOCKET] Đã lưu thông báo: ${notification._id}`);

    // Gửi thông báo qua socket
    io.to('admin-channel').emit('new-order', {
      ...orderData,
      notificationId: notification._id.toString(),
      timestamp: new Date().toISOString()
    });

    console.log(`[SOCKET] Đã gửi thông báo đơn hàng #${orderData.orderCode} đến admin-channel`);

    return notification;
  } catch (error) {
    console.error('Lỗi khi gửi thông báo đơn hàng mới:', error);
    return null;
  }
};

// Thông báo cập nhật trạng thái đơn hàng - ĐÃ SỬA LỖI
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
    // LUÔN gửi thông báo đến khách hàng nếu là đơn hàng có user
    if (order.user) {
      const customerId = order.user.toString();
      const customerRoom = `customer:${customerId}`;

      // Kiểm tra xem phòng khách hàng có tồn tại không
      const customerRoomExists = io.sockets.adapter.rooms.get(customerRoom);
      const customerCount = customerRoomExists ? customerRoomExists.size : 0;

      // THÊM NHIỀU LOG để debug
      console.log(`[SOCKET] Gửi thông báo cập nhật đơn hàng #${order.orderCode} đến phòng ${customerRoom}`);
      console.log(`[SOCKET] Số khách hàng online trong phòng ${customerRoom}: ${customerCount}`);

      if (customerCount > 0) {
        // Gửi thông báo đến khách hàng
        io.to(customerRoom).emit('order-status-update', {
          orderId: order._id.toString(),
          orderCode: order.orderCode,
          status: order.status,
          timestamp: new Date().toISOString()
        });

        console.log(`[SOCKET] Đã gửi thông báo cập nhật đơn hàng #${order.orderCode} đến khách hàng ${customerId}`);
      } else {
        console.log(`[SOCKET] Khách hàng ${customerId} không online, tạo thông báo trong DB`);

        // Lưu thông báo vào database cho khách hàng
        try {
          const notification = new Notification({
            type: 'order-status-update',
            orderId: order._id,
            orderCode: order.orderCode,
            title: `Cập nhật đơn hàng #${order.orderCode}`,
            description: `Đơn hàng của bạn đã được cập nhật sang trạng thái mới`,
            status: order.status,
            forAdmin: false,
            customerId: order.user, // Sử dụng customerId thay vì userId
            read: false
          });

          await notification.save();
          console.log(`[SOCKET] Đã lưu thông báo cập nhật đơn hàng cho khách hàng: ${notification._id}`);
        } catch (notifyError) {
          console.error(`[SOCKET] Lỗi lưu thông báo cho khách hàng:`, notifyError);
        }
      }
    }

    // Kiểm tra xem có phải admin vừa thực hiện thao tác này không
    let skipAdminNotification = false;

    if (adminId) {
      const operationKey = `${adminId}-update-${order._id.toString()}`;
      skipAdminNotification = currentAdminOperations.has(operationKey);
    }

    // Nếu không phải admin thực hiện, hoặc không tìm thấy key trong Map
    if (!skipAdminNotification) {
      // Gửi thông báo cho admin
      io.to('admin-channel').emit('admin-notification', {
        _id: order._id.toString(),
        orderId: order._id.toString(),
        orderCode: order.orderCode,
        status: order.status,
        type: 'status-update',
        timestamp: new Date().toISOString()
      });

      console.log(`[SOCKET] Đã gửi thông báo cập nhật trạng thái đơn hàng #${order.orderCode} đến admin-channel`);
    }
  } catch (error) {
    console.error('Lỗi khi gửi thông báo cập nhật trạng thái:', error);
  }
};

// Lấy socket instance
exports.getIO = () => io;

// Kiểm tra trạng thái kết nối của người dùng
exports.isUserConnected = (userId, isAdmin = false) => {
  const roomKey = isAdmin ? `admin:${userId}` : `customer:${userId}`;
  return userSocketMap.has(roomKey);
};