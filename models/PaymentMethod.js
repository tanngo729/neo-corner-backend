const mongoose = require('mongoose');

const PaymentMethodSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String },
  icon: { type: String },
  isActive: { type: Boolean, default: true },
  position: { type: Number, default: 0 },
  config: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('PaymentMethod', PaymentMethodSchema);

