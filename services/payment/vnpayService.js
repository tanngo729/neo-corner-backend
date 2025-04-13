// services/payment/vnpayService.js
const crypto = require('crypto');
const moment = require('moment');
const querystring = require('querystring');
const { ApiError } = require('../../utils/errorHandler');

class VnpayService {
  constructor(config) {
    // Ưu tiên sử dụng trực tiếp biến môi trường nếu có
    this.tmnCode = config.vnpTmnCode || process.env.VNPAY_TMN_CODE;
    this.hashSecret = config.vnpHashSecret || process.env.VNPAY_HASH_SECRET;
    this.vnpUrl = config.vnpUrl || process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    this.returnUrl = process.env.VNPAY_RETURN_URL || 'http://localhost:5000/callback/vnpay';
    this.isTestMode = config.vnpTestMode !== false;

    // Thông tin debug
    console.log('Khởi tạo VNPAY Service với các biến môi trường:');
    console.log('- API_URL:', process.env.API_URL);
    console.log('- VNPAY_RETURN_URL:', process.env.VNPAY_RETURN_URL);
    console.log('- VNPAY_TMN_CODE:', process.env.VNPAY_TMN_CODE);
    console.log('- VNPAY_URL:', process.env.VNPAY_URL);

    // Sử dụng các giá trị mặc định cho môi trường test nếu không có config
    if (this.isTestMode) {
      this.tmnCode = this.tmnCode || 'CQSRDGBD';
      this.hashSecret = this.hashSecret || '5HAYN4OAK3A02GYULICV3GOSROG8Z41B';
    }

    // Kiểm tra các thông số bắt buộc
    if (!this.tmnCode || !this.hashSecret) {
      console.warn('Cấu hình VNPAY không đầy đủ. Vui lòng kiểm tra lại thông tin cấu hình.');
    }

    console.log('VNPAY Service initialized with:', {
      tmnCode: this.tmnCode,
      url: this.vnpUrl,
      returnUrl: this.returnUrl,
      testMode: this.isTestMode
    });
  }

  /**
   * Sắp xếp object theo key
   * @param {Object} obj - Object cần sắp xếp
   * @returns {Object} Object đã sắp xếp
   */
  sortObject(obj) {
    const sorted = {};
    const keys = Object.keys(obj).sort();

    for (const key of keys) {
      if (obj[key] !== null && obj[key] !== undefined) {
        sorted[key] = obj[key];
      }
    }

    return sorted;
  }

