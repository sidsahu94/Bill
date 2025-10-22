// migrate_db.js
// Usage: node migrate_db.js
// This script will:
//  - create a backup bill.db.bak
//  - add missing columns to users/products/customers/bills
//  - copy values from old snake_case columns (if any) to new camelCase columns

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, 'bill.db');
if (!fs.existsSync(dbPath)) {
  console.error('No bill.db found at', dbPath);
  process.exit(1);
}

// backup
const bak = dbPath + '.bak';
fs.copyFileSync(dbPath, bak);
console.log('Created backup:', bak);

const db = new Database(dbPath);

function getColumns(table) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.map(r => r.name);
}

function addColumnIfMissing(table, columnDef) {
  // columnDef is like "name TEXT DEFAULT ''"
  const col = columnDef.split(/\s+/)[0];
  const cols = getColumns(table);
  if (!cols.includes(col)) {
    console.log(`Adding column ${col} to ${table}`);
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`).run();
  } else {
    console.log(`Column ${col} already exists on ${table}`);
  }
}

// USERS
const usersCols = getColumns('users');
console.log('users columns before:', usersCols);

addColumnIfMissing('users', 'name TEXT');
addColumnIfMissing('users', 'username TEXT');
addColumnIfMissing('users', 'verified INTEGER DEFAULT 0');
addColumnIfMissing('users', 'otp TEXT');
addColumnIfMissing('users', 'otp_expiry INTEGER');

console.log('users columns after:', getColumns('users'));

// PRODUCTS
try {
  const productsCols = getColumns('products');
  console.log('products columns before:', productsCols);

  addColumnIfMissing('products', 'lowStockThreshold INTEGER DEFAULT 10');

  console.log('products columns after:', getColumns('products'));
} catch (err) {
  console.warn('products table check failed (maybe table missing):', err.message);
}

// CUSTOMERS
try {
  const customersCols = getColumns('customers');
  console.log('customers columns before:', customersCols);

  addColumnIfMissing('customers', 'gstin TEXT');

  console.log('customers columns after:', getColumns('customers'));
} catch (err) {
  console.warn('customers table check failed (maybe table missing):', err.message);
}

// BILLS table: ensure camelCase columns exist and migrate old snake_case if present
try {
  const billsCols = getColumns('bills');
  console.log('bills columns before:', billsCols);

  // Add new columns that controllers expect
  addColumnIfMissing('bills', 'invoiceNumber TEXT');
  addColumnIfMissing('bills', 'totalAmount REAL');
  addColumnIfMissing('bills', 'paymentMethod TEXT');
  addColumnIfMissing('bills', 'discount REAL DEFAULT 0');
  addColumnIfMissing('bills', 'createdAt TEXT');

  // Try copying from old snake_case to new camelCase if needed
  const has = (c) => getColumns('bills').includes(c);

  if (has('invoice_number') && has('invoiceNumber')) {
    console.log('Copying invoice_number -> invoiceNumber');
    db.prepare(`UPDATE bills SET invoiceNumber = invoice_number WHERE invoiceNumber IS NULL OR invoiceNumber = ''`).run();
  }
  if (has('total') && has('totalAmount')) {
    console.log('Copying total -> totalAmount');
    db.prepare(`UPDATE bills SET totalAmount = total WHERE totalAmount IS NULL`).run();
  }
  if (has('payment_method') && has('paymentMethod')) {
    console.log('Copying payment_method -> paymentMethod');
    db.prepare(`UPDATE bills SET paymentMethod = payment_method WHERE paymentMethod IS NULL OR paymentMethod = ''`).run();
  }

  console.log('bills columns after:', getColumns('bills'));
} catch (err) {
  console.warn('bills table check failed (maybe table missing):', err.message);
}

// Sanity: print counts
try {
  const u = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  console.log('users count:', u);
} catch (e) { console.warn('Cannot count users:', e.message); }

try {
  const p = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  console.log('products count:', p);
} catch (e) { console.warn('Cannot count products:', e.message); }

try {
  const b = db.prepare('SELECT COUNT(*) as c FROM bills').get().c;
  console.log('bills count:', b);
} catch (e) { console.warn('Cannot count bills:', e.message); }

console.log('Migration finished. Please restart the server.');
db.close();
