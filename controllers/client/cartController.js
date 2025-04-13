const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');

// Lấy giỏ hàng của người dùng
exports.getCart = async (req, res, next) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id })
      .populate({
        path: 'items.product',
        select: 'name price stock mainImage status'
      });

    if (!cart) {
      cart = await new Cart({ user: req.user.id, items: [] }).save();
    }

    // Kiểm tra xem có sản phẩm nào đã không còn available
    const updatedItems = [];
    let hasUpdates = false;

    for (const item of cart.items) {
      // Nếu sản phẩm không còn tồn tại hoặc không còn active
      if (!item.product || item.product.status !== 'active') {
        hasUpdates = true;
        continue;
      }

      // Nếu sản phẩm không đủ số lượng, cập nhật lại số lượng trong giỏ hàng
      if (item.quantity > item.product.stock) {
        item.quantity = item.product.stock;
        hasUpdates = true;
      }

      // Cập nhật lại giá nếu có thay đổi
      if (item.price !== item.product.price) {
        item.price = item.product.price;
        hasUpdates = true;
      }

      updatedItems.push(item);
    }

    // Nếu có thay đổi, cập nhật lại giỏ hàng
    if (hasUpdates) {
      cart.items = updatedItems;
      await cart.save();
    }

    return ApiResponse.success(res, 200, cart, 'Lấy giỏ hàng thành công');
  } catch (error) {
    console.error('Lỗi khi lấy giỏ hàng:', error);
    next(error);
  }
};

// Thêm sản phẩm vào giỏ hàng
exports.addToCart = async (req, res, next) => {
  try {
    const { productId, quantity = 1 } = req.body;

    // Kiểm tra sản phẩm
    const product = await Product.findOne({ _id: productId, status: 'active' });
    if (!product) {
      throw new ApiError(404, 'Không tìm thấy sản phẩm hoặc sản phẩm không còn khả dụng');
    }

    // Kiểm tra số lượng
    if (quantity <= 0) {
      throw new ApiError(400, 'Số lượng phải lớn hơn 0');
    }

    // Kiểm tra tồn kho
    if (product.stock < quantity) {
      throw new ApiError(400, `Sản phẩm chỉ còn ${product.stock} trong kho`);
    }

    // Tìm hoặc tạo giỏ hàng
    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      cart = new Cart({ user: req.user.id, items: [] });
    }

    // Kiểm tra xem sản phẩm đã có trong giỏ hàng chưa
    const itemIndex = cart.items.findIndex(item => item.product.toString() === productId);

    if (itemIndex > -1) {
      // Sản phẩm đã tồn tại, cập nhật số lượng
      const newQuantity = cart.items[itemIndex].quantity + quantity;

      // Kiểm tra tồn kho
      if (newQuantity > product.stock) {
        throw new ApiError(400, `Không thể thêm ${quantity} sản phẩm. Giỏ hàng của bạn đã có ${cart.items[itemIndex].quantity} và chỉ còn ${product.stock} trong kho.`);
      }

      cart.items[itemIndex].quantity = newQuantity;
      cart.items[itemIndex].price = product.price; // Cập nhật giá mới nhất
    } else {
      // Thêm sản phẩm mới vào giỏ hàng
      cart.items.push({
        product: productId,
        quantity,
        price: product.price,
        name: product.name,
        image: product.mainImage ? product.mainImage.url : ''
      });
    }

    await cart.save();

    // Populate thông tin sản phẩm để trả về
    await cart.populate({
      path: 'items.product',
      select: 'name price stock mainImage status'
    });

    return ApiResponse.success(res, 200, cart, 'Thêm sản phẩm vào giỏ hàng thành công');
  } catch (error) {
    console.error('Lỗi khi thêm vào giỏ hàng:', error);
    next(error);
  }
};

// Cập nhật số lượng sản phẩm trong giỏ hàng
exports.updateCartItem = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    const { itemId } = req.params;

    // Kiểm tra số lượng
    if (!quantity || quantity <= 0) {
      throw new ApiError(400, 'Số lượng phải lớn hơn 0');
    }

    // Tìm giỏ hàng
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      throw new ApiError(404, 'Không tìm thấy giỏ hàng');
    }

    // Tìm sản phẩm trong giỏ hàng
    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      throw new ApiError(404, 'Không tìm thấy sản phẩm trong giỏ hàng');
    }

    // Lấy thông tin sản phẩm từ database để kiểm tra tồn kho
    const product = await Product.findById(cart.items[itemIndex].product);
    if (!product || product.status !== 'active') {
      throw new ApiError(400, 'Sản phẩm không còn khả dụng');
    }

    // Kiểm tra tồn kho
    if (quantity > product.stock) {
      throw new ApiError(400, `Chỉ còn ${product.stock} sản phẩm trong kho`);
    }

    // Cập nhật số lượng
    cart.items[itemIndex].quantity = quantity;
    // Cập nhật giá (phòng trường hợp giá đã thay đổi)
    cart.items[itemIndex].price = product.price;

    await cart.save();

    // Populate thông tin sản phẩm để trả về
    await cart.populate({
      path: 'items.product',
      select: 'name price stock mainImage status'
    });

    return ApiResponse.success(res, 200, cart, 'Cập nhật giỏ hàng thành công');
  } catch (error) {
    console.error('Lỗi khi cập nhật giỏ hàng:', error);
    next(error);
  }
};

