const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const CustomerSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true, select: false },
  fullName: { type: String },
  phone: { type: String },
  status: { type: String, enum: ['active', 'inactive', 'banned'], default: 'active' },
  isVerified: { type: Boolean, default: false },
  verificationToken: { type: String },
  resetPasswordToken: { type: String },
  resetPasswordExpire: { type: Date },
  lastLogin: { type: Date },
  avatar: { type: String }
}, { timestamps: true });

CustomerSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

CustomerSchema.methods.matchPassword = async function(entered) {
  return bcrypt.compare(entered, this.password);
};

CustomerSchema.methods.generateAuthToken = function() {
  // Persist login longer for customers, default to days
  const days = parseInt(process.env.JWT_REFRESH_EXPIRATION_DAYS, 10);
  const expiresIn = Number.isFinite(days) && days > 0 ? `${days}d` : '30d';
  return jwt.sign({ id: this._id, type: 'customer' }, process.env.JWT_SECRET || 'dev_secret', { expiresIn });
};

module.exports = mongoose.model('Customer', CustomerSchema);
