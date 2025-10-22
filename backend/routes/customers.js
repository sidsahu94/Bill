// backend/routes/customers.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middlewares/auth');

router.get('/', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM customers WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json(rows);
});

router.post('/', auth, (req, res) => {
  const { name, email, contact, address, gstin } = req.body;
  const info = db.prepare('INSERT INTO customers (user_id, name, email, contact, address, gstin) VALUES (?, ?, ?, ?, ?, ?)').run(req.user.id, name, email, contact, address, gstin);
  const created = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
  res.json({ success: true, customer: created });
});

router.put('/:id', auth, (req, res) => {
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return res.status(404).json({ message: 'Not found' });
  const { name, email, contact, address, gstin } = req.body;
  db.prepare('UPDATE customers SET name=?, email=?, contact=?, address=?, gstin=? WHERE id = ?').run(name, email, contact, address, gstin, id);
  res.json({ success: true });
});

router.delete('/:id', auth, (req, res) => {
  db.prepare('DELETE FROM customers WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

module.exports = router;
