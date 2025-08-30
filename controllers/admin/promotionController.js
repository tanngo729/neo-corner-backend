// controllers/admin/promotionController.js
const Promotion = require('../../models/Promotion');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');
const { logActivity } = require('../../services/loggingService');

// Lấy danh sách khuyến mãi với khả năng tìm kiếm, lọc và sắp xếp nâng cao
exports.getAllPromotions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      isActive,
      discountType
    } = req.query;

    const query = {};

    // Tìm kiếm theo tiêu đề, mô tả hoặc mã
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    // Lọc theo trạng thái
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    // Lọc theo loại giảm giá
    if (discountType) {
      query.discountType = discountType;
    }

    // Đếm tổng số khuyến mãi thỏa mãn điều kiện
    const total = await Promotion.countDocuments(query);

    // Xác định hướng sắp xếp
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Lấy dữ liệu với phân trang và sắp xếp
    const promotions = await Promotion.find(query)
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    return ApiResponse.paginated(
      res,
      promotions,
      parseInt(page),
      parseInt(limit),
      total,
      'Lấy danh sách khuyến mãi thành công'
    );
  } catch (error) {
    next(error);
  }
};

// Lấy thông tin một khuyến mãi
exports.getPromotion = async (req, res, next) => {
  try {
    const promotion = await Promotion.findById(req.params.id);

    if (!promotion) {
      throw new ApiError(404, 'Không tìm thấy khuyến mãi');
    }

    return ApiResponse.success(res, 200, promotion, 'Lấy thông tin khuyến mãi thành công');
  } catch (error) {
    next(error);
  }
};

// Tạo khuyến mãi mới
exports.createPromotion = async (req, res, next) => {
  try {
    const {
      title,
      code,
      description,
      discountType,
      discountValue,
      minPurchase,
      maxUses,
      isActive,
      startDate,
      expiry,
      image,
      appliesTo,
      categoryIds,
      productIds,
      userType,
      usageType
    } = req.body;

    // Validate dữ liệu đầu vào
    if (!title || !code) {
      throw new ApiError(400, 'Tiêu đề và mã khuyến mãi là bắt buộc');
    }

    // Kiểm tra mã đã tồn tại chưa
    const existingPromotion = await Promotion.findOne({ code: code.toUpperCase() });
    if (existingPromotion) {
      throw new ApiError(400, 'Mã khuyến mãi đã tồn tại');
    }

    // Kiểm tra giá trị giảm giá hợp lệ
    if (discountType === 'percent' && (discountValue <= 0 || discountValue > 100)) {
      throw new ApiError(400, 'Giảm giá theo phần trăm phải từ 0% đến 100%');
    }

    if (discountType === 'fixed' && discountValue < 0) {
      throw new ApiError(400, 'Giảm giá cố định không được âm');
    }

    // Tạo đối tượng dữ liệu khuyến mãi
    const promotionData = {
      title,
      code: code.toUpperCase(),
      description,
      discountType: discountType || 'percent',
      discountValue: discountValue || 0,
      minPurchase: minPurchase || 0,
      maxUses: maxUses || 0,
      isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : true,
      startDate,
      expiry,
      image: image || { url: 'https://placehold.co/400x200?text=Promotion' },
      appliesTo: appliesTo || 'all',
      categoryIds: (appliesTo === 'category' && categoryIds) ? categoryIds : [],
      productIds: (appliesTo === 'product' && productIds) ? productIds : [],
      userType: userType || 'all',
      usageType: usageType || 'multi'
    };

    // Tạo và lưu khuyến mãi
    const promotion = new Promotion(promotionData);
    await promotion.save();

    // Log hoạt động
    await logActivity(req, 'create', 'promotion', promotion);

    return ApiResponse.success(res, 201, promotion, 'Tạo khuyến mãi thành công');
  } catch (error) {
    next(error);
  }
};

