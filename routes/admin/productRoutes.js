// backend/routes/admin/productRoutes.js
const express = require('express');
const router = express.Router();
const productController = require('../../controllers/admin/productController');
const { uploadProductImages } = require('../../services/cloudinaryService');
const { authenticate, authorize } = require('../../middlewares/authMiddleware');

// Apply authentication middleware to all routes
router.use(authenticate);

// Routes cho quản lý sản phẩm (admin)
router.get('/', authorize('products.view'), productController.getProducts);

// Sử dụng middleware uploadProductImages trước controller
router.post('/', authorize('products.create'), uploadProductImages, productController.createProduct);
router.get('/:id', authorize('products.view'), productController.getProductById);
router.put('/:id', authorize('products.edit'), uploadProductImages, productController.updateProduct);
router.delete('/:id', authorize('products.delete'), productController.deleteProduct);
router.delete('/', authorize('products.delete'), productController.batchDeleteProducts);
router.put('/:id/status', authorize('products.edit'), productController.updateProductStatus);
router.put('/:id/position', authorize('products.edit'), productController.updateProductPosition);
router.put('/:id/featured', authorize('products.edit'), productController.updateProductFeatured);

module.exports = router;