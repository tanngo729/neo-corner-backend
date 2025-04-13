// controllers/client/paymentCallbackController.js
const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const PaymentMethod = require('../../models/PaymentMethod');
const MomoService = require('../../services/payment/momoService');
const VnpayService = require('../../services/payment/vnpayService');

/**
 * Hàm xử lý chung cho các callback thanh toán
 * @param {string} orderCode - Mã đơn hàng
 * @param {string} paymentMethod - Phương thức thanh toán ('MOMO', 'VNPAY')
 * @param {Object} transactionInfo - Thông tin giao dịch từ cổng thanh toán
 * @returns {Promise<Object>} Kết quả xử lý
 */
async function processPaymentCallback(orderCode, paymentMethod, transactionInfo) {
  // Bắt đầu transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log(`[processPaymentCallback] Xử lý callback ${paymentMethod} cho đơn hàng: ${orderCode}`);

    // Tìm đơn hàng theo mã và phương thức thanh toán - KHÔNG giới hạn trạng thái
    let order = await Order.findOne({
      orderCode: orderCode,
      paymentMethod: paymentMethod
    }).session(session);

    // Nếu không tìm thấy, thử tìm mà không quan tâm phương thức thanh toán
    if (!order) {
      console.log(`[processPaymentCallback] Không tìm thấy đơn hàng ${orderCode} với phương thức ${paymentMethod}, thử tìm không giới hạn phương thức`);

      order = await Order.findOne({ orderCode: orderCode }).session(session);

      if (order) {
        console.log(`[processPaymentCallback] Đã tìm thấy đơn hàng ${orderCode} với phương thức ${order.paymentMethod}`);
      } else {
        console.error(`[processPaymentCallback] Không tìm thấy đơn hàng ${orderCode} trong hệ thống`);
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          message: 'Không tìm thấy đơn hàng'
        };
      }
    }

    // Nếu đơn hàng đã hoàn thành thanh toán trước đó
    if (order.payment.status === 'COMPLETED') {
      console.log(`[processPaymentCallback] Đơn hàng ${orderCode} đã được thanh toán trước đó`);
      await session.abortTransaction();
      session.endSession();
      return {
        success: true,
        message: 'Đơn hàng đã được thanh toán trước đó',
        orderCode: order.orderCode,
        wasAlreadyCompleted: true
      };
    }

    // Cập nhật trạng thái đơn hàng và thông tin thanh toán
    order.status = 'PROCESSING';
    order.payment.status = 'COMPLETED';
    order.payment.transactionId = transactionInfo.transactionId;
    order.payment.transactionInfo = transactionInfo;
    order.payment.paidAt = new Date();

    await order.save({ session });
    console.log(`[processPaymentCallback] Đã cập nhật trạng thái đơn hàng ${orderCode} sang PROCESSING và thanh toán COMPLETED`);

    // Cập nhật tồn kho nếu chưa cập nhật
    if (!order.stockUpdated) {
      console.log(`[processPaymentCallback] Bắt đầu cập nhật tồn kho cho đơn hàng ${orderCode}`);

      for (const item of order.items) {
        if (!item.product) {
          console.warn(`[processPaymentCallback] Sản phẩm không xác định trong đơn hàng ${orderCode}`);
          continue;
        }

        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { stock: -item.quantity, sold: item.quantity || 0 } },
          { session }
        );
        console.log(`[processPaymentCallback] Đã cập nhật tồn kho cho sản phẩm ${item.product}`);
      }

      // Đánh dấu đã cập nhật tồn kho
      order.stockUpdated = true;
      await order.save({ session });
      console.log(`[processPaymentCallback] Đã đánh dấu cập nhật tồn kho cho đơn hàng ${orderCode}`);

      // Xóa giỏ hàng
      if (order.user) {
        await Cart.findOneAndUpdate(
          { user: order.user },
          { items: [], couponCode: null, couponDiscount: 0 },
          { session }
        );
        console.log(`[processPaymentCallback] Đã xóa giỏ hàng cho khách hàng ${order.user}`);
      }
    } else {
      console.log(`[processPaymentCallback] Tồn kho đã được cập nhật trước đó cho đơn hàng ${orderCode}`);
    }

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    console.log(`[processPaymentCallback] Xử lý callback thành công cho đơn hàng ${orderCode}`);
    return {
      success: true,
      message: 'Xử lý thanh toán thành công',
      orderCode: order.orderCode
    };
  } catch (error) {
    // Rollback nếu có lỗi
    await session.abortTransaction();
    session.endSession();

    console.error(`[processPaymentCallback] Lỗi khi xử lý callback: ${error.message}`, error);
    return {
      success: false,
      message: `Lỗi xử lý đơn hàng: ${error.message}`,
      error: error
    };
  }
}

/**
 * Xử lý callback từ MoMo
 */
