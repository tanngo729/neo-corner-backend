// routes/client/bannerRoutes.js
const express = require('express');
const router = express.Router();
const bannerController = require('../../controllers/admin/bannerController');

// Get active banners for client with location filtering
router.get('/active', bannerController.getActiveBanners);

module.exports = router;