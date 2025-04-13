// backend/models/ActivityLog.js
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    enum: ['create', 'update', 'delete'],
    required: true
  },
  entity: {
    type: String,
    enum: ['product', 'category', 'user', 'role', 'order', 'setting'],
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  entityName: {
    type: String,
    required: true
  },
  details: {
    type: Object,
    default: {}
  },
  ip: {
    type: String
  }
}, {
  timestamps: true
});

// Index để tối ưu truy vấn
activityLogSchema.index({ entity: 1, entityId: 1 });
activityLogSchema.index({ user: 1 });
activityLogSchema.index({ createdAt: -1 });

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

module.exports = ActivityLog;