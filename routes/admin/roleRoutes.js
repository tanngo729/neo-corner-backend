const express = require('express');
const router = express.Router();
const roleController = require('../../controllers/admin/roleController');
const { authenticate, authorize } = require('../../middlewares/authMiddleware');

// Tất cả các route quản lý vai trò đều cần xác thực
router.use(authenticate);

// Lấy danh sách quyền
router.get('/permissions', authorize('roles.view'), roleController.getAllPermissions);

// Các route quản lý vai trò
router.get('/', authorize('roles.view'), roleController.getRoles);
router.post('/', authorize('roles.create'), roleController.createRole);
router.get('/:id', authorize('roles.view'), roleController.getRoleById);
router.put('/:id', authorize('roles.edit'), roleController.updateRole);
router.delete('/:id', authorize('roles.delete'), roleController.deleteRole);

module.exports = router;