// backend/services/authService.js
const crypto = require('crypto');
const Customer = require('../models/Customer');
const { ApiError } = require('../utils/errorHandler');
const emailService = require('./emailService');

const authService = {
  /**
   * Đăng ký khách hàng mới
   * @param {Object} customerData - Dữ liệu khách hàng
   * @returns {Promise<Object>} - Trả về khách hàng đã tạo và token
   */
  async registerCustomer(customerData) {
    const { email, password, fullName, phone } = customerData;

    // Kiểm tra email đã tồn tại chưa
    const existingCustomer = await Customer.findOne({ email });
    if (existingCustomer) {
      throw new ApiError(400, 'Email đã được sử dụng');
    }

    // Tạo token xác thực email
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Tạo khách hàng mới
    const customer = await Customer.create({
      email,
      password,
      fullName,
      phone,
      verificationToken
    });

    // Gửi email xác thực
    await emailService.sendVerificationEmail(customer, verificationToken);

    // Tạo token xác thực
    const token = customer.generateAuthToken();

    // Không trả về mật khẩu và token xác thực
    customer.password = undefined;
    customer.verificationToken = undefined;

    return { customer, token };
  },

  /**
   * Đăng nhập khách hàng
   * @param {string} email - Email khách hàng
   * @param {string} password - Mật khẩu
   * @returns {Promise<Object>} - Trả về khách hàng và token
   */
  async loginCustomer(email, password) {
    // Kiểm tra email và password
    if (!email || !password) {
      throw new ApiError(400, 'Vui lòng cung cấp email và mật khẩu');
    }

    // Tìm khách hàng và lấy cả trường password
    const customer = await Customer.findOne({ email }).select('+password');

    // Kiểm tra khách hàng tồn tại
    if (!customer) {
      throw new ApiError(401, 'Email hoặc mật khẩu không chính xác');
    }

    // Kiểm tra trạng thái tài khoản
    if (customer.status !== 'active') {
      throw new ApiError(403, 'Tài khoản đã bị khóa hoặc vô hiệu hóa');
    }

    if (!customer.isVerified) {
      throw new ApiError(403, 'Email chưa được xác thực, vui lòng xác thực email trước khi đăng nhập');
    }

    // Kiểm tra mật khẩu
    const isMatch = await customer.matchPassword(password);
    if (!isMatch) {
      throw new ApiError(401, 'Email hoặc mật khẩu không chính xác');
    }

    // Cập nhật lần đăng nhập cuối
    customer.lastLogin = Date.now();
    await customer.save();

    // Tạo token
    const token = customer.generateAuthToken();

    // Không trả về mật khẩu
    customer.password = undefined;

    return { customer, token };
  },

  /**
   * Xử lý quên mật khẩu
   * @param {string} email - Email khách hàng
   * @returns {Promise<boolean>} - Trả về true nếu email được gửi
   */
  async forgotPassword(email) {
    if (!email) {
      throw new ApiError(400, 'Vui lòng cung cấp email');
    }

    // Tìm khách hàng theo email
    const customer = await Customer.findOne({ email });

    if (!customer) {
      // Không thông báo rõ email không tồn tại vì lý do bảo mật
      return true;
    }

    // Tạo token đặt lại mật khẩu
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Lưu hash của token vào DB
    customer.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Token hết hạn sau 15 phút
    customer.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

    await customer.save();

    try {
      // Gửi email đặt lại mật khẩu
      await emailService.sendPasswordResetEmail(customer, resetToken);
      return true;
    } catch (error) {
      // Nếu gửi email thất bại, xóa token và thời gian hết hạn
      customer.resetPasswordToken = undefined;
      customer.resetPasswordExpire = undefined;
      await customer.save();
      throw new ApiError(500, 'Không thể gửi email đặt lại mật khẩu');
    }
  },

  /**
   * Đặt lại mật khẩu
   * @param {string} token - Token đặt lại mật khẩu
   * @param {string} password - Mật khẩu mới
   * @returns {Promise<boolean>} - Trả về true nếu mật khẩu được đặt lại thành công
   */
  async resetPassword(token, password) {
    if (!token || !password) {
      throw new ApiError(400, 'Vui lòng cung cấp token và mật khẩu mới');
    }

    if (password.length < 6) {
      throw new ApiError(400, 'Mật khẩu phải có ít nhất 6 ký tự');
    }

    // Hash token nhận được
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Tìm khách hàng theo token và thời gian hạn
    const customer = await Customer.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!customer) {
      throw new ApiError(400, 'Token không hợp lệ hoặc đã hết hạn');
    }

    // Đặt mật khẩu mới và xóa token
    customer.password = password;
    customer.resetPasswordToken = undefined;
    customer.resetPasswordExpire = undefined;

    await customer.save();

    // Gửi email thông báo mật khẩu đã được thay đổi
    await emailService.sendPasswordChangedEmail(customer);

    return true;
  },

  /**
   * Xác thực email
   * @param {string} token - Token xác thực
   * @returns {Promise<boolean>} - Trả về true nếu email được xác thực thành công
   */
  async verifyEmail(token) {
    if (!token) {
      throw new ApiError(400, 'Token xác thực không hợp lệ');
    }

    // Tìm khách hàng theo token xác thực
    const customer = await Customer.findOne({ verificationToken: token });

    if (!customer) {
      throw new ApiError(400, 'Token xác thực không hợp lệ hoặc đã hết hạn');
    }

    // Cập nhật trạng thái xác thực và xóa token
    customer.isVerified = true;
    customer.verificationToken = undefined;

    await customer.save();

    return true;
  },

  /**
   * Gửi lại email xác thực
   * @param {Object} customer - Khách hàng
   * @returns {Promise<boolean>} - Trả về true nếu email được gửi thành công
   */
  async resendVerificationEmail(customer) {
    if (customer.isVerified) {
      throw new ApiError(400, 'Email đã được xác thực');
    }

    // Tạo token xác thực mới
    const verificationToken = crypto.randomBytes(32).toString('hex');
    customer.verificationToken = verificationToken;

    await customer.save();

    // Gửi email xác thực
    await emailService.sendVerificationEmail(customer, verificationToken);

    return true;
  },

  /**
   * Cập nhật thông tin khách hàng
   * @param {string} customerId - ID khách hàng
   * @param {Object} updateData - Dữ liệu cập nhật
   * @returns {Promise<Object>} - Trả về khách hàng đã cập nhật
   */
  async updateProfile(customerId, updateData) {
    const allowedFields = ['fullName', 'phone', 'address'];
    const filteredData = {};

    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key) && updateData[key] !== undefined) {
        filteredData[key] = updateData[key];
      }
    });

    if (Object.keys(filteredData).length === 0) {
      throw new ApiError(400, 'Không có dữ liệu cập nhật hợp lệ');
    }

    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { $set: filteredData },
      { new: true, runValidators: true }
    );

    if (!customer) {
      throw new ApiError(404, 'Không tìm thấy khách hàng');
    }

    return customer;
  },

  /**
   * Thay đổi mật khẩu
   * @param {string} customerId - ID khách hàng
   * @param {string} currentPassword - Mật khẩu hiện tại
   * @param {string} newPassword - Mật khẩu mới
   * @returns {Promise<boolean>} - Trả về true nếu mật khẩu được thay đổi thành công
   */
  async changePassword(customerId, currentPassword, newPassword) {
    if (!currentPassword || !newPassword) {
      throw new ApiError(400, 'Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới');
    }

    if (newPassword.length < 6) {
      throw new ApiError(400, 'Mật khẩu mới phải có ít nhất 6 ký tự');
    }

    // Lấy khách hàng với mật khẩu
    const customer = await Customer.findById(customerId).select('+password');

    if (!customer) {
      throw new ApiError(404, 'Không tìm thấy khách hàng');
    }

    // Kiểm tra mật khẩu hiện tại
    const isMatch = await customer.matchPassword(currentPassword);
    if (!isMatch) {
      throw new ApiError(401, 'Mật khẩu hiện tại không chính xác');
    }

    // Cập nhật mật khẩu mới
    customer.password = newPassword;
    await customer.save();

    return true;
  }
};

module.exports = authService;