// backend/routes/analytics.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middlewares/auth');

// 1. MAIN INTELLIGENCE DASHBOARD ROUTE
router.get('/', auth, (req, res) => {
  try {
    const userId = req.user.id;
    
    const bills = db.prepare('SELECT * FROM bills WHERE user_id = ? ORDER BY date DESC').all(userId);
    const products = db.prepare('SELECT id, name, stock, lowStockThreshold FROM products WHERE user_id = ?').all(userId);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    let totalRevenue = 0;
    let currentMonthRevenue = 0;
    let lastMonthRevenue = 0;
    
    const monthMap = {};
    const productSalesMap = {}; 
    const paymentCount = {};

    bills.forEach(b => {
      const billDate = new Date(b.date || b.createdAt);
      const mName = billDate.toLocaleString('default', { month: 'short', year: 'numeric' });
      const bTotal = Number(b.totalAmount) || 0;

      totalRevenue += bTotal;
      monthMap[mName] = (monthMap[mName] || 0) + bTotal;

      if (billDate.getMonth() === currentMonth && billDate.getFullYear() === currentYear) {
        currentMonthRevenue += bTotal;
      } else if (
        (billDate.getMonth() === currentMonth - 1 && billDate.getFullYear() === currentYear) ||
        (currentMonth === 0 && billDate.getMonth() === 11 && billDate.getFullYear() === currentYear - 1)
      ) {
        lastMonthRevenue += bTotal;
      }

      const items = JSON.parse(b.items || '[]');
      items.forEach(item => {
        productSalesMap[item.productId] = (productSalesMap[item.productId] || 0) + Number(item.qty || 0);
      });
      paymentCount[b.paymentMethod || 'Unknown'] = (paymentCount[b.paymentMethod || 'Unknown'] || 0) + 1;
    });

    let growthPercent = 0;
    if (lastMonthRevenue > 0) {
      growthPercent = ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;
    } else if (currentMonthRevenue > 0) {
      growthPercent = 100; 
    }

    const smartAlerts = [];
    const topProductsArr = [];

    products.forEach(p => {
      const qtySold = productSalesMap[p.id] || 0;
      topProductsArr.push({ name: p.name, qty: qtySold });

      const dailyBurnRate = qtySold / 30; 
      let daysUntilStockout = 999;

      if (dailyBurnRate > 0) {
        daysUntilStockout = Math.floor(p.stock / dailyBurnRate);
      }

      if (p.stock === 0) {
        smartAlerts.push({ type: 'danger', message: `🚨 <b>${p.name}</b> is completely out of stock!` });
      } else if (p.stock <= p.lowStockThreshold) {
        smartAlerts.push({ type: 'warning', message: `⚠️ <b>${p.name}</b> is critically low (${p.stock} left).` });
      } else if (daysUntilStockout < 7) {
        smartAlerts.push({ type: 'info', message: `📈 High Demand: <b>${p.name}</b> will run out in approx. ${daysUntilStockout} days based on current sales velocity.` });
      }
    });

    topProductsArr.sort((a, b) => b.qty - a.qty);

    const sortedMonths = Object.keys(monthMap).reverse().slice(-6); 
    const sortedRevenues = sortedMonths.map(m => monthMap[m]);

    res.json({
      totalRevenue,
      currentMonthRevenue,
      growthPercent: growthPercent.toFixed(1),
      totalBills: bills.length,
      avgSale: bills.length ? (totalRevenue / bills.length) : 0,
      smartAlerts: smartAlerts.slice(0, 5), 
      revenueByMonth: { labels: sortedMonths, values: sortedRevenues },
      topProducts: { 
        labels: topProductsArr.slice(0, 5).map(p => p.name), 
        values: topProductsArr.slice(0, 5).map(p => p.qty) 
      },
      paymentModes: { labels: Object.keys(paymentCount), values: Object.values(paymentCount) }
    });
  } catch (err) {
    console.error('[ANALYTICS] Engine error:', err);
    res.status(500).json({ message: 'Analytics Engine Failed' });
  }
});

// 2. NEW: CSV EXPORT REPORT ENGINE
router.get('/export', auth, (req, res) => {
  try {
    const userId = req.user.id;
    
    // Join bills with customers for a complete report
    const bills = db.prepare(`
      SELECT b.invoiceNumber, b.date, c.name as customerName, b.totalAmount, b.paymentMethod, b.discount
      FROM bills b
      LEFT JOIN customers c ON b.customer_id = c.id
      WHERE b.user_id = ?
      ORDER BY b.date DESC
    `).all(userId);

    // Build CSV Header
    let csv = 'Invoice Number,Date,Customer Name,Payment Method,Discount (Rs),Total Amount (Rs)\n';
    
    // Build CSV Rows safely escaping strings
    bills.forEach(b => {
      const dateStr = new Date(b.date).toLocaleDateString('en-IN');
      const custName = b.customerName ? `"${b.customerName.replace(/"/g, '""')}"` : '"Walk-in Customer"';
      csv += `${b.invoiceNumber},${dateStr},${custName},${b.paymentMethod},${(b.discount||0).toFixed(2)},${(b.totalAmount||0).toFixed(2)}\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment(`Financial_Report_${new Date().toISOString().slice(0,10)}.csv`);
    return res.send(csv);

  } catch (err) {
    console.error('[ANALYTICS EXPORT] error:', err);
    res.status(500).json({ message: 'Failed to generate report' });
  }
});

module.exports = router;