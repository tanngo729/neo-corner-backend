// backend/controllers/admin/profileController.js
const User = require('../../models/User');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');
const bcrypt = require('bcryptjs');
const { logActivity } = require('../../services/loggingService');
const { deleteImage, uploadToCloudinary, uploadImageFromUrl } = require('../../services/cloudinaryService');

// Lấy thông tin người dùng hiện tại
exports.getProfile = async (req, res, next) => {
  try {
    // req.user đã được set trong middleware authenticate
    return ApiResponse.success(res, 200, req.user, 'Lấy thông tin người dùng thành công');
  } catch (error) {
    next(error);
  }
};

// Cập nhật thông tin cá nhân
exports.updateProfile = async (req, res, next) => {
  try {
    console.log('Đang cập nhật profile với dữ liệu:', req.body);
    console.log('File upload:', req.file);

    const { email, fullName, removeAvatar } = req.body;
    const avatarFile = req.file;
    const avatarUrl = req.body.avatarUrl;

    // Lấy thông tin user hiện tại (từ middleware auth)
    const user = await User.findById(req.user._id);

    if (!user) {
      throw new ApiError(404, 'Không tìm thấy thông tin người dùng');
    }

    // Kiểm tra email mới nếu thay đổi
    if (email && email !== user.email) {
      const existingEmail = await User.findOne({ email: email });
      if (existingEmail) {
        throw new ApiError(400, 'Email đã tồn tại');
      }
      user.email = email;
    }

    // Cập nhật các trường
    if (fullName) user.fullName = fullName;

    // Nếu người dùng muốn xóa avatar
    if (removeAvatar === 'true') {
      // Xóa avatar cũ nếu có
      if (user.avatar && user.avatar.publicId) {
        await deleteImage(user.avatar.publicId);
      }
      // Đặt avatar về null
      user.avatar = null;
    }
    // Xử lý avatar nếu có thay đổi
    else if (avatarFile || avatarUrl) {
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

    // Lưu ý: Nếu chưa triển khai logActivity, hãy comment hoặc xóa dòng này để tránh lỗi
    try {
      await logActivity(req, 'update', 'profile', user);
    } catch (logError) {
      console.error('Lỗi ghi log hoạt động:', logError);
    }

    // Trả về thông tin đã cập nhật (đã loại bỏ password)
    const updatedUser = await User.findById(user._id)
      .select('-password')
      .populate('role', 'name permissions');

    return ApiResponse.success(res, 200, updatedUser, 'Cập nhật thông tin cá nhân thành công');
  } catch (error) {
    console.error('Lỗi cập nhật profile:', error);
    next(error);
  }
};

// Đổi mật khẩu
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ApiError(400, 'Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới');
    }

    // Lấy người dùng kèm mật khẩu
    const user = await User.findById(req.user._id).select('+password');

    // Kiểm tra mật khẩu hiện tại
    if (!(await user.matchPassword(currentPassword))) {
      throw new ApiError(401, 'Mật khẩu hiện tại không chính xác');
    }

    // Mật khẩu mới phải khác mật khẩu cũ
    if (await user.matchPassword(newPassword)) {
      throw new ApiError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại');
    }

    // Cập nhật mật khẩu
    user.password = newPassword;
    await user.save();

    // Ghi log đổi mật khẩu
    try {
      await logActivity(req, 'change', 'password', { userId: user._id });
    } catch (logError) {
      console.error('Lỗi ghi log hoạt động:', logError);
    }

    return ApiResponse.success(res, 200, null, 'Đổi mật khẩu thành công');
  } catch (error) {
    next(error);
  }
};