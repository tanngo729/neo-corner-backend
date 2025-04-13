// utils/seedData.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const PaymentMethod = require('../models/PaymentMethod');
const ShippingMethod = require('../models/ShippingMethod');
const Role = require('../models/Role');
const User = require('../models/User');
const Category = require('../models/Category');

// Dữ liệu mẫu cho phương thức thanh toán
const paymentMethodsData = [
  {
    code: 'COD',
    name: 'Thanh toán khi nhận hàng',
    description: 'Thanh toán bằng tiền mặt khi nhận hàng',
    icon: '/payment-icons/cod.png',
    isActive: true,
    position: 1,
    config: {
      codExtraFee: 0 // Không tính phí thu hộ
    }
  },
  {
    code: 'BANK_TRANSFER',
    name: 'Chuyển khoản ngân hàng',
    description: 'Thanh toán qua chuyển khoản ngân hàng',
    icon: '/payment-icons/bank.png',
    isActive: true,
    position: 2,
    config: {
      bankAccounts: [
        {
          bankName: 'Vietcombank',
          accountNumber: '1234567890',
          accountName: 'NEO CORNER',
          branch: 'Kontum',
          isDefault: true
        }
      ]
    }
  },
  {
    code: 'MOMO',
    name: 'Ví điện tử MoMo',
    description: 'Thanh toán qua ví điện tử MoMo',
    icon: '/payment-icons/momo.png',
    isActive: true,
    position: 3,
    config: {
      momoPartnerCode: 'MOMOBKUN20180529',
      momoAccessKey: 'klm05TvNBzhg7h7j',
      momoSecretKey: 'at67qH6mk8w5Y1nAyMoYKMWACiEi2bsa',
      momoEndpoint: 'https://test-payment.momo.vn/v2/gateway/api/create',
      momoTestMode: true
    }
  },
  {
    code: 'VNPAY',
    name: 'Thanh toán VNPAY',
    description: 'Thanh toán qua cổng VNPAY',
    icon: '/payment-icons/vnpay.png',
    isActive: true,
    position: 4,
    config: {
      vnpTmnCode: 'CQSRDGBD',
      vnpHashSecret: '5HAYN4OAK3A02GYULICV3GOSROG8Z41B',
      vnpUrl: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
      vnpReturnUrl: process.env.API_URL + '/payment/vnpay-callback',
      vnpTestMode: true
    }
  }
];

// Dữ liệu mẫu cho phương thức vận chuyển
const shippingMethodsData = [
  {
    code: 'FAST_DELIVERY',
    name: 'Giao hàng nhanh Kontum',
    description: 'Giao hàng trong 15-35 phút quanh khu vực thành phố Kontum',
    isActive: true,
    position: 1,
    baseFee: 15000,
    freeShippingThreshold: 200000, // Miễn phí ship khi đơn hàng trên 200k
    estimatedDeliveryDays: 0, // Giao trong ngày
    regionFees: [
      {
        regionCode: 'KT',
        regionName: 'Thành phố Kontum',
        fee: 15000
      }
    ]
  },
  {
    code: 'STANDARD_DELIVERY',
    name: 'Giao hàng tiêu chuẩn',
    description: 'Giao hàng tiêu chuẩn trong khu vực thành phố Kontum',
    isActive: true,
    position: 2,
    baseFee: 10000,
    freeShippingThreshold: 150000, // Miễn phí ship khi đơn hàng trên 150k
    estimatedDeliveryDays: 0, // Giao trong ngày
    regionFees: [
      {
        regionCode: 'KT',
        regionName: 'Thành phố Kontum',
        fee: 10000
      }
    ]
  }
];

