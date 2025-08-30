const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
  url: String,
  publicId: String,
  width: Number,
  height: Number,
  format: String
}, { _id: false });

const BannerSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  buttonText: { type: String },
  buttonLink: { type: String },
  iconType: { type: String },
  image: { type: ImageSchema, default: null },
  link: { type: String },
  position: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  displayOn: { type: [String], default: ['home'] },
  startDate: { type: Date },
  endDate: { type: Date }
}, { timestamps: true });

// Static: get active banners by location
BannerSchema.statics.getActiveBanners = async function(location = 'home', limit = 10) {
  const now = new Date();
  const query = {
    isActive: true,
    $and: [
      { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
      { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] }
    ],
    $or: [
      { displayOn: { $in: [location] } },
      { displayOn: { $in: ['all'] } }
    ]
  };

  return this.find(query).sort({ position: 1, createdAt: -1 }).limit(limit);
};

module.exports = mongoose.model('Banner', BannerSchema);
