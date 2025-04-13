// backend/routes/admin/customerRoutes.js
const express = require('express');
const router = express.Router();
const customerController = require('../../controllers/admin/customerController');
const { authenticate, authorize } = require('../../middlewares/authMiddleware');
const { uploadAvatarImage } = require('../../services/cloudinaryService');

// Các route cần xác thực
router.use(authenticate);

// Các route quản lý khách hàng (cần quyền)
router.get('/', authorize('customers.view'), customerController.getCustomers);
router.post('/', authorize('customers.create'), uploadAvatarImage, customerController.createCustomer);
router.get('/:id', authorize('customers.view'), customerController.getCustomerById);
router.put('/:id', authorize('customers.edit'), uploadAvatarImage, customerController.updateCustomer);
router.delete('/:id', authorize('customers.delete'), customerController.deleteCustomer);

// Route cập nhật trạng thái khách hàng
router.patch('/:id/status', authorize('customers.edit'), customerController.updateCustomerStatus);

// Route đặt lại mật khẩu khách hàng
router.patch('/:id/reset-password', authorize('customers.edit'), customerController.resetCustomerPassword);

// Route cập nhật trạng thái xác thực email
router.patch('/:id/verification', authorize('customers.edit'), customerController.updateVerificationStatus);

module.exports = router;