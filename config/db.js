const mysql = require("mysql2/promise");

const db = mysql.createPool({
  host: "217.154.6.43",  // IP del tuo VPS IONOS
  user: "Tim3787",  // Il tuo nome utente MySQL
  password: "rRRhrhry8883j@5ddw_!",  // La password corretta
  database: "gestione_commesse",  // Il nome del tuo database
  port: 3306,  // Porta predefinita per MySQL
  timezone: "Z",  // Forza UTC
});

module.exports = db;
