const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Số lượng không thể nhỏ hơn 1'],
    default: 1
  },
  price: {
    type: Number,
    required: true
  },
  name: String,
  image: String
}, { _id: true });

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [cartItemSchema],
  couponCode: {
    type: String,
    default: null
  },
  couponDiscount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Tính tổng số lượng sản phẩm trong giỏ hàng
cartSchema.virtual('totalItems').get(function () {
  return this.items.reduce((total, item) => total + item.quantity, 0);
});

// Tính tổng tiền trước khi áp dụng giảm giá
cartSchema.virtual('subtotal').get(function () {
  return this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
});

// Tính tổng tiền sau khi áp dụng giảm giá
cartSchema.virtual('total').get(function () {
  return Math.max(0, this.subtotal - this.couponDiscount);
});

module.exports = mongoose.model('Cart', cartSchema);