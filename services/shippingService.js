const ShippingMethod = require('../models/ShippingMethod');
const { ApiError } = require('../utils/errorHandler');

const shippingService = {
  /**
   * Lấy danh sách phương thức vận chuyển
   * @param {boolean} activeOnly - Chỉ lấy các phương thức đang hoạt động
   * @returns {Promise<Array>} Danh sách phương thức vận chuyển
   */
  async getShippingMethods(activeOnly = true) {
    try {
      const query = activeOnly ? { isActive: true } : {};
      return await ShippingMethod.find(query).sort({ position: 1 });
    } catch (error) {
      console.error('Lỗi khi lấy danh sách phương thức vận chuyển:', error);
      throw new ApiError(500, 'Lỗi khi lấy danh sách phương thức vận chuyển');
    }
  },

  /**
   * Lấy phương thức vận chuyển theo mã
   * @param {string} code - Mã phương thức vận chuyển
   * @returns {Promise<Object>} Phương thức vận chuyển
   */
  async getShippingMethod(code) {
    try {
      const shippingMethod = await ShippingMethod.findOne({ code });
      if (!shippingMethod) {
        throw new ApiError(404, 'Không tìm thấy phương thức vận chuyển');
      }
      return shippingMethod;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Lỗi khi lấy thông tin phương thức vận chuyển');
    }
  },

  /**
   * Tính phí vận chuyển
   * @param {string} shippingMethodCode - Mã phương thức vận chuyển
   * @param {string} regionCode - Mã khu vực (tỉnh/thành)
   * @param {number} orderTotal - Tổng giá trị đơn hàng
   * @returns {Promise<number>} Phí vận chuyển
   */
  async calculateShippingFee(shippingMethodCode, regionCode, orderTotal) {
    try {
      if (!shippingMethodCode) {
        throw new ApiError(400, 'Vui lòng chọn phương thức vận chuyển');
      }
      if (orderTotal === undefined || orderTotal === null) {
        throw new ApiError(400, 'Vui lòng cung cấp tổng giá trị đơn hàng');
      }

      const shippingMethod = await ShippingMethod.findOne({
        code: shippingMethodCode,
        isActive: true
      });

      if (!shippingMethod) {
        throw new ApiError(404, 'Không tìm thấy phương thức vận chuyển hoặc phương thức không khả dụng');
      }

      // Nếu đơn hàng đạt ngưỡng miễn phí vận chuyển
      if (shippingMethod.freeShippingThreshold > 0 && orderTotal >= shippingMethod.freeShippingThreshold) {
        return 0;
      }

      // Sử dụng mã khu vực Kontum luôn (với hệ thống chỉ phục vụ Kon Tum)
      const finalRegionCode = 'KT';

      // Tìm phí theo khu vực nếu có
      if (shippingMethod.regionFees && shippingMethod.regionFees.length > 0) {
        const regionFee = shippingMethod.regionFees.find(region =>
          region.regionCode.toUpperCase() === finalRegionCode
        );
        if (regionFee) {
          return regionFee.fee;
        }
      }

      return shippingMethod.baseFee || 0;
    } catch (error) {
      console.error('Lỗi khi tính phí vận chuyển:', error);
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Lỗi khi tính phí vận chuyển');
    }
  },

  /**
   * Ước tính thời gian giao hàng
   * @param {string} shippingMethodCode - Mã phương thức vận chuyển
   * @param {string} regionCode - Mã khu vực (tùy chọn)
   * @returns {Promise<Object>} Thông tin thời gian giao hàng
   */
  async estimateDeliveryTime(shippingMethodCode, regionCode) {
    try {
      const shippingMethod = await ShippingMethod.findOne({
        code: shippingMethodCode,
        isActive: true
      });

      if (!shippingMethod) {
        throw new ApiError(404, 'Không tìm thấy phương thức vận chuyển');
      }

      let days = shippingMethod.estimatedDeliveryDays || 0;
      // Ép mã khu vực về 'KT'
      const finalRegionCode = 'KT';

      if (shippingMethod.regionFees && shippingMethod.regionFees.length > 0) {
        const regionFee = shippingMethod.regionFees.find(region =>
          region.regionCode === finalRegionCode
        );
        if (regionFee && regionFee.estimatedDeliveryDays !== undefined) {
          days = regionFee.estimatedDeliveryDays;
        }
      }

      const today = new Date();
      const estimatedDate = new Date(today);
      estimatedDate.setDate(today.getDate() + days);

      return {
        days,
        estimatedDate,
        formattedDate: estimatedDate.toLocaleDateString('vi-VN', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      };
    } catch (error) {
      console.error('Lỗi khi ước tính thời gian giao hàng:', error);
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Lỗi khi ước tính thời gian giao hàng');
    }
  },

  /**
   * Kiểm tra và trả về mã khu vực dựa trên tên tỉnh/thành phố
   * Với hệ thống chỉ phục vụ Kon Tum, luôn trả về 'KT'
   * @param {string} cityName - Tên tỉnh/thành phố
   * @returns {string} Mã khu vực
   */
  getRegionCodeFromCity(cityName) {
    return 'KT';
  }
};

module.exports = shippingService;
