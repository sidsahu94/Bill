// backend/routes/settings.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../db');
const auth = require('../middlewares/auth');

const upload = multer({ dest: 'uploads/' });

// ==========================================
// 1. GET SETTINGS
// ==========================================
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT name, gstin, address FROM settings WHERE user_id = $1', [req.user.id]);
    res.json(rows[0] || {});
  } catch (err) {
    console.error('[SETTINGS] GET error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ==========================================
// 2. UPDATE SETTINGS
// ==========================================
router.post('/', auth, upload.none(), async (req, res) => {
  try {
    const { name, gstin, address } = req.body;
    
    await db.query(`
      INSERT INTO settings (user_id, name, gstin, address) 
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) 
      DO UPDATE SET name = EXCLUDED.name, gstin = EXCLUDED.gstin, address = EXCLUDED.address
    `, [req.user.id, name || '', gstin || '', address || '']);
    
    res.json({ success: true });
  } catch (err) {
    console.error('[SETTINGS] POST error:', err);
    res.status(500).json({ message: 'Failed to update settings' });
  }
});

// ==========================================
// 3. EXPORT SYSTEM SNAPSHOT
// ==========================================
router.get('/export', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [products, customers, bills, settings] = await Promise.all([
      db.query('SELECT * FROM products WHERE user_id = $1', [userId]),
      db.query('SELECT * FROM customers WHERE user_id = $1', [userId]),
      db.query('SELECT * FROM bills WHERE user_id = $1', [userId]),
      db.query('SELECT * FROM settings WHERE user_id = $1', [userId])
    ]);

    const backup = {
      timestamp: new Date().toISOString(),
      products: products.rows,
      customers: customers.rows,
      bills: bills.rows,
      settings: settings.rows[0] || {}
    };

    res.header('Content-Type', 'application/json');
    res.attachment(`Bill_Snapshot_${new Date().toISOString().slice(0,10)}.json`);
    res.send(JSON.stringify(backup, null, 2));
  } catch (err) {
    res.status(500).json({ message: 'Export failed' });
  }
});

// ==========================================
// 4. RESTORE SNAPSHOT (ID-MAPPING ENGINE)
// ==========================================
router.post('/import', auth, async (req, res) => {
  const userId = req.user.id;
  await db.query('BEGIN');
  
  try {
    const { products = [], customers = [], bills = [], settings = {} } = req.body;

    // 1. Purge Existing Data (Order matters to prevent foreign key locks)
    await db.query('DELETE FROM bills WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM products WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM customers WHERE user_id = $1', [userId]);

    // 2. Restore Settings
    if (settings && settings.name) {
      await db.query(`
        INSERT INTO settings (user_id, name, gstin, address) VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, gstin = EXCLUDED.gstin, address = EXCLUDED.address
      `, [userId, settings.name, settings.gstin, settings.address]);
    }

    // 3. Import Customers & Map IDs
    const customerIdMap = {}; // { old_id: new_id }
    for (const cust of customers) {
      const res = await db.query(`
        INSERT INTO customers (user_id, name, email, contact, address, gstin) 
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
      `, [userId, cust.name, cust.email, cust.contact, cust.address, cust.gstin]);
      
      customerIdMap[cust.id] = res.rows[0].id;
    }

    // 4. Import Products & Map IDs
    const productIdMap = {}; // { old_id: new_id }
    for (const prod of products) {
      const res = await db.query(`
        INSERT INTO products (user_id, name, sku, price, stock, gst, lowStockThreshold) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
      `, [
        userId, prod.name, prod.sku, prod.price, prod.stock, prod.gst, 
        prod.lowstockthreshold || prod.lowStockThreshold || 10
      ]);
      
      productIdMap[prod.id] = res.rows[0].id;
    }

    // 5. Import Bills & Rewrite Relational Links
    for (const bill of bills) {
      // Map the customer ID
      const newCustomerId = bill.customer_id ? (customerIdMap[bill.customer_id] || null) : null;
      
      // Parse items safely
      let items = [];
      try { items = typeof bill.items === 'string' ? JSON.parse(bill.items) : bill.items; } catch(e){}
      
      // Map product IDs inside the JSON items array
      const remappedItems = items.map(item => ({
        ...item,
        productId: productIdMap[item.productId] || item.productId // fallback if mapping fails
      }));

      // Insert rewritten bill
      await db.query(`
        INSERT INTO bills (user_id, invoiceNumber, customer_id, discount, discountType, paymentMethod, totalAmount, items, date) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        userId, 
        bill.invoicenumber || bill.invoiceNumber, 
        newCustomerId, 
        bill.discount, 
        bill.discounttype || bill.discountType, 
        bill.paymentmethod || bill.paymentMethod, 
        bill.totalamount || bill.totalAmount, 
        JSON.stringify(remappedItems), 
        bill.date
      ]);
    }
    
    await db.query('COMMIT');
    res.json({ success: true, message: 'Snapshot applied. Integrity maintained.' });
  } catch (err) {
    await db.query('ROLLBACK');
    console.error('[SETTINGS] Import Error:', err);
    res.status(500).json({ message: 'Import failed. Data restored to previous state.' });
  }
});

module.exports = router;