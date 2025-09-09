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

// Load environment variables early: prefer repo root .env, fall back to backend/.env
const rootEnvPath = path.resolve(__dirname, '../.env');
const localEnvPath = path.resolve(__dirname, './.env');
if (require('fs').existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else if (require('fs').existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
} else {
  dotenv.config();
}

// Fallback API_URL when not provided
if (!process.env.API_URL) {
  process.env.API_URL = `http://localhost:${process.env.PORT || 5000}`;
}

// Import modules that can rely on env after it's loaded
const { errorConverter, errorHandler } = require('./utils/errorHandler');
const { adminRouter, clientRouter } = require('./routes');
const authDebug = require('./middlewares/authDebugMiddleware');
const { initializeData } = require('./utils/seedData');

// Basic startup logs (avoid encoding issues in terminals)
console.log('Environment:', process.env.NODE_ENV);
console.log('API URL:', process.env.API_URL);
console.log('CLIENT URL:', process.env.CLIENT_URL);

// Connect MongoDB if configured
if (!process.env.MONGODB_URI || process.env.MONGODB_URI.trim() === '') {
  console.error('MONGODB_URI is not set. Skipping DB connection.');
} else {
  mongoose
    .connect(process.env.MONGODB_URI)
    .then(async () => {
      console.log('MongoDB connected successfully');
      if (process.env.NODE_ENV === 'development') {
        await initializeData();
      }
    })
    .catch((err) => console.log('MongoDB connection error:', err));
}

// Init Express app
const app = express();

// Create HTTP server from Express app
const server = http.createServer(app);

// Build allowed origins list from CLIENT_URL (comma-separated supported)
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

console.log('Allowed CORS origins:', allowedOrigins);

// Configure Socket.IO with safer CORS
const io = socketIO(server, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: allowedOrigins.length > 0, // credentials only when not wildcard
    allowedHeaders: ['content-type', 'authorization'],
    transports: ['websocket', 'polling'],
  },
  allowEIO3: true,
});

// Socket debug logs
io.on('connection', (socket) => {
  console.log(`[SOCKET DEBUG] Client connected: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    console.log(`[SOCKET DEBUG] Client disconnected: ${socket.id}, reason: ${reason}`);
  });
});

// Initialize socket manager and events
require('./utils/socketManager').initialize(io);

// Middleware configuration
// Trust proxy (so req.ip and secure cookies work behind proxies)
app.set('trust proxy', 1);

// Configure CORS for Express
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow if origin is in allowedOrigins list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // In development, allow localhost with any port
    if (process.env.NODE_ENV === 'development' && origin.includes('localhost')) {
      return callback(null, true);
    }
    
    console.warn('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  // Include cache-related headers to avoid preflight failures from no-cache requests
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Cache-Control',
    'Pragma',
    'Expires'
  ],
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan('dev'));
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(mongoSanitize());

// Request log middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  next();
});

// Detailed log for /callback routes
app.use('/callback', (req, res, next) => {
  console.log('===== CALLBACK ROUTE =====');
  console.log('Method:', req.method);
  console.log('Path:', req.path);
  console.log('Query Parameters:', req.query);
  console.log('Body:', req.body);
  console.log('Headers:', {
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent'],
  });
  console.log('==========================');
  next();
});

// Admin debug middleware (development only)
if (process.env.NODE_ENV === 'development') {
  app.use('/admin', authDebug);
}

// Mount routes
app.use('/admin', adminRouter);
app.use('/', clientRouter);

// Health check
app.get('/ping', (req, res) => {
  res.json({
    message: 'API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    apiUrl: process.env.API_URL,
    clientUrl: process.env.CLIENT_URL,
    corsOrigins: allowedOrigins,
  });
});

// Test endpoint to check connectivity
app.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Backend connection successful',
    origin: req.headers.origin,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
  });
});

// Lightweight health endpoint
app.get('/health', (req, res) => {
  const dbState = mongoose.connection?.readyState;
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({ status: 'ok', time: new Date().toISOString(), db: states[dbState] || dbState });
});

// Serve static in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
  });
}

// Error handling
app.use(errorConverter);
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  console.log(`Route not found: ${req.originalUrl}`);
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Start server with port auto-increment if in use
const BASE_PORT = Number(process.env.PORT) || 5000;
const MAX_PORT_INCREMENT = Number(process.env.PORT_MAX_TRIES) || 20;

function startListening(port, attemptsLeft) {
  // Remove any existing error listeners to prevent accumulation
  server.removeAllListeners('error');
  
  // Set up error handler for this specific attempt
  const errorHandler = (err) => {
    if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} in use. Retrying on ${nextPort}... (${attemptsLeft - 1} attempts left)`);
      // Remove this error listener before trying again
      server.removeListener('error', errorHandler);
      // Try again on the next port with delay to avoid race condition
      setTimeout(() => startListening(nextPort, attemptsLeft - 1), 100);
    } else {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  };
  
  server.once('error', errorHandler);

  server.listen(port, () => {
    // Remove error listener on successful start
    server.removeListener('error', errorHandler);
    
    console.log('======================================');
    console.log(`✅ Server listening on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV}`);
    console.log(`API URL: ${process.env.API_URL}`);
    console.log(`CLIENT URL: ${process.env.CLIENT_URL}`);
    console.log('======================================');
  });
}

startListening(BASE_PORT, MAX_PORT_INCREMENT);

// Unhandled rejections
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! Shutting down...');
  console.log(err.name, err.message);
  console.log(err.stack);
  process.exit(1);
});

// Graceful shutdown on SIGTERM
process.on('SIGTERM', () => {
  console.log('SIGTERM RECEIVED. Shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});
