// controllers/admin/paymentMethodController.js
const PaymentMethod = require('../../models/PaymentMethod');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');

// Lấy tất cả phương thức thanh toán
exports.getAllPaymentMethods = async (req, res, next) => {
  try {
    const paymentMethods = await PaymentMethod.find().sort({ position: 1 });
    return ApiResponse.success(res, 200, paymentMethods, 'Lấy danh sách phương thức thanh toán thành công');
  } catch (error) {
    next(error);
  }
};

// Lấy phương thức thanh toán theo mã
exports.getPaymentMethodByCode = async (req, res, next) => {
  try {
    const { code } = req.params;
    const paymentMethod = await PaymentMethod.findOne({ code });

    if (!paymentMethod) {
      throw new ApiError(404, 'Không tìm thấy phương thức thanh toán');
    }

    return ApiResponse.success(res, 200, paymentMethod, 'Lấy thông tin phương thức thanh toán thành công');
  } catch (error) {
    next(error);
  }
};

// Cập nhật phương thức thanh toán
exports.updatePaymentMethod = async (req, res, next) => {
  try {
    const { code } = req.params;
    const updateData = req.body;

    const paymentMethod = await PaymentMethod.findOne({ code });

    if (!paymentMethod) {
      throw new ApiError(404, 'Không tìm thấy phương thức thanh toán');
    }

    // Cập nhật thông tin cơ bản
    if (updateData.name) paymentMethod.name = updateData.name;
    if (updateData.description !== undefined) paymentMethod.description = updateData.description;
    if (updateData.icon !== undefined) paymentMethod.icon = updateData.icon;
    if (updateData.isActive !== undefined) paymentMethod.isActive = updateData.isActive;
    if (updateData.position !== undefined) paymentMethod.position = updateData.position;

    // Cập nhật config tùy theo loại thanh toán
    if (updateData.config) {
      // COD config
      if (code === 'COD' && updateData.config.codExtraFee !== undefined) {
        paymentMethod.config.codExtraFee = updateData.config.codExtraFee;
      }

      // MOMO config
      if (code === 'MOMO') {
        if (updateData.config.momoPartnerCode !== undefined)
          paymentMethod.config.momoPartnerCode = updateData.config.momoPartnerCode;
        if (updateData.config.momoAccessKey !== undefined)
          paymentMethod.config.momoAccessKey = updateData.config.momoAccessKey;
        if (updateData.config.momoSecretKey !== undefined)
          paymentMethod.config.momoSecretKey = updateData.config.momoSecretKey;
        if (updateData.config.momoEndpoint !== undefined)
          paymentMethod.config.momoEndpoint = updateData.config.momoEndpoint;
        if (updateData.config.momoTestMode !== undefined)
          paymentMethod.config.momoTestMode = updateData.config.momoTestMode;
      }

      // VNPAY config
      if (code === 'VNPAY') {
        if (updateData.config.vnpTmnCode !== undefined)
          paymentMethod.config.vnpTmnCode = updateData.config.vnpTmnCode;
        if (updateData.config.vnpHashSecret !== undefined)
          paymentMethod.config.vnpHashSecret = updateData.config.vnpHashSecret;
        if (updateData.config.vnpUrl !== undefined)
          paymentMethod.config.vnpUrl = updateData.config.vnpUrl;
        if (updateData.config.vnpReturnUrl !== undefined)
          paymentMethod.config.vnpReturnUrl = updateData.config.vnpReturnUrl;
        if (updateData.config.vnpTestMode !== undefined)
          paymentMethod.config.vnpTestMode = updateData.config.vnpTestMode;
      }

      // Bank transfer config
      if (code === 'BANK_TRANSFER' && updateData.config.bankAccounts) {
        paymentMethod.config.bankAccounts = updateData.config.bankAccounts;
      }
    }

    await paymentMethod.save();

    return ApiResponse.success(res, 200, paymentMethod, 'Cập nhật phương thức thanh toán thành công');
  } catch (error) {
    next(error);
  }
};

