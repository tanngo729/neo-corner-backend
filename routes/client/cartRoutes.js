const express = require('express');
const router = express.Router();
const cartController = require('../../controllers/client/cartController');
const { authenticateCustomer } = require('../../middlewares/customerAuthMiddleware');

// Tất cả các routes đều cần đăng nhập với tài khoản khách hàng
router.use(authenticateCustomer);

// Lấy giỏ hàng
router.get('/', cartController.getCart);

// Thêm sản phẩm vào giỏ hàng
router.post('/items', cartController.addToCart);

// Cập nhật số lượng sản phẩm trong giỏ hàng
router.put('/items/:itemId', cartController.updateCartItem);

// Xóa sản phẩm khỏi giỏ hàng
router.delete('/items/:itemId', cartController.removeCartItem);

// Xóa toàn bộ giỏ hàng
router.delete('/', cartController.clearCart);

// Áp dụng mã giảm giá
router.post('/apply-coupon', cartController.applyCoupon);

// Hủy mã giảm giá
router.delete('/coupon', cartController.removeCoupon);

module.exports = router;