// backend/routes/admin/settingsRoutes.js
const express = require('express');
const router = express.Router();
const settingsController = require('../../controllers/admin/settingsController');
const logController = require('../../controllers/admin/logController');
const { authenticate, authorize } = require('../../middlewares/authMiddleware');

// Áp dụng middleware xác thực cho tất cả routes
router.use(authenticate);

// Routes cài đặt
router.get('/', authorize('settings.view'), settingsController.getSettings);
router.put('/', authorize('settings.edit'), settingsController.updateSettings);

// Routes logs - tích hợp vào cài đặt
router.get('/logs', authorize('settings.view'), logController.getLogs);

module.exports = router;