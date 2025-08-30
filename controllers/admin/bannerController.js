// controllers/admin/bannerController.js
const Banner = require('../../models/Banner');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');
const { logActivity } = require('../../services/loggingService');
const { uploadToCloudinary, deleteImage } = require('../../services/cloudinaryService');
const fs = require('fs');
const path = require('path');

// Get all banners với khả năng tìm kiếm, lọc và sắp xếp nâng cao
exports.getAllBanners = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'position',
      sortOrder = 'asc',
      isActive,
      displayOn
    } = req.query;

    const query = {};

    // Tìm kiếm theo tiêu đề hoặc mô tả
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Lọc theo trạng thái
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Lọc theo vị trí hiển thị
    if (displayOn) {
      query.displayOn = displayOn;
    }

    // Đếm tổng số banner thỏa mãn điều kiện
    const total = await Banner.countDocuments(query);

    // Xác định hướng sắp xếp
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Lấy dữ liệu với phân trang và sắp xếp
    const banners = await Banner.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    return ApiResponse.paginated(
      res,
      banners,
      parseInt(page),
      parseInt(limit),
      total,
      'Lấy danh sách banner thành công'
    );
  } catch (error) {
    next(error);
  }
};

// Get a single banner
exports.getBanner = async (req, res, next) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      throw new ApiError(404, 'Không tìm thấy banner');
    }

    return ApiResponse.success(res, 200, banner, 'Lấy thông tin banner thành công');
  } catch (error) {
    next(error);
  }
};

// Create a new banner with file upload support
exports.createBanner = async (req, res, next) => {
  try {
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Request body displayOn:', req.body['displayOn[]']);
    console.log('Request file:', req.file ? req.file.originalname : 'No file');
    console.log('Request image data:', req.body.imageData);

    const {
      title,
      description,
      buttonText,
      buttonLink,
      iconType,
      isActive,
      position,
      startDate,
      endDate
    } = req.body;

    // Xử lý displayOn đặc biệt
    const displayOn = req.body['displayOn[]'] ?
      (Array.isArray(req.body['displayOn[]']) ? req.body['displayOn[]'] : [req.body['displayOn[]']]) :
      ['home'];

    // Validate required fields
    if (!title) {
      throw new ApiError(400, 'Tiêu đề banner là bắt buộc');
    }

    // Initialize banner object
    const bannerData = {
      title,
      description,
      buttonText,
      buttonLink,
      iconType,
      isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : true,
      position: position || 0,
      startDate,
      endDate,
      displayOn
    };

    // Xử lý thông tin hình ảnh
    if (req.file) {
      // Có file upload
      console.log('Xử lý file upload:', req.file.originalname);
      const uploadResult = await uploadToCloudinary(req.file.path, 'ecommerce/banners');
      bannerData.image = {
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format
      };

      // Xóa file tạm
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting temp file:', unlinkError);
      }
    } else if (req.body.imageData) {
      // Có dữ liệu ảnh gửi từ form
      try {
        const imageData = JSON.parse(req.body.imageData);
        if (!imageData.url) {
          throw new Error('URL hình ảnh không hợp lệ');
        }
        bannerData.image = imageData;
        console.log('Sử dụng dữ liệu ảnh từ form:', imageData.url);
      } catch (error) {
        console.error('Lỗi xử lý dữ liệu hình ảnh:', error);
        throw new ApiError(400, 'Dữ liệu hình ảnh không hợp lệ');
      }
    } else {
      // Không có thông tin hình ảnh
      console.error('Không có thông tin hình ảnh');
      throw new ApiError(400, 'Hình ảnh banner là bắt buộc');
    }

    // Create and save banner
    const banner = new Banner(bannerData);
    await banner.save();

    // Log activity
    await logActivity(req, 'create', 'banner', banner);

    return ApiResponse.success(res, 201, banner, 'Tạo banner thành công');
  } catch (error) {
    // Cleanup temp file if exists and error occurred
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting temp file:', unlinkError);
      }
    }
    next(error);
  }
};

