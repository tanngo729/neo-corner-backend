// backend/controllers/admin/userController.js
const User = require('../../models/User');
const Role = require('../../models/Role');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');
const { logActivity } = require('../../services/loggingService');
const { uploadToCloudinary, uploadImageFromUrl, deleteImage } = require('../../services/cloudinaryService');

// Lấy danh sách người dùng (có phân trang, lọc)
exports.getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, role, status } = req.query;

    // Xây dựng query
    const query = {};

    // Tìm kiếm theo từ khóa
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } }
      ];
    }

    // Lọc theo vai trò
    if (role) {
      query.role = role;
    }

    // Lọc theo trạng thái
    if (status) {
      query.status = status;
    }

    // Tính tổng số người dùng
    const total = await User.countDocuments(query);

    // Lấy danh sách người dùng
    const users = await User.find(query)
      .select('-password')
      .populate('role', 'name permissions')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((page - 1) * limit);

    // Trả về kết quả
    return ApiResponse.paginated(
      res,
      users,
      parseInt(page),
      parseInt(limit),
      total,
      'Lấy danh sách người dùng thành công'
    );
  } catch (error) {
    next(error);
  }
};

// Lấy chi tiết người dùng
exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('role', 'name permissions');

    if (!user) {
      throw new ApiError(404, 'Không tìm thấy người dùng');
    }

    return ApiResponse.success(res, 200, user, 'Lấy chi tiết người dùng thành công');
  } catch (error) {
    next(error);
  }
};

// Tạo người dùng mới
exports.createUser = async (req, res, next) => {
  try {
    const { username, email, password, fullName, role, status } = req.body;
    const avatarUrl = req.body.avatarUrl;
    const avatarFile = req.file;

    // Kiểm tra các trường bắt buộc
    if (!username || !email || !password) {
      throw new ApiError(400, 'Vui lòng cung cấp đầy đủ thông tin bắt buộc');
    }

    // Kiểm tra xem tên đăng nhập hoặc email đã tồn tại chưa
    const existingUser = await User.findOne({
      $or: [
        { username: username },
        { email: email }
      ]
    });

    if (existingUser) {
      throw new ApiError(400, 'Tên đăng nhập hoặc email đã tồn tại');
    }

    // Kiểm tra và lấy vai trò
    let userRole;
    if (role) {
      userRole = await Role.findById(role);
      if (!userRole) {
        throw new ApiError(400, 'Vai trò không hợp lệ');
      }
    } else {
      // Nếu không có vai trò, gán vai trò mặc định
      userRole = await Role.findOne({ isDefault: true });
      if (!userRole) {
        throw new ApiError(500, 'Không tìm thấy vai trò mặc định');
      }
    }

    // Xử lý avatar
    let avatar = {};
    if (avatarFile) {
      // Xử lý file upload
      avatar = await uploadToCloudinary(avatarFile.path, 'ecommerce/users');
    } else if (avatarUrl) {
      // Xử lý URL avatar
      avatar = await uploadImageFromUrl(avatarUrl, 'ecommerce/users');
    }

    // Tạo người dùng mới
    const user = new User({
      username,
      email,
      password,
      fullName: fullName || username,
      avatar,
      role: userRole._id,
      status: status || 'active'
    });

    await user.save();

    // Ghi log hoạt động tạo người dùng
    await logActivity(req, 'create', 'user', user);

    // Loại bỏ mật khẩu từ response
    const userResponse = user.toObject();
    delete userResponse.password;

    return ApiResponse.success(res, 201, userResponse, 'Tạo người dùng thành công');
  } catch (error) {
    next(error);
  }
};

