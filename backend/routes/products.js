// backend/routes/products.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middlewares/auth');

// GET products for logged-in user
router.get('/', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM products WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json(rows);
});

// POST add product
router.post('/', auth, (req, res) => {
  const { name, sku, price = 0, stock = 0, gst = 0, lowStockThreshold = 10 } = req.body;
  const info = db.prepare('INSERT INTO products (user_id, sku, name, price, stock, gst, lowStockThreshold) VALUES (?, ?, ?, ?, ?, ?, ?)').run(req.user.id, sku, name, price, stock, gst, lowStockThreshold);
  const created = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
  res.json({ success: true, product: created });
});

// PUT update product
router.put('/:id', auth, (req, res) => {
  const id = req.params.id;
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!p) return res.status(404).json({ message: 'Not found' });
  const { name, sku, price = 0, stock = 0, gst = 0, lowStockThreshold = 10 } = req.body;
  db.prepare('UPDATE products SET sku=?, name=?, price=?, stock=?, gst=?, lowStockThreshold=? WHERE id = ?').run(sku, name, price, stock, gst, lowStockThreshold, id);
  res.json({ success: true });
});

// DELETE
router.delete('/:id', auth, (req, res) => {
  const id = req.params.id;
  db.prepare('DELETE FROM products WHERE id = ? AND user_id = ?').run(id, req.user.id);
  res.json({ success: true });
});

module.exports = router;
