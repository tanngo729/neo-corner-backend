const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: String,
  image: String,
  quantity: { type: Number, default: 1 },
  price: { type: Number, default: 0 }
}, { _id: false });

const PaymentInfoSchema = new mongoose.Schema({
  status: { type: String, enum: ['AWAITING', 'PENDING', 'PAID', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'], default: 'AWAITING' },
  method: { type: String },
  paymentUrl: { type: String },
  requestedAt: { type: Date },
  transactionId: { type: String },
  paidAt: { type: Date }
}, { _id: false });

const AddressSchema = new mongoose.Schema({
  fullName: String,
  phone: String,
  street: String,
  ward: String,
  district: String,
  city: String
}, { _id: false });

const CouponSchema = new mongoose.Schema({
  code: String,
  discountType: String,
  discountValue: Number,
  discountAmount: Number,
  promotionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotion' }
}, { _id: false });

const OrderSchema = new mongoose.Schema({
  orderCode: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  items: { type: [OrderItemSchema], default: [] },
  subtotal: { type: Number, default: 0 },
  shippingFee: { type: Number, default: 0 },
  codFee: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  couponCode: { type: String },
  coupon: { type: CouponSchema, default: null },
  total: { type: Number, default: 0 },
  status: { type: String, default: 'AWAITING_PAYMENT' },
  payment: { type: PaymentInfoSchema, default: { status: 'AWAITING' } },
  paymentMethod: { type: String },
  paymentMethodId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMethod' },
  shippingMethod: { type: String },
  shippingAddress: { type: AddressSchema },
  shippingInfo: { type: mongoose.Schema.Types.Mixed, default: {} },
  notes: { type: String },
  stockUpdated: { type: Boolean, default: false },
  cancelReason: { type: String },
  cancelledAt: { type: Date },
  deliveryInfo: {
    shippedAt: { type: Date },
    deliveredAt: { type: Date }
  },
  adminNotes: [{
    content: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Order', OrderSchema);
// Helpful indexes
OrderSchema.index({ orderCode: 1 }, { unique: true });
OrderSchema.index({ user: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
