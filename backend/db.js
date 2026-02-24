// backend/db.js
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '..', 'bill.db');
const db = new Database(dbPath);

// Enable strict mode and foreign keys
db.pragma('journal_mode = WAL'); // Better concurrency
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    verified INTEGER DEFAULT 0,
    otp TEXT,
    otp_expiry INTEGER
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sku TEXT NOT NULL,
    price REAL CHECK(price >= 0),
    stock INTEGER CHECK(stock >= 0), -- Critical constraint to prevent negative stock
    gst REAL DEFAULT 0,
    hsn_code TEXT,
    lowStockThreshold INTEGER DEFAULT 10,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, sku)
  );

  CREATE TABLE IF NOT EXISTS inventory_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    change_amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    contact TEXT,
    address TEXT,
    gstin TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    invoiceNumber TEXT NOT NULL,
    customer_id INTEGER,
    date TEXT NOT NULL,
    totalAmount REAL CHECK(totalAmount >= 0),
    paymentMethod TEXT NOT NULL,
    items TEXT NOT NULL,
    discount REAL DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    UNIQUE(user_id, invoiceNumber)
  );
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_bills_user_date ON bills (user_id, date);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_products_user ON products (user_id);`);

module.exports = db;