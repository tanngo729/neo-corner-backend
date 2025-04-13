"use strict";

// backend/scripts/manualUpdatePermissions.js
require('dotenv').config({
  path: './.env'
});

var mongoose = require('mongoose'); // Hàm cập nhật quyền


function updatePermissions() {
  var result1, result2, result3;
  return regeneratorRuntime.async(function updatePermissions$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          _context.prev = 0;
          console.log('=== BẮT ĐẦU CẬP NHẬT QUYỀN THỦ CÔNG ===');
          console.log('URI MongoDB:', process.env.MONGODB_URI); // Kết nối đến MongoDB

          _context.next = 5;
          return regeneratorRuntime.awrap(mongoose.connect(process.env.MONGODB_URI));

        case 5:
          console.log('Đã kết nối đến MongoDB'); // Truy vấn và cập nhật vai trò Super Admin

          _context.next = 8;
          return regeneratorRuntime.awrap(mongoose.connection.db.collection('roles').updateOne({
            name: 'Super Admin'
          }, {
            $addToSet: {
              permissions: {
                $each: ['customers.view', 'customers.create', 'customers.edit', 'customers.delete']
              }
            }
          }));

        case 8:
          result1 = _context.sent;
          console.log('Cập nhật Super Admin:', result1.matchedCount ? 'Thành công' : 'Không tìm thấy vai trò'); // Truy vấn và cập nhật vai trò Admin

          _context.next = 12;
          return regeneratorRuntime.awrap(mongoose.connection.db.collection('roles').updateOne({
            name: 'Admin'
          }, {
            $addToSet: {
              permissions: {
                $each: ['customers.view', 'customers.create', 'customers.edit', 'customers.delete']
              }
            }
          }));

        case 12:
          result2 = _context.sent;
          console.log('Cập nhật Admin:', result2.matchedCount ? 'Thành công' : 'Không tìm thấy vai trò'); // Truy vấn và cập nhật vai trò Staff

          _context.next = 16;
          return regeneratorRuntime.awrap(mongoose.connection.db.collection('roles').updateOne({
            name: 'Staff'
          }, {
            $addToSet: {
              permissions: {
                $each: ['customers.view', 'customers.edit']
              }
            }
          }));

        case 16:
          result3 = _context.sent;
          console.log('Cập nhật Staff:', result3.matchedCount ? 'Thành công' : 'Không tìm thấy vai trò');
          console.log('=== CẬP NHẬT QUYỀN THỦ CÔNG HOÀN TẤT ==='); // Đóng kết nối

          _context.next = 21;
          return regeneratorRuntime.awrap(mongoose.connection.close());

        case 21:
          console.log('Đã đóng kết nối MongoDB');
          _context.next = 28;
          break;

        case 24:
          _context.prev = 24;
          _context.t0 = _context["catch"](0);
          console.error('=== LỖI CẬP NHẬT QUYỀN THỦ CÔNG ===');
          console.error(_context.t0);

        case 28:
        case "end":
          return _context.stop();
      }
    }
  }, null, null, [[0, 24]]);
} // Chạy script


updatePermissions();