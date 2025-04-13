const express = require('express');
const router = express.Router();
const userController = require('../../controllers/admin/userController');
const { authenticate, authorize } = require('../../middlewares/authMiddleware');
const { uploadAvatarImage } = require('../../services/cloudinaryService');

// Các route cần xác thực
router.use(authenticate);

// Các route quản lý người dùng (cần quyền)
router.get('/', authorize('users.view'), userController.getUsers);
router.post('/', authorize('users.create'), uploadAvatarImage, userController.createUser);
router.get('/:id', authorize('users.view'), userController.getUserById);
router.put('/:id', authorize('users.edit'), uploadAvatarImage, userController.updateUser);
router.delete('/:id', authorize('users.delete'), userController.deleteUser);

module.exports = router;
