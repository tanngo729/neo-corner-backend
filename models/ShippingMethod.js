const mongoose = require('mongoose');

const RegionFeeSchema = new mongoose.Schema({
  regionCode: String,
  regionName: String,
  fee: { type: Number, default: 0 }
}, { _id: false });

const ShippingMethodSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  position: { type: Number, default: 0 },
  baseFee: { type: Number, default: 0 },
  freeShippingThreshold: { type: Number, default: 0 },
  estimatedDeliveryDays: { type: Number, default: 0 },
  regionFees: { type: [RegionFeeSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('ShippingMethod', ShippingMethodSchema);