// Thêm tài khoản ngân hàng mới (chỉ dành cho phương thức chuyển khoản ngân hàng)
exports.addBankAccount = async (req, res, next) => {
  try {
    const { bankName, accountNumber, accountName, branch, isDefault } = req.body;

    // Validate input
    if (!bankName || !accountNumber || !accountName) {
      throw new ApiError(400, 'Vui lòng cung cấp đầy đủ thông tin tài khoản ngân hàng');
    }

    const paymentMethod = await PaymentMethod.findOne({ code: 'BANK_TRANSFER' });

    if (!paymentMethod) {
      throw new ApiError(404, 'Không tìm thấy phương thức thanh toán');
    }

    // Nếu là tài khoản đầu tiên hoặc đánh dấu là mặc định
    if (!paymentMethod.config.bankAccounts || paymentMethod.config.bankAccounts.length === 0 || isDefault) {
      // Đánh dấu tất cả tài khoản hiện tại là không mặc định
      if (paymentMethod.config.bankAccounts && paymentMethod.config.bankAccounts.length > 0) {
        paymentMethod.config.bankAccounts.forEach(acc => {
          acc.isDefault = false;
        });
      }
    }

    // Thêm tài khoản mới
    const newAccount = {
      bankName,
      accountNumber,
      accountName,
      branch: branch || '',
      isDefault: isDefault || paymentMethod.config.bankAccounts.length === 0
    };

    // Khởi tạo mảng nếu chưa có
    if (!paymentMethod.config.bankAccounts) {
      paymentMethod.config.bankAccounts = [];
    }

    paymentMethod.config.bankAccounts.push(newAccount);
    await paymentMethod.save();

    return ApiResponse.success(res, 201, paymentMethod, 'Thêm tài khoản ngân hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Xóa tài khoản ngân hàng
exports.removeBankAccount = async (req, res, next) => {
  try {
    const { accountIndex } = req.params;

    const paymentMethod = await PaymentMethod.findOne({ code: 'BANK_TRANSFER' });

    if (!paymentMethod) {
      throw new ApiError(404, 'Không tìm thấy phương thức thanh toán');
    }

    // Kiểm tra tài khoản tồn tại
    if (!paymentMethod.config.bankAccounts || !paymentMethod.config.bankAccounts[accountIndex]) {
      throw new ApiError(404, 'Không tìm thấy tài khoản ngân hàng');
    }

    // Kiểm tra nếu là tài khoản mặc định và không phải tài khoản duy nhất
    if (paymentMethod.config.bankAccounts[accountIndex].isDefault &&
      paymentMethod.config.bankAccounts.length > 1) {
      // Đặt tài khoản đầu tiên khác làm mặc định
      const nextDefaultIndex = accountIndex === 0 ? 1 : 0;
      paymentMethod.config.bankAccounts[nextDefaultIndex].isDefault = true;
    }

    // Xóa tài khoản
    paymentMethod.config.bankAccounts.splice(accountIndex, 1);
    await paymentMethod.save();

    return ApiResponse.success(res, 200, paymentMethod, 'Xóa tài khoản ngân hàng thành công');
  } catch (error) {
    next(error);
  }
};

// Thiết lập tài khoản ngân hàng mặc định
exports.setDefaultBankAccount = async (req, res, next) => {
  try {
    const { accountIndex } = req.params;

    const paymentMethod = await PaymentMethod.findOne({ code: 'BANK_TRANSFER' });

    if (!paymentMethod) {
      throw new ApiError(404, 'Không tìm thấy phương thức thanh toán');
    }

    // Kiểm tra tài khoản tồn tại
    if (!paymentMethod.config.bankAccounts || !paymentMethod.config.bankAccounts[accountIndex]) {
      throw new ApiError(404, 'Không tìm thấy tài khoản ngân hàng');
    }

    // Đặt tất cả tài khoản là không mặc định
    paymentMethod.config.bankAccounts.forEach((account, index) => {
      account.isDefault = index.toString() === accountIndex;
    });

    await paymentMethod.save();

    return ApiResponse.success(res, 200, paymentMethod, 'Đặt tài khoản ngân hàng mặc định thành công');
  } catch (error) {
    next(error);
  }
};