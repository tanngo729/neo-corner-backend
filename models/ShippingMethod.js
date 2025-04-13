// models/ShippingMethod.js
const mongoose = require('mongoose');

const shippingMethodSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  isActive: {
    type: Boolean,
    default: true
  },
  position: {
    type: Number,
    default: 0
  },
  baseFee: {
    type: Number,
    default: 0
  },
  freeShippingThreshold: {
    type: Number,
    default: 0
  },
  estimatedDeliveryDays: {
    type: Number,
    default: 3
  },
  // Cấu hình phí vận chuyển theo khu vực
  regionFees: [{
    regionCode: String, // Mã khu vực (tỉnh/thành)
    regionName: String, // Tên khu vực
    fee: Number // Phí vận chuyển
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('ShippingMethod', shippingMethodSchema);