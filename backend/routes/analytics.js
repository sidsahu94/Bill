// backend/routes/analytics.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middlewares/auth');

// 1. MAIN INTELLIGENCE DASHBOARD ROUTE
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Fetch data asynchronously from PostgreSQL
    const { rows: bills } = await db.query('SELECT * FROM bills WHERE user_id = $1 ORDER BY date DESC', [userId]);
    const { rows: products } = await db.query('SELECT id, name, stock, lowstockthreshold as "lowStockThreshold" FROM products WHERE user_id = $1', [userId]);

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
      const billDate = new Date(b.date);
      const mName = billDate.toLocaleString('default', { month: 'short', year: 'numeric' });
      
      // PostgreSQL might return column names in lowercase, so we check both
      const bTotal = Number(b.totalamount) || Number(b.totalAmount) || 0;

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

      // Parse JSONB items safely
      let items = [];
      try { 
        items = typeof b.items === 'string' ? JSON.parse(b.items) : b.items; 
      } catch(e) {
        console.error('Failed to parse items for bill:', b.id);
      }
      
      if(Array.isArray(items)){
         items.forEach(item => {
           productSalesMap[item.productId] = (productSalesMap[item.productId] || 0) + Number(item.qty || 0);
         });
      }

      const payMethod = b.paymentmethod || b.paymentMethod || 'Unknown';
      paymentCount[payMethod] = (paymentCount[payMethod] || 0) + 1;
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
      
      const threshold = Number(p.lowStockThreshold) || 10;

      if (p.stock === 0) {
        smartAlerts.push({ type: 'danger', message: `${p.name} is completely out of stock!` });
      } else if (p.stock <= threshold) {
        smartAlerts.push({ type: 'warning', message: `${p.name} is critically low (${p.stock} units remaining).` });
      }
    });

    topProductsArr.sort((a, b) => b.qty - a.qty);
    
    // Get last 6 months for chart
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

// 2. CSV EXPORT REPORT ENGINE
router.get('/export', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Join bills with customers for a complete report using PostgreSQL syntax
    const { rows: bills } = await db.query(`
      SELECT b.invoicenumber as "invoiceNumber", b.date, c.name as "customerName", 
             b.totalamount as "totalAmount", b.paymentmethod as "paymentMethod", b.discount
      FROM bills b 
      LEFT JOIN customers c ON b.customer_id = c.id
      WHERE b.user_id = $1 
      ORDER BY b.date DESC
    `, [userId]);

    // Build CSV Header
    let csv = 'Invoice Number,Date,Customer Name,Payment Method,Discount (Rs),Total Amount (Rs)\n';
    
    // Build CSV Rows safely escaping strings
    bills.forEach(b => {
      const dateStr = new Date(b.date).toLocaleDateString('en-IN');
      const custName = b.customerName ? `"${b.customerName.replace(/"/g, '""')}"` : '"Standard Walk-in"';
      const tot = Number(b.totalAmount || 0).toFixed(2);
      const disc = Number(b.discount || 0).toFixed(2);
      const meth = b.paymentMethod || 'N/A';
      const inv = b.invoiceNumber || 'N/A';
      
      csv += `${inv},${dateStr},${custName},${meth},${disc},${tot}\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment(`Financial_Ledger_Export_${new Date().toISOString().slice(0,10)}.csv`);
    return res.send(csv);

  } catch (err) {
    console.error('[ANALYTICS EXPORT] error:', err);
    res.status(500).json({ message: 'Failed to generate report' });
  }
});

module.exports = router;