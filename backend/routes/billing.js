// backend/routes/billing.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const auth = require('../middlewares/auth');

// ==========================================
// 1. GET LEDGER (PAGINATED & FILTERED)
// ==========================================
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', date = '', payment = '' } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Dynamic Query Builder
    let baseQuery = `
      FROM bills b 
      LEFT JOIN customers c ON b.customer_id = c.id 
      WHERE b.user_id = $1
    `;
    const params = [req.user.id];
    let paramIdx = 2;

    // Apply Search Filter (ILIKE for case-insensitive Postgres search)
    if (search) {
      baseQuery += ` AND (b.invoicenumber ILIKE $${paramIdx} OR c.name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }
    
    // Apply Date Filter
    if (date) {
      baseQuery += ` AND DATE(b.date) = $${paramIdx}`;
      params.push(date);
      paramIdx++;
    }
    
    // Apply Payment Method Filter
    if (payment) {
      baseQuery += ` AND b.paymentmethod = $${paramIdx}`;
      params.push(payment);
      paramIdx++;
    }

    // 1. Get Total Count for Pagination UI
    const { rows: countRows } = await db.query(`SELECT COUNT(*) ${baseQuery}`, params);
    const totalItems = parseInt(countRows[0].count);

    // 2. Fetch Chunked Data
    const dataQuery = `
      SELECT b.*, 
             c.name as customer_name, c.contact as customer_contact,
             c.email as customer_email, c.gstin as customer_gstin,
             c.address as customer_address
      ${baseQuery}
      ORDER BY b.date DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;
    
    const dataParams = [...params, Number(limit), offset];
    const { rows } = await db.query(dataQuery, dataParams);

    // Format the response
    const formattedBills = rows.map(bill => {
      let parsedItems = [];
      try { parsedItems = typeof bill.items === 'string' ? JSON.parse(bill.items) : bill.items; } catch(e){}
      
      return {
        id: bill.id,
        invoiceNumber: bill.invoicenumber || bill.invoiceNumber,
        totalAmount: Number(bill.totalamount || bill.totalAmount || 0),
        paymentMethod: bill.paymentmethod || bill.paymentMethod,
        discount: Number(bill.discount || 0),
        discountType: bill.discounttype || bill.discountType,
        date: bill.date,
        items: parsedItems,
        customer_id: bill.customer_id,
        customer: bill.customer_id ? { 
          name: bill.customer_name, contact: bill.customer_contact,
          email: bill.customer_email, gstin: bill.customer_gstin, address: bill.customer_address
        } : null
      };
    });

    res.json({
      data: formattedBills,
      pagination: {
        total: totalItems,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(totalItems / Number(limit)),
        hasMore: (offset + rows.length) < totalItems
      }
    });

  } catch (err) {
    console.error('[BILLING] GET error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to fetch ledger' });
  }
});

// ==========================================
// 2. CREATE INVOICE (TRANSACTIONAL)
// ==========================================
router.post('/create', auth, async (req, res) => {
  await db.query('BEGIN');
  try {
    const { invoiceNumber, customerId, discount, discountType, paymentMethod, items } = req.body;
    
    if (!items || items.length === 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'VALIDATION', message: 'No items provided' });
    }

    let grandTotal = 0;
    const finalItems = [];

    for (let item of items) {
      const { rows: prodRows } = await db.query('SELECT * FROM products WHERE id = $1 AND user_id = $2 FOR UPDATE', [item.productId, req.user.id]);
      const product = prodRows[0];
      
      if (!product) throw new Error(`Product ID ${item.productId} not found`);
      if (product.stock < item.qty) throw new Error(`Insufficient stock for ${product.name}`);

      await db.query('UPDATE products SET stock = stock - $1 WHERE id = $2 AND user_id = $3', [item.qty, product.id, req.user.id]);

      const subtotal = Number(product.price) * Number(item.qty);
      const gstAmount = subtotal * (Number(product.gst) / 100);
      grandTotal += (subtotal + gstAmount);

      finalItems.push({
        productId: product.id, name: product.name, sku: product.sku,
        price: Number(product.price), gst: Number(product.gst), qty: Number(item.qty)
      });
    }

    const discInput = Number(discount) || 0;
    if (discInput > 0) {
      if (discountType === 'percentage') {
        if (discInput > 100) throw new Error('Percentage discount cannot exceed 100%');
        grandTotal -= (grandTotal * (discInput / 100));
      } else {
        if (discInput > grandTotal) throw new Error('Flat discount cannot exceed total');
        grandTotal -= discInput;
      }
    }
    grandTotal = Math.max(0, grandTotal);

    await db.query(
      `INSERT INTO bills (user_id, invoiceNumber, customer_id, discount, discountType, paymentMethod, totalAmount, items, date) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [ req.user.id, invoiceNumber, customerId || null, discInput, discountType, paymentMethod, grandTotal, JSON.stringify(finalItems), new Date().toISOString() ]
    );

    await db.query('COMMIT');
    res.json({ success: true, message: 'Transaction processed successfully' });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('[BILLING] Transaction Error:', err.message);
    res.status(400).json({ error: 'TRANSACTION_FAILED', message: err.message });
  }
});

// ==========================================
// 3. VOID INVOICE
// ==========================================
router.delete('/:id', auth, async (req, res) => {
  await db.query('BEGIN');
  try {
    const { rows } = await db.query('SELECT items FROM bills WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.params.id, req.user.id]);
    const bill = rows[0];
    
    if (!bill) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Document not found' });
    }

    let items = [];
    try { items = typeof bill.items === 'string' ? JSON.parse(bill.items) : bill.items; } catch(e){}

    for (let item of items) {
      if (item.productId) {
        await db.query('UPDATE products SET stock = stock + $1 WHERE id = $2 AND user_id = $3', [item.qty, item.productId, req.user.id]);
      }
    }

    await db.query('DELETE FROM bills WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    await db.query('COMMIT');
    res.json({ success: true, message: 'Document voided and assets returned to registry.' });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('[BILLING] Delete error:', err);
    res.status(500).json({ error: 'SERVER_ERROR', message: 'Failed to void document' });
  }
});

module.exports = router;