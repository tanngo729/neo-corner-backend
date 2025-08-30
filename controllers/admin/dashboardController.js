// controllers/admin/dashboardController.js
const Order = require('../../models/Order');
const Product = require('../../models/Product');
const Customer = require('../../models/Customer');
const { ApiError } = require('../../utils/errorHandler');
const ApiResponse = require('../../utils/apiResponder');
const mongoose = require('mongoose');
const moment = require('moment');

// Lấy thống kê tổng quan cho dashboard
exports.getStats = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    // Xây dựng điều kiện lọc theo ngày nếu có
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Lấy thống kê đơn hàng
    const orderStats = await Order.aggregate([
      { $match: { ...dateFilter } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
          pendingOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0]
            }
          },
          processingOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'PROCESSING'] }, 1, 0]
            }
          },
          shippingOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'SHIPPING'] }, 1, 0]
            }
          },
          deliveredOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'DELIVERED'] }, 1, 0]
            }
          },
          completedOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0]
            }
          },
          cancelledOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0]
            }
          },
          refundedOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'REFUNDED'] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Lấy số lượng khách hàng
    const totalCustomers = await Customer.countDocuments();

    // Lấy số lượng sản phẩm
    const totalProducts = await Product.countDocuments();

    // Lấy số lượng sản phẩm có stock < 5
    const lowStockProducts = await Product.countDocuments({ stock: { $lt: 5 } });

    // Tính toán doanh thu so với kỳ trước nếu có dateFilter
    let revenueComparison = null;
    if (startDate && endDate) {
      // Tính khoảng thời gian
      const start = moment(startDate);
      const end = moment(endDate);
      const duration = moment.duration(end.diff(start)).asDays();

      // Tính khoảng thời gian trước đó
      const prevStart = start.clone().subtract(duration, 'days');
      const prevEnd = start.clone().subtract(1, 'days');

      // Lấy doanh thu của khoảng thời gian trước đó
      const prevRevenueData = await Order.aggregate([
        {
          $match: {
            createdAt: {
              $gte: prevStart.toDate(),
              $lte: prevEnd.toDate()
            },
            status: { $nin: ['CANCELLED', 'REFUNDED'] }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$total' }
          }
        }
      ]);

      const prevRevenue = prevRevenueData.length > 0 ? prevRevenueData[0].totalRevenue : 0;
      const currentRevenue = orderStats.length > 0 ? orderStats[0].totalRevenue : 0;

      if (prevRevenue > 0) {
        revenueComparison = {
          percentChange: ((currentRevenue - prevRevenue) / prevRevenue) * 100,
          increased: currentRevenue > prevRevenue
        };
      }
    }

    // Xây dựng đối tượng thống kê trả về
    const stats = {
      totalOrders: orderStats.length > 0 ? orderStats[0].totalOrders : 0,
      totalRevenue: orderStats.length > 0 ? orderStats[0].totalRevenue : 0,
      totalCustomers,
      totalProducts,
      lowStockProducts,
      pendingOrders: orderStats.length > 0 ? orderStats[0].pendingOrders : 0,
      processingOrders: orderStats.length > 0 ? orderStats[0].processingOrders : 0,
      shippingOrders: orderStats.length > 0 ? orderStats[0].shippingOrders : 0,
      deliveredOrders: orderStats.length > 0 ? orderStats[0].deliveredOrders : 0,
      completedOrders: orderStats.length > 0 ? orderStats[0].completedOrders : 0,
      cancelledOrders: orderStats.length > 0 ? orderStats[0].cancelledOrders : 0,
      refundedOrders: orderStats.length > 0 ? orderStats[0].refundedOrders : 0,
      revenueComparison
    };

    return ApiResponse.success(res, 200, stats, 'Lấy thống kê dashboard thành công');
  } catch (error) {
    next(error);
  }
};

