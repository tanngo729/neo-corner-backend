const Product = require('../../models/Product');
const Category = require('../../models/Category'); // Thêm import Category
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');

exports.getProducts = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 12,
      search,
      category,
      sort = 'createdAt',
      order = 'desc',
      minPrice,
      maxPrice,
      includeSubcategories = 'true' // Mặc định là true
    } = req.query;

    const query = { status: 'active' };

    // Tìm kiếm theo từ khóa - xử lý an toàn với regex
    if (search && typeof search === 'string' && search.trim() !== '') {
      try {
        const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        query.$or = [
          { name: { $regex: safeSearch, $options: 'i' } },
          { description: { $regex: safeSearch, $options: 'i' } }
        ];
      } catch (error) {
        console.error('Lỗi regex tìm kiếm:', error);
        query.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      }
    }

    // Lọc theo danh mục - kiểm tra giá trị hợp lệ và xử lý danh mục con
    if (category && category !== 'undefined' && category !== 'null') {
      // Kiểm tra xem có bao gồm danh mục con không
      const shouldIncludeSubcategories = includeSubcategories === 'true';

      if (shouldIncludeSubcategories) {
        try {
          // Kiểm tra xem category có hợp lệ không
          const isValidId = /^[0-9a-fA-F]{24}$/.test(category);

          if (isValidId) {
            // Tìm danh mục hiện tại
            const currentCategory = await Category.findById(category);

            if (currentCategory && currentCategory.status === 'active') {
              // Tìm tất cả danh mục con của danh mục này
              const childCategories = await Category.find({
                parent: category,
                status: 'active'
              });

              // Nếu có danh mục con, thêm vào điều kiện tìm kiếm
              if (childCategories && childCategories.length > 0) {
                const categoryIds = [
                  category,
                  ...childCategories.map(cat => cat._id.toString())
                ];

                console.log(`Tìm sản phẩm trong các danh mục: ${categoryIds.join(', ')}`);
                query.category = { $in: categoryIds };
              } else {
                // Nếu không có danh mục con, chỉ tìm theo danh mục hiện tại
                query.category = category;
              }
            } else {
              // Nếu không tìm thấy danh mục hoặc không active
              query.category = category;
            }
          } else {
            // Nếu ID không hợp lệ
            query.category = category;
          }
        } catch (error) {
          console.error('Lỗi khi xử lý danh mục con:', error);
          query.category = category; // Fallback khi có lỗi
        }
      } else {
        // Nếu không bao gồm danh mục con, chỉ tìm chính xác danh mục này
        query.category = category;
      }
    }

    // Lọc theo khoảng giá - xử lý an toàn với parse Int
    if ((minPrice !== undefined && minPrice !== '') || (maxPrice !== undefined && maxPrice !== '')) {
      query.price = {};

      if (minPrice !== undefined && minPrice !== '') {
        try {
          const minPriceVal = parseInt(minPrice, 10);
          if (!isNaN(minPriceVal)) {
            query.price.$gte = minPriceVal;
          }
        } catch (error) {
          console.error('Lỗi parse minPrice:', error);
        }
      }

      if (maxPrice !== undefined && maxPrice !== '') {
        try {
          const maxPriceVal = parseInt(maxPrice, 10);
          if (!isNaN(maxPriceVal)) {
            query.price.$lte = maxPriceVal;
          }
        } catch (error) {
          console.error('Lỗi parse maxPrice:', error);
        }
      }

      // Nếu price object rỗng, xóa nó
      if (Object.keys(query.price).length === 0) {
        delete query.price;
      }
    }

    // Tùy chọn sắp xếp - đảm bảo không lỗi
    const sortOption = {};
    const validSortFields = ['createdAt', 'price', 'sold', 'views', 'name'];
    const validSortField = validSortFields.includes(sort) ? sort : 'createdAt';
    sortOption[validSortField] = order === 'asc' ? 1 : -1;

    // Parse và xử lý an toàn với limit
    let parsedLimit;
    try {
      parsedLimit = parseInt(limit, 10);
      if (isNaN(parsedLimit) || parsedLimit <= 0) parsedLimit = 12;
    } catch (error) {
      parsedLimit = 12;
    }

    // Parse và xử lý an toàn với page
    let parsedPage;
    try {
      parsedPage = parseInt(page, 10);
      if (isNaN(parsedPage) || parsedPage <= 0) parsedPage = 1;
    } catch (error) {
      parsedPage = 1;
    }

    // Tính tổng số sản phẩm
    const total = await Product.countDocuments(query);

    console.log('Query:', JSON.stringify(query));
    console.log('Sort:', JSON.stringify(sortOption));

    // Lấy danh sách sản phẩm
    const products = await Product.find(query)
      .sort(sortOption)
      .limit(parsedLimit)
      .skip((parsedPage - 1) * parsedLimit)
      .populate('category', 'name');

    // Trả về kết quả
    return ApiResponse.paginated(
      res,
      products,
      parsedPage,
      parsedLimit,
      total,
      'Lấy danh sách sản phẩm thành công'
    );
  } catch (error) {
    console.error('Lỗi khi lấy sản phẩm:', error);
    return ApiResponse.error(
      res,
      500,
      'Lỗi server khi lấy danh sách sản phẩm: ' + (error.message || 'Unknown error')
    );
  }
};