exports.momoCallback = async (req, res, next) => {
  try {
    console.log('Nhận callback từ MoMo (đầy đủ):', JSON.stringify(req.body, null, 2));
    console.log('MOMO extraData:', req.body.extraData);

    // Lấy cấu hình MoMo
    const momoConfig = await PaymentMethod.findOne({ code: 'MOMO', isActive: true });
    if (!momoConfig) {
      console.error('Không tìm thấy cấu hình MoMo');
      return res.status(200).json({ message: 'Không tìm thấy cấu hình MoMo nhưng đã xác nhận' });
    }

    // Khởi tạo MomoService
    const momoService = new MomoService(momoConfig.config);

    // Kiểm tra resultCode trước khi gọi processCallback
    const resultCode = req.body.resultCode;
    if (resultCode !== '0' && resultCode !== 0) {
      console.log(`Thanh toán MoMo không thành công, resultCode=${resultCode}`);
      return res.status(200).json({
        message: 'Thanh toán không thành công',
        resultCode: resultCode
      });
    }

    // Xử lý callback
    const result = await momoService.processCallback(req.body);
    console.log('Kết quả xử lý callback MoMo:', result);

    if (result.success) {
      // Tìm orderCode từ kết quả callback
      let orderCode = result.orderCode || '';

      // Nếu không có orderCode trực tiếp, thử lấy từ các thông tin khác
      if (!orderCode) {
        try {
          // Lấy thông tin từ extraData - ƯU TIÊN VÌ CHỨA DỮ LIỆU CHÍNH XÁC NHẤT
          if (req.body.extraData) {
            console.log('Dữ liệu extraData trước khi giải mã:', req.body.extraData);
            try {
              const decodedData = JSON.parse(Buffer.from(req.body.extraData, 'base64').toString());
              orderCode = decodedData.orderCode || '';
              console.log('Giải mã extraData thành công:', decodedData);
              console.log('Trích xuất mã đơn hàng:', orderCode);
            } catch (decodeError) {
              console.error('Lỗi giải mã extraData:', decodeError, 'dữ liệu gốc:', req.body.extraData);
            }
          }

          // Hoặc thử lấy từ orderInfo
          if (!orderCode && req.body.orderInfo) {
            // Tìm mẫu DH + số trong orderInfo
            const orderCodeMatch = req.body.orderInfo.match(/DH\d+/);
            if (orderCodeMatch) {
              orderCode = orderCodeMatch[0];
              console.log('Tìm thấy mã đơn hàng trong orderInfo:', orderCode);
            } else if (req.body.orderInfo.includes('#')) {
              orderCode = req.body.orderInfo.split('#')[1].trim();
              console.log('Tìm thấy mã đơn hàng sau dấu # trong orderInfo:', orderCode);
            }
          }

          // Hoặc thử lấy từ orderId
          if (!orderCode && req.body.orderId) {
            const orderIdParts = req.body.orderId.split('_');
            if (orderIdParts.length > 1) {
              // Kiểm tra nếu phần cuối có dạng mã đơn hàng
              const potentialOrderCode = orderIdParts[orderIdParts.length - 1];
              if (potentialOrderCode.match(/^DH\d+$/)) {
                orderCode = potentialOrderCode;
                console.log('Tìm thấy mã đơn hàng từ orderId:', orderCode);
              } else {
                // Thử tìm objectId trong orderId
                const orderId = orderIdParts[orderIdParts.length - 1];
                console.log('Thử tìm đơn hàng với _id:', orderId);
                try {
                  // Nếu là ObjectId hợp lệ, thử tìm đơn hàng
                  if (mongoose.Types.ObjectId.isValid(orderId)) {
                    const orderById = await Order.findById(orderId);
                    if (orderById) {
                      orderCode = orderById.orderCode;
                      console.log('Tìm thấy đơn hàng qua _id, mã đơn hàng:', orderCode);
                    }
                  }
                } catch (findError) {
                  console.error('Lỗi khi tìm đơn hàng theo _id:', findError);
                }
              }
            }
          }
        } catch (e) {
          console.error('Lỗi xử lý dữ liệu từ MoMo:', e);
        }
      }

      console.log('Tìm đơn hàng với mã cuối cùng:', orderCode);
      if (!orderCode) {
        console.error('Không thể xác định mã đơn hàng từ callback MoMo');
        return res.status(200).json({ message: 'Không thể xác định mã đơn hàng nhưng đã xác nhận' });
      }

      // Sử dụng hàm xử lý chung để cập nhật đơn hàng
      const transactionInfo = {
        momoResponse: req.body,
        amount: result.amount || parseInt(req.body.amount),
        transactionId: result.transactionId || req.body.transId
      };

      const processResult = await processPaymentCallback(orderCode, 'MOMO', transactionInfo);

      if (processResult.wasAlreadyCompleted) {
        return res.status(200).json({ message: 'Đơn hàng đã được thanh toán trước đó' });
      }

      if (processResult.success) {
        return res.status(200).json({ message: 'Xử lý thanh toán thành công' });
      } else {
        // Nếu có lỗi xử lý nhưng resultCode là thành công, vẫn trả về 200 để MOMO không gửi lại
        return res.status(200).json({ message: processResult.message || 'Lỗi xử lý đơn hàng nhưng đã xác nhận' });
      }
    } else {
      // Xử lý thất bại
      console.error('Thanh toán MoMo thất bại:', result.message);
      return res.status(200).json({ message: 'Thanh toán thất bại nhưng đã xác nhận' });
    }
  } catch (error) {
    console.error('Lỗi xử lý callback từ MoMo (chi tiết):', error);
    // Luôn trả về 200 để MoMo không gửi lại
    return res.status(200).json({ message: 'Lỗi xử lý nhưng đã xác nhận' });
  }
};

