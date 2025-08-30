// services/payment/vnpayService.js
const crypto = require('crypto');
const moment = require('moment');
const querystring = require('querystring');
const { ApiError } = require('../../utils/errorHandler');

class VnpayService {
  constructor(config) {
    this.tmnCode = config.vnpTmnCode || process.env.VNPAY_TMN_CODE;
    this.hashSecret = config.vnpHashSecret || process.env.VNPAY_HASH_SECRET;
    this.vnpUrl = config.vnpUrl || process.env.VNPAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    this.returnUrl = config.vnpReturnUrl || process.env.VNPAY_RETURN_URL;
    this.isTestMode = config.vnpTestMode !== false;

    // Log cấu hình để debug
    console.log('VNPay Service khởi tạo với cấu hình:', {
      tmnCode: this.tmnCode,
      returnUrl: this.returnUrl,
      vnpUrl: this.vnpUrl,
      hashSecretLength: this.hashSecret ? this.hashSecret.length : 0,
      testMode: this.isTestMode
    });

    // Sử dụng giá trị mặc định cho môi trường test nếu không có config
    if (this.isTestMode) {
      this.tmnCode = this.tmnCode || 'CQSRDGBD';
      this.hashSecret = this.hashSecret || '5HAYN4OAK3A02GYULICV3GOSROG8Z41B';
    }

    // Kiểm tra các thông số bắt buộc
    if (!this.tmnCode || !this.hashSecret) {
      console.warn('Cấu hình VNPAY không đầy đủ. Vui lòng kiểm tra lại thông tin.');
    }
  }

  // Sắp xếp object theo thứ tự key từ a-z
  sortObject(obj) {
    const sorted = {};
    const keys = Object.keys(obj).sort();

    for (const key of keys) {
      if (obj[key] !== null && obj[key] !== undefined && obj[key] !== '') {
        sorted[key] = obj[key];
      }
    }

    return sorted;
  }

