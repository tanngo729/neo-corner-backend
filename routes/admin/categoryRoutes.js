// backend/routes/admin/categoryRoutes.js
const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/admin/categoryController');
const { uploadCategoryImage } = require('../../services/cloudinaryService');
const { authenticate, authorize } = require('../../middlewares/authMiddleware');

// Apply authentication middleware to all routes
router.use(authenticate);

// Routes cho quản lý danh mục
router.get('/', authorize('categories.view'), categoryController.getCategories);
router.post('/', authorize('categories.create'), uploadCategoryImage, categoryController.createCategory);
router.get('/:id', authorize('categories.view'), categoryController.getCategoryById);
router.put('/:id', authorize('categories.edit'), uploadCategoryImage, categoryController.updateCategory);
router.delete('/:id', authorize('categories.delete'), categoryController.deleteCategory);
router.put('/:id/status', authorize('categories.edit'), categoryController.updateCategoryStatus);

module.exports = router;