// services/payment/momoService.js
const crypto = require('crypto');
const axios = require('axios');
const { ApiError } = require('../../utils/errorHandler');

class MomoService {
  constructor(config) {
    this.partnerCode = config.momoPartnerCode;
    this.accessKey = config.momoAccessKey;
    this.secretKey = config.momoSecretKey;
    this.endpoint = config.momoEndpoint || 'https://test-payment.momo.vn/v2/gateway/api/create';
    this.isTestMode = config.momoTestMode !== false;

    // Sử dụng các giá trị mặc định cho môi trường test nếu không có config
    if (this.isTestMode) {
      this.partnerCode = this.partnerCode || 'MOMOBKUN20180529';
      this.accessKey = this.accessKey || 'klm05TvNBzhg7h7j';
      this.secretKey = this.secretKey || 'at67qH6mk8w5Y1nAyMoYKMWACiEi2bsa';
    }

    // Kiểm tra các thông số bắt buộc
    if (!this.partnerCode || !this.accessKey || !this.secretKey) {
      console.warn('Cấu hình MoMo không đầy đủ. Vui lòng kiểm tra lại thông tin cấu hình.');
    }
  }

  /**
   * Tạo URL thanh toán MoMo
   * @param {Object} order - Thông tin đơn hàng
   * @returns {Promise<string>} URL thanh toán
   */
  async createPaymentUrl(order) {
    try {
      console.log('Tạo URL thanh toán MoMo cho đơn hàng:', order);

      const requestId = `${Date.now()}_${order._id}`;
      const momoOrderId = `${Date.now()}_${order._id}`;
      const orderInfo = `Thanh toán đơn hàng #${order.orderCode}`;
      const redirectUrl = `${process.env.CLIENT_URL}/payment/result`;
      const ipnUrl = `${process.env.API_URL}/callback/momo`;
      console.log('IPN URL:', ipnUrl);
      const amount = Math.round(order.total);

      // Gửi thông tin đơn hàng trong extraData cho dễ tìm kiếm sau này
      const extraData = Buffer.from(JSON.stringify({
        orderId: order._id.toString(),
        orderCode: order.orderCode
      })).toString('base64');

      console.log('Dữ liệu extraData:', {
        orderId: order._id.toString(),
        orderCode: order.orderCode
      });
      console.log('extraData encoded:', extraData);

      const requestType = "captureWallet";

      // Tạo chữ ký
      const rawSignature = `accessKey=${this.accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${momoOrderId}&orderInfo=${orderInfo}&partnerCode=${this.partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;

      const signature = crypto
        .createHmac('sha256', this.secretKey)
        .update(rawSignature)
        .digest('hex');

      console.log('Raw signature:', rawSignature);
      console.log('Chữ ký:', signature);

      const requestBody = {
        partnerCode: this.partnerCode,
        accessKey: this.accessKey,
        requestId: requestId,
        amount: amount,
        orderId: momoOrderId,
        orderInfo: orderInfo,
        redirectUrl: redirectUrl,
        ipnUrl: ipnUrl,
        extraData: extraData,
        requestType: requestType,
        signature: signature,
        lang: 'vi'
      };

      console.log('Request body to MoMo:', JSON.stringify(requestBody, null, 2));

      // Gọi API MoMo
      const response = await axios.post(this.endpoint, requestBody, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log('MoMo response:', response.data);

      if (response.data.resultCode === 0) {
        // Lưu thông tin cho callback
        return response.data.payUrl;
      } else {
        throw new ApiError(400, response.data.message || 'Không thể tạo thanh toán MoMo');
      }
    } catch (error) {
      console.error('Lỗi khi tạo URL thanh toán MoMo:', error);
      throw new ApiError(500, 'Không thể tạo URL thanh toán MoMo. Vui lòng thử lại sau.');
    }
  }

  /**
   * Xử lý callback từ MoMo
   * @param {Object} momoResponse - Dữ liệu callback từ MoMo
   * @returns {Promise<Object>} Kết quả xử lý callback
   */
  async processCallback(momoResponse) {
    try {
      console.log('Xử lý dữ liệu callback từ MoMo:', momoResponse);

      // Kiểm tra các trường bắt buộc
      if (!momoResponse.partnerCode || !momoResponse.orderId ||
        !momoResponse.requestId || !momoResponse.amount ||
        !momoResponse.signature) {
        console.error('Thiếu trường dữ liệu bắt buộc từ MoMo');
        return {
          success: false,
          message: 'Dữ liệu không hợp lệ, thiếu trường bắt buộc'
        };
      }

      // Xác thực chữ ký từ MoMo
      const {
        partnerCode, accessKey, requestId, amount, orderId,
        orderInfo, orderType, transId, resultCode, message,
        payType, responseTime, extraData, signature
      } = momoResponse;

      // Xác định các trường cần thiết để tạo signature
      // Cách 1: Tạo chuỗi rawSignature để xác thực - kiểu cũ
      let rawSignature = "";
      if (accessKey && amount && extraData && message &&
        orderId && orderInfo && partnerCode && responseTime &&
        resultCode && transId) {

        rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`;
      }
      // Cách 2: Tạo chuỗi rawSignature kiểu mới với payType
      else if (accessKey && amount && extraData && message &&
        orderId && orderInfo && orderType && partnerCode &&
        payType && responseTime && resultCode && transId) {

        rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}&orderType=${orderType}&partnerCode=${partnerCode}&payType=${payType}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`;
      }
      // Nếu không đủ dữ liệu để tạo signature
      else {
        console.error('Không đủ trường dữ liệu để tạo chữ ký MoMo');
        // Trong trường hợp test, có thể bỏ qua việc kiểm tra chữ ký
        if (this.isTestMode) {
          console.log('Môi trường test: Bỏ qua kiểm tra chữ ký');
        } else {
          return {
            success: false,
            message: 'Không đủ dữ liệu để xác thực chữ ký'
          };
        }
      }

      // Thực hiện kiểm tra chữ ký nếu có đủ dữ liệu
      if (rawSignature) {
        const checkSignature = crypto
          .createHmac('sha256', this.secretKey)
          .update(rawSignature)
          .digest('hex');

        if (checkSignature !== signature) {
          console.error('Lỗi xác thực chữ ký MoMo');
          console.log('Chữ ký nhận được:', signature);
          console.log('Chữ ký tính toán:', checkSignature);
          console.log('Raw signature:', rawSignature);

          // Trong trường hợp test, có thể bỏ qua việc kiểm tra chữ ký
          if (this.isTestMode) {
            console.log('Môi trường test: Bỏ qua lỗi chữ ký không khớp');
          } else {
            return {
              success: false,
              message: 'Chữ ký không hợp lệ'
            };
          }
        }
      }

      // Kiểm tra kết quả giao dịch
      // MoMo sử dụng resultCode là chuỗi hoặc số tùy phiên bản
      if (resultCode !== '0' && resultCode !== 0) {
        console.warn(`Giao dịch MoMo thất bại: ${message}`);
        return {
          success: false,
          message: message || 'Giao dịch thất bại',
          resultCode
        };
      }

      // Giải mã extraData để lấy orderCode và orderId
      let orderCode = '';
      let extractedOrderId = '';
      try {
        if (extraData) {
          const decodedExtraData = JSON.parse(Buffer.from(extraData, 'base64').toString());
          orderCode = decodedExtraData.orderCode;
          extractedOrderId = decodedExtraData.orderId;
          console.log('Giải mã extraData thành công:', decodedExtraData);
        }
      } catch (e) {
        console.error('Lỗi giải mã extraData:', e);
        // Thử phương pháp khác để lấy thông tin đơn hàng
        const orderIdParts = orderId.split('_');
        if (orderIdParts.length > 1) {
          extractedOrderId = orderIdParts[1];
        }

        // Hoặc thử lấy từ orderInfo
        if (orderInfo && orderInfo.includes('#')) {
          orderCode = orderInfo.split('#')[1].trim();
        }
      }

      // Trả về kết quả thành công
      return {
        success: true,
        orderCode,
        orderId: extractedOrderId,
        transactionId: transId,
        amount: parseInt(amount),
        message: 'Thanh toán thành công'
      };
    } catch (error) {
      console.error('Lỗi xử lý callback từ MoMo:', error);
      throw new ApiError(500, 'Không thể xử lý callback từ MoMo');
    }
  }

  /**
   * Cập nhật thông tin thanh toán vào đơn hàng
   * @param {Object} order - Đơn hàng cần cập nhật
   * @param {Object} paymentInfo - Thông tin thanh toán
   * @returns {Promise<void>}
   */
  async updateOrderPaymentInfo(order, paymentInfo) {
    // Thực hiện cập nhật thông tin thanh toán vào đơn hàng
    // Thông thường sẽ cần một Order model ở đây
    try {
      if (!order.payment) {
        order.payment = {};
      }

      if (!order.payment.transactionInfo) {
        order.payment.transactionInfo = {};
      }

      order.payment.status = paymentInfo.paymentStatus || order.payment.status;
      order.payment.transactionInfo.momo = {
        ...order.payment.transactionInfo.momo,
        ...paymentInfo
      };

      await order.save();
      console.log(`Đã cập nhật thông tin thanh toán cho đơn hàng ${order.orderCode}`);
    } catch (error) {
      console.error('Lỗi cập nhật thông tin thanh toán:', error);
    }
  }

  /**
   * Kiểm tra trạng thái giao dịch với MoMo
   * @param {string} orderId - Mã đơn hàng trong hệ thống MoMo
   * @returns {Promise<Object>} Kết quả kiểm tra
   */
  async checkTransactionStatus(orderId) {
    try {
      // Trong môi trường thực tế, bạn có thể gọi API kiểm tra trạng thái của MoMo
      // Đây chỉ là mã giả định
      const endpoint = this.isTestMode
        ? 'https://test-payment.momo.vn/v2/gateway/api/query'
        : 'https://payment.momo.vn/v2/gateway/api/query';

      const requestId = `${Date.now()}`;
      const rawSignature = `accessKey=${this.accessKey}&orderId=${orderId}&partnerCode=${this.partnerCode}&requestId=${requestId}`;

      const signature = crypto
        .createHmac('sha256', this.secretKey)
        .update(rawSignature)
        .digest('hex');

      const requestBody = {
        partnerCode: this.partnerCode,
        requestId: requestId,
        orderId: orderId,
        signature: signature,
        lang: 'vi'
      };

      const response = await axios.post(endpoint, requestBody, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Lỗi kiểm tra trạng thái giao dịch MoMo:', error.response ? error.response.data : error.message);
      throw new ApiError(500, 'Không thể kiểm tra trạng thái giao dịch MoMo');
    }
  }
}

module.exports = MomoService;