exports.getProductBySlug = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      slug: req.params.slug,
      status: 'active'
    }).populate('category', 'name');

    if (!product) {
      throw new ApiError(404, 'Không tìm thấy sản phẩm');
    }

    // Tăng lượt xem
    product.views += 1;
    await product.save();

    return ApiResponse.success(res, 200, product, 'Lấy chi tiết sản phẩm thành công');
  } catch (error) {
    console.error('Lỗi khi lấy chi tiết sản phẩm:', error);
    next(error);
  }
};

// Lấy sản phẩm nổi bật
exports.getFeaturedProducts = async (req, res, next) => {
  try {
    let limit = 6;
    try {
      if (req.query.limit) {
        limit = parseInt(req.query.limit);
        if (isNaN(limit) || limit <= 0) limit = 6;
      }
    } catch (error) {
      limit = 6;
    }

    const products = await Product.find({
      status: 'active',
      featured: true
    })
      .sort({ position: 1, createdAt: -1 })
      .limit(limit)
      .populate('category', 'name');

    return ApiResponse.success(res, 200, products, 'Lấy danh sách sản phẩm nổi bật thành công');
  } catch (error) {
    console.error('Lỗi khi lấy sản phẩm nổi bật:', error);
    next(error);
  }
};

// Lấy sản phẩm liên quan
exports.getRelatedProducts = async (req, res, next) => {
  try {
    const { productId, categoryId } = req.query;
    let limit = 4;

    try {
      if (req.query.limit) {
        limit = parseInt(req.query.limit);
        if (isNaN(limit) || limit <= 0) limit = 4;
      }
    } catch (error) {
      limit = 4;
    }

    if (!productId || !categoryId) {
      throw new ApiError(400, 'Thiếu thông tin sản phẩm hoặc danh mục');
    }

    // Lấy tất cả danh mục con và danh mục hiện tại
    let categoryIds = [categoryId];
    try {
      // Kiểm tra xem có phải danh mục cha không
      const category = await Category.findById(categoryId);
      if (category && category.status === 'active' && !category.parent) {
        // Nếu là danh mục cha, lấy danh mục con
        const childCategories = await Category.find({
          parent: categoryId,
          status: 'active'
        });
        if (childCategories && childCategories.length > 0) {
          childCategories.forEach(child => {
            categoryIds.push(child._id.toString());
          });
        }
      }
    } catch (error) {
      console.error('Lỗi khi lấy danh mục con cho sản phẩm liên quan:', error);
      // Fallback chỉ sử dụng categoryId đã cung cấp
    }

    const products = await Product.find({
      _id: { $ne: productId },
      category: { $in: categoryIds },
      status: 'active'
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('category', 'name');

    return ApiResponse.success(res, 200, products, 'Lấy danh sách sản phẩm liên quan thành công');
  } catch (error) {
    console.error('Lỗi khi lấy sản phẩm liên quan:', error);
    next(error);
  }
};

// Gợi ý tìm kiếm
exports.searchSuggestions = async (req, res, next) => {
  try {
    const { q } = req.query;
    let limit = 5;

    try {
      if (req.query.limit) {
        limit = parseInt(req.query.limit);
        if (isNaN(limit) || limit <= 0) limit = 5;
      }
    } catch (error) {
      limit = 5;
    }

    if (!q || typeof q !== 'string') {
      return ApiResponse.success(res, 200, [], 'Không có từ khóa tìm kiếm hợp lệ');
    }

    const sanitizedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const suggestions = await Product.find({
      status: 'active',
      name: { $regex: sanitizedQuery, $options: 'i' }
    })
      .select('name slug mainImage price')
      .limit(limit);

    return ApiResponse.success(res, 200, suggestions, 'Lấy gợi ý tìm kiếm thành công');
  } catch (error) {
    console.error('Lỗi khi lấy gợi ý tìm kiếm:', error);
    return ApiResponse.error(res, 500, 'Lỗi khi lấy gợi ý tìm kiếm');
  }
};