// Cập nhật khuyến mãi
exports.updatePromotion = async (req, res, next) => {
  try {
    const {
      title,
      code,
      description,
      discountType,
      discountValue,
      minPurchase,
      maxUses,
      isActive,
      startDate,
      expiry,
      image,
      appliesTo,
      categoryIds,
      productIds,
      userType,
      usageType
    } = req.body;

    const promotion = await Promotion.findById(req.params.id);

    if (!promotion) {
      throw new ApiError(404, 'Không tìm thấy khuyến mãi');
    }

    // Kiểm tra mã đã tồn tại chưa (nếu có thay đổi mã)
    if (code && code !== promotion.code) {
      const existingPromotion = await Promotion.findOne({
        code: code.toUpperCase(),
        _id: { $ne: req.params.id }
      });

      if (existingPromotion) {
        throw new ApiError(400, 'Mã khuyến mãi đã tồn tại');
      }
    }

    // Kiểm tra giá trị giảm giá hợp lệ
    if (discountType === 'percent' && discountValue !== undefined && (discountValue <= 0 || discountValue > 100)) {
      throw new ApiError(400, 'Giảm giá theo phần trăm phải từ 0% đến 100%');
    }

    if (discountType === 'fixed' && discountValue !== undefined && discountValue < 0) {
      throw new ApiError(400, 'Giảm giá cố định không được âm');
    }

    // Cập nhật các field nếu được cung cấp
    if (title) promotion.title = title;
    if (code) promotion.code = code.toUpperCase();
    if (description !== undefined) promotion.description = description;
    if (discountType) promotion.discountType = discountType;
    if (discountValue !== undefined) promotion.discountValue = discountValue;
    if (minPurchase !== undefined) promotion.minPurchase = minPurchase;
    if (maxUses !== undefined) promotion.maxUses = maxUses;
    if (isActive !== undefined) promotion.isActive = isActive === 'true' || isActive === true;
    if (startDate !== undefined) promotion.startDate = startDate;
    if (expiry !== undefined) promotion.expiry = expiry;
    if (image) promotion.image = image;
    if (appliesTo) promotion.appliesTo = appliesTo;

    // Cập nhật categoryIds và productIds dựa trên appliesTo
    if (appliesTo === 'category' && categoryIds) promotion.categoryIds = categoryIds;
    if (appliesTo === 'product' && productIds) promotion.productIds = productIds;

    if (userType) promotion.userType = userType;
    if (usageType) promotion.usageType = usageType;

    // Lưu khuyến mãi đã cập nhật
    await promotion.save();

    // Log hoạt động
    await logActivity(req, 'update', 'promotion', promotion);

    return ApiResponse.success(res, 200, promotion, 'Cập nhật khuyến mãi thành công');
  } catch (error) {
    next(error);
  }
};

// Xóa khuyến mãi
exports.deletePromotion = async (req, res, next) => {
  try {
    const promotion = await Promotion.findById(req.params.id);

    if (!promotion) {
      throw new ApiError(404, 'Không tìm thấy khuyến mãi');
    }

    await Promotion.deleteOne({ _id: req.params.id });

    // Log hoạt động
    await logActivity(req, 'delete', 'promotion', promotion);

    return ApiResponse.success(res, 200, null, 'Xóa khuyến mãi thành công');
  } catch (error) {
    next(error);
  }
};

// Lấy các khuyến mãi đang hoạt động (cho client)
exports.getActivePromotions = async (req, res, next) => {
  try {
    console.log('Controller: getActivePromotions được gọi');
    const promotions = await Promotion.getActivePromotions();
    console.log('Controller: promotions từ DB:', promotions);

    // Đảm bảo trả về đúng định dạng
    return ApiResponse.success(res, 200, promotions, 'Lấy danh sách khuyến mãi đang hoạt động thành công');
  } catch (error) {
    console.error('Controller: Lỗi khi lấy khuyến mãi:', error);
    next(error);
  }
};