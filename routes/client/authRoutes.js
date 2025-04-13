// backend/routes/client/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../../controllers/client/authController');
const { authenticateCustomer, requireVerifiedEmail } = require('../../middlewares/customerAuthMiddleware');

// Routes công khai - không cần đăng nhập
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/verify-email/:token', authController.verifyEmail);

router.use(authenticateCustomer);

router.get('/me', authController.getMe);
router.patch('/update-profile', authController.updateProfile);
router.patch('/change-password', authController.changePassword);
router.post('/resend-verification', authController.resendVerificationEmail);


module.exports = router;