/**
 * Xử lý callback từ VNPAY
 */
exports.vnpayCallback = async (req, res, next) => {
  try {
    console.log('Nhận callback từ VNPAY:', req.query);

    // Lấy cấu hình VNPAY
    const vnpayConfig = await PaymentMethod.findOne({ code: 'VNPAY', isActive: true });
    if (!vnpayConfig) {
      console.error('Không tìm thấy cấu hình VNPAY');
      return res.redirect(`${process.env.CLIENT_URL}/payment/result?status=error&message=Phương thức thanh toán VNPAY không khả dụng`);
    }

    // Khởi tạo VnpayService
    const vnpayService = new VnpayService(vnpayConfig.config);

    // Kiểm tra trực tiếp mã phản hồi
    const responseCode = req.query.vnp_ResponseCode;
    const isSuccess = responseCode === '00';

    // Nếu không thành công, chuyển hướng ngay
    if (!isSuccess) {
      console.log(`Thanh toán VNPAY không thành công, vnp_ResponseCode=${responseCode}`);
      return res.redirect(`${process.env.CLIENT_URL}/payment/result?status=error&message=Thanh toán không thành công&code=${responseCode}`);
    }

    // Xử lý callback
    const result = await vnpayService.processCallback(req.query);
    console.log('Kết quả xử lý callback VNPAY:', result);

    if (result.success) {
      // Lấy mã đơn hàng từ kết quả hoặc từ vnp_TxnRef
      let orderCode = result.orderCode || req.query.vnp_TxnRef;
      console.log('Tìm đơn hàng với mã:', orderCode);

      // Nếu không có mã đơn hàng, thử tìm trong OrderInfo
      if (!orderCode && req.query.vnp_OrderInfo) {
        const match = req.query.vnp_OrderInfo.match(/DH\d+/);
        if (match) {
          orderCode = match[0];
          console.log('Tìm thấy mã đơn hàng trong vnp_OrderInfo:', orderCode);
        }
      }

      if (!orderCode) {
        console.error('Không thể xác định mã đơn hàng từ callback VNPAY');
        return res.redirect(`${process.env.CLIENT_URL}/payment/result?status=error&message=Không thể xác định mã đơn hàng`);
      }

      // Sử dụng hàm xử lý chung để cập nhật đơn hàng
      const transactionInfo = {
        vnpayResponse: req.query,
        amount: result.amount,
        bankCode: result.bankCode || req.query.vnp_BankCode,
        bankTranNo: result.bankTranNo || req.query.vnp_BankTranNo,
        cardType: result.cardType || req.query.vnp_CardType,
        payDate: result.payDate || req.query.vnp_PayDate,
        transactionId: result.transactionId || req.query.vnp_TransactionNo
      };

      const processResult = await processPaymentCallback(orderCode, 'VNPAY', transactionInfo);

      if (processResult.wasAlreadyCompleted || processResult.success) {
        // Chuyển hướng về trang kết quả với trạng thái thành công
        return res.redirect(`${process.env.CLIENT_URL}/payment/result?status=success&orderCode=${orderCode}`);
      } else {
        // Chuyển hướng với thông báo lỗi
        return res.redirect(`${process.env.CLIENT_URL}/payment/result?status=error&message=${encodeURIComponent(processResult.message || 'Lỗi xử lý đơn hàng')}`);
      }
    } else {
      // Xử lý thất bại
      console.error('Thanh toán VNPAY thất bại:', result.message);
      return res.redirect(`${process.env.CLIENT_URL}/payment/result?status=error&message=${encodeURIComponent(result.message)}`);
    }
  } catch (error) {
    console.error('Lỗi xử lý callback từ VNPAY:', error);
    return res.redirect(`${process.env.CLIENT_URL}/payment/result?status=error&message=Lỗi xử lý thanh toán`);
  }
};