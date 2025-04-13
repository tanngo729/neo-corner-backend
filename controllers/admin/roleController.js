// backend/controllers/admin/roleController.js
const Role = require('../../models/Role');
const User = require('../../models/User');
const permissions = require('../../config/permissions');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');

// Lấy danh sách tất cả vai trò
exports.getRoles = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    }

    const roles = await Role.find(query).sort({ createdAt: -1 });

    return ApiResponse.success(res, 200, roles, 'Lấy danh sách vai trò thành công');
  } catch (error) {
    next(error);
  }
};

// Lấy chi tiết vai trò
exports.getRoleById = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      throw new ApiError(404, 'Không tìm thấy vai trò');
    }

    // Đếm số người dùng có vai trò này
    const userCount = await User.countDocuments({ role: role._id });

    return ApiResponse.success(res, 200, {
      ...role.toObject(),
      userCount
    }, 'Lấy chi tiết vai trò thành công');
  } catch (error) {
    next(error);
  }
};

// Tạo vai trò mới
exports.createRole = async (req, res, next) => {
  try {
    const { name, description, permissions: rolePermissions, isDefault, status } = req.body;

    // Kiểm tra các trường bắt buộc
    if (!name) {
      throw new ApiError(400, 'Tên vai trò là bắt buộc');
    }

    // Kiểm tra vai trò đã tồn tại chưa
    const existingRole = await Role.findOne({ name });
    if (existingRole) {
      throw new ApiError(400, 'Vai trò này đã tồn tại');
    }

    // Kiểm tra quyền hợp lệ
    if (rolePermissions && rolePermissions.length > 0) {
      const validPermissions = Object.keys(permissions);
      const invalidPermissions = rolePermissions.filter(p => !validPermissions.includes(p));

      if (invalidPermissions.length > 0) {
        throw new ApiError(400, `Quyền không hợp lệ: ${invalidPermissions.join(', ')}`);
      }
    }

    // Nếu đánh dấu là mặc định, cập nhật vai trò mặc định cũ
    if (isDefault) {
      await Role.updateMany({ isDefault: true }, { isDefault: false });
    }

    // Tạo vai trò mới
    const role = new Role({
      name,
      description,
      permissions: rolePermissions || [],
      isDefault: isDefault || false,
      status: status || 'active'
    });

    await role.save();

    return ApiResponse.success(res, 201, role, 'Tạo vai trò thành công');
  } catch (error) {
    next(error);
  }
};

// Cập nhật vai trò
exports.updateRole = async (req, res, next) => {
  try {
    const { name, description, permissions: rolePermissions, isDefault, status } = req.body;

    const role = await Role.findById(req.params.id);

    if (!role) {
      throw new ApiError(404, 'Không tìm thấy vai trò');
    }

    // Kiểm tra tên vai trò đã tồn tại chưa (nếu thay đổi)
    if (name && name !== role.name) {
      const existingRole = await Role.findOne({ name });
      if (existingRole) {
        throw new ApiError(400, 'Vai trò này đã tồn tại');
      }
      role.name = name;
    }

    // Kiểm tra quyền hợp lệ
    if (rolePermissions && rolePermissions.length > 0) {
      const validPermissions = Object.keys(permissions);
      const invalidPermissions = rolePermissions.filter(p => !validPermissions.includes(p));

      if (invalidPermissions.length > 0) {
        throw new ApiError(400, `Quyền không hợp lệ: ${invalidPermissions.join(', ')}`);
      }
      role.permissions = rolePermissions;
    }

    // Nếu đánh dấu là mặc định, cập nhật vai trò mặc định cũ
    if (isDefault && !role.isDefault) {
      await Role.updateMany({ isDefault: true }, { isDefault: false });
      role.isDefault = true;
    } else if (isDefault !== undefined) {
      role.isDefault = isDefault;
    }

    // Cập nhật các trường khác
    if (description !== undefined) role.description = description;
    if (status) role.status = status;

    await role.save();

    return ApiResponse.success(res, 200, role, 'Cập nhật vai trò thành công');
  } catch (error) {
    next(error);
  }
};

// Xóa vai trò
exports.deleteRole = async (req, res, next) => {
  try {
    const role = await Role.findById(req.params.id);

    if (!role) {
      throw new ApiError(404, 'Không tìm thấy vai trò');
    }

    // Kiểm tra xem vai trò có đang được sử dụng không
    const userCount = await User.countDocuments({ role: role._id });
    if (userCount > 0) {
      throw new ApiError(400, `Không thể xóa vai trò đang được sử dụng bởi ${userCount} người dùng`);
    }

    await role.deleteOne();

    return ApiResponse.success(res, 200, null, 'Xóa vai trò thành công');
  } catch (error) {
    next(error);
  }
};

// Lấy danh sách tất cả quyền có trong hệ thống
exports.getAllPermissions = async (req, res, next) => {
  try {
    // Chuyển đổi từ object sang array để dễ dàng hiển thị
    const permissionList = Object.entries(permissions).map(([key, value]) => ({
      id: key,
      name: value
    }));

    // Nhóm quyền theo module
    const groupedPermissions = permissionList.reduce((groups, perm) => {
      const [module] = perm.id.split('.');
      if (!groups[module]) {
        groups[module] = [];
      }
      groups[module].push(perm);
      return groups;
    }, {});

    return ApiResponse.success(res, 200, {
      permissions: permissionList,
      groupedPermissions
    }, 'Lấy danh sách quyền thành công');
  } catch (error) {
    next(error);
  }
};