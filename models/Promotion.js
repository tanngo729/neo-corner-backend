const mongoose = require('mongoose');

const PromotionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  description: { type: String },
  discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  discountValue: { type: Number, default: 0 },
  minPurchase: { type: Number, default: 0 },
  maxUses: { type: Number, default: 0 },
  usedCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  startDate: { type: Date },
  expiry: { type: Date },
  image: { type: Object, default: null },
  appliesTo: { type: String, enum: ['all', 'category', 'product'], default: 'all' },
  categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  userType: { type: String, enum: ['all', 'new', 'vip'], default: 'all' },
  usageType: { type: String, enum: ['single', 'multi'], default: 'multi' }
}, { timestamps: true });

// Normalize code to uppercase
PromotionSchema.pre('save', function(next) {
  if (this.code) this.code = this.code.toUpperCase();
  next();
});

// Static: get active promotions for client
PromotionSchema.statics.getActivePromotions = async function() {
  const now = new Date();
  const query = {
    isActive: true,
    $and: [
      { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ expiry: { $exists: false } }, { expiry: null }, { expiry: { $gte: now } }] }
    ]
  };

  return this.find(query).sort({ createdAt: -1 }).limit(50);
};

// Static: find by code (case-insensitive, trim)
PromotionSchema.statics.findByCode = async function(code) {
  if (!code) return null;
  const normalized = code.toString().trim().toUpperCase();
  return this.findOne({ code: normalized });
};

// Instance: validate basic promotion constraints
PromotionSchema.methods.isValidPromotion = function() {
  const now = new Date();
  if (this.isActive === false) return false;
  if (this.startDate && this.startDate > now) return false;
  if (this.expiry && this.expiry < now) return false;
  if (typeof this.maxUses === 'number' && this.maxUses > 0 && typeof this.usedCount === 'number' && this.usedCount >= this.maxUses) {
    return false;
  }
  return true;
};

module.exports = mongoose.model('Promotion', PromotionSchema);
