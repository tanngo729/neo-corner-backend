// backend/controllers/admin/productController.js
const Product = require('../../models/Product');
const { cloudinary, uploadToCloudinary, uploadImageFromUrl, deleteImage } = require('../../services/cloudinaryService');
const { logActivity } = require('../../services/loggingService');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');

// Lấy danh sách sản phẩm (có phân trang, lọc, sắp xếp)
exports.getProducts = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, status, category, sort = 'position', order = 'desc' } = req.query;

    // Xây dựng query
    const query = {};

    // Tìm kiếm theo từ khóa
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Lọc theo trạng thái
    if (status) {
      query.status = status;
    }

    // Lọc theo danh mục
    if (category) {
      query.category = category;
    }

    // Tính tổng số sản phẩm
    const total = await Product.countDocuments(query);

    // Tùy chọn sắp xếp - mặc định sắp xếp theo position giảm dần
    const sortOption = {};
    sortOption[sort] = order === 'asc' ? 1 : -1;

    // Lấy danh sách sản phẩm
    const products = await Product.find(query)
      .sort(sortOption)
      .limit(parseInt(limit))
      .skip((page - 1) * limit)
      .populate('category', 'name');

    // Trả về kết quả
    return ApiResponse.paginated(
      res,
      products,
      parseInt(page),
      parseInt(limit),
      total,
      'Lấy danh sách sản phẩm thành công'
    );
  } catch (error) {
    console.error('LỖI DANH SÁCH SẢN PHẨM:', error);
    next(error);
  }
};

// Lấy chi tiết sản phẩm
exports.getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).populate('category', 'name');

    if (!product) {
      throw new ApiError(404, 'Không tìm thấy sản phẩm');
    }

    return ApiResponse.success(res, 200, product, 'Lấy chi tiết sản phẩm thành công');
  } catch (error) {
    console.error('LỖI CHI TIẾT SẢN PHẨM:', error);
    next(error);
  }
};

// Xử lý upload từ URL
const processImageUrls = async (imageUrls) => {
  try {
    if (!imageUrls) return [];

    console.log('XỬ LÝ IMAGE URLS:', imageUrls);

    // Parse JSON string nếu cần
    let urls = [];

    try {
      if (typeof imageUrls === 'string') {
        // Thử parse JSON
        urls = JSON.parse(imageUrls);
        console.log('ĐÃ PARSE IMAGEURL THÀNH CÔNG:', urls);
      } else {
        urls = imageUrls;
      }
    } catch (parseError) {
      console.error('LỖI KHI PARSE IMAGEURL:', parseError);
      // Nếu không parse được, coi như đây là một URL duy nhất
      urls = [imageUrls];
    }

    // Đảm bảo urls là một mảng
    if (!Array.isArray(urls)) {
      console.log('URL KHÔNG PHẢI MẢNG, CHUYỂN THÀNH MẢNG');
      urls = [urls];
    }

    console.log('DANH SÁCH URLs CẦN UPLOAD:', urls);

    // Upload từng URL lên Cloudinary
    const uploadPromises = urls.map(url => uploadImageFromUrl(url, 'ecommerce/products'));

    // Chờ tất cả uploads hoàn thành và lọc ra các kết quả thành công
    const results = await Promise.all(uploadPromises);
    console.log('SỐ HÌNH ẢNH UPLOAD THÀNH CÔNG:', results.length);

    return results;
  } catch (error) {
    console.error('LỖI TỔNG THỂ KHI XỬ LÝ URLS:', error);
    return [];
  }
};

