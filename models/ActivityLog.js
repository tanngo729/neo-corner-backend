const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String },
  entity: { type: String },
  entityId: { type: mongoose.Schema.Types.ObjectId },
  entityName: { type: String },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  ip: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);

