// backend/routes/customers.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middlewares/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM customers WHERE user_id = $1 ORDER BY id DESC', [req.user.id]);
    res.json(rows);
  } catch (err) {
    console.error('[CUSTOMERS] GET error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch customers' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { name, email, contact, address, gstin } = req.body;
    if (!name) return res.status(400).json({ error: 'VALIDATION', message: 'Name is required' });

    await db.query(
      `INSERT INTO customers (user_id, name, email, contact, address, gstin) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.user.id, name, email || '', contact || '', address || '', gstin || '']
    );
    res.status(201).json({ success: true, message: 'Customer created' });
  } catch (err) {
    console.error('[CUSTOMERS] POST error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to create customer' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { name, email, contact, address, gstin } = req.body;
    await db.query(
      `UPDATE customers 
       SET name = $1, email = $2, contact = $3, address = $4, gstin = $5 
       WHERE id = $6 AND user_id = $7`,
      [name, email, contact, address, gstin, req.params.id, req.user.id]
    );
    res.json({ success: true, message: 'Customer updated' });
  } catch (err) {
    console.error('[CUSTOMERS] PUT error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to update customer' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM customers WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true, message: 'Customer deleted' });
  } catch (err) {
    console.error('[CUSTOMERS] DELETE error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to delete customer' });
  }
});

module.exports = router;