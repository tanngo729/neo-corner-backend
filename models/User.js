const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true, select: false },
  fullName: { type: String, trim: true },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role' },
  status: { type: String, enum: ['active', 'inactive', 'banned'], default: 'active' },
  type: { type: String, enum: ['admin', 'staff'], default: 'admin' },
  lastLogin: { type: Date }
}, { timestamps: true });

UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.matchPassword = async function(entered) {
  return bcrypt.compare(entered, this.password);
};

UserSchema.methods.generateAuthToken = function() {
  return jwt.sign({ id: this._id, type: this.type }, process.env.JWT_SECRET || 'dev_secret', {
    expiresIn: '30d'
  });
};

module.exports = mongoose.model('User', UserSchema);

