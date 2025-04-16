// models/Notification.js
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['new-order', 'order-status-update', 'cancelled-by-user', 'system'],
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  orderCode: String,
  title: String,
  description: String,
  status: String,
  read: {
    type: Boolean,
    default: false
  },
  forAdmin: {
    type: Boolean,
    default: false
  },
  // Thay đổi cách tham chiếu người dùng
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Luôn tham chiếu đến User
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer' // Tham chiếu đến Customer nếu là thông báo cho khách hàng
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 2592000 // 30 ngày
  }
});

// Thêm index cho tốc độ truy vấn
notificationSchema.index({ forAdmin: 1, read: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ customerId: 1, read: 1, createdAt: -1 });
notificationSchema.index({ orderId: 1 });

module.exports = mongoose.model('Notification', notificationSchema);