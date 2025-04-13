// backend/controllers/admin/customerController.js
const Customer = require('../../models/Customer');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');
const { logActivity } = require('../../services/loggingService');
const { uploadToCloudinary, uploadImageFromUrl, deleteImage } = require('../../services/cloudinaryService');

// Lấy danh sách khách hàng (có phân trang, lọc)
exports.getCustomers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, status, isVerified } = req.query;

    // Xây dựng query
    const query = {};

    // Tìm kiếm theo từ khóa
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Lọc theo trạng thái
    if (status) {
      query.status = status;
    }

    // Lọc theo trạng thái xác thực email
    if (isVerified !== undefined) {
      query.isVerified = isVerified === 'true';
    }

    // Tính tổng số khách hàng
    const total = await Customer.countDocuments(query);

    // Lấy danh sách khách hàng
    const customers = await Customer.find(query)
      .select('-password -verificationToken -resetPasswordToken -resetPasswordExpire')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((page - 1) * limit);

    // Trả về kết quả
    return ApiResponse.paginated(
      res,
      customers,
      parseInt(page),
      parseInt(limit),
      total,
      'Lấy danh sách khách hàng thành công'
    );
  } catch (error) {
    next(error);
  }
};

// Lấy chi tiết khách hàng
exports.getCustomerById = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .select('-password -verificationToken -resetPasswordToken -resetPasswordExpire');

    if (!customer) {
      throw new ApiError(404, 'Không tìm thấy khách hàng');
    }

    return ApiResponse.success(res, 200, customer, 'Lấy chi tiết khách hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Tạo khách hàng mới (Admin tạo)
exports.createCustomer = async (req, res, next) => {
  try {
    const { email, password, fullName, phone, address, status, isVerified } = req.body;
    const avatarUrl = req.body.avatarUrl;
    const avatarFile = req.file;

    // Kiểm tra các trường bắt buộc
    if (!email || !password || !fullName) {
      throw new ApiError(400, 'Vui lòng cung cấp đầy đủ thông tin bắt buộc');
    }

    // Kiểm tra xem email đã tồn tại chưa
    const existingCustomer = await Customer.findOne({ email });

    if (existingCustomer) {
      throw new ApiError(400, 'Email đã tồn tại');
    }

    // Xử lý avatar
    let avatar = {};
    if (avatarFile) {
      // Xử lý file upload
      avatar = await uploadToCloudinary(avatarFile.path, 'ecommerce/customers');
    } else if (avatarUrl) {
      // Xử lý URL avatar
      avatar = await uploadImageFromUrl(avatarUrl, 'ecommerce/customers');
    }

    // Tạo khách hàng mới
    const customer = new Customer({
      email,
      password,
      fullName,
      phone,
      address: address || {},
      avatar,
      status: status || 'active',
      isVerified: isVerified || false
    });

    await customer.save();

    // Ghi log hoạt động tạo khách hàng
    await logActivity(req, 'create', 'customer', customer);

    // Loại bỏ mật khẩu từ response
    const customerResponse = customer.toObject();
    delete customerResponse.password;
    delete customerResponse.verificationToken;
    delete customerResponse.resetPasswordToken;
    delete customerResponse.resetPasswordExpire;

    return ApiResponse.success(res, 201, customerResponse, 'Tạo khách hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Cập nhật thông tin khách hàng
exports.updateCustomer = async (req, res, next) => {
  try {
    const { email, fullName, phone, address, status, isVerified, password } = req.body;
    const avatarUrl = req.body.avatarUrl;
    const avatarFile = req.file;

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      throw new ApiError(404, 'Không tìm thấy khách hàng');
    }

    // Kiểm tra email mới nếu thay đổi
    if (email && email !== customer.email) {
      const existingEmail = await Customer.findOne({ email });
      if (existingEmail) {
        throw new ApiError(400, 'Email đã tồn tại');
      }
      customer.email = email;
    }

    // Cập nhật avatar nếu có
    if (avatarFile || avatarUrl) {
      // Xóa avatar cũ nếu có
      if (customer.avatar && customer.avatar.publicId) {
        await deleteImage(customer.avatar.publicId);
      }

      // Upload avatar mới
      if (avatarFile) {
        customer.avatar = await uploadToCloudinary(avatarFile.path, 'ecommerce/customers');
      } else if (avatarUrl) {
        customer.avatar = await uploadImageFromUrl(avatarUrl, 'ecommerce/customers');
      }
    }

    // Cập nhật các trường khác
    if (fullName) customer.fullName = fullName;
    if (phone) customer.phone = phone;
    if (address) customer.address = { ...customer.address, ...address };
    if (status) customer.status = status;
    if (isVerified !== undefined) customer.isVerified = isVerified;
    if (password) customer.password = password; // Sẽ được mã hóa bởi middleware pre-save

    await customer.save();

    // Ghi log hoạt động cập nhật khách hàng
    await logActivity(req, 'update', 'customer', customer);

    // Lấy khách hàng đã cập nhật
    const updatedCustomer = await Customer.findById(customer._id)
      .select('-password -verificationToken -resetPasswordToken -resetPasswordExpire');

    return ApiResponse.success(res, 200, updatedCustomer, 'Cập nhật khách hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Xóa khách hàng
exports.deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      throw new ApiError(404, 'Không tìm thấy khách hàng');
    }

    // Xóa avatar nếu có
    if (customer.avatar && customer.avatar.publicId) {
      await deleteImage(customer.avatar.publicId);
    }

    // Ghi log hoạt động xóa khách hàng
    await logActivity(req, 'delete', 'customer', customer);

    await customer.deleteOne();

    return ApiResponse.success(res, 200, null, 'Xóa khách hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Cập nhật trạng thái khách hàng
exports.updateCustomerStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    // Kiểm tra trạng thái hợp lệ
    if (!['active', 'inactive', 'banned'].includes(status)) {
      throw new ApiError(400, 'Trạng thái không hợp lệ');
    }

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      throw new ApiError(404, 'Không tìm thấy khách hàng');
    }

    customer.status = status;
    await customer.save();

    // Ghi log hoạt động cập nhật trạng thái
    await logActivity(req, 'update', 'customer', customer);

    return ApiResponse.success(res, 200, { status }, 'Cập nhật trạng thái khách hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Đặt lại mật khẩu khách hàng (Admin reset)
exports.resetCustomerPassword = async (req, res, next) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      throw new ApiError(400, 'Mật khẩu mới phải có ít nhất 6 ký tự');
    }

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      throw new ApiError(404, 'Không tìm thấy khách hàng');
    }

    // Cập nhật mật khẩu
    customer.password = newPassword;
    await customer.save();

    // Ghi log hoạt động đặt lại mật khẩu
    await logActivity(req, 'resetPassword', 'customer', customer);

    return ApiResponse.success(res, 200, null, 'Đặt lại mật khẩu khách hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Cập nhật trạng thái xác thực email
exports.updateVerificationStatus = async (req, res, next) => {
  try {
    const { isVerified } = req.body;

    if (isVerified === undefined) {
      throw new ApiError(400, 'Thiếu thông tin trạng thái xác thực');
    }

    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      throw new ApiError(404, 'Không tìm thấy khách hàng');
    }

    customer.isVerified = isVerified;
    await customer.save();

    // Ghi log hoạt động cập nhật trạng thái xác thực
    await logActivity(req, 'update', 'customer', { ...customer._doc, action: 'verification_status' });

    return ApiResponse.success(res, 200, { isVerified }, 'Cập nhật trạng thái xác thực thành công');
  } catch (error) {
    next(error);
  }
};