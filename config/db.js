const mysql = require('mysql2/promise');

const DB_PASSWORD = process.env.DB_PASSWORD || process.env.DB_PASS;

if (!process.env.DB_HOST || !process.env.DB_USER || !DB_PASSWORD || !process.env.DB_NAME) {
  console.error('❌ Variabili DB mancanti (.env): DB_HOST, DB_USER, DB_PASSWORD/DB_PASS, DB_NAME');
  process.exit(1);
}

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  timezone: 'Z',
});

module.exports = db;