// Lấy dữ liệu biểu đồ doanh thu theo ngày
exports.getSalesChart = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    // Mặc định lấy dữ liệu 30 ngày gần nhất nếu không có ngày bắt đầu và kết thúc
    const endDateObj = endDate ? new Date(endDate) : new Date();
    const startDateObj = startDate ? new Date(startDate) : new Date(endDateObj.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Format lại ngày để đảm bảo kết quả chính xác
    endDateObj.setHours(23, 59, 59, 999);
    startDateObj.setHours(0, 0, 0, 0);

    // Lấy dữ liệu bán hàng theo ngày
    const salesData = await Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDateObj,
            $lte: endDateObj
          },
          status: { $nin: ['CANCELLED', 'REFUNDED'] }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          value: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Xử lý dữ liệu để đảm bảo đầy đủ các ngày trong khoảng (không bỏ sót ngày không có doanh thu)
    const dateMap = {};

    // Tạo mảng ngày đầy đủ từ startDate đến endDate
    let currentDate = new Date(startDateObj);
    while (currentDate <= endDateObj) {
      const dateString = moment(currentDate).format('YYYY-MM-DD');
      dateMap[dateString] = {
        date: dateString,
        value: 0,
        orders: 0
      };
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Cập nhật dữ liệu từ kết quả aggregate
    salesData.forEach(item => {
      dateMap[item._id] = {
        date: item._id,
        value: item.value,
        orders: item.orders
      };
    });

    // Chuyển đổi thành mảng để trả về
    const result = Object.values(dateMap);

    return ApiResponse.success(res, 200, result, 'Lấy dữ liệu biểu đồ doanh thu thành công');
  } catch (error) {
    next(error);
  }
};

// Lấy danh sách đơn hàng gần đây
exports.getRecentOrders = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user', 'fullName email phone')
      .lean();

    return ApiResponse.success(res, 200, recentOrders, 'Lấy danh sách đơn hàng gần đây thành công');
  } catch (error) {
    next(error);
  }
};

// Lấy danh sách sản phẩm bán chạy
exports.getTopProducts = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const limit = parseInt(req.query.limit) || 5;

    // Xây dựng điều kiện lọc theo ngày nếu có
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Thêm điều kiện chỉ lấy đơn hàng đã hoàn thành hoặc đang giao
    const statusFilter = {
      status: { $in: ['COMPLETED', 'DELIVERED', 'SHIPPING'] }
    };

    // Lấy danh sách sản phẩm bán chạy dựa trên số lượng
    const topProducts = await Order.aggregate([
      {
        $match: {
          ...dateFilter,
          ...statusFilter
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          sold: { $sum: '$items.quantity' },
          revenue: {
            $sum: { $multiply: ['$items.price', '$items.quantity'] }
          }
        }
      },
      { $sort: { sold: -1 } },
      { $limit: limit }
    ]);

    // Bổ sung thông tin sản phẩm
    const productIds = topProducts.map(item => item._id);
    const productDetails = await Product.find({ _id: { $in: productIds } })
      .select('name slug images')
      .lean();

    // Map thông tin chi tiết
    const productMap = {};
    productDetails.forEach(product => {
      productMap[product._id.toString()] = product;
    });

    // Bổ sung thông tin vào kết quả
    const result = topProducts.map(item => {
      const productId = item._id.toString();
      const product = productMap[productId] || {};

      return {
        id: productId,
        name: item.name || product.name || 'Sản phẩm không xác định',
        slug: product.slug,
        image: product.images && product.images.length > 0 ? product.images[0].url : null,
        sold: item.sold,
        revenue: item.revenue
      };
    });

    return ApiResponse.success(res, 200, result, 'Lấy danh sách sản phẩm bán chạy thành công');
  } catch (error) {
    next(error);
  }
};

