const Category = require('../../models/Category');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');
const mongoose = require('mongoose');

// Lấy tất cả danh mục cho client (chỉ danh mục active)
exports.getCategories = async (req, res, next) => {
  try {
    const { parent } = req.query;
    const query = { status: 'active' };
    if (parent) {
      if (parent === 'null') {
        query.parent = null;
      } else {
        query.parent = parent;
      }
    }
    const categories = await Category.find(query)
      .sort({ position: 1, name: 1 })
      .populate({
        path: 'parent',
        select: 'name slug'
      });

    return ApiResponse.success(res, 200, categories, 'Lấy danh sách danh mục thành công');
  } catch (error) {
    next(error);
  }
};

// Lấy danh mục kèm danh mục con (mới)
exports.getCategoriesWithSubcategories = async (req, res, next) => {
  try {
    const parentCategories = await Category.find({
      status: 'active',
      parent: null
    }).sort({ position: 1, name: 1 });
    const childCategories = await Category.find({
      status: 'active',
      parent: { $ne: null }
    }).sort({ position: 1, name: 1 });
    const result = parentCategories.map(parent => {
      const parentObj = parent.toObject();
      parentObj.subcategories = childCategories.filter(child =>
        child.parent && child.parent.toString() === parent._id.toString()
      );
      return parentObj;
    });

    return ApiResponse.success(res, 200, result, 'Lấy danh sách danh mục phân cấp thành công');
  } catch (error) {
    next(error);
  }
};

// Hàm helper để lấy tất cả ID danh mục con (bao gồm cả danh mục cha)
exports.getAllSubcategoryIds = async (categoryId) => {
  try {
    // Kiểm tra xem categoryId có phải ObjectId hợp lệ không
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return [categoryId]; // Trả về chỉ categoryId nếu không hợp lệ
    }

    // Lấy danh mục hiện tại để kiểm tra trạng thái
    const currentCategory = await Category.findById(categoryId);
    if (!currentCategory || currentCategory.status !== 'active') {
      return [];
    }

    // Bắt đầu với danh mục hiện tại
    const categoryIds = [categoryId];

    // Tìm tất cả danh mục con trực tiếp
    const childCategories = await Category.find({
      parent: categoryId,
      status: 'active'
    });

    // Thêm ID của các danh mục con vào mảng
    childCategories.forEach(child => {
      categoryIds.push(child._id.toString());
    });

    return categoryIds;
  } catch (error) {
    console.error('Lỗi khi lấy danh mục con:', error);
    return [categoryId]; // Trả về chỉ categoryId nếu có lỗi
  }
};

// API endpoint để lấy tất cả danh mục con của một danh mục
exports.getSubcategories = async (req, res, next) => {
  try {
    const { categoryId } = req.params;

    if (!categoryId) {
      throw new ApiError(400, 'ID danh mục không được cung cấp');
    }

    const categoryIds = await this.getAllSubcategoryIds(categoryId);

    // Lấy đầy đủ thông tin danh mục
    const categories = await Category.find({
      _id: { $in: categoryIds },
      status: 'active'
    }).sort({ position: 1, name: 1 });

    return ApiResponse.success(res, 200, categories, 'Lấy danh sách danh mục con thành công');
  } catch (error) {
    next(error);
  }
};