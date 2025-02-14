
const mysql = require("mysql2/promise");

const db = mysql.createPool({
  host: "database-1.ct2yk8ewuzpb.eu-north-1.rds.amazonaws.com",
  user: "commesseun",
  password: "66548765443",
  database: "gestione_commesse",
  port: 3306,
  timezone: "Z", // Forza UTC
});

module.exports = db;