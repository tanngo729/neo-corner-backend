"use strict";

// backend/utils/seedData.js
var mongoose = require('mongoose');

var bcrypt = require('bcryptjs');
/**
 * Khởi tạo dữ liệu ban đầu: vai trò và tài khoản admin
 */


var initializeData = function initializeData() {
  var Role, User, permissions, adminCount, staffCount, adminRoleExists, adminRole, subAdminRoleExists, subAdminRole, adminPermissions, _adminPermissions, staffRoleExists, staffRole, adminUserExists, salt, hashedPassword, admin, staffExists, _salt, _hashedPassword, staff;

  return regeneratorRuntime.async(function initializeData$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.prev = 0;
          console.log('=== BẮT ĐẦU KHỞI TẠO DỮ LIỆU ==='); // Đảm bảo models đã được nạp

          Role = mongoose.model('Role') || require('../models/Role');
          User = mongoose.model('User') || require('../models/User');
          permissions = require('../config/permissions'); // Đếm số lượng tài khoản admin/staff hiện có để biết đã có hay chưa

          _context.next = 7;
          return regeneratorRuntime.awrap(User.countDocuments({
            type: 'admin'
          }));

        case 7:
          adminCount = _context.sent;
          _context.next = 10;
          return regeneratorRuntime.awrap(User.countDocuments({
            type: 'staff'
          }));

        case 10:
          staffCount = _context.sent;
          console.log("Hi\u1EC7n c\xF3 ".concat(adminCount, " t\xE0i kho\u1EA3n admin v\xE0 ").concat(staffCount, " t\xE0i kho\u1EA3n staff trong h\u1EC7 th\u1ED1ng.")); // Định nghĩa vai trò
          // 1. Vai trò Super Admin - có toàn quyền

          _context.next = 14;
          return regeneratorRuntime.awrap(Role.findOne({
            name: 'Super Admin'
          }));

        case 14:
          adminRoleExists = _context.sent;

          if (adminRoleExists) {
            _context.next = 23;
            break;
          }

          console.log('Tạo vai trò Super Admin...'); // Tạo vai trò Admin với tất cả quyền

          adminRole = new Role({
            name: 'Super Admin',
            description: 'Quản trị viên cao cấp với toàn quyền truy cập',
            permissions: Object.keys(permissions),
            isDefault: false,
            status: 'active'
          });
          _context.next = 20;
          return regeneratorRuntime.awrap(adminRole.save());

        case 20:
          console.log('Đã tạo vai trò Super Admin:', adminRole._id);
          _context.next = 28;
          break;

        case 23:
          // Cập nhật quyền của vai trò Super Admin
          adminRole = adminRoleExists;
          adminRole.permissions = Object.keys(permissions);
          _context.next = 27;
          return regeneratorRuntime.awrap(adminRole.save());

        case 27:
          console.log('Đã cập nhật quyền cho vai trò Super Admin:', adminRole._id);

        case 28:
          _context.next = 30;
          return regeneratorRuntime.awrap(Role.findOne({
            name: 'Admin'
          }));

        case 30:
          subAdminRoleExists = _context.sent;

          if (subAdminRoleExists) {
            _context.next = 40;
            break;
          }

          console.log('Tạo vai trò Admin...'); // Lọc bớt một số quyền nhạy cảm

          adminPermissions = Object.keys(permissions).filter(function (perm) {
            return !perm.startsWith('roles.') && // Không có quyền quản lý vai trò
            !(perm === 'users.delete');
          } // Không thể xóa người dùng
          );
          subAdminRole = new Role({
            name: 'Admin',
            description: 'Quản trị viên với quyền quản lý hệ thống, trừ phân quyền',
            permissions: adminPermissions,
            isDefault: false,
            status: 'active'
          });
          _context.next = 37;
          return regeneratorRuntime.awrap(subAdminRole.save());

        case 37:
          console.log('Đã tạo vai trò Admin:', subAdminRole._id);
          _context.next = 46;
          break;

        case 40:
          // Cập nhật quyền của vai trò Admin
          subAdminRole = subAdminRoleExists; // Lọc bớt một số quyền nhạy cảm

          _adminPermissions = Object.keys(permissions).filter(function (perm) {
            return !perm.startsWith('roles.') && // Không có quyền quản lý vai trò
            !(perm === 'users.delete');
          } // Không thể xóa người dùng
          );
          subAdminRole.permissions = _adminPermissions;
          _context.next = 45;
          return regeneratorRuntime.awrap(subAdminRole.save());

        case 45:
          console.log('Đã cập nhật quyền cho vai trò Admin:', subAdminRole._id);

        case 46:
          _context.next = 48;
          return regeneratorRuntime.awrap(Role.findOne({
            name: 'Staff'
          }));

        case 48:
          staffRoleExists = _context.sent;

          if (staffRoleExists) {
            _context.next = 57;
            break;
          }

          console.log('Tạo vai trò Staff...');
          staffRole = new Role({
            name: 'Staff',
            description: 'Nhân viên với quyền thao tác hạn chế',
            permissions: ['dashboard.view', 'products.view', 'products.create', 'products.edit', 'categories.view', 'categories.create', 'categories.edit', 'orders.view', 'orders.process', 'orders.edit', 'customers.view', 'customers.edit' // Thêm quyền xem và sửa khách hàng cho Staff
            ],
            isDefault: true,
            status: 'active'
          });
          _context.next = 54;
          return regeneratorRuntime.awrap(staffRole.save());

        case 54:
          console.log('Đã tạo vai trò Staff:', staffRole._id);
          _context.next = 63;
          break;

        case 57:
          // Cập nhật quyền của vai trò Staff
          staffRole = staffRoleExists; // Cập nhật danh sách quyền, thêm quyền mới

          if (!staffRole.permissions.includes('customers.view')) {
            staffRole.permissions.push('customers.view');
          }

          if (!staffRole.permissions.includes('customers.edit')) {
            staffRole.permissions.push('customers.edit');
          }

          _context.next = 62;
          return regeneratorRuntime.awrap(staffRole.save());

        case 62:
          console.log('Đã cập nhật quyền cho vai trò Staff:', staffRole._id);

        case 63:
          if (!(adminCount === 0)) {
            _context.next = 91;
            break;
          }

          console.log('Chưa có tài khoản admin trong hệ thống, tiến hành tạo tài khoản mặc định...'); // Kiểm tra xem có tài khoản admin hoặc superadmin hay chưa

          _context.next = 67;
          return regeneratorRuntime.awrap(User.findOne({
            $or: [{
              username: 'superadmin'
            }, {
              username: 'admin'
            }, {
              email: 'tanngo729@gmail.com'
            }]
          }));

        case 67:
          adminUserExists = _context.sent;

          if (adminUserExists) {
            _context.next = 88;
            break;
          }

          console.log('Tạo tài khoản Super Admin mặc định...');
          _context.next = 72;
          return regeneratorRuntime.awrap(bcrypt.genSalt(10));

        case 72:
          salt = _context.sent;
          _context.next = 75;
          return regeneratorRuntime.awrap(bcrypt.hash('admin123', salt));

        case 75:
          hashedPassword = _context.sent;
          admin = new User({
            username: 'admin',
            email: 'tanngo729@gmail.com',
            password: hashedPassword,
            fullName: 'Super Administrator',
            role: adminRole._id,
            status: 'active',
            type: 'admin'
          });
          _context.prev = 77;
          _context.next = 80;
          return regeneratorRuntime.awrap(admin.save());

        case 80:
          console.log('Đã tạo tài khoản Super Admin:', admin._id);
          _context.next = 86;
          break;

        case 83:
          _context.prev = 83;
          _context.t0 = _context["catch"](77);
          console.error('Chi tiết lỗi khi tạo tài khoản Super Admin:', _context.t0);

        case 86:
          _context.next = 89;
          break;

        case 88:
          console.log('Đã có tài khoản Super Admin:', adminUserExists._id);

        case 89:
          _context.next = 92;
          break;

        case 91:
          console.log('Đã có tài khoản admin trong hệ thống, bỏ qua bước tạo tài khoản admin mặc định.');

        case 92:
          if (!(staffCount === 0)) {
            _context.next = 120;
            break;
          }

          console.log('Chưa có tài khoản staff trong hệ thống, tiến hành tạo tài khoản mặc định...'); // Kiểm tra xem có tài khoản staff hay chưa

          _context.next = 96;
          return regeneratorRuntime.awrap(User.findOne({
            $or: [{
              username: 'staff'
            }, {
              email: 'staff@example.com'
            }]
          }));

        case 96:
          staffExists = _context.sent;

          if (staffExists) {
            _context.next = 117;
            break;
          }

          console.log('Tạo tài khoản Staff/Nhân viên...'); // Mã hóa mật khẩu thủ công

          _context.next = 101;
          return regeneratorRuntime.awrap(bcrypt.genSalt(10));

        case 101:
          _salt = _context.sent;
          _context.next = 104;
          return regeneratorRuntime.awrap(bcrypt.hash('staff123', _salt));

        case 104:
          _hashedPassword = _context.sent;
          staff = new User({
            username: 'staff',
            email: 'staff@example.com',
            password: _hashedPassword,
            fullName: 'Staff User',
            role: staffRole._id,
            status: 'active',
            type: 'staff'
          });
          _context.prev = 106;
          _context.next = 109;
          return regeneratorRuntime.awrap(staff.save());

        case 109:
          console.log('Đã tạo tài khoản Staff/Nhân viên:', staff._id);
          _context.next = 115;
          break;

        case 112:
          _context.prev = 112;
          _context.t1 = _context["catch"](106);
          console.error('Chi tiết lỗi khi tạo tài khoản Staff/Nhân viên:', _context.t1);

        case 115:
          _context.next = 118;
          break;

        case 117:
          console.log('Đã có tài khoản Staff:', staffExists._id);

        case 118:
          _context.next = 121;
          break;

        case 120:
          console.log('Đã có tài khoản staff trong hệ thống, bỏ qua bước tạo tài khoản staff mặc định.');

        case 121:
          console.log('=== KHỞI TẠO DỮ LIỆU HOÀN TẤT ===');
          return _context.abrupt("return", true);

        case 125:
          _context.prev = 125;
          _context.t2 = _context["catch"](0);
          console.error('=== LỖI KHỞI TẠO DỮ LIỆU ===');
          console.error(_context.t2);
          return _context.abrupt("return", false);

        case 130:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[0, 125], [77, 83], [106, 112]]);
};

module.exports = {
  initializeData: initializeData
};