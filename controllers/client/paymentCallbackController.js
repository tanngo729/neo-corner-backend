// controllers/client/paymentCallbackController.js
const mongoose = require('mongoose');
const Order = require('../../models/Order');
const Cart = require('../../models/Cart');
const Product = require('../../models/Product');
const PaymentMethod = require('../../models/PaymentMethod');
const MomoService = require('../../services/payment/momoService');
const VnpayService = require('../../services/payment/vnpayService');
const Notification = require('../../models/Notification'); // Import Notification
const socketManager = require('../../utils/socketManager'); // Import socketManager

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

    // GỬI THÔNG BÁO ĐƠN HÀNG MỚI SAU KHI THANH TOÁN THÀNH CÔNG
    try {
      const notification = new Notification({
        type: 'new-order',
        orderId: order._id,
        orderCode: order.orderCode,
        title: `Đơn hàng mới #${order.orderCode} (Đã thanh toán)`,
        description: `Đơn hàng từ ${order.shippingAddress.fullName} - ${order.total.toLocaleString()} VND`,
        status: order.status,
        forAdmin: true,
        read: false
      });

      await notification.save({ session });
      console.log(`[processPaymentCallback] Đã lưu thông báo đơn hàng ${order.orderCode} vào database`);

      await socketManager.notifyNewOrder({
        _id: order._id.toString(),
        orderId: order._id.toString(),
        orderCode: order.orderCode,
        total: order.total,
        status: order.status,
        type: 'new-order',
        timestamp: new Date(),
        customerName: order.shippingAddress.fullName,
        customerPhone: order.shippingAddress.phone,
        paymentMethod: paymentMethod,
        notificationId: notification._id.toString(),
        isPaid: true
      });

      console.log(`[processPaymentCallback] Đã gửi thông báo đơn hàng #${order.orderCode} sau khi thanh toán thành công`);
    } catch (notifyError) {
      console.error('[processPaymentCallback] Lỗi khi gửi thông báo đơn hàng:', notifyError);
      // Không ảnh hưởng đến việc xử lý thanh toán, chỉ log lỗi
    }

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    console.log(`[processPaymentCallback] Xử lý callback thành công cho đơn hàng ${orderCode}`);
    return {
      success: true,
      message: 'Xử lý thanh toán thành công',
      orderCode: order.orderCode,
      notified: true // Đánh dấu đã gửi thông báo
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
    console.log('[MOMO CALLBACK] Dữ liệu nhận được:', JSON.stringify(req.body, null, 2));

    // Trả về HTTP 200 ngay lập tức để MoMo không gửi lại callback
    res.status(200).json({ message: 'Đã nhận callback' });

    // Tiếp tục xử lý ở background để tránh timeout
    setTimeout(async () => {
      try {
        // Extract orderCode từ extraData (ưu tiên nhất)
        let orderCode = '';
        if (req.body.extraData) {
          try {
            const decodedData = JSON.parse(Buffer.from(req.body.extraData, 'base64').toString());
            orderCode = decodedData.orderCode;
            console.log('[MOMO CALLBACK] Trích xuất orderCode từ extraData:', orderCode);
          } catch (error) {
            console.error('[MOMO CALLBACK] Lỗi giải mã extraData:', error);
          }
        }

        // Nếu không có orderCode từ extraData, thử từ các nguồn khác
        if (!orderCode) {
          if (req.body.orderInfo && req.body.orderInfo.includes('DH')) {
            const match = req.body.orderInfo.match(/DH\d+/);
            if (match) orderCode = match[0];
          }
        }

        if (!orderCode) {
          console.error('[MOMO CALLBACK] Không thể xác định mã đơn hàng từ callback MoMo');
          return;
        }

        // Kiểm tra kết quả thanh toán từ MoMo
        const resultCode = req.body.resultCode;

        if (resultCode === '0' || resultCode === 0) {
          console.log(`[MOMO CALLBACK] Thanh toán thành công cho đơn hàng ${orderCode}`);

          // Xử lý đơn hàng
          const transactionInfo = {
            transactionId: req.body.transId,
            amount: req.body.amount,
            responseTime: req.body.responseTime,
            message: req.body.message,
            payType: req.body.payType,
            signature: req.body.signature
          };

          // Sử dụng hàm xử lý chung
          const result = await processPaymentCallback(orderCode, 'MOMO', transactionInfo);

          if (result.success) {
            console.log(`[MOMO CALLBACK] Đã xử lý thành công thanh toán cho đơn hàng ${orderCode}`);
          } else {
            console.error(`[MOMO CALLBACK] Lỗi xử lý thanh toán: ${result.message}`);
          }
        } else {
          console.log(`[MOMO CALLBACK] Thanh toán thất bại cho đơn hàng ${orderCode}, mã lỗi: ${resultCode}`);

          // Cập nhật trạng thái thanh toán thất bại
          const order = await Order.findOne({ orderCode });
          if (order) {
            order.payment.status = 'FAILED';
            order.payment.transactionInfo = req.body;
            await order.save();
            console.log(`[MOMO CALLBACK] Đã cập nhật trạng thái thất bại cho đơn hàng ${orderCode}`);
          }
        }
      } catch (error) {
        console.error('[MOMO CALLBACK] Lỗi xử lý background:', error);
      }
    }, 0);

  } catch (error) {
    console.error('[MOMO CALLBACK] Lỗi xử lý callback MoMo:', error);
    // Luôn trả về 200 để MoMo không gửi lại
    return res.status(200).json({ message: 'Lỗi xử lý nhưng đã xác nhận' });
  }
};

