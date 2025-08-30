// routes/admin/bannerRoutes.js
const express = require('express');
const router = express.Router();
const bannerController = require('../../controllers/admin/bannerController');
const { authenticate, authorize } = require('../../middlewares/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Cấu hình multer để upload file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(process.cwd(), 'uploads', 'banners');

    // Tạo thư mục nếu không tồn tại
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'banner-' + uniqueSuffix + ext);
  }
});

// Kiểm tra file upload là hình ảnh
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận tệp hình ảnh: jpeg, jpg, png, gif, webp'));
  }
};

// Cấu hình upload 
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // Giới hạn 5MB
});

// Middleware debug 
const debugRequest = (req, res, next) => {
  console.log('DEBUG - Headers:', {
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length']
  });
  console.log('DEBUG - Body keys:', Object.keys(req.body));
  next();
};

// Apply authentication middleware to all routes
router.use(authenticate);

// Get all banners with search and filters
router.get('/', authorize('settings.view'), bannerController.getAllBanners);

// Get a single banner
router.get('/:id', authorize('settings.view'), bannerController.getBanner);

// Create a new banner with file upload
router.post('/',
  authorize('settings.edit'),
  debugRequest,
  upload.single('image'),
  bannerController.createBanner
);

// Update a banner with file upload
router.put('/:id',
  authorize('settings.edit'),
  debugRequest,
  upload.single('image'),
  bannerController.updateBanner
);

// Delete a banner
router.delete('/:id', authorize('settings.edit'), bannerController.deleteBanner);

// Reorder banners (update positions)
router.post('/reorder', authorize('settings.edit'), bannerController.reorderBanners);

module.exports = router;