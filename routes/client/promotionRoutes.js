// routes/client/promotionRoutes.js
const express = require('express');
const router = express.Router();
const promotionController = require('../../controllers/admin/promotionController'); // Tái sử dụng controller admin

// Chỉ cho phép xem các khuyến mãi đang hoạt động
router.get('/active', promotionController.getActivePromotions);

module.exports = router;