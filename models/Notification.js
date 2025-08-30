const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  title: { type: String },
  description: { type: String },
  message: { type: String },
  type: { type: String, default: 'system' },
  status: { type: String },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  orderCode: { type: String },
  forAdmin: { type: Boolean, default: false },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
  read: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Notification', NotificationSchema);
// Indexes to stabilize queries
NotificationSchema.index({ forAdmin: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ customerId: 1, read: 1, createdAt: -1 });