// Lấy danh sách khách hàng tiềm năng
exports.getTopCustomers = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const limit = parseInt(req.query.limit) || 5;

    // Xây dựng điều kiện lọc theo ngày nếu có
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Lấy danh sách khách hàng có tổng tiền chi tiêu cao nhất
    const topCustomers = await Order.aggregate([
      {
        $match: {
          ...dateFilter,
          status: { $nin: ['CANCELLED', 'REFUNDED'] }
        }
      },
      {
        $group: {
          _id: '$user',
          orders: { $sum: 1 },
          spent: { $sum: '$total' }
        }
      },
      { $sort: { spent: -1 } },
      { $limit: limit }
    ]);

    // Bổ sung thông tin khách hàng
    const customerIds = topCustomers.map(item => item._id);
    const customerDetails = await Customer.find({ _id: { $in: customerIds } })
      .select('fullName email phone')
      .lean();

    // Map thông tin chi tiết
    const customerMap = {};
    customerDetails.forEach(customer => {
      customerMap[customer._id.toString()] = customer;
    });

    // Bổ sung thông tin vào kết quả
    const result = topCustomers.map(item => {
      const customerId = item._id.toString();
      const customer = customerMap[customerId] || {};

      return {
        id: customerId,
        name: customer.fullName || 'Khách hàng không xác định',
        email: customer.email || 'N/A',
        phone: customer.phone || 'N/A',
        orders: item.orders,
        spent: item.spent
      };
    });

    return ApiResponse.success(res, 200, result, 'Lấy danh sách khách hàng tiềm năng thành công');
  } catch (error) {
    next(error);
  }
};

