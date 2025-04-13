// models/PaymentMethod.js
const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    enum: ['COD', 'MOMO', 'VNPAY', 'BANK_TRANSFER']
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  icon: String,
  isActive: {
    type: Boolean,
    default: true
  },
  position: {
    type: Number,
    default: 0
  },
  config: {
    // COD config
    codExtraFee: {
      type: Number,
      default: 0
    },

    // MOMO config - demo
    momoPartnerCode: String,
    momoAccessKey: String,
    momoSecretKey: String,
    momoEndpoint: {
      type: String,
      default: 'https://test-payment.momo.vn/v2/gateway/api/create'
    },
    momoTestMode: {
      type: Boolean,
      default: true
    },

    // VNPAY config - demo
    vnpTmnCode: String,
    vnpHashSecret: String,
    vnpUrl: {
      type: String,
      default: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html'
    },
    vnpReturnUrl: String,
    vnpTestMode: {
      type: Boolean,
      default: true
    },

    // Bank transfer config
    bankAccounts: [{
      bankName: String,
      accountNumber: String,
      accountName: String,
      branch: String,
      isDefault: {
        type: Boolean,
        default: false
      }
    }]
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);