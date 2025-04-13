// controllers/admin/shippingMethodController.js
const ShippingMethod = require('../../models/ShippingMethod');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');

// Lấy tất cả phương thức vận chuyển
exports.getAllShippingMethods = async (req, res, next) => {
  try {
    const shippingMethods = await ShippingMethod.find().sort({ position: 1 });
    return ApiResponse.success(res, 200, shippingMethods, 'Lấy danh sách phương thức vận chuyển thành công');
  } catch (error) {
    next(error);
  }
};

// Lấy phương thức vận chuyển theo mã
exports.getShippingMethodByCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    const shippingMethod = await ShippingMethod.findOne({ code });

    if (!shippingMethod) {
      throw new ApiError(404, 'Không tìm thấy phương thức vận chuyển');
    }

    return ApiResponse.success(res, 200, shippingMethod, 'Lấy thông tin phương thức vận chuyển thành công');
  } catch (error) {
    next(error);
  }
};

// Thêm phương thức vận chuyển mới
exports.createShippingMethod = async (req, res, next) => {
  try {
    const {
      code, name, description, isActive, position,
      baseFee, freeShippingThreshold, estimatedDeliveryDays,
      regionFees
    } = req.body;

    // Validate input
    if (!code || !name) {
      throw new ApiError(400, 'Vui lòng cung cấp mã và tên phương thức vận chuyển');
    }

    // Kiểm tra mã đã tồn tại
    const existingMethod = await ShippingMethod.findOne({ code });
    if (existingMethod) {
      throw new ApiError(400, 'Mã phương thức vận chuyển đã tồn tại');
    }

    // Tạo phương thức vận chuyển mới
    const shippingMethod = new ShippingMethod({
      code,
      name,
      description,
      isActive: isActive !== undefined ? isActive : true,
      position: position || 0,
      baseFee: baseFee || 0,
      freeShippingThreshold: freeShippingThreshold || 0,
      estimatedDeliveryDays: estimatedDeliveryDays || 3,
      regionFees: regionFees || []
    });

    await shippingMethod.save();

    return ApiResponse.success(res, 201, shippingMethod, 'Tạo phương thức vận chuyển thành công');
  } catch (error) {
    next(error);
  }
};

// Cập nhật phương thức vận chuyển
exports.updateShippingMethod = async (req, res, next) => {
  try {
    const { code } = req.params;
    const updateData = req.body;

    const shippingMethod = await ShippingMethod.findOne({ code });

    if (!shippingMethod) {
      throw new ApiError(404, 'Không tìm thấy phương thức vận chuyển');
    }

    // Cập nhật thông tin
    if (updateData.name !== undefined) shippingMethod.name = updateData.name;
    if (updateData.description !== undefined) shippingMethod.description = updateData.description;
    if (updateData.isActive !== undefined) shippingMethod.isActive = updateData.isActive;
    if (updateData.position !== undefined) shippingMethod.position = updateData.position;
    if (updateData.baseFee !== undefined) shippingMethod.baseFee = updateData.baseFee;
    if (updateData.freeShippingThreshold !== undefined) shippingMethod.freeShippingThreshold = updateData.freeShippingThreshold;
    if (updateData.estimatedDeliveryDays !== undefined) shippingMethod.estimatedDeliveryDays = updateData.estimatedDeliveryDays;

    // Nếu có regionFees mới, thay thế hoàn toàn
    if (updateData.regionFees !== undefined) {
      shippingMethod.regionFees = updateData.regionFees;
    }

    await shippingMethod.save();

    return ApiResponse.success(res, 200, shippingMethod, 'Cập nhật phương thức vận chuyển thành công');
  } catch (error) {
    next(error);
  }
};

// Xóa phương thức vận chuyển
exports.deleteShippingMethod = async (req, res, next) => {
  try {
    const { code } = req.params;

    const result = await ShippingMethod.deleteOne({ code });

    if (result.deletedCount === 0) {
      throw new ApiError(404, 'Không tìm thấy phương thức vận chuyển');
    }

    return ApiResponse.success(res, 200, { code }, 'Xóa phương thức vận chuyển thành công');
  } catch (error) {
    next(error);
  }
};

// Thêm phí vận chuyển cho khu vực
exports.addRegionFee = async (req, res, next) => {
  try {
    const { code } = req.params;
    const { regionCode, regionName, fee } = req.body;

    if (!regionCode || !regionName || fee === undefined) {
      throw new ApiError(400, 'Vui lòng cung cấp đầy đủ thông tin khu vực');
    }

    const shippingMethod = await ShippingMethod.findOne({ code });

    if (!shippingMethod) {
      throw new ApiError(404, 'Không tìm thấy phương thức vận chuyển');
    }

    // Kiểm tra xem khu vực đã tồn tại chưa
    const existingRegion = shippingMethod.regionFees.find(region => region.regionCode === regionCode);
    if (existingRegion) {
      throw new ApiError(400, 'Khu vực này đã tồn tại');
    }

    // Thêm khu vực mới
    shippingMethod.regionFees.push({ regionCode, regionName, fee });
    await shippingMethod.save();

    return ApiResponse.success(res, 201, shippingMethod, 'Thêm phí vận chuyển khu vực thành công');
  } catch (error) {
    next(error);
  }
};

// Cập nhật phí vận chuyển cho khu vực
exports.updateRegionFee = async (req, res, next) => {
  try {
    const { code, regionCode } = req.params;
    const { regionName, fee } = req.body;

    if (!regionName && fee === undefined) {
      throw new ApiError(400, 'Vui lòng cung cấp thông tin cần cập nhật');
    }

    const shippingMethod = await ShippingMethod.findOne({ code });

    if (!shippingMethod) {
      throw new ApiError(404, 'Không tìm thấy phương thức vận chuyển');
    }

    // Tìm khu vực cần cập nhật
    const regionIndex = shippingMethod.regionFees.findIndex(region => region.regionCode === regionCode);
    if (regionIndex === -1) {
      throw new ApiError(404, 'Không tìm thấy khu vực này');
    }

    // Cập nhật thông tin
    if (regionName !== undefined) {
      shippingMethod.regionFees[regionIndex].regionName = regionName;
    }
    if (fee !== undefined) {
      shippingMethod.regionFees[regionIndex].fee = fee;
    }

    await shippingMethod.save();

    return ApiResponse.success(res, 200, shippingMethod, 'Cập nhật phí vận chuyển khu vực thành công');
  } catch (error) {
    next(error);
  }
};

// Xóa phí vận chuyển cho khu vực
exports.removeRegionFee = async (req, res, next) => {
  try {
    const { code, regionCode } = req.params;

    const shippingMethod = await ShippingMethod.findOne({ code });

    if (!shippingMethod) {
      throw new ApiError(404, 'Không tìm thấy phương thức vận chuyển');
    }

    // Tìm vị trí của khu vực cần xóa
    const regionIndex = shippingMethod.regionFees.findIndex(region => region.regionCode === regionCode);

    if (regionIndex === -1) {
      throw new ApiError(404, 'Không tìm thấy khu vực này');
    }

    // Xóa khu vực
    shippingMethod.regionFees.splice(regionIndex, 1);
    await shippingMethod.save();

    return ApiResponse.success(res, 200, shippingMethod, 'Xóa phí vận chuyển khu vực thành công');
  } catch (error) {
    next(error);
  }
};