// Lấy dữ liệu phân bố trạng thái đơn hàng
exports.getOrderStatusDistribution = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    // Xây dựng điều kiện lọc theo ngày nếu có
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Lấy dữ liệu phân bố trạng thái
    const statusDistribution = await Order.aggregate([
      { $match: { ...dateFilter } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Xây dựng đối tượng kết quả đầy đủ
    const statusMap = {
      'PENDING': { color: '#1890ff' },
      'AWAITING_PAYMENT': { color: '#faad14' },
      'PROCESSING': { color: '#52c41a' },
      'SHIPPING': { color: '#722ed1' },
      'DELIVERED': { color: '#13c2c2' },
      'COMPLETED': { color: '#52c41a' },
      'CANCELLED': { color: '#f5222d' },
      'REFUNDED': { color: '#fa541c' }
    };

    // Format kết quả
    const result = statusDistribution.map(item => ({
      status: item._id,
      value: item.count,
      color: statusMap[item._id]?.color || '#d9d9d9'
    }));

    return ApiResponse.success(res, 200, result, 'Lấy dữ liệu phân bố trạng thái thành công');
  } catch (error) {
    next(error);
  }
};

// Lấy tất cả dữ liệu dashboard một lần - ĐÃ ĐƯỢC SỬA
exports.getDashboardData = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    // Định nghĩa điều kiện lọc chung theo ngày
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Định nghĩa các promises để truy vấn dữ liệu

    // 1. Promise cho thống kê tổng quan
    const statsPromise = Promise.all([
      // Lấy thống kê đơn hàng
      Order.aggregate([
        { $match: { ...dateFilter } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$total' },
            pendingOrders: {
              $sum: {
                $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0]
              }
            },
            processingOrders: {
              $sum: {
                $cond: [{ $eq: ['$status', 'PROCESSING'] }, 1, 0]
              }
            },
            shippingOrders: {
              $sum: {
                $cond: [{ $eq: ['$status', 'SHIPPING'] }, 1, 0]
              }
            },
            deliveredOrders: {
              $sum: {
                $cond: [{ $eq: ['$status', 'DELIVERED'] }, 1, 0]
              }
            },
            completedOrders: {
              $sum: {
                $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0]
              }
            },
            cancelledOrders: {
              $sum: {
                $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0]
              }
            },
            refundedOrders: {
              $sum: {
                $cond: [{ $eq: ['$status', 'REFUNDED'] }, 1, 0]
              }
            }
          }
        }
      ]),
      // Lấy số lượng khách hàng
      Customer.countDocuments(),
      // Lấy số lượng sản phẩm
      Product.countDocuments(),
      // Lấy số lượng sản phẩm có stock < 5
      Product.countDocuments({ stock: { $lt: 5 } })
    ]);

    // 2. Promise cho dữ liệu biểu đồ doanh thu
    const endDateObj = endDate ? new Date(endDate) : new Date();
    const startDateObj = startDate ? new Date(startDate) : new Date(endDateObj.getTime() - 30 * 24 * 60 * 60 * 1000);
    endDateObj.setHours(23, 59, 59, 999);
    startDateObj.setHours(0, 0, 0, 0);

    const salesDataPromise = Order.aggregate([
      {
        $match: {
          createdAt: {
            $gte: startDateObj,
            $lte: endDateObj
          },
          status: { $nin: ['CANCELLED', 'REFUNDED'] }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          value: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // 3. Promise cho danh sách đơn hàng gần đây
    const recentOrdersPromise = Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('user', 'fullName email phone')
      .lean();

    // 4. Promise cho danh sách sản phẩm bán chạy
    const topProductsPromise = Order.aggregate([
      {
        $match: {
          ...dateFilter,
          status: { $in: ['COMPLETED', 'DELIVERED', 'SHIPPING'] }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          sold: { $sum: '$items.quantity' },
          revenue: {
            $sum: { $multiply: ['$items.price', '$items.quantity'] }
          }
        }
      },
      { $sort: { sold: -1 } },
      { $limit: 5 }
    ]);

    // 5. Promise cho danh sách khách hàng tiềm năng
    const topCustomersPromise = Order.aggregate([
      {
        $match: {
          ...dateFilter,
          status: { $nin: ['CANCELLED', 'REFUNDED'] }
        }
      },
      {
        $group: {
          _id: '$user',
          orders: { $sum: 1 },
          spent: { $sum: '$total' }
        }
      },
      { $sort: { spent: -1 } },
      { $limit: 5 }
    ]);

    // 6. Promise cho phân bố trạng thái đơn hàng
    const statusDistributionPromise = Order.aggregate([
      { $match: { ...dateFilter } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Gọi tất cả Promise và xử lý kết quả
    const [
      [orderStatsResult, totalCustomers, totalProducts, lowStockProducts],
      salesDataRaw,
      recentOrders,
      topProductsRaw,
      topCustomersRaw,
      statusDistributionRaw
    ] = await Promise.all([
      statsPromise,
      salesDataPromise,
      recentOrdersPromise,
      topProductsPromise,
      topCustomersPromise,
      statusDistributionPromise
    ]);

    // Xử lý dữ liệu thống kê
    const orderStats = orderStatsResult[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      pendingOrders: 0,
      processingOrders: 0,
      shippingOrders: 0,
      deliveredOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      refundedOrders: 0
    };

    // Tính toán doanh thu so với kỳ trước
    let revenueComparison = null;
    if (startDate && endDate) {
      const start = moment(startDate);
      const end = moment(endDate);
      const duration = moment.duration(end.diff(start)).asDays();
      const prevStart = start.clone().subtract(duration, 'days');
      const prevEnd = start.clone().subtract(1, 'days');

      const prevRevenueData = await Order.aggregate([
        {
          $match: {
            createdAt: {
              $gte: prevStart.toDate(),
              $lte: prevEnd.toDate()
            },
            status: { $nin: ['CANCELLED', 'REFUNDED'] }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$total' }
          }
        }
      ]);

      const prevRevenue = prevRevenueData.length > 0 ? prevRevenueData[0].totalRevenue : 0;
      const currentRevenue = orderStats.totalRevenue || 0;

      if (prevRevenue > 0) {
        revenueComparison = {
          percentChange: ((currentRevenue - prevRevenue) / prevRevenue) * 100,
          increased: currentRevenue > prevRevenue
        };
      }
    }

    // Hoàn thiện thống kê
    const stats = {
      totalOrders: orderStats.totalOrders || 0,
      totalRevenue: orderStats.totalRevenue || 0,
      totalCustomers,
      totalProducts,
      lowStockProducts,
      pendingOrders: orderStats.pendingOrders || 0,
      processingOrders: orderStats.processingOrders || 0,
      shippingOrders: orderStats.shippingOrders || 0,
      deliveredOrders: orderStats.deliveredOrders || 0,
      completedOrders: orderStats.completedOrders || 0,
      cancelledOrders: orderStats.cancelledOrders || 0,
      refundedOrders: orderStats.refundedOrders || 0,
      revenueComparison
    };

    // Xử lý dữ liệu biểu đồ doanh thu
    const dateMap = {};
    let currentDate = new Date(startDateObj);
    while (currentDate <= endDateObj) {
      const dateString = moment(currentDate).format('YYYY-MM-DD');
      dateMap[dateString] = {
        date: dateString,
        value: 0,
        orders: 0
      };
      currentDate.setDate(currentDate.getDate() + 1);
    }
    salesDataRaw.forEach(item => {
      dateMap[item._id] = {
        date: item._id,
        value: item.value,
        orders: item.orders
      };
    });
    const salesData = Object.values(dateMap);

    // Xử lý danh sách sản phẩm bán chạy
    const productIds = topProductsRaw.map(item => item._id);
    let productDetails = [];
    if (productIds.length > 0) {
      productDetails = await Product.find({ _id: { $in: productIds } })
        .select('name slug images')
        .lean();
    }

    const productMap = {};
    productDetails.forEach(product => {
      productMap[product._id.toString()] = product;
    });

    const topProducts = topProductsRaw.map(item => {
      const productId = item._id.toString();
      const product = productMap[productId] || {};
      return {
        id: productId,
        name: item.name || product.name || 'Sản phẩm không xác định',
        slug: product.slug,
        image: product.images && product.images.length > 0 ? product.images[0].url : null,
        sold: item.sold,
        revenue: item.revenue
      };
    });

    // Xử lý danh sách khách hàng tiềm năng
    const customerIds = topCustomersRaw.map(item => item._id);
    let customerDetails = [];
    if (customerIds.length > 0) {
      customerDetails = await Customer.find({ _id: { $in: customerIds } })
        .select('fullName email phone')
        .lean();
    }

    const customerMap = {};
    customerDetails.forEach(customer => {
      customerMap[customer._id.toString()] = customer;
    });

    const topCustomers = topCustomersRaw.map(item => {
      const customerId = item._id.toString();
      const customer = customerMap[customerId] || {};
      return {
        id: customerId,
        name: customer.fullName || 'Khách hàng không xác định',
        email: customer.email || 'N/A',
        phone: customer.phone || 'N/A',
        orders: item.orders,
        spent: item.spent
      };
    });

    // Xử lý phân bố trạng thái
    const statusMap = {
      'PENDING': { color: '#1890ff' },
      'AWAITING_PAYMENT': { color: '#faad14' },
      'PROCESSING': { color: '#52c41a' },
      'SHIPPING': { color: '#722ed1' },
      'DELIVERED': { color: '#13c2c2' },
      'COMPLETED': { color: '#52c41a' },
      'CANCELLED': { color: '#f5222d' },
      'REFUNDED': { color: '#fa541c' }
    };
    const statusDistribution = statusDistributionRaw.map(item => ({
      status: item._id,
      value: item.count,
      color: statusMap[item._id]?.color || '#d9d9d9'
    }));

    // Tổng hợp dữ liệu
    const dashboardData = {
      stats,
      salesData,
      recentOrders,
      topProducts,
      topCustomers,
      statusDistribution
    };

    return ApiResponse.success(res, 200, dashboardData, 'Lấy dữ liệu dashboard thành công');
  } catch (error) {
    next(error);
  }
};