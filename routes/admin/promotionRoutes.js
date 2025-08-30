// routes/admin/promotionRoutes.js
const express = require('express');
const router = express.Router();
const promotionController = require('../../controllers/admin/promotionController');
const { authenticate, authorize } = require('../../middlewares/authMiddleware');

// Áp dụng middleware xác thực cho tất cả routes
router.use(authenticate);

// Routes quản lý khuyến mãi - sử dụng quyền settings thay vì quyền promotions riêng biệt
router.get('/', authorize('settings.view'), promotionController.getAllPromotions);
router.get('/:id', authorize('settings.view'), promotionController.getPromotion);
router.post('/', authorize('settings.edit'), promotionController.createPromotion);
router.put('/:id', authorize('settings.edit'), promotionController.updatePromotion);
router.delete('/:id', authorize('settings.edit'), promotionController.deletePromotion);

module.exports = router;