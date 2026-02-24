// backend/db.js
const { Pool } = require('pg');
require('dotenv').config();

// Strip the conflicting "?sslmode=require" from the Neon URL 
// because the 'pg' library handles SSL via the config object below.
let safeConnectionString = process.env.DATABASE_URL || '';
if (safeConnectionString.includes('?')) {
  safeConnectionString = safeConnectionString.split('?')[0];
}

// Connect to the free Neon.tech PostgreSQL database
const pool = new Pool({
  connectionString: safeConnectionString,
  ssl: {
    rejectUnauthorized: false // Required for secure cloud connections
  }
});

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        verified INTEGER DEFAULT 0,
        otp VARCHAR(10),
        otp_expiry BIGINT
      );
      
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255),
        sku VARCHAR(100),
        price NUMERIC(10, 2),
        stock INTEGER DEFAULT 0,
        gst NUMERIC(5, 2) DEFAULT 0,
        lowStockThreshold INTEGER DEFAULT 10
      );

      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255),
        email VARCHAR(255),
        contact VARCHAR(50),
        address TEXT,
        gstin VARCHAR(50)
      );

      CREATE TABLE IF NOT EXISTS bills (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        invoiceNumber VARCHAR(100),
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        discount NUMERIC(10, 2) DEFAULT 0,
        discountType VARCHAR(20) DEFAULT 'flat',
        paymentMethod VARCHAR(50),
        totalAmount NUMERIC(10, 2),
        items JSONB,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255),
        gstin VARCHAR(50),
        address TEXT
      );
    `);
    console.log("[DATABASE] Cloud PostgreSQL Initialized Successfully.");
  } catch (err) {
    console.error("[DATABASE] Initialization Failed. Check DATABASE_URL.", err);
  }
}

initDb();

module.exports = {
  query: (text, params) => pool.query(text, params),
};