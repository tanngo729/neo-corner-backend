// backend/controllers/admin/categoryController.js
const Category = require('../../models/Category');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');
const { logActivity } = require('../../services/loggingService');
const { cloudinary, uploadToCloudinary, uploadImageFromUrl, deleteImage } = require('../../services/cloudinaryService');

// Lấy danh sách danh mục
exports.getCategories = async (req, res, next) => {
  try {
    const { parent, status } = req.query;
    const query = {};

    if (parent) {
      query.parent = parent === 'null' ? null : parent;
    }

    if (status) {
      query.status = status;
    }

    // Lấy danh sách danh mục và sắp xếp theo position giảm dần (position cao hiển thị trước)
    const categories = await Category.find(query)
      .sort({ position: -1, createdAt: -1 })
      .populate('parent', 'name');

    return ApiResponse.success(res, 200, categories, 'Lấy danh sách danh mục thành công');
  } catch (error) {
    console.error('LỖI LẤY DANH SÁCH DANH MỤC:', error);
    next(error);
  }
};

// Lấy chi tiết danh mục
exports.getCategoryById = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate('parent', 'name');

    if (!category) {
      throw new ApiError(404, 'Không tìm thấy danh mục');
    }

    // Lấy danh sách danh mục con (nếu có)
    const subcategories = await Category.find({ parent: category._id });

    return ApiResponse.success(res, 200, {
      ...category.toObject(),
      subcategories
    }, 'Lấy chi tiết danh mục thành công');
  } catch (error) {
    console.error('LỖI LẤY CHI TIẾT DANH MỤC:', error);
    next(error);
  }
};

// Tạo danh mục mới
exports.createCategory = async (req, res, next) => {
  try {
    console.log('TẠO DANH MỤC MỚI - BODY:', req.body);
    console.log('TẠO DANH MỤC MỚI - FILE:', req.file);

    const { name, description, parent, status, position, imageUrl } = req.body;

    // Khởi tạo đối tượng image
    let image = {};

    // Tìm vị trí cao nhất hiện tại
    let highestPosition = 0;
    try {
      const highestCategory = await Category.findOne().sort({ position: -1 }).limit(1);
      if (highestCategory) {
        highestPosition = highestCategory.position;
      }
    } catch (err) {
      console.error('Lỗi khi tìm vị trí cao nhất:', err);
    }

    // Tăng vị trí lên 1 để danh mục mới có vị trí cao nhất
    const newPosition = highestPosition + 1;
    console.log('VỊ TRÍ MỚI CHO DANH MỤC:', newPosition);

    // Xử lý trường hợp có URL ảnh
    if (imageUrl) {
      try {
        console.log('ĐANG XỬ LÝ IMAGE URL:', imageUrl);
        // Upload URL lên Cloudinary
        image = await uploadImageFromUrl(imageUrl, 'ecommerce/categories');
      } catch (uploadError) {
        console.error('LỖI KHI UPLOAD URL:', uploadError);
        throw new ApiError(400, 'Không thể upload hình ảnh từ URL đã cung cấp');
      }
    }
    // Xử lý trường hợp có file ảnh upload
    else if (req.file) {
      try {
        console.log('ĐANG XỬ LÝ FILE UPLOAD:', req.file.path);
        // Upload file lên Cloudinary
        image = await uploadToCloudinary(req.file.path, 'ecommerce/categories');
      } catch (uploadError) {
        console.error('LỖI KHI UPLOAD FILE:', uploadError);
        throw new ApiError(400, 'Không thể upload hình ảnh');
      }
    }

    // Tạo danh mục mới
    const category = new Category({
      name,
      description,
      parent: parent || null,
      status: status || 'active',
      position: newPosition, // Sử dụng vị trí mới
      image
    });

    await category.save();
    console.log('ĐÃ TẠO DANH MỤC THÀNH CÔNG:', category._id);

    await logActivity(req, 'create', 'category', category);

    return ApiResponse.success(res, 201, category, 'Tạo danh mục thành công');
  } catch (error) {
    console.error('LỖI TẠO DANH MỤC:', error);
    next(error);
  }
};