// Cập nhật người dùng
exports.updateUser = async (req, res, next) => {
  try {
    const { email, fullName, role, status, password } = req.body;
    const avatarUrl = req.body.avatarUrl;
    const avatarFile = req.file;

    const user = await User.findById(req.params.id);

    if (!user) {
      throw new ApiError(404, 'Không tìm thấy người dùng');
    }

    // Kiểm tra email mới nếu thay đổi
    if (email && email !== user.email) {
      const existingEmail = await User.findOne({ email: email });
      if (existingEmail) {
        throw new ApiError(400, 'Email đã tồn tại');
      }
      user.email = email;
    }

    // Cập nhật avatar nếu có
    if (avatarFile || avatarUrl) {
      // Xóa avatar cũ nếu có
      if (user.avatar && user.avatar.publicId) {
        await deleteImage(user.avatar.publicId);
      }

      // Upload avatar mới
      if (avatarFile) {
        user.avatar = await uploadToCloudinary(avatarFile.path, 'ecommerce/users');
      } else if (avatarUrl) {
        user.avatar = await uploadImageFromUrl(avatarUrl, 'ecommerce/users');
      }
    }

    // Cập nhật vai trò nếu có
    if (role) {
      const userRole = await Role.findById(role);
      if (!userRole) {
        throw new ApiError(400, 'Vai trò không hợp lệ');
      }
      user.role = userRole._id;
    }

    // Cập nhật các trường khác
    if (fullName) user.fullName = fullName;
    if (status) user.status = status;
    if (password) user.password = password; // Sẽ được mã hóa bởi middleware pre-save

    await user.save();

    // Ghi log hoạt động cập nhật người dùng
    await logActivity(req, 'update', 'user', user);

    // Lấy người dùng đã cập nhật với thông tin vai trò
    const updatedUser = await User.findById(user._id)
      .select('-password')
      .populate('role', 'name permissions');

    return ApiResponse.success(res, 200, updatedUser, 'Cập nhật người dùng thành công');
  } catch (error) {
    next(error);
  }
};

// Xóa người dùng
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      throw new ApiError(404, 'Không tìm thấy người dùng');
    }

    // Không cho phép xóa chính mình
    if (user._id.toString() === req.user._id.toString()) {
      throw new ApiError(400, 'Không thể xóa tài khoản của chính bạn');
    }

    // Xóa avatar nếu có
    if (user.avatar && user.avatar.publicId) {
      await deleteImage(user.avatar.publicId);
    }

    // Ghi log hoạt động xóa người dùng
    await logActivity(req, 'delete', 'user', user);

    await user.deleteOne();

    return ApiResponse.success(res, 200, null, 'Xóa người dùng thành công');
  } catch (error) {
    next(error);
  }
};

// Cập nhật hồ sơ cá nhân
exports.updateProfile = async (req, res, next) => {
  try {
    console.log('Đang cập nhật profile với dữ liệu:', req.body);
    console.log('File upload:', req.file);

    const { email, fullName } = req.body;
    const avatarFile = req.file;
    const avatarUrl = req.body.avatarUrl;

    // Lấy thông tin user hiện tại (từ middleware auth)
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new ApiError(404, 'Không tìm thấy thông tin người dùng');
    }

    // Cập nhật các trường
    if (email) user.email = email;
    if (fullName) user.fullName = fullName;

    // Xử lý avatar nếu có thay đổi
    if (avatarFile || avatarUrl) {
      // Xóa avatar cũ nếu có
      if (user.avatar && user.avatar.publicId) {
        await deleteImage(user.avatar.publicId);
      }

      // Upload avatar mới
      if (avatarFile) {
        user.avatar = await uploadToCloudinary(avatarFile.path, 'ecommerce/users');
      } else if (avatarUrl) {
        user.avatar = await uploadImageFromUrl(avatarUrl, 'ecommerce/users');
      }
    }

    await user.save();

    // Ghi log hoạt động cập nhật hồ sơ
    await logActivity(req, 'update', 'user', user);

    // Trả về thông tin đã cập nhật (đã loại bỏ password)
    const updatedUser = await User.findById(user._id)
      .select('-password')
      .populate('role', 'name permissions');

    return ApiResponse.success(res, 200, updatedUser, 'Cập nhật thông tin thành công');
  } catch (error) {
    console.error('Lỗi cập nhật profile:', error);
    next(error);
  }
};