const express = require('express');
const router = express.Router();
const productController = require('../../controllers/client/productController');

// Routes cho sản phẩm (client)
router.get('/', productController.getProducts);
router.get('/featured', productController.getFeaturedProducts);
router.get('/related', productController.getRelatedProducts);
router.get('/search-suggestions', productController.searchSuggestions);
router.get('/:slug', productController.getProductBySlug);

module.exports = router;