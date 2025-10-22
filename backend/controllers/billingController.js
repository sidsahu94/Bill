// backend/controllers/billingController.js
const db = require('../db');

function getNextInvoiceNumber(userId) {
  const todayKey = new Date().toISOString().slice(0,10).replace(/-/g,'');
  // count bills for user today (uses date stored in 'date' column)
  const countRow = db.prepare('SELECT COUNT(*) as c FROM bills WHERE user_id = ? AND date(date)=date("now")').get(userId);
  const count = countRow ? (countRow.c || 0) : 0;
  const seq = String(count + 1).padStart(3, '0');
  return `INV-${todayKey}-${seq}`;
}

exports.createBill = (req, res) => {
  try {
    const userId = req.user.id;
    const { invoiceNumber, customerId, items, discount = 0, paymentMethod = 'Cash', date } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'Items required' });

    // validate customer belongs to user (if provided)
    if (customerId) {
      const cust = db.prepare('SELECT id FROM customers WHERE id = ? AND user_id = ?').get(customerId, userId);
      if (!cust) return res.status(400).json({ message: 'Customer not found' });
    }

    // enrich items and update stock
    let totalAmount = 0;
    const enriched = [];
    const productStmt = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?');
    const updateStockStmt = db.prepare('UPDATE products SET stock = ? WHERE id = ?');

    for (const it of items) {
      const prod = productStmt.get(it.productId, userId);
      if (!prod) return res.status(400).json({ message: `Product ${it.productId} not found` });
      const qty = Number(it.qty || it.quantity) || 0;
      if (qty <= 0) return res.status(400).json({ message: `Invalid qty for product ${prod.name}` });
      if (qty > Number(prod.stock || 0)) return res.status(400).json({ message: `Insufficient stock for ${prod.name}` });
      const price = Number(it.price ?? prod.price) || 0;
      const gst = Number(it.gst ?? prod.gst) || 0;
      const subtotal = price * qty;
      const gstAmount = subtotal * (gst / 100);
      const itemTotal = subtotal + gstAmount;
      enriched.push({ productId: prod.id, sku: prod.sku, name: prod.name, price, gst, qty, subtotal, itemTotal });
      totalAmount += itemTotal;
      updateStockStmt.run(Number(prod.stock) - qty, prod.id);
    }

    // apply discount
    let finalTotal = totalAmount;
    const disc = Number(discount || 0);
    if (disc > 0 && disc <= 100) finalTotal = totalAmount * (1 - disc / 100);
    else if (disc > 100) finalTotal = Math.max(0, totalAmount - disc);

    const inv = invoiceNumber || getNextInvoiceNumber(userId);
    const createdAt = new Date().toISOString();
    const dateVal = date || createdAt;

    const info = db.prepare(
      `INSERT INTO bills 
        (user_id, invoiceNumber, customer_id, items, discount, paymentMethod, totalAmount, date, createdAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      inv,
      customerId || null,
      JSON.stringify(enriched),
      disc,
      paymentMethod,
      Number(finalTotal.toFixed(2)),
      dateVal,
      createdAt
    );

    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(info.lastInsertRowid);
    bill.items = JSON.parse(bill.items || '[]');

    // attach customer object for convenience (if present)
    if (bill.customer_id) {
      const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(bill.customer_id);
      bill.customer = cust || null;
    } else {
      bill.customer = null;
    }

    res.json({ success: true, bill });
  } catch (err) {
    console.error('createBill error', err);
    res.status(500).json({ message: err.message || 'Server error' });
  }
};

exports.getBills = (req, res) => {
  try {
    const userId = req.user.id;
    const rows = db.prepare('SELECT * FROM bills WHERE user_id = ? ORDER BY createdAt DESC').all(userId);
    rows.forEach(r => {
      r.items = JSON.parse(r.items || '[]');
      if (r.customer_id) {
        const cust = db.prepare('SELECT * FROM customers WHERE id = ?').get(r.customer_id);
        r.customer = cust || null;
      } else r.customer = null;
    });
    res.json(rows);
  } catch (err) {
    console.error('getBills error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getBillById = (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    const bill = db.prepare('SELECT * FROM bills WHERE user_id = ? AND (id = ? OR invoiceNumber = ?)').get(userId, id, id);
    if (!bill) return res.status(404).json({ message: 'Bill not found' });
    bill.items = JSON.parse(bill.items || '[]');
    if (bill.customer_id) {
      bill.customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(bill.customer_id);
    } else bill.customer = null;
    res.json(bill);
  } catch (err) {
    console.error('getBillById error', err);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteBill = (req, res) => {
  try {
    const userId = req.user.id;
    const id = req.params.id;
    db.prepare('DELETE FROM bills WHERE user_id = ? AND (id = ? OR invoiceNumber = ?)').run(userId, id, id);
    res.json({ success: true });
  } catch (err) {
    console.error('deleteBill error', err);
    res.status(500).json({ message: 'Server error' });
  }
};