// Tạo sản phẩm mới
exports.createProduct = async (req, res, next) => {
  try {
    console.log('TẠO SẢN PHẨM MỚI - BODY:', req.body);
    console.log('TẠO SẢN PHẨM MỚI - FILES:', req.files);

    const {
      name, description, price, originalPrice, discountPercentage,
      category, stock, status, featured, imageUrls
    } = req.body;

    // Kiểm tra các trường bắt buộc
    if (!name) {
      throw new ApiError(400, 'Tên sản phẩm là bắt buộc');
    }

    if (!description) {
      throw new ApiError(400, 'Mô tả sản phẩm là bắt buộc');
    }

    if (!price || isNaN(price)) {
      throw new ApiError(400, 'Giá sản phẩm phải là số và là bắt buộc');
    }

    if (!stock || isNaN(stock)) {
      throw new ApiError(400, 'Số lượng tồn kho phải là số và là bắt buộc');
    }

    // Tìm vị trí cao nhất hiện tại
    let highestPosition = 0;
    try {
      const highestProduct = await Product.findOne().sort({ position: -1 }).limit(1);
      if (highestProduct) {
        highestPosition = highestProduct.position;
      }
    } catch (err) {
      console.error('Lỗi khi tìm vị trí cao nhất:', err);
    }

    // Tăng vị trí lên 1 để sản phẩm mới có vị trí cao nhất
    const newPosition = highestPosition + 1;
    console.log('VỊ TRÍ MỚI CHO SẢN PHẨM:', newPosition);

    // Tạo sản phẩm mới
    const product = new Product({
      name,
      description,
      price: Number(price),
      originalPrice: originalPrice ? Number(originalPrice) : Number(price),
      discountPercentage: discountPercentage ? Number(discountPercentage) : 0,
      category,
      stock: Number(stock),
      status: status || 'active',
      featured: featured === 'true' || featured === true,
      position: newPosition, // Sử dụng vị trí mới
      images: []
    });

    // Mảng lưu tất cả hình ảnh
    let processedImages = [];

    // Xử lý file uploads nếu có
    if (req.files && req.files.length > 0) {
      console.log('XỬ LÝ FILE UPLOADS:', req.files.length, 'FILES');

      const uploadPromises = req.files.map(file => uploadToCloudinary(file.path, 'ecommerce/products'));
      const uploadedImages = await Promise.all(uploadPromises);

      processedImages = [...processedImages, ...uploadedImages];
      console.log('ĐÃ UPLOAD FILES LÊN CLOUDINARY:', uploadedImages.length);
    }

    // Xử lý image URLs nếu có
    if (imageUrls) {
      console.log('XỬ LÝ IMAGE URLS');
      const urlImages = await processImageUrls(imageUrls);
      processedImages = [...processedImages, ...urlImages];
      console.log('ĐÃ UPLOAD URL LÊN CLOUDINARY:', urlImages.length);
    }

    // Gán images và mainImage
    if (processedImages.length > 0) {
      product.images = processedImages;
      product.mainImage = processedImages[0];
    }

    console.log('LƯU SẢN PHẨM VÀO DATABASE');
    const savedProduct = await product.save();
    console.log('ĐÃ LƯU SẢN PHẨM THÀNH CÔNG:', savedProduct._id);

    await logActivity(req, 'create', 'product', savedProduct);

    return ApiResponse.success(res, 201, savedProduct, 'Tạo sản phẩm thành công');
  } catch (error) {
    console.error('LỖI TẠO SẢN PHẨM:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: 'Lỗi validation: ' + messages.join(', '),
        error: error.message
      });
    }
    next(error);
  }
};

// Cập nhật sản phẩm
exports.updateProduct = async (req, res, next) => {
  try {
    console.log('CẬP NHẬT SẢN PHẨM - BODY:', req.body);
    console.log('CẬP NHẬT SẢN PHẨM - FILES:', req.files);

    const {
      name, description, price, originalPrice, discountPercentage,
      category, stock, status, featured, keepImages, removedImages
    } = req.body;

    // Tìm sản phẩm cần cập nhật
    const product = await Product.findById(req.params.id);

    if (!product) {
      throw new ApiError(404, 'Không tìm thấy sản phẩm');
    }

    // Xử lý hình ảnh
    let updatedImages = [];

    // Kiểm tra nếu keepImages tồn tại và chuyển về boolean
    const shouldKeepImages = keepImages === 'true' || keepImages === true;

    if (shouldKeepImages) {
      console.log('GIỮ LẠI MỘT SỐ HÌNH ẢNH CŨ');

      // Xử lý xóa các hình ảnh đã được đánh dấu để xóa
      let imagesToRemove = [];
      if (removedImages) {
        try {
          // Kiểm tra nếu removedImages đã là mảng
          if (Array.isArray(removedImages)) {
            imagesToRemove = removedImages;
          } else {
            imagesToRemove = JSON.parse(removedImages);
          }
          console.log('CÁC HÌNH ẢNH CẦN XÓA:', imagesToRemove);
        } catch (e) {
          console.error('Lỗi khi parse removedImages:', e);
        }
      }

      // Lọc ra các hình ảnh cần giữ lại
      updatedImages = product.images.filter(image => {
        // Kiểm tra nếu hình ảnh này cần xóa
        const shouldRemove = imagesToRemove.includes(image.publicId);

        if (shouldRemove) {
          // Xóa hình ảnh khỏi Cloudinary
          console.log('ĐANG XÓA ẢNH:', image.publicId);
          deleteImage(image.publicId).catch(err =>
            console.error('Lỗi khi xóa ảnh từ Cloudinary:', err));
          return false;
        }
        return true;
      });

      console.log('SỐ HÌNH ẢNH GIỮ LẠI SAU KHI LỌC:', updatedImages.length);
    } else {
      // Nếu không giữ lại hình ảnh cũ
      console.log('XÓA TẤT CẢ HÌNH ẢNH CŨ');

      // Xóa tất cả hình ảnh cũ từ Cloudinary
      const deletePromises = product.images.map(image => {
        if (image.publicId) {
          return deleteImage(image.publicId);
        }
        return Promise.resolve();
      });

      await Promise.all(deletePromises);

      // Reset mảng hình ảnh
      updatedImages = [];
    }

    // Thêm file uploads mới nếu có
    if (req.files && req.files.length > 0) {
      console.log('XỬ LÝ FILE UPLOADS:', req.files.length, 'FILES');

      const uploadPromises = req.files.map(file => uploadToCloudinary(file.path, 'ecommerce/products'));
      const uploadedImages = await Promise.all(uploadPromises);

      updatedImages = [...updatedImages, ...uploadedImages];
      console.log('ĐÃ UPLOAD FILES LÊN CLOUDINARY:', uploadedImages.length);
    }

    // Thêm image URLs mới nếu có
    if (req.body.imageUrls) {
      console.log('XỬ LÝ IMAGE URLS');
      const urlImages = await processImageUrls(req.body.imageUrls);
      updatedImages = [...updatedImages, ...urlImages];
      console.log('ĐÃ UPLOAD URL LÊN CLOUDINARY:', urlImages.length);
    }

    // Cập nhật dữ liệu sản phẩm
    if (name) product.name = name;
    if (description) product.description = description;
    if (price) product.price = Number(price);
    if (originalPrice) product.originalPrice = Number(originalPrice);
    if (discountPercentage !== undefined) product.discountPercentage = Number(discountPercentage);
    if (category) product.category = category;
    if (stock !== undefined) product.stock = Number(stock);
    if (status) product.status = status;
    if (featured !== undefined) product.featured = featured === 'true' || featured === true;

    // Cập nhật images
    product.images = updatedImages;
    if (updatedImages.length > 0) {
      product.mainImage = updatedImages[0];
    } else {
      product.mainImage = null;
    }

    console.log('LƯU SẢN PHẨM ĐÃ CẬP NHẬT');
    const updatedProduct = await product.save();
    console.log('ĐÃ LƯU SẢN PHẨM THÀNH CÔNG:', updatedProduct._id);

    await logActivity(req, 'update', 'product', updatedProduct);

    return ApiResponse.success(res, 200, updatedProduct, 'Cập nhật sản phẩm thành công');
  } catch (error) {
    console.error('LỖI CẬP NHẬT SẢN PHẨM:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: 'Lỗi validation: ' + messages.join(', '),
        error: error.message
      });
    }
    next(error);
  }
};

