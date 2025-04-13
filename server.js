// backend/server.js
const dotenv = require('dotenv');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');
const { errorConverter, errorHandler } = require('./utils/errorHandler');
const { adminRouter, clientRouter, callbackRouter } = require('./routes');
const authDebug = require('./middlewares/authDebugMiddleware');
const { initializeData } = require('./utils/seedData');
const paymentCallbackController = require('./controllers/client/paymentCallbackController');

// Tải biến môi trường
dotenv.config({ path: './.env' });

// Đặt biến API_URL nếu chưa được đặt trong .env
if (!process.env.API_URL) {
  process.env.API_URL = `http://localhost:${process.env.PORT || 5000}`;
}

console.log('Môi trường:', process.env.NODE_ENV);
console.log('API URL:', process.env.API_URL);
console.log('CLIENT URL:', process.env.CLIENT_URL);

// Kết nối MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('MongoDB đã kết nối thành công...');

    // Khởi tạo dữ liệu sau khi kết nối thành công (chỉ trong môi trường development)
    if (process.env.NODE_ENV === 'development') {
      await initializeData();
    }
  })
  .catch(err => console.log('Lỗi kết nối MongoDB:', err));

// Khởi tạo ứng dụng Express
const app = express();

// Cấu hình middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan('dev'));
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(mongoSanitize());

// Thêm middleware ghi log tất cả request
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  next();
});

// Thêm middleware log chi tiết cho /callback routes
app.use('/callback', (req, res, next) => {
  console.log('===== CALLBACK ROUTE =====');
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  console.log('Query Parameters:', req.query);
  console.log('Body:', req.body);
  console.log('Headers:', {
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent']
  });
  console.log('==========================');
  next();
});

// Debug middleware cho admin trong môi trường phát triển
if (process.env.NODE_ENV === 'development') {
  app.use('/admin', authDebug);
}

// Áp dụng các router - thứ tự rất quan trọng
app.use('/callback', callbackRouter);
app.use('/admin', adminRouter);
app.use('/', clientRouter);

// Route kiểm tra hoạt động
app.get('/ping', (req, res) => {
  res.json({
    message: 'API đang hoạt động',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    apiUrl: process.env.API_URL,
    clientUrl: process.env.CLIENT_URL
  });
});

// Phục vụ nội dung tĩnh nếu cần
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
  });
}

// Xử lý lỗi
app.use(errorConverter);
app.use(errorHandler);

// Xử lý route không tồn tại
app.use('*', (req, res) => {
  console.log(`Route không tồn tại: ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} không tồn tại`
  });
});

// Khởi động server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('======================================');
  console.log(`Server đang chạy trên cổng ${PORT}`);
  console.log(`Môi trường: ${process.env.NODE_ENV}`);
  console.log(`API URL: ${process.env.API_URL}`);
  console.log(`CLIENT URL: ${process.env.CLIENT_URL}`);
  console.log('======================================');
});

// Xử lý sự kiện không xử lý được
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! Đang tắt...');
  console.log(err.name, err.message);
  console.log(err.stack);

  // Thoát quá trình một cách an toàn
  process.exit(1);
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  console.log('SIGTERM RECEIVED. Đang tắt ứng dụng...');
  process.exit(0);
});