// Xóa sản phẩm khỏi giỏ hàng
exports.removeCartItem = async (req, res, next) => {
  try {
    const { itemId } = req.params;

    // Tìm giỏ hàng
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      throw new ApiError(404, 'Không tìm thấy giỏ hàng');
    }

    // Tìm sản phẩm trong giỏ hàng
    const itemIndex = cart.items.findIndex(item => item._id.toString() === itemId);
    if (itemIndex === -1) {
      throw new ApiError(404, 'Không tìm thấy sản phẩm trong giỏ hàng');
    }

    // Xóa sản phẩm khỏi giỏ hàng
    cart.items.splice(itemIndex, 1);
    await cart.save();

    // Populate thông tin sản phẩm để trả về
    await cart.populate({
      path: 'items.product',
      select: 'name price stock mainImage status'
    });

    return ApiResponse.success(res, 200, cart, 'Xóa sản phẩm khỏi giỏ hàng thành công');
  } catch (error) {
    console.error('Lỗi khi xóa sản phẩm khỏi giỏ hàng:', error);
    next(error);
  }
};

// Xóa toàn bộ giỏ hàng
exports.clearCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      throw new ApiError(404, 'Không tìm thấy giỏ hàng');
    }

    cart.items = [];
    cart.couponCode = null;
    cart.couponDiscount = 0;
    await cart.save();

    return ApiResponse.success(res, 200, cart, 'Xóa giỏ hàng thành công');
  } catch (error) {
    console.error('Lỗi khi xóa giỏ hàng:', error);
    next(error);
  }
};

// Áp dụng mã giảm giá
exports.applyCoupon = async (req, res, next) => {
  try {
    const { couponCode } = req.body;

    if (!couponCode) {
      throw new ApiError(400, 'Vui lòng nhập mã giảm giá');
    }

    // Tìm giỏ hàng
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      throw new ApiError(404, 'Không tìm thấy giỏ hàng');
    }

    // TODO: Xác thực mã giảm giá với promotionService
    // Đây là đoạn code giả định - bạn cần thay thế bằng mã thực tế
    const { promotionService } = require('../../services/client');
    const couponResponse = await promotionService.validateCoupon(couponCode);

    if (!couponResponse.data.data.valid) {
      throw new ApiError(400, couponResponse.data.message || 'Mã giảm giá không hợp lệ');
    }

    const couponData = couponResponse.data.data;

    // Kiểm tra điều kiện áp dụng (ví dụ: giá trị đơn hàng tối thiểu)
    if (couponData.minOrderValue && cart.subtotal < couponData.minOrderValue) {
      throw new ApiError(400, `Giỏ hàng cần tối thiểu ${couponData.minOrderValue.toLocaleString('vi-VN')}đ để áp dụng mã này`);
    }

    // Tính giá trị giảm giá
    let discount = 0;
    if (couponData.discountType === 'percentage') {
      discount = (cart.subtotal * couponData.discount) / 100;
      // Giới hạn giảm giá tối đa nếu có
      if (couponData.maxDiscount && discount > couponData.maxDiscount) {
        discount = couponData.maxDiscount;
      }
    } else if (couponData.discountType === 'fixed') {
      discount = couponData.discount;
    }

    // Lưu mã giảm giá và giá trị giảm giá vào giỏ hàng
    cart.couponCode = couponCode;
    cart.couponDiscount = discount;
    await cart.save();

    // Populate thông tin sản phẩm để trả về
    await cart.populate({
      path: 'items.product',
      select: 'name price stock mainImage status'
    });

    return ApiResponse.success(res, 200, cart, 'Áp dụng mã giảm giá thành công');
  } catch (error) {
    console.error('Lỗi khi áp dụng mã giảm giá:', error);
    next(error);
  }
};

// Hủy mã giảm giá
exports.removeCoupon = async (req, res, next) => {
  try {
    // Tìm giỏ hàng
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      throw new ApiError(404, 'Không tìm thấy giỏ hàng');
    }

    // Xóa mã giảm giá
    cart.couponCode = null;
    cart.couponDiscount = 0;
    await cart.save();

    // Populate thông tin sản phẩm để trả về
    await cart.populate({
      path: 'items.product',
      select: 'name price stock mainImage status'
    });

    return ApiResponse.success(res, 200, cart, 'Hủy mã giảm giá thành công');
  } catch (error) {
    console.error('Lỗi khi hủy mã giảm giá:', error);
    next(error);
  }
};