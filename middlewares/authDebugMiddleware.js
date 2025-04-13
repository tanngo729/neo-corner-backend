// backend/middlewares/authDebugMiddleware.js
const jwt = require('jsonwebtoken');

// Middleware debug xác thực
const authDebug = (req, res, next) => {
  console.log('--- AUTH DEBUG START ---');
  console.log('Request URL:', req.originalUrl);
  console.log('Request Method:', req.method);
  console.log('Authorization Header:', req.headers.authorization ?
    `${req.headers.authorization.substring(0, 20)}...` :
    'không có');

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    const token = req.headers.authorization.substring(7);
    console.log('Token extracted:', token.substring(0, 20) + '...');

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token valid, decoded:', decoded);
    } catch (error) {
      console.log('Token validation error:', error.message);
    }
  }

  console.log('--- AUTH DEBUG END ---');
  next();
};

module.exports = authDebug;