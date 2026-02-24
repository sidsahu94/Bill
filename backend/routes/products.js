// backend/routes/products.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middlewares/auth');

// Get all products for user
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM products WHERE user_id = $1 ORDER BY id DESC', [req.user.id]);
    res.json(rows);
  } catch (err) {
    console.error('[PRODUCTS] GET error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch products' });
  }
});

// Create product
router.post('/', auth, async (req, res) => {
  try {
    const { name, sku, price, stock, gst, lowStockThreshold } = req.body;
    if (!name || !sku) return res.status(400).json({ error: 'VALIDATION', message: 'Name and SKU required' });

    await db.query(
      `INSERT INTO products (user_id, name, sku, price, stock, gst, lowStockThreshold) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.user.id, name, sku, price || 0, stock || 0, gst || 0, lowStockThreshold || 10]
    );
    res.status(201).json({ success: true, message: 'Product created' });
  } catch (err) {
    console.error('[PRODUCTS] POST error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create product' });
  }
});

// Update product
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, sku, price, stock, gst, lowStockThreshold } = req.body;
    await db.query(
      `UPDATE products 
       SET name = $1, sku = $2, price = $3, stock = $4, gst = $5, lowStockThreshold = $6 
       WHERE id = $7 AND user_id = $8`,
      [name, sku, price, stock, gst, lowStockThreshold, req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Product updated' });
  } catch (err) {
    console.error('[PRODUCTS] PUT error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update product' });
  }
});

// Delete product
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM products WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    console.error('[PRODUCTS] DELETE error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to delete product' });
  }
});

module.exports = router;