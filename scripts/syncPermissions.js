// backend/scripts/manualUpdatePermissions.js
require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');

// Hàm cập nhật quyền
async function updatePermissions() {
  try {
    console.log('=== BẮT ĐẦU CẬP NHẬT QUYỀN THỦ CÔNG ===');
    console.log('URI MongoDB:', process.env.MONGODB_URI);

    // Kết nối đến MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Đã kết nối đến MongoDB');

    // Truy vấn và cập nhật vai trò Super Admin
    const result1 = await mongoose.connection.db.collection('roles').updateOne(
      { name: 'Super Admin' },
      {
        $addToSet: {
          permissions: {
            $each: [
              'customers.view',
              'customers.create',
              'customers.edit',
              'customers.delete'
            ]
          }
        }
      }
    );
    console.log('Cập nhật Super Admin:', result1.matchedCount ? 'Thành công' : 'Không tìm thấy vai trò');

    // Truy vấn và cập nhật vai trò Admin
    const result2 = await mongoose.connection.db.collection('roles').updateOne(
      { name: 'Admin' },
      {
        $addToSet: {
          permissions: {
            $each: [
              'customers.view',
              'customers.create',
              'customers.edit',
              'customers.delete'
            ]
          }
        }
      }
    );
    console.log('Cập nhật Admin:', result2.matchedCount ? 'Thành công' : 'Không tìm thấy vai trò');

    // Truy vấn và cập nhật vai trò Staff
    const result3 = await mongoose.connection.db.collection('roles').updateOne(
      { name: 'Staff' },
      {
        $addToSet: {
          permissions: {
            $each: [
              'customers.view',
              'customers.edit'
            ]
          }
        }
      }
    );
    console.log('Cập nhật Staff:', result3.matchedCount ? 'Thành công' : 'Không tìm thấy vai trò');

    console.log('=== CẬP NHẬT QUYỀN THỦ CÔNG HOÀN TẤT ===');

    // Đóng kết nối
    await mongoose.connection.close();
    console.log('Đã đóng kết nối MongoDB');

  } catch (error) {
    console.error('=== LỖI CẬP NHẬT QUYỀN THỦ CÔNG ===');
    console.error(error);
  }
}

// Chạy script
updatePermissions();