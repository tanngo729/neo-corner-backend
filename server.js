// server.js
const dotenv = require('dotenv');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
const { errorConverter, errorHandler } = require('./utils/errorHandler');
const { adminRouter, clientRouter } = require('./routes');
const authDebug = require('./middlewares/authDebugMiddleware');
const { initializeData } = require('./utils/seedData');

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
    if (process.env.NODE_ENV === 'development') {
      await initializeData();
    }
  })
  .catch(err => console.log('Lỗi kết nối MongoDB:', err));

// Khởi tạo ứng dụng Express
const app = express();

// Tạo HTTP server từ Express app
const server = http.createServer(app);

// Khởi tạo Socket.IO với cấu hình CORS và debug log
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["my-custom-header"],
    transports: ['websocket', 'polling']
  },
  allowEIO3: true
});

// Thêm debug log cho socket
io.on('connection', (socket) => {
  console.log(`[SOCKET DEBUG] Client kết nối mới: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    console.log(`[SOCKET DEBUG] Client ngắt kết nối: ${socket.id}, lý do: ${reason}`);
  });
});

// Khởi tạo socketManager và giao tiếp thông qua các sự kiện socket
require('./utils/socketManager').initialize(io);

// Cấu hình middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan('dev'));
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(mongoSanitize());

// Middleware log request
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  next();
});

// Middleware log chi tiết cho /callback routes
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

// Debug middleware cho admin (chỉ dùng cho development)
if (process.env.NODE_ENV === 'development') {
  app.use('/admin', authDebug);
}

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

// Phục vụ nội dung tĩnh khi chạy production
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
server.listen(PORT, () => {
  console.log('======================================');
  console.log(`Server đang chạy trên cổng ${PORT}`);
  console.log(`Môi trường: ${process.env.NODE_ENV}`);
  console.log(`API URL: ${process.env.API_URL}`);
  console.log(`CLIENT URL: ${process.env.CLIENT_URL}`);
  console.log('======================================');
});

// Xử lý các ngoại lệ không được bắt
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! Đang tắt...');
  console.log(err.name, err.message);
  console.log(err.stack);
  process.exit(1);
});

// Handle SIGTERM
process.on('SIGTERM', () => {
  console.log('SIGTERM RECEIVED. Đang tắt ứng dụng...');
  process.exit(0);
});