// Cập nhật danh mục
exports.updateCategory = async (req, res, next) => {
  try {
    console.log('CẬP NHẬT DANH MỤC - BODY:', req.body);
    console.log('CẬP NHẬT DANH MỤC - FILE:', req.file);

    const { name, description, parent, status, position, imageUrl } = req.body;
    const category = await Category.findById(req.params.id);

    if (!category) {
      throw new ApiError(404, 'Không tìm thấy danh mục');
    }

    // Xử lý trường hợp có URL ảnh mới
    if (imageUrl) {
      try {
        // Xóa ảnh cũ nếu có
        if (category.image && category.image.publicId) {
          await deleteImage(category.image.publicId);
        }

        // Upload URL mới lên Cloudinary
        category.image = await uploadImageFromUrl(imageUrl, 'ecommerce/categories');
      } catch (uploadError) {
        console.error('LỖI KHI UPLOAD URL:', uploadError);
        throw new ApiError(400, 'Không thể upload hình ảnh từ URL đã cung cấp');
      }
    }
    // Xử lý trường hợp có file ảnh mới
    else if (req.file) {
      try {
        // Xóa ảnh cũ nếu có
        if (category.image && category.image.publicId) {
          await deleteImage(category.image.publicId);
        }

        // Upload file mới lên Cloudinary
        category.image = await uploadToCloudinary(req.file.path, 'ecommerce/categories');
      } catch (uploadError) {
        console.error('LỖI KHI UPLOAD FILE:', uploadError);
        throw new ApiError(400, 'Không thể upload hình ảnh');
      }
    }

    // Cập nhật thông tin danh mục
    category.name = name || category.name;
    category.description = description !== undefined ? description : category.description;
    category.parent = parent !== undefined ? (parent === 'null' ? null : parent) : category.parent;
    category.status = status || category.status;
    if (position !== undefined) {
      category.position = parseInt(position);
    }

    await category.save();
    console.log('ĐÃ CẬP NHẬT DANH MỤC THÀNH CÔNG:', category._id);

    await logActivity(req, 'update', 'category', category);

    return ApiResponse.success(res, 200, category, 'Cập nhật danh mục thành công');
  } catch (error) {
    console.error('LỖI CẬP NHẬT DANH MỤC:', error);
    next(error);
  }
};

// Xóa danh mục
exports.deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      throw new ApiError(404, 'Không tìm thấy danh mục');
    }

    // Kiểm tra xem có danh mục con không
    const hasChildren = await Category.exists({ parent: category._id });

    if (hasChildren) {
      throw new ApiError(400, 'Không thể xóa danh mục có chứa danh mục con');
    }

    // Kiểm tra xem có sản phẩm nào thuộc danh mục này không
    const Product = require('../../models/Product');
    const hasProducts = await Product.exists({ category: category._id });

    if (hasProducts) {
      throw new ApiError(400, 'Không thể xóa danh mục có chứa sản phẩm');
    }

    // Xóa ảnh nếu có
    if (category.image && category.image.publicId) {
      await deleteImage(category.image.publicId);
    }

    await category.deleteOne();

    await logActivity(req, 'delete', 'category', category);

    return ApiResponse.success(res, 200, null, 'Xóa danh mục thành công');
  } catch (error) {
    console.error('LỖI XÓA DANH MỤC:', error);
    next(error);
  }
};

// Cập nhật trạng thái danh mục
exports.updateCategoryStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      throw new ApiError(400, 'Trạng thái không hợp lệ');
    }

    const category = await Category.findById(req.params.id);

    if (!category) {
      throw new ApiError(404, 'Không tìm thấy danh mục');
    }

    category.status = status;
    await category.save();

    return ApiResponse.success(res, 200, category, 'Cập nhật trạng thái danh mục thành công');
  } catch (error) {
    console.error('LỖI CẬP NHẬT TRẠNG THÁI:', error);
    next(error);
  }
};