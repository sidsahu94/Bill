// backend/routes/analytics.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middlewares/auth');

router.get('/', auth, (req, res) => {
  try {
    const userId = req.user.id;
    const bills = db.prepare('SELECT * FROM bills WHERE user_id = ?').all(userId).map(r => ({ ...r, items: JSON.parse(r.items || '[]') }));

    if (!bills.length) {
      return res.json({
        totalRevenue: 0, totalBills: 0, avgSale: 0,
        revenueByMonth: { labels: [], values: [] },
        topProducts: { labels: [], values: [] },
        paymentModes: { labels: [], values: [] }
      });
    }

    const totalRevenue = bills.reduce((acc,b)=> acc + (Number(b.totalAmount) || 0), 0);
    const totalBills = bills.length;
    const avgSale = totalBills ? (totalRevenue / totalBills) : 0;

    // revenue by month
    const monthMap = {};
    bills.forEach(b => {
      const m = new Date(b.date || b.createdAt).toLocaleString('default', { month: 'short', year: 'numeric' });
      monthMap[m] = (monthMap[m] || 0) + (Number(b.totalAmount) || 0);
    });

    const productCount = {};
    bills.forEach(b => {
      (b.items || []).forEach(i => {
        const id = i.productId;
        productCount[id] = (productCount[id] || 0) + Number(i.qty || 0);
      });
    });

    // fetch product names (try to resolve)
    const topProductsArr = Object.entries(productCount).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([id, qty])=>{
      const p = db.prepare('SELECT name FROM products WHERE id = ? AND user_id = ?').get(id, userId);
      return { name: p ? p.name : `Product ${id}`, qty };
    });

    const paymentCount = {};
    bills.forEach(b => paymentCount[b.paymentMethod || 'Unknown'] = (paymentCount[b.paymentMethod || 'Unknown'] || 0) + 1);

    res.json({
      totalRevenue,
      totalBills,
      avgSale,
      revenueByMonth: { labels: Object.keys(monthMap), values: Object.values(monthMap) },
      topProducts: { labels: topProductsArr.map(p=>p.name), values: topProductsArr.map(p=>p.qty) },
      paymentModes: { labels: Object.keys(paymentCount), values: Object.values(paymentCount) }
    });
  } catch (err) {
    console.error('analytics error', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