/**
 * Xử lý callback từ VNPAY
 */
exports.vnpayCallback = async (req, res, next) => {
  try {
    console.log('[VNPAY CALLBACK] Dữ liệu nhận được:', req.query);

    // Lấy cấu hình VNPAY
    const vnpayConfig = await PaymentMethod.findOne({ code: 'VNPAY', isActive: true });
    if (!vnpayConfig) {
      console.error('[VNPAY CALLBACK] Không tìm thấy cấu hình VNPAY');
      return res.redirect(`${process.env.CLIENT_URL}/payment/result?status=error&message=Phương thức thanh toán VNPAY không khả dụng`);
    }

    // Khởi tạo VnpayService
    const vnpayService = new VnpayService(vnpayConfig.config);

    // Kiểm tra trực tiếp mã phản hồi
    const responseCode = req.query.vnp_ResponseCode;
    const isSuccess = responseCode === '00';

    // Nếu không thành công, chuyển hướng ngay
    if (!isSuccess) {
      console.log(`[VNPAY CALLBACK] Thanh toán không thành công, vnp_ResponseCode=${responseCode}`);
      return res.redirect(`${process.env.CLIENT_URL}/payment/result?status=error&message=Thanh toán không thành công&code=${responseCode}`);
    }

    // Xử lý callback
    const result = await vnpayService.processCallback(req.query);
    console.log('[VNPAY CALLBACK] Kết quả xử lý callback VNPAY:', result);

    if (result.success) {
      // Lấy mã đơn hàng từ kết quả hoặc từ vnp_TxnRef
      let orderCode = result.orderCode || req.query.vnp_TxnRef;
      console.log('[VNPAY CALLBACK] Tìm đơn hàng với mã:', orderCode);

      // Nếu không có mã đơn hàng, thử tìm trong OrderInfo
      if (!orderCode && req.query.vnp_OrderInfo) {
        const match = req.query.vnp_OrderInfo.match(/DH\d+/);
        if (match) {
          orderCode = match[0];
          console.log('[VNPAY CALLBACK] Tìm thấy mã đơn hàng trong vnp_OrderInfo:', orderCode);
        }
      }

      if (!orderCode) {
        console.error('[VNPAY CALLBACK] Không thể xác định mã đơn hàng từ callback VNPAY');
        return res.redirect(`${process.env.CLIENT_URL}/payment/result?status=error&message=Không thể xác định mã đơn hàng`);
      }

      // Xử lý đơn hàng với thông tin giao dịch
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

      // Kiểm tra xem đã gửi thông báo chưa
      if ((processResult.wasAlreadyCompleted || processResult.success) && !processResult.notified) {
        try {
          const order = await Order.findOne({ orderCode });
          if (order && order.payment.status === 'COMPLETED') {
            // Gửi thông báo nếu chưa được gửi từ processPaymentCallback
            const notification = new Notification({
              type: 'new-order',
              orderId: order._id,
              orderCode: order.orderCode,
              title: `Đơn hàng mới #${order.orderCode} (Đã thanh toán qua VNPAY)`,
              description: `Đơn hàng từ ${order.shippingAddress.fullName} - ${order.total.toLocaleString()} VND`,
              status: order.status,
              forAdmin: true,
              read: false
            });

            await notification.save();

            await socketManager.notifyNewOrder({
              _id: order._id.toString(),
              orderId: order._id.toString(),
              orderCode: order.orderCode,
              total: order.total,
              status: order.status,
              type: 'new-order',
              timestamp: new Date(),
              customerName: order.shippingAddress.fullName,
              customerPhone: order.shippingAddress.phone,
              paymentMethod: 'VNPAY',
              notificationId: notification._id.toString(),
              isPaid: true
            });

            console.log(`[VNPAY CALLBACK] Đã gửi thông báo đơn hàng #${order.orderCode} sau khi thanh toán thành công`);
          }
        } catch (notifyError) {
          console.error('[VNPAY CALLBACK] Lỗi khi gửi thông báo sau thanh toán:', notifyError);
        }
      }

      // Chuyển hướng về trang kết quả với trạng thái thành công
      return res.redirect(`${process.env.CLIENT_URL}/payment/result?status=success&orderCode=${orderCode}`);
    } else {
      // Xử lý thất bại
      console.error('[VNPAY CALLBACK] Thanh toán VNPAY thất bại:', result.message);
      return res.redirect(`${process.env.CLIENT_URL}/payment/result?status=error&message=${encodeURIComponent(result.message)}`);
    }
  } catch (error) {
    console.error('[VNPAY CALLBACK] Lỗi xử lý callback từ VNPAY:', error);
    return res.redirect(`${process.env.CLIENT_URL}/payment/result?status=error&message=Lỗi xử lý thanh toán`);
  }
};