// Hàm khởi tạo dữ liệu
const initializeData = async () => {
  try {
    console.log('=== BẮT ĐẦU KHỞI TẠO DỮ LIỆU ===');

    // Đếm số lượng tài khoản admin/staff hiện có để biết đã có hay chưa
    const adminCount = await User.countDocuments({ type: 'admin' });
    const staffCount = await User.countDocuments({ type: 'staff' });

    console.log(`Hiện có ${adminCount} tài khoản admin và ${staffCount} tài khoản staff trong hệ thống.`);

    // Định nghĩa vai trò
    // 1. Vai trò Super Admin - có toàn quyền
    let permissions;
    try {
      permissions = require('../config/permissions');
    } catch (error) {
      console.warn('Không thể tải file permissions, sử dụng danh sách mặc định');
      permissions = {
        'dashboard.view': 'Xem trang tổng quan',
        'users.view': 'Xem danh sách người dùng',
        'users.create': 'Tạo người dùng mới',
        'users.edit': 'Chỉnh sửa người dùng',
        'users.delete': 'Xóa người dùng',
        'roles.view': 'Xem danh sách vai trò',
        'roles.create': 'Tạo vai trò mới',
        'roles.edit': 'Chỉnh sửa vai trò',
        'roles.delete': 'Xóa vai trò',
        'products.view': 'Xem danh sách sản phẩm',
        'products.create': 'Tạo sản phẩm mới',
        'products.edit': 'Chỉnh sửa sản phẩm',
        'products.delete': 'Xóa sản phẩm',
        'categories.view': 'Xem danh sách danh mục',
        'categories.create': 'Tạo danh mục mới',
        'categories.edit': 'Chỉnh sửa danh mục',
        'categories.delete': 'Xóa danh mục',
        'orders.view': 'Xem danh sách đơn hàng',
        'orders.process': 'Xử lý đơn hàng',
        'orders.edit': 'Chỉnh sửa đơn hàng',
        'orders.delete': 'Xóa đơn hàng',
        'customers.view': 'Xem danh sách khách hàng',
        'customers.create': 'Tạo khách hàng mới',
        'customers.edit': 'Chỉnh sửa khách hàng',
        'customers.delete': 'Xóa khách hàng',
        'settings.view': 'Xem cài đặt hệ thống',
        'settings.edit': 'Chỉnh sửa cài đặt hệ thống'
      };
    }

    const adminRoleExists = await Role.findOne({ name: 'Super Admin' });
    let adminRole;

    if (!adminRoleExists) {
      console.log('Tạo vai trò Super Admin...');
      adminRole = new Role({
        name: 'Super Admin',
        description: 'Quản trị viên cao cấp với toàn quyền truy cập',
        permissions: Object.keys(permissions),
        isDefault: false,
        status: 'active'
      });
      await adminRole.save();
      console.log('Đã tạo vai trò Super Admin:', adminRole._id);
    } else {
      adminRole = adminRoleExists;
      adminRole.permissions = Object.keys(permissions);
      await adminRole.save();
      console.log('Đã cập nhật quyền cho vai trò Super Admin:', adminRole._id);
    }

    // 2. Vai trò Admin - có nhiều quyền nhưng không thể quản lý vai trò và người dùng cấp cao
    const subAdminRoleExists = await Role.findOne({ name: 'Admin' });
    let subAdminRole;

    if (!subAdminRoleExists) {
      console.log('Tạo vai trò Admin...');
      const adminPermissions = Object.keys(permissions).filter(perm =>
        !perm.startsWith('roles.') && perm !== 'users.delete'
      );

      subAdminRole = new Role({
        name: 'Admin',
        description: 'Quản trị viên với quyền quản lý hệ thống, trừ phân quyền',
        permissions: adminPermissions,
        isDefault: false,
        status: 'active'
      });
      await subAdminRole.save();
      console.log('Đã tạo vai trò Admin:', subAdminRole._id);
    } else {
      subAdminRole = subAdminRoleExists;
      const adminPermissions = Object.keys(permissions).filter(perm =>
        !perm.startsWith('roles.') && perm !== 'users.delete'
      );
      subAdminRole.permissions = adminPermissions;
      await subAdminRole.save();
      console.log('Đã cập nhật quyền cho vai trò Admin:', subAdminRole._id);
    }

    // 3. Vai trò Staff/Nhân viên - có quyền thao tác hạn chế
    const staffRoleExists = await Role.findOne({ name: 'Staff' });
    let staffRole;

    if (!staffRoleExists) {
      console.log('Tạo vai trò Staff...');
      staffRole = new Role({
        name: 'Staff',
        description: 'Nhân viên với quyền thao tác hạn chế',
        permissions: [
          'dashboard.view',
          'products.view', 'products.create', 'products.edit',
          'categories.view', 'categories.create', 'categories.edit',
          'orders.view', 'orders.process', 'orders.edit',
          'customers.view', 'customers.edit'
        ],
        isDefault: true,
        status: 'active'
      });
      await staffRole.save();
      console.log('Đã tạo vai trò Staff:', staffRole._id);
    } else {
      staffRole = staffRoleExists;
      if (!staffRole.permissions.includes('customers.view')) {
        staffRole.permissions.push('customers.view');
      }
      if (!staffRole.permissions.includes('customers.edit')) {
        staffRole.permissions.push('customers.edit');
      }
      await staffRole.save();
      console.log('Đã cập nhật quyền cho vai trò Staff:', staffRole._id);
    }

    // CHỈ TẠO TÀI KHOẢN KHI CHƯA CÓ TÀI KHOẢN ADMIN NÀO TRONG HỆ THỐNG
    if (adminCount === 0) {
      console.log('Chưa có tài khoản admin trong hệ thống, tiến hành tạo tài khoản mặc định...');

      const adminUserExists = await User.findOne({
        $or: [
          { username: 'superadmin' },
          { username: 'admin' },
          { email: 'tanngo729@gmail.com' }
        ]
      });

      if (!adminUserExists) {
        console.log('Tạo tài khoản Super Admin mặc định...');
        // Chỉ truyền mật khẩu dạng plain text để middleware pre-save tự mã hóa
        const admin = new User({
          username: 'admin',
          email: 'tanngo729@gmail.com',
          password: 'admin123',
          fullName: 'Super Administrator',
          role: adminRole._id,
          status: 'active',
          type: 'admin'
        });

        try {
          await admin.save();
          console.log('Đã tạo tài khoản Super Admin:', admin._id);
        } catch (userError) {
          console.error('Chi tiết lỗi khi tạo tài khoản Super Admin:', userError);
        }
      } else {
        console.log('Đã có tài khoản Super Admin:', adminUserExists._id);
      }
    } else {
      console.log('Đã có tài khoản admin trong hệ thống, bỏ qua bước tạo tài khoản admin mặc định.');
    }

    // CHỈ TẠO TÀI KHOẢN STAFF KHI KHÔNG CÓ TÀI KHOẢN STAFF NÀO
    if (staffCount === 0) {
      console.log('Chưa có tài khoản staff trong hệ thống, tiến hành tạo tài khoản mặc định...');

      const staffExists = await User.findOne({
        $or: [
          { username: 'staff' },
          { email: 'staff@example.com' }
        ]
      });

      if (!staffExists) {
        console.log('Tạo tài khoản Staff/Nhân viên...');
        const staff = new User({
          username: 'staff',
          email: 'staff@example.com',
          password: 'staff123',
          fullName: 'Staff User',
          role: staffRole._id,
          status: 'active',
          type: 'staff'
        });

        try {
          await staff.save();
          console.log('Đã tạo tài khoản Staff/Nhân viên:', staff._id);
        } catch (userError) {
          console.error('Chi tiết lỗi khi tạo tài khoản Staff/Nhân viên:', userError);
        }
      } else {
        console.log('Đã có tài khoản Staff:', staffExists._id);
      }
    } else {
      console.log('Đã có tài khoản staff trong hệ thống, bỏ qua bước tạo tài khoản staff mặc định.');
    }

    // KHỞI TẠO PHƯƠNG THỨC THANH TOÁN
    const paymentMethodCount = await PaymentMethod.countDocuments();
    if (paymentMethodCount === 0) {
      console.log('Chưa có phương thức thanh toán, tiến hành khởi tạo...');
      await PaymentMethod.insertMany(paymentMethodsData);
      console.log(`Đã thêm ${paymentMethodsData.length} phương thức thanh toán`);
    } else {
      console.log(`Đã tồn tại ${paymentMethodCount} phương thức thanh toán.`);
    }

    // KHỞI TẠO PHƯƠNG THỨC VẬN CHUYỂN
    const shippingMethodCount = await ShippingMethod.countDocuments();
    if (shippingMethodCount === 0) {
      console.log('Chưa có phương thức vận chuyển, tiến hành khởi tạo...');
      await ShippingMethod.insertMany(shippingMethodsData);
      console.log(`Đã thêm ${shippingMethodsData.length} phương thức vận chuyển`);
    } else {
      console.log(`Đã tồn tại ${shippingMethodCount} phương thức vận chuyển.`);
    }

    console.log('=== KHỞI TẠO DỮ LIỆU HOÀN TẤT ===');
    return true;
  } catch (error) {
    console.error('=== LỖI KHỞI TẠO DỮ LIỆU ===');
    console.error(error);
    return false;
  }
};

module.exports = { initializeData };