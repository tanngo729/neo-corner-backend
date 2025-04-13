const express = require('express');
const router = express.Router();
const categoryController = require('../../controllers/client/categoryController');

router.get('/', categoryController.getCategories);
router.get('/with-subcategories', categoryController.getCategoriesWithSubcategories);
router.get('/:categoryId/subcategories', categoryController.getSubcategories);

module.exports = router;