// Phần còn lại giữ nguyên
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      throw new ApiError(404, 'Không tìm thấy sản phẩm');
    }

    // Xóa các hình ảnh của sản phẩm từ Cloudinary
    for (const image of product.images) {
      if (image.publicId) {
        await deleteImage(image.publicId);
      }
    }

    await Product.findByIdAndDelete(req.params.id);

    await logActivity(req, 'delete', 'product', product);

    return ApiResponse.success(res, 200, null, 'Xóa sản phẩm thành công');
  } catch (error) {
    console.error('LỖI XÓA SẢN PHẨM:', error);
    next(error);
  }
};

exports.batchDeleteProducts = async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(400, 'Danh sách sản phẩm cần xóa không hợp lệ');
    }

    // Lấy danh sách sản phẩm để xóa hình ảnh
    const products = await Product.find({ _id: { $in: ids } });

    // Xóa các hình ảnh từ Cloudinary
    for (const product of products) {
      for (const image of product.images) {
        if (image.publicId) {
          await deleteImage(image.publicId);
        }
      }
    }

    // Xóa các sản phẩm
    const result = await Product.deleteMany({ _id: { $in: ids } });

    return ApiResponse.success(res, 200, {
      deletedCount: result.deletedCount
    }, `Đã xóa ${result.deletedCount} sản phẩm`);
  } catch (error) {
    console.error('LỖI XÓA NHIỀU SẢN PHẨM:', error);
    next(error);
  }
};

exports.updateProductStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!['active', 'inactive', 'draft'].includes(status)) {
      throw new ApiError(400, 'Trạng thái không hợp lệ');
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      throw new ApiError(404, 'Không tìm thấy sản phẩm');
    }

    product.status = status;
    await product.save();

    return ApiResponse.success(res, 200, product, 'Cập nhật trạng thái thành công');
  } catch (error) {
    console.error('LỖI CẬP NHẬT TRẠNG THÁI:', error);
    next(error);
  }
};

exports.updateProductPosition = async (req, res, next) => {
  try {
    const { position } = req.body;

    if (isNaN(position)) {
      throw new ApiError(400, 'Vị trí không hợp lệ');
    }

    const product = await Product.findById(req.params.id);

    if (!product) {
      throw new ApiError(404, 'Không tìm thấy sản phẩm');
    }

    product.position = position;
    await product.save();

    return ApiResponse.success(res, 200, product, 'Cập nhật vị trí thành công');
  } catch (error) {
    console.error('LỖI CẬP NHẬT VỊ TRÍ:', error);
    next(error);
  }
};

exports.updateProductFeatured = async (req, res, next) => {
  try {
    const { featured } = req.body;

    const product = await Product.findById(req.params.id);

    if (!product) {
      throw new ApiError(404, 'Không tìm thấy sản phẩm');
    }

    product.featured = featured === true || featured === 'true';
    await product.save();

    return ApiResponse.success(res, 200, product, `Sản phẩm đã ${product.featured ? '' : 'không'} được đánh dấu nổi bật`);
  } catch (error) {
    console.error('LỖI CẬP NHẬT FEATURED:', error);
    next(error);
  }
};