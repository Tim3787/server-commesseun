const mysql = require("mysql2/promise");

const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "La_Mia_Passwor@1",
  database: "gestione_commesse",
  timezone: "Z", // Forza UTC
});

module.exports = db;