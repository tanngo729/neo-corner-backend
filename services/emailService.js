// backend/services/emailService.js
const nodemailer = require('nodemailer');
const { ApiError } = require('../utils/errorHandler');

// Tạo transporter cho nodemailer
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

// Dịch vụ gửi email
const emailService = {
  /**
   * Gửi email
   * @param {Object} options - Các tùy chọn email
   * @param {string} options.to - Địa chỉ email người nhận
   * @param {string} options.subject - Tiêu đề email
   * @param {string} options.html - Nội dung HTML của email
   * @param {string} [options.text] - Nội dung text của email (tùy chọn)
   * @returns {Promise<void>}
   */
  async sendEmail(options) {
    try {
      const transporter = createTransporter();

      const mailOptions = {
        from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
      };

      if (options.text) {
        mailOptions.text = options.text;
      }

      await transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Lỗi gửi email:', error);
      throw new ApiError(500, 'Không thể gửi email');
    }
  },

  /**
   * Gửi email xác thực
   * @param {Object} customer - Thông tin khách hàng
   * @param {string} verificationToken - Token xác thực
   * @returns {Promise<void>}
   */
  async sendVerificationEmail(customer, verificationToken) {
    // Thay đổi để trỏ trực tiếp đến backend endpoint
    const verificationUrl = `${process.env.API_URL}/${verificationToken}`;

    await this.sendEmail({
      to: customer.email,
      subject: 'Xác thực tài khoản của bạn',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Xin chào ${customer.fullName},</h2>
          <p>Cảm ơn bạn đã đăng ký tài khoản tại Neo Corner.</p>
          <p>Vui lòng nhấp vào nút bên dưới để xác thực email của bạn:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 12px 25px; text-align: center; text-decoration: none; display: inline-block; border-radius: 4px; font-weight: bold;">
              Xác thực email
            </a>
          </div>
          <p>Hoặc bạn có thể sao chép và dán liên kết này vào trình duyệt:</p>
          <p>${verificationUrl}</p>
          <p>Liên kết này sẽ hết hạn sau 24 giờ.</p>
          <p>Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email này.</p>
          <p>Trân trọng,<br>Đội ngũ Neo Corner</p>
        </div>
      `
    });
  },

  /**
   * Gửi email đặt lại mật khẩu
   * @param {Object} customer - Thông tin khách hàng
   * @param {string} resetToken - Token đặt lại mật khẩu
   * @returns {Promise<void>}
   */
  async sendPasswordResetEmail(customer, resetToken) {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

    await this.sendEmail({
      to: customer.email,
      subject: 'Yêu cầu đặt lại mật khẩu',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Xin chào ${customer.fullName},</h2>
          <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản của mình tại Neo Corner.</p>
          <p>Vui lòng nhấp vào nút bên dưới để đặt lại mật khẩu:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 12px 25px; text-align: center; text-decoration: none; display: inline-block; border-radius: 4px; font-weight: bold;">
              Đặt lại mật khẩu
            </a>
          </div>
          <p>Hoặc bạn có thể sao chép và dán liên kết này vào trình duyệt:</p>
          <p>${resetUrl}</p>
          <p>Liên kết này sẽ hết hạn sau 15 phút.</p>
          <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này hoặc liên hệ với chúng tôi nếu bạn có bất kỳ câu hỏi nào.</p>
          <p>Trân trọng,<br>Đội ngũ Neo Corner</p>
        </div>
      `
    });
  },

  /**
   * Gửi email thông báo sau khi đặt lại mật khẩu thành công
   * @param {Object} customer - Thông tin khách hàng
   * @returns {Promise<void>}
   */
  async sendPasswordChangedEmail(customer) {
    await this.sendEmail({
      to: customer.email,
      subject: 'Mật khẩu của bạn đã được thay đổi',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Xin chào ${customer.fullName},</h2>
          <p>Mật khẩu của tài khoản bạn tại Neo Corner đã được thay đổi thành công.</p>
          <p>Nếu bạn không thực hiện hành động này, vui lòng liên hệ với chúng tôi ngay lập tức.</p>
          <p>Trân trọng,<br>Đội ngũ Neo Corner</p>
        </div>
      `
    });
  }
};

module.exports = emailService;