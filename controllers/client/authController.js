// backend/controllers/client/authController.js
const crypto = require('crypto');
const Customer = require('../../models/Customer');
const { ApiError } = require('../../utils/errorHandler');
const emailService = require('../../services/emailService');

// Controller đăng ký tài khoản
exports.register = async (req, res, next) => {
  try {
    const { email, password, fullName, phone } = req.body;

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

    customer.password = undefined;
    customer.verificationToken = undefined;

    res.status(201).json({
      success: true,
      message: 'Đăng ký thành công, vui lòng kiểm tra email để xác thực tài khoản',
      data: {
        customer
        // Không trả về token
      }
    });
  } catch (error) {
    next(error);
  }
};

// Controller đăng nhập
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

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

    res.status(200).json({
      success: true,
      message: 'Đăng nhập thành công',
      data: {
        customer,
        token
      }
    });
  } catch (error) {
    next(error);
  }
};

// Controller quên mật khẩu
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ApiError(400, 'Vui lòng cung cấp email');
    }

    // Tìm khách hàng theo email
    const customer = await Customer.findOne({ email });

    if (!customer) {
      // Không thông báo rõ email không tồn tại vì lý do bảo mật
      return res.status(200).json({
        success: true,
        message: 'Nếu tài khoản tồn tại, email đặt lại mật khẩu sẽ được gửi'
      });
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

    // Tạo URL đặt lại mật khẩu
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

    try {
      // Gửi email đặt lại mật khẩu
      await emailService.sendPasswordResetEmail(customer, resetToken);

      res.status(200).json({
        success: true,
        message: 'Email đặt lại mật khẩu đã được gửi'
      });
    } catch (emailError) {
      // Nếu gửi email thất bại, xóa token và thời gian hết hạn
      customer.resetPasswordToken = undefined;
      customer.resetPasswordExpire = undefined;
      await customer.save();

      throw new ApiError(500, 'Không thể gửi email đặt lại mật khẩu');
    }
  } catch (error) {
    next(error);
  }
};

// Controller đặt lại mật khẩu
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

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

    res.status(200).json({
      success: true,
      message: 'Mật khẩu đã được đặt lại thành công'
    });
  } catch (error) {
    next(error);
  }
};

// Controller xác thực email
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.params;

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

    // Chuyển hướng đến trang thành công
    res.redirect(`${process.env.CLIENT_URL}/verify-success`);
  } catch (error) {
    next(error);
  }
};

// Controller lấy thông tin khách hàng hiện tại
exports.getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: req.user
    });
  } catch (error) {
    next(error);
  }
};

// Controller cập nhật thông tin cá nhân
exports.updateProfile = async (req, res, next) => {
  try {
    const { fullName, phone, address } = req.body;

    // Các thông tin có thể cập nhật
    const updateData = {};

    if (fullName) updateData.fullName = fullName;
    if (phone) updateData.phone = phone;
    if (address) updateData.address = address;

    // Cập nhật khách hàng
    const customer = await Customer.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Cập nhật thông tin thành công',
      data: customer
    });
  } catch (error) {
    next(error);
  }
};

// Controller thay đổi mật khẩu
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ApiError(400, 'Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới');
    }

    if (newPassword.length < 6) {
      throw new ApiError(400, 'Mật khẩu mới phải có ít nhất 6 ký tự');
    }

    // Lấy khách hàng với mật khẩu
    const customer = await Customer.findById(req.user._id).select('+password');

    // Kiểm tra mật khẩu hiện tại
    const isMatch = await customer.matchPassword(currentPassword);
    if (!isMatch) {
      throw new ApiError(401, 'Mật khẩu hiện tại không chính xác');
    }

    // Cập nhật mật khẩu mới
    customer.password = newPassword;
    await customer.save();

    res.status(200).json({
      success: true,
      message: 'Mật khẩu đã được thay đổi thành công'
    });
  } catch (error) {
    next(error);
  }
};

// Controller gửi lại email xác thực
exports.resendVerificationEmail = async (req, res, next) => {
  try {
    const customer = req.user;

    if (customer.isVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email đã được xác thực'
      });
    }

    // Tạo token xác thực mới
    const verificationToken = crypto.randomBytes(32).toString('hex');
    customer.verificationToken = verificationToken;

    await customer.save();

    // Gửi email xác thực
    await emailService.sendVerificationEmail(customer, verificationToken);

    res.status(200).json({
      success: true,
      message: 'Email xác thực đã được gửi lại'
    });
  } catch (error) {
    next(error);
  }
};