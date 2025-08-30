const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
  url: String,
  publicId: String
}, { _id: false });

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
  slug: { type: String, index: true },
  price: { type: Number, required: true, default: 0 },
  stock: { type: Number, default: 0 },
  sold: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  position: { type: Number, default: 0 },
  images: { type: [ImageSchema], default: [] },
  mainImage: { type: ImageSchema, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Product', ProductSchema);