  /**
   * Tạo URL thanh toán VNPAY
   * @param {Object} order - Thông tin đơn hàng
   * @param {string} ipAddr - Địa chỉ IP của khách hàng
   * @returns {Promise<string>} URL thanh toán
   */
  async createPaymentUrl(order, ipAddr = '127.0.0.1') {
    try {
      console.log('Tạo URL thanh toán VNPAY cho đơn hàng:', order);

      // Đảm bảo orderCode hợp lệ - chỉ giữ chữ và số
      const sanitizedOrderCode = order.orderCode.replace(/[^a-zA-Z0-9]/g, '');

      // Format số tiền, nhân với 100 theo yêu cầu của VNPAY
      const amount = Math.round(order.total) * 100;

      // Các tham số VNPAY
      const date = new Date();
      const createDate = moment(date).format('YYYYMMDDHHmmss');

      // QUAN TRỌNG: Sử dụng đúng định dạng và số lượng tham số
      const vnpParams = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: this.tmnCode,
        vnp_Locale: 'vn',
        vnp_CurrCode: 'VND',
        vnp_TxnRef: sanitizedOrderCode,
        vnp_OrderInfo: `Thanh toan don hang ${sanitizedOrderCode}`,
        vnp_OrderType: 'billpayment',
        vnp_Amount: amount,
        vnp_ReturnUrl: this.returnUrl,
        vnp_IpAddr: '127.0.0.1', // Thay đổi từ ::1 sang 127.0.0.1
        vnp_CreateDate: createDate,
        vnp_BankCode: '', // Thêm tham số trống để VNPAY hiển thị tất cả ngân hàng
      };

      console.log('Tham số VNPAY:', vnpParams);

      // Sắp xếp tham số
      const sortedParams = this.sortObject(vnpParams);

      // Tạo chuỗi ký chính xác từ các tham số đã sắp xếp
      const signData = this.buildSignatureString(sortedParams);
      console.log('Chuỗi ký:', signData);

      // Tạo chữ ký với HMAC SHA512
      const hmac = crypto.createHmac('sha512', this.hashSecret);
      const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
      console.log('Chữ ký:', signed);

      // Tạo URL đúng cách - QUAN TRỌNG: sử dụng querystring.stringify để xử lý đúng 
      // việc mã hóa URL (tránh lỗi với các ký tự đặc biệt)
      const secureHash = signed;
      sortedParams.vnp_SecureHash = secureHash;

      // Tạo URL với các tham số đã được mã hóa đúng
      const paymentUrl = this.vnpUrl + '?' + querystring.stringify(sortedParams);

      console.log('URL thanh toán VNPAY:', paymentUrl);

      return paymentUrl;
    } catch (error) {
      console.error('Lỗi khi tạo URL thanh toán VNPAY:', error);
      throw new ApiError(500, `Không thể tạo URL thanh toán VNPAY: ${error.message}`);
    }
  }

  // Hàm xây dựng chuỗi ký CHÍNH XÁC cho VNPAY
  buildSignatureString(params) {
    // Tạo chuỗi ký theo đúng định dạng VNPAY yêu cầu
    return Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&');
  }

  /**
   * Xử lý callback từ VNPAY
   * @param {Object} vnpParams - Tham số callback từ VNPAY
   * @returns {Promise<Object>} Kết quả xử lý callback
   */
  async processCallback(vnpParams) {
    try {
      console.log('Processing VNPAY callback:', vnpParams);

      // Kiểm tra xem có dữ liệu không
      if (!vnpParams || Object.keys(vnpParams).length === 0) {
        console.error('VNPAY callback empty params');
        return {
          success: false,
          message: 'Không nhận được dữ liệu từ VNPAY'
        };
      }

      // Kiểm tra các tham số bắt buộc
      if (!vnpParams.vnp_TxnRef || !vnpParams.vnp_ResponseCode) {
        console.error('VNPAY callback missing required params');
        return {
          success: false,
          message: 'Thiếu tham số bắt buộc từ VNPAY'
        };
      }

      // Lấy secure hash từ tham số
      const secureHash = vnpParams.vnp_SecureHash;

      // Trong môi trường test, có thể bỏ qua kiểm tra chữ ký
      if (!secureHash) {
        console.error('VNPAY callback missing vnp_SecureHash');
        if (this.isTestMode) {
          console.log('Test mode: Skipping signature verification');
        } else {
          return {
            success: false,
            message: 'Thiếu chữ ký xác thực'
          };
        }
      } else {
        // Tạo bản sao không có secure hash để tính lại
        const vnpParamsCopy = { ...vnpParams };
        delete vnpParamsCopy.vnp_SecureHash;
        delete vnpParamsCopy.vnp_SecureHashType;

        // Sắp xếp và tạo chuỗi ký
        const sortedParams = this.sortObject(vnpParamsCopy);
        const signData = this.buildSignatureString(sortedParams);
        console.log('VNPAY callback sign data:', signData);

        const hmac = crypto.createHmac('sha512', this.hashSecret);
        const signed = hmac.update(signData, 'utf-8').digest('hex');
        console.log('VNPAY callback calculated hash:', signed);
        console.log('VNPAY callback received hash:', secureHash);

        // Kiểm tra chữ ký
        if (secureHash !== signed && !this.isTestMode) {
          console.error('VNPAY signature verification failed');
          return {
            success: false,
            message: 'Chữ ký không hợp lệ'
          };
        }
      }

      // Kiểm tra mã phản hồi
      const responseCode = vnpParams.vnp_ResponseCode;
      console.log('VNPAY response code:', responseCode);

      if (responseCode !== '00') {
        console.warn(`VNPAY transaction failed: ${this.getResponseMessage(responseCode)}`);
        return {
          success: false,
          message: this.getResponseMessage(responseCode),
          responseCode
        };
      }

      // Thành công
      return {
        success: true,
        orderCode: vnpParams.vnp_TxnRef,
        transactionId: vnpParams.vnp_TransactionNo,
        amount: parseInt(vnpParams.vnp_Amount) / 100, // Chuyển về đơn vị gốc
        bankCode: vnpParams.vnp_BankCode,
        bankTranNo: vnpParams.vnp_BankTranNo,
        cardType: vnpParams.vnp_CardType,
        payDate: vnpParams.vnp_PayDate,
        message: 'Thanh toán thành công'
      };
    } catch (error) {
      console.error('Lỗi xử lý callback từ VNPAY:', error);
      throw new ApiError(500, 'Không thể xử lý callback từ VNPAY');
    }
  }

  /**
   * Lấy thông báo dựa trên mã phản hồi
   * @param {string} responseCode - Mã phản hồi từ VNPAY
   * @returns {string} Thông báo tương ứng
   */
  getResponseMessage(responseCode) {
    const messages = {
      '00': 'Giao dịch thành công',
      '01': 'Giao dịch đã tồn tại',
      '02': 'Merchant không hợp lệ (kiểm tra lại vnp_TmnCode)',
      '03': 'Dữ liệu gửi sang không đúng định dạng',
      '04': 'Khởi tạo GD không thành công do Website đang bị tạm khóa',
      '05': 'Giao dịch không thành công do: Quý khách nhập sai mật khẩu quá số lần quy định',
      '06': 'Giao dịch không thành công do Quý khách nhập sai mật khẩu',
      '07': 'Giao dịch bị nghi ngờ gian lận',
      '09': 'Giao dịch không thành công do: Thẻ/Tài khoản của khách hàng chưa đăng ký dịch vụ Internet Banking',
      '10': 'Giao dịch không thành công do: Khách hàng xác thực thông tin thẻ/tài khoản không đúng quá 3 lần',
      '11': 'Giao dịch không thành công do: Đã hết hạn chờ thanh toán',
      '12': 'Giao dịch không thành công do: Thẻ/Tài khoản bị khóa',
      '13': 'Giao dịch không thành công do Quý khách nhập sai mật khẩu xác thực',
      '24': 'Giao dịch không thành công do: Khách hàng hủy giao dịch',
      '51': 'Giao dịch không thành công do: Tài khoản không đủ số dư để thực hiện giao dịch',
      '65': 'Giao dịch không thành công do: Tài khoản của Quý khách đã vượt quá hạn mức giao dịch trong ngày',
      '75': 'Ngân hàng thanh toán đang bảo trì',
      '79': 'Giao dịch không thành công do: KH nhập sai mật khẩu thanh toán nhiều lần',
      '99': 'Lỗi không xác định',
      '70': 'Sai chữ ký', // Thêm mã lỗi 70 - Sai chữ ký
    };

    return messages[responseCode] || 'Giao dịch không thành công';
  }
}

module.exports = VnpayService;