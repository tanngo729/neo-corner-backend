/**
 * Danh sách các quyền trong hệ thống
 * Format: 'module.action': 'Mô tả quyền'
 */
const permissions = {
  // Dashboard
  'dashboard.view': 'Xem tổng quan',

  // Sản phẩm
  'products.view': 'Xem sản phẩm',
  'products.create': 'Thêm sản phẩm',
  'products.edit': 'Sửa sản phẩm',
  'products.delete': 'Xóa sản phẩm',

  // Danh mục
  'categories.view': 'Xem danh mục',
  'categories.create': 'Thêm danh mục',
  'categories.edit': 'Sửa danh mục',
  'categories.delete': 'Xóa danh mục',

  // Đơn hàng
  'orders.view': 'Xem đơn hàng',
  'orders.process': 'Xử lý đơn hàng',
  'orders.edit': 'Sửa đơn hàng',
  'orders.delete': 'Xóa đơn hàng',

  // Người dùng hệ thống (admin)
  'users.view': 'Xem người dùng',
  'users.create': 'Thêm người dùng',
  'users.edit': 'Sửa người dùng',
  'users.delete': 'Xóa người dùng',

  // Khách hàng
  'customers.view': 'Xem khách hàng',
  'customers.create': 'Thêm khách hàng',
  'customers.edit': 'Sửa khách hàng',
  'customers.delete': 'Xóa khách hàng',

  // Phân quyền
  'roles.view': 'Xem vai trò và quyền',
  'roles.create': 'Thêm vai trò',
  'roles.edit': 'Sửa vai trò',
  'roles.delete': 'Xóa vai trò',

  // Cài đặt
  'settings.view': 'Xem cài đặt',
  'settings.edit': 'Sửa cài đặt',
};

module.exports = permissions;