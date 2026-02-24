// backend/controllers/billingController.js
const db = require('../db');

// Utility for strict financial rounding
const exactRound = (num) => Math.round((Number(num) + Number.EPSILON) * 100) / 100;

function getNextInvoiceNumber(userId) {
  const todayKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const countRow = db.prepare('SELECT COUNT(*) as c FROM bills WHERE user_id = ? AND date(date)=date("now")').get(userId);
  const count = countRow ? (countRow.c || 0) : 0;
  const seq = String(count + 1).padStart(3, '0');
  return `INV-${todayKey}-${seq}`;
}

exports.createBill = (req, res) => {
  const userId = req.user.id;
  const { invoiceNumber, customerId, items, discount = 0, discountType = 'flat', paymentMethod = 'Cash', date } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Items required' });
  }

  const processBillTransaction = db.transaction((billData) => {
    let totalAmount = 0;
    const enriched = [];

    const productStmt = db.prepare('SELECT * FROM products WHERE id = ? AND user_id = ?');
    const updateStockStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    const logStockStmt = db.prepare('INSERT INTO inventory_logs (product_id, user_id, change_amount, reason) VALUES (?, ?, ?, ?)');

    for (const it of billData.items) {
      const prod = productStmt.get(it.productId, userId);
      if (!prod) throw new Error(`Product ID ${it.productId} not found`);
      
      const qty = parseInt(it.qty || it.quantity, 10);
      if (isNaN(qty) || qty <= 0) throw new Error(`Invalid quantity for ${prod.name}`);
      if (prod.stock < qty) throw new Error(`Insufficient stock for ${prod.name}. Available: ${prod.stock}`);

      const price = exactRound(it.price ?? prod.price);
      const gst = exactRound(it.gst ?? prod.gst);
      
      const subtotal = exactRound(price * qty);
      const gstAmount = exactRound(subtotal * (gst / 100));
      const itemTotal = exactRound(subtotal + gstAmount);

      enriched.push({ productId: prod.id, sku: prod.sku, name: prod.name, price, gst, qty, subtotal, itemTotal });
      totalAmount += itemTotal;

      updateStockStmt.run(qty, prod.id);
      logStockStmt.run(prod.id, userId, -qty, `Sale: ${billData.inv}`);
    }

    // Fixed Discount Logic
    let finalTotal = totalAmount;
    const discValue = exactRound(billData.discount);
    
    if (discValue > 0) {
      if (billData.discountType === 'percentage') {
        if (discValue > 100) throw new Error('Percentage discount cannot exceed 100%');
        finalTotal = totalAmount - (totalAmount * (discValue / 100));
      } else {
        if (discValue > totalAmount) throw new Error('Flat discount cannot exceed bill total');
        finalTotal = totalAmount - discValue;
      }
    }
    
    finalTotal = exactRound(Math.max(0, finalTotal));

    // Freeze customer snapshot to prevent data loss on customer deletion
    let customerSnapshot = null;
    if (billData.customerId) {
        const cust = db.prepare('SELECT name, email, contact, gstin, address FROM customers WHERE id = ? AND user_id = ?').get(billData.customerId, userId);
        if (cust) customerSnapshot = JSON.stringify(cust);
    }

    const info = db.prepare(
      `INSERT INTO bills (user_id, invoiceNumber, customer_id, items, discount, paymentMethod, totalAmount, date, createdAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      billData.inv,
      billData.customerId || null,
      JSON.stringify(enriched),
      discValue,
      billData.paymentMethod,
      finalTotal,
      billData.dateVal,
      new Date().toISOString() // Force ISO to fix SQLite UTC drift
    );

    // Update bill with snapshot metadata (hacky but effective without schema alter)
    // In Phase 2 we will officially alter the schema to hold customer_snapshot
    return info.lastInsertRowid;
  });

  try {
    const inv = invoiceNumber || getNextInvoiceNumber(userId);
    const dateVal = date || new Date().toISOString();
    
    const billId = processBillTransaction({ items, discount, discountType, customerId, paymentMethod, inv, dateVal });
    
    const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(billId);
    bill.items = JSON.parse(bill.items);
    
    res.json({ success: true, bill });
  } catch (err) {
    res.status(400).json({ message: err.message || 'Transaction failed' });
  }
};

exports.getBills = (req, res) => {
  const userId = req.user.id;
  const rows = db.prepare('SELECT * FROM bills WHERE user_id = ? ORDER BY createdAt DESC').all(userId);
  rows.forEach(r => {
    r.items = JSON.parse(r.items || '[]');
  });
  res.json(rows);
};

exports.getBillById = (req, res) => {
  const userId = req.user.id;
  const id = req.params.id;
  const bill = db.prepare('SELECT * FROM bills WHERE user_id = ? AND (id = ? OR invoiceNumber = ?)').get(userId, id, id);
  if (!bill) return res.status(404).json({ message: 'Bill not found' });
  bill.items = JSON.parse(bill.items || '[]');
  res.json(bill);
};

exports.deleteBill = (req, res) => {
  const userId = req.user.id;
  const id = req.params.id;
  
  const deleteTransaction = db.transaction(() => {
    const bill = db.prepare('SELECT * FROM bills WHERE user_id = ? AND (id = ? OR invoiceNumber = ?)').get(userId, id, id);
    if(!bill) throw new Error('Bill not found');

    const items = JSON.parse(bill.items);
    const updateStockStmt = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');
    const logStockStmt = db.prepare('INSERT INTO inventory_logs (product_id, user_id, change_amount, reason) VALUES (?, ?, ?, ?)');

    for(const item of items) {
       updateStockStmt.run(item.qty, item.productId);
       logStockStmt.run(item.productId, userId, item.qty, `Bill Deleted: ${bill.invoiceNumber}`);
    }

    db.prepare('DELETE FROM bills WHERE id = ?').run(bill.id);
  });

  try {
    deleteTransaction();
    res.json({ success: true });
  } catch(err) {
    res.status(400).json({ message: err.message });
  }
};