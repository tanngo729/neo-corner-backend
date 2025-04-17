// routes/index.js
const express = require('express');

// Import admin routes
const adminProductRoutes = require('./admin/productRoutes');
const adminDashboardRoutes = require('./admin/dashboardRoutes');
const adminCategoryRoutes = require('./admin/categoryRoutes');
const adminUserRoutes = require('./admin/userRoutes');
const adminRoleRoutes = require('./admin/roleRoutes');
const adminAuthRoutes = require('./admin/authRoutes');
const adminProfileRoutes = require('./admin/profileRoutes');
const adminSettingsRoutes = require('./admin/settingsRoutes');
const adminCustomerRoutes = require('./admin/customerRoutes');
const adminPaymentSettingsRoutes = require('./admin/paymentSettingsRoutes');
const adminOrderRoutes = require('./admin/orderRoutes');
const adminNotificationRoutes = require('./admin/notificationRoutes');

// Import client routes
const clientProductRoutes = require('./client/productRoutes');
const clientCategoryRoutes = require('./client/categoryRoutes');
const clientAuthRoutes = require('./client/authRoutes');
const clientOrderRoutes = require('./client/orderRoutes');
const clientCartRoutes = require('./client/cartRoutes');
const clientCheckoutRoutes = require('./client/checkoutRoutes');
const clientPaymentRoutes = require('./client/paymentRoutes');
const clientCallbackRoutes = require('./client/callbackRoutes');
const clientNotificationRoutes = require('./client/notificationRoutes');

// Nhóm routes admin
const adminRouter = express.Router();
adminRouter.use('/auth', adminAuthRoutes);
adminRouter.use('/dashboard', adminDashboardRoutes);
adminRouter.use('/profile', adminProfileRoutes);
adminRouter.use('/users', adminUserRoutes);
adminRouter.use('/roles', adminRoleRoutes);
adminRouter.use('/products', adminProductRoutes);
adminRouter.use('/categories', adminCategoryRoutes);
adminRouter.use('/settings', adminSettingsRoutes);
adminRouter.use('/customers', adminCustomerRoutes);
adminRouter.use('/payment-settings', adminPaymentSettingsRoutes);
adminRouter.use('/orders', adminOrderRoutes);
adminRouter.use('/notifications', adminNotificationRoutes);

// Nhóm routes client
const clientRouter = express.Router();
clientRouter.use('/products', clientProductRoutes);
clientRouter.use('/categories', clientCategoryRoutes);
clientRouter.use('/auth', clientAuthRoutes);
clientRouter.use('/orders', clientOrderRoutes);
clientRouter.use('/cart', clientCartRoutes);
clientRouter.use('/checkout', clientCheckoutRoutes);
clientRouter.use('/payment', clientPaymentRoutes);
clientRouter.use('/callback', clientCallbackRoutes);
clientRouter.use('/notifications', clientNotificationRoutes);

module.exports = {
  adminRouter,
  clientRouter
};