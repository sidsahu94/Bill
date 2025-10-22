// backend/db.js
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.resolve(__dirname, '..', 'bill.db');
const db = new Database(dbPath);

// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    username TEXT,
    password TEXT,
    verified INTEGER DEFAULT 0,
    otp TEXT,
    otp_expiry INTEGER
  );
`);

// Products table
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    sku TEXT,
    price REAL,
    stock INTEGER,
    gst REAL,
    lowStockThreshold INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Customers table
db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    email TEXT,
    contact TEXT,
    address TEXT,
    gstin TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Bills table - using camelCase fields to match controllers/frontend
db.exec(`
  CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    invoiceNumber TEXT,
    customer_id INTEGER,
    date TEXT,
    totalAmount REAL,
    paymentMethod TEXT,
    items TEXT,
    discount REAL DEFAULT 0,
    createdAt TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );
`);

// Add some useful indexes
db.exec(`CREATE INDEX IF NOT EXISTS idx_bills_user_date ON bills (user_id, date);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_products_user ON products (user_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_customers_user ON customers (user_id);`);

module.exports = db;
