// routes/admin/paymentSettingsRoutes.js
const express = require('express');
const router = express.Router();
const paymentMethodController = require('../../controllers/admin/paymentMethodController');
const shippingMethodController = require('../../controllers/admin/shippingMethodController');
const { authenticate, authorize } = require('../../middlewares/authMiddleware');

// Middleware xác thực
router.use(authenticate);

// Phương thức thanh toán
router.get('/payment-methods',
  authorize('settings.payment.view'),
  paymentMethodController.getAllPaymentMethods
);

router.get('/payment-methods/:code',
  authorize('settings.payment.view'),
  paymentMethodController.getPaymentMethodByCode
);

router.put('/payment-methods/:code',
  authorize('settings.payment.edit'),
  paymentMethodController.updatePaymentMethod
);

// Bank account routes - chỉ dành cho BANK_TRANSFER
router.post('/payment-methods/bank-transfer/accounts',
  authorize('settings.payment.edit'),
  paymentMethodController.addBankAccount
);

router.delete('/payment-methods/bank-transfer/accounts/:accountIndex',
  authorize('settings.payment.edit'),
  paymentMethodController.removeBankAccount
);

router.put('/payment-methods/bank-transfer/accounts/:accountIndex/default',
  authorize('settings.payment.edit'),
  paymentMethodController.setDefaultBankAccount
);

// Phương thức vận chuyển
router.get('/shipping-methods',
  authorize('settings.shipping.view'),
  shippingMethodController.getAllShippingMethods
);

router.get('/shipping-methods/:code',
  authorize('settings.shipping.view'),
  shippingMethodController.getShippingMethodByCode
);

router.post('/shipping-methods',
  authorize('settings.shipping.edit'),
  shippingMethodController.createShippingMethod
);

router.put('/shipping-methods/:code',
  authorize('settings.shipping.edit'),
  shippingMethodController.updateShippingMethod
);

router.delete('/shipping-methods/:code',
  authorize('settings.shipping.edit'),
  shippingMethodController.deleteShippingMethod
);

// Region fee routes
router.post('/shipping-methods/:code/regions',
  authorize('settings.shipping.edit'),
  shippingMethodController.addRegionFee
);

router.put('/shipping-methods/:code/regions/:regionCode',
  authorize('settings.shipping.edit'),
  shippingMethodController.updateRegionFee
);

router.delete('/shipping-methods/:code/regions/:regionCode',
  authorize('settings.shipping.edit'),
  shippingMethodController.removeRegionFee
);

module.exports = router;