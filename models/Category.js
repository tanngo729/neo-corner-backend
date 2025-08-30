const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
  url: String,
  publicId: String
}, { _id: false });

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  image: { type: ImageSchema, default: null },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  position: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Category', CategorySchema);

