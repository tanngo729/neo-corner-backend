// routes/admin/notificationRoutes.js
const express = require('express');
const router = express.Router();
const notificationController = require('../../controllers/admin/notificationController');
const { authenticate } = require('../../middlewares/authMiddleware');

router.use(authenticate);
router.get('/', notificationController.getAdminNotifications);
router.put('/read', notificationController.markAsRead);

module.exports = router;

