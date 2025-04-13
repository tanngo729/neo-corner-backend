// backend/models/Role.js
const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Tên vai trò không được để trống'],
    unique: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  permissions: [{
    type: String,
    required: true
  }],
  isDefault: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Virtual cho người dùng thuộc vai trò này
roleSchema.virtual('users', {
  ref: 'User',
  localField: '_id',
  foreignField: 'role'
});

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;