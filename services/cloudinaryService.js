// backend/services/cloudinaryService.js
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Cloudinary via environment variables (recommended)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || ''
});

// Basic config presence log (avoid printing secrets)
try {
  const cfg = cloudinary.config();
  console.log('Cloudinary config:', {
    cloud_name: cfg.cloud_name || 'missing',
    api_key: cfg.api_key ? 'exists' : 'missing',
    api_secret: cfg.api_secret ? 'exists' : 'missing'
  });
} catch (_) {}

// Cấu hình disk storage cho multer
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = path.join(process.cwd(), 'uploads');

    // Tạo thư mục nếu chưa tồn tại
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// Kiểm tra định dạng file
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file hình ảnh'), false);
  }
};

// Middleware upload sản phẩm - sử dụng disk storage
const uploadProductImages = multer({
  storage: diskStorage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
}).array('images', 5);

// Middleware upload danh mục - sử dụng disk storage
const uploadCategoryImage = multer({
  storage: diskStorage,
  fileFilter: fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
}).single('image');

// Middleware upload avatar người dùng - sử dụng disk storage
const uploadAvatarImage = multer({
  storage: diskStorage,
  fileFilter: fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
}).single('avatar');

// Hàm upload file lên Cloudinary
const uploadToCloudinary = async (filePath, folder = 'ecommerce/products') => {
  try {
    // Kiểm tra xem file có tồn tại không
    if (!fs.existsSync(filePath)) {
      throw new Error('File không tồn tại');
    }

    // Upload lên Cloudinary dùng Promise
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        filePath,
        { folder: folder },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
    });

    // Xóa file tạm sau khi upload
    try {
      fs.unlinkSync(filePath);
    } catch (unlinkError) {
    }

    return {
      url: result.secure_url,
      publicId: result.public_id
    };
  } catch (error) {
    throw error;
  }
};

// Hàm xóa hình ảnh từ Cloudinary
const deleteImage = async (publicId) => {
  try {
    if (!publicId) {
      return null;
    }

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });

    return result;
  } catch (error) {
    throw error;
  }
};

// Hàm upload hình ảnh từ URL
const uploadImageFromUrl = async (imageUrl, folder = 'ecommerce/products') => {
  try {
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        imageUrl,
        { folder: folder },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      );
    });

    return {
      url: result.secure_url,
      publicId: result.public_id
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  cloudinary,
  uploadProductImages,
  uploadCategoryImage,
  uploadAvatarImage,
  uploadToCloudinary,
  uploadImageFromUrl,
  deleteImage
};