  // Tạo URL thanh toán VNPay
  async createPaymentUrl(order, ipAddr = '127.0.0.1') {
    try {
      console.log('Tạo URL thanh toán VNPay cho đơn hàng:', JSON.stringify(order));

      // Kiểm tra dữ liệu đầu vào
      if (!order || !order.orderCode || !order.total) {
        throw new Error('Dữ liệu đơn hàng không hợp lệ');
      }

      // Đảm bảo orderCode hợp lệ - chỉ giữ chữ và số
      const sanitizedOrderCode = order.orderCode.replace(/[^a-zA-Z0-9]/g, '');

      // Format số tiền, nhân với 100 theo yêu cầu của VNPay
      const amount = Math.round(order.total) * 100;

      // Tạo tham số cho VNPay theo chuẩn v2.1.0
      const tmnCode = this.tmnCode;
      const createDate = moment().format('YYYYMMDDHHmmss');
      const orderId = sanitizedOrderCode + createDate.substring(8, 14);

      const vnpParams = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: tmnCode,
        vnp_Locale: 'vn',
        vnp_CurrCode: 'VND',
        vnp_TxnRef: orderId,
        vnp_OrderInfo: `Thanh toan don hang ${order.orderCode}`,
        vnp_OrderType: 'other',
        vnp_Amount: amount,
        vnp_ReturnUrl: this.returnUrl,
        vnp_IpAddr: ipAddr.replace(/\:\:1/g, '127.0.0.1'),
        vnp_CreateDate: createDate,
      };

      console.log('Tham số VNPay trước khi sắp xếp:', vnpParams);

      // Sắp xếp tham số theo thứ tự a-z
      const sortedParams = this.sortObject(vnpParams);
      console.log('Tham số VNPay sau khi sắp xếp:', sortedParams);

      // Tạo chuỗi query string từ tham số đã sắp xếp
      // THAY ĐỔI: Sử dụng hàm mặc định để URL encode đúng cách
      const signData = querystring.stringify(sortedParams);
      console.log('Chuỗi dữ liệu ký:', signData);

      // Tạo chữ ký bằng HMAC SHA512
      const hmac = crypto.createHmac('sha512', this.hashSecret);
      const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

      console.log('Chữ ký được tạo:', signed);

      // Thêm chữ ký vào tham số
      sortedParams.vnp_SecureHash = signed;

      // Tạo URL thanh toán
      const paymentUrl = this.vnpUrl + '?' + querystring.stringify(sortedParams);
      console.log('URL thanh toán VNPay:', paymentUrl);

      return paymentUrl;
    } catch (error) {
      console.error('Lỗi khi tạo URL thanh toán VNPay:', error);
      throw new ApiError(500, `Không thể tạo URL thanh toán VNPay: ${error.message}`);
    }
  }

  // Xử lý callback từ VNPay
  async processCallback(vnpParams) {
    try {
      console.log('Nhận callback từ VNPay:', JSON.stringify(vnpParams));

      // Kiểm tra xem có dữ liệu không
      if (!vnpParams || Object.keys(vnpParams).length === 0) {
        console.error('VNPay callback: Không có tham số');
        return {
          success: false,
          message: 'Không nhận được dữ liệu từ VNPay'
        };
      }

      // Lấy secure hash từ tham số
      const vnp_SecureHash = vnpParams.vnp_SecureHash;

      // Kiểm tra các tham số bắt buộc
      if (!vnpParams.vnp_TxnRef || !vnpParams.vnp_ResponseCode) {
        console.error('VNPay callback: Thiếu tham số bắt buộc');
        return {
          success: false,
          message: 'Thiếu tham số bắt buộc từ VNPay'
        };
      }

      if (!vnp_SecureHash) {
        console.error('VNPay callback: Thiếu chữ ký xác thực (vnp_SecureHash)');
        if (this.isTestMode) {
          console.log('Chế độ thử nghiệm: Bỏ qua kiểm tra chữ ký');
        } else {
          return {
            success: false,
            message: 'Thiếu chữ ký xác thực'
          };
        }
      } else {
        // Tạo bản sao params không có secure hash để tính lại
        const vnpParamsCopy = { ...vnpParams };
        delete vnpParamsCopy.vnp_SecureHash;
        delete vnpParamsCopy.vnp_SecureHashType;

        // Sắp xếp tham số theo thứ tự a-z
        const sortedParams = this.sortObject(vnpParamsCopy);

        // Tạo chuỗi query để ký (cùng cách với lúc tạo URL)
        // THAY ĐỔI: Sử dụng hàm mặc định để URL encode đúng cách
        const signData = querystring.stringify(sortedParams);
        console.log('Callback - Chuỗi dữ liệu để ký:', signData);

        // Tạo chữ ký
        const hmac = crypto.createHmac('sha512', this.hashSecret);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

        console.log('Callback - Chữ ký tính được:', signed);
        console.log('Callback - Chữ ký nhận được:', vnp_SecureHash);

        // Kiểm tra chữ ký
        if (vnp_SecureHash !== signed) {
          console.error('VNPay callback: Chữ ký không hợp lệ');
          console.error('Chữ ký tính toán: ' + signed);
          console.error('Chữ ký nhận được: ' + vnp_SecureHash);

          if (!this.isTestMode) {
            return {
              success: false,
              message: 'Chữ ký không hợp lệ'
            };
          } else {
            console.log('Chế độ thử nghiệm: Tiếp tục mặc dù chữ ký không khớp');
          }
        }
      }

      // Kiểm tra mã phản hồi
      const responseCode = vnpParams.vnp_ResponseCode;
      console.log('VNPay response code:', responseCode);

      if (responseCode !== '00') {
        console.warn(`Giao dịch VNPay thất bại: ${this.getResponseMessage(responseCode)}`);
        return {
          success: false,
          message: this.getResponseMessage(responseCode),
          responseCode
        };
      }

      // Nếu thành công trả về kết quả giao dịch
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
      console.error('Lỗi xử lý callback từ VNPay:', error);
      throw new ApiError(500, 'Không thể xử lý callback từ VNPay');
    }
  }

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
      '70': 'Sai chữ ký',
    };

    return messages[responseCode] || 'Giao dịch không thành công';
  }
}

module.exports = VnpayService;