// Update a banner with file upload support
exports.updateBanner = async (req, res, next) => {
  try {
    console.log('Update Banner - Request body keys:', Object.keys(req.body));
    console.log('Update Banner - Request file:', req.file ? req.file.originalname : 'No file');
    console.log('Update Banner - Image Data:', req.body.imageData);

    const {
      title,
      description,
      buttonText,
      buttonLink,
      iconType,
      isActive,
      position,
      startDate,
      endDate
    } = req.body;

    // Xử lý displayOn đặc biệt
    const displayOn = req.body['displayOn[]'] ?
      (Array.isArray(req.body['displayOn[]']) ? req.body['displayOn[]'] : [req.body['displayOn[]']]) :
      undefined;

    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      throw new ApiError(404, 'Không tìm thấy banner');
    }

    // Update fields if provided
    if (title) banner.title = title;
    if (description !== undefined) banner.description = description;
    if (buttonText !== undefined) banner.buttonText = buttonText;
    if (buttonLink !== undefined) banner.buttonLink = buttonLink;
    if (iconType) banner.iconType = iconType;
    if (isActive !== undefined) banner.isActive = isActive === 'true' || isActive === true;
    if (position !== undefined) banner.position = position;
    if (startDate !== undefined) banner.startDate = startDate;
    if (endDate !== undefined) banner.endDate = endDate;
    if (displayOn) banner.displayOn = displayOn;

    // Handle image upload if file is included
    if (req.file) {
      // Có file upload mới
      console.log('Xử lý file upload mới:', req.file.originalname);

      // Delete previous image from Cloudinary if exists
      if (banner.image && banner.image.publicId) {
        await deleteImage(banner.image.publicId);
      }

      // Upload new image
      const uploadResult = await uploadToCloudinary(req.file.path, 'ecommerce/banners');
      banner.image = {
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format
      };

      // Xóa file tạm
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting temp file:', unlinkError);
      }
    } else if (req.body.imageData) {
      // Có dữ liệu ảnh từ form
      try {
        const imageData = JSON.parse(req.body.imageData);
        if (!imageData.url) {
          throw new Error('URL hình ảnh không hợp lệ');
        }

        // Nếu là URL khác thì mới cập nhật và xóa ảnh cũ
        if (banner.image.url !== imageData.url) {
          // Xóa ảnh cũ nếu có
          if (banner.image && banner.image.publicId) {
            await deleteImage(banner.image.publicId);
          }
          banner.image = imageData;
        }

        console.log('Sử dụng dữ liệu hình ảnh:', imageData.url);
      } catch (error) {
        console.error('Lỗi xử lý dữ liệu hình ảnh:', error);
        throw new ApiError(400, 'Dữ liệu hình ảnh không hợp lệ');
      }
    }

    await banner.save();
    await logActivity(req, 'update', 'banner', banner);

    return ApiResponse.success(res, 200, banner, 'Cập nhật banner thành công');
  } catch (error) {
    // Cleanup temp file if exists and error occurred
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting temp file:', unlinkError);
      }
    }
    next(error);
  }
};

// Delete a banner
exports.deleteBanner = async (req, res, next) => {
  try {
    const banner = await Banner.findById(req.params.id);

    if (!banner) {
      throw new ApiError(404, 'Không tìm thấy banner');
    }

    // Delete image from Cloudinary if exists
    if (banner.image && banner.image.publicId) {
      await deleteImage(banner.image.publicId);
    }

    await Banner.deleteOne({ _id: req.params.id });
    await logActivity(req, 'delete', 'banner', banner);

    return ApiResponse.success(res, 200, null, 'Xóa banner thành công');
  } catch (error) {
    next(error);
  }
};

// Get active banners for client with filter by location
exports.getActiveBanners = async (req, res, next) => {
  try {
    const { location = 'home', limit = 10 } = req.query;

    const banners = await Banner.getActiveBanners(location, parseInt(limit));

    return ApiResponse.success(res, 200, banners, 'Lấy danh sách banner hoạt động thành công');
  } catch (error) {
    next(error);
  }
};

// Reorder banners
exports.reorderBanners = async (req, res, next) => {
  try {
    const { positions } = req.body;

    if (!positions || !Array.isArray(positions)) {
      throw new ApiError(400, 'Dữ liệu vị trí không hợp lệ');
    }

    // Lặp qua mảng vị trí và cập nhật từng banner
    await Promise.all(
      positions.map(item =>
        Banner.updateOne(
          { _id: item.id },
          { $set: { position: item.position } }
        )
      )
    );

    await logActivity(req, 'update', 'banner', { detail: 'Sắp xếp lại vị trí banner' });

    return ApiResponse.success(res, 200, null, 'Cập nhật vị trí banner thành công');
  } catch (error) {
    next(error);
  }
};