const mongoose = require('mongoose');

const CartItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String },
  image: { type: String },
  quantity: { type: Number, default: 1 },
  price: { type: Number, default: 0 }
}, { _id: true });

const CartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  items: { type: [CartItemSchema], default: [] },
  couponCode: { type: String, default: null },
  couponDiscount: { type: Number, default: 0 }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

CartSchema.virtual('subtotal').get(function () {
  if (!this.items || this.items.length === 0) return 0;
  return this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
});

CartSchema.virtual('totalItems').get(function () {
  if (!this.items || this.items.length === 0) return 0;
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

CartSchema.virtual('total').get(function () {
  const subtotal = this.subtotal || 0;
  const discount = this.couponDiscount || 0;
  return Math.max(0, subtotal - discount);
});

module.exports = mongoose.model('Cart', CartSchema);
