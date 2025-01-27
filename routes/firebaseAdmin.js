const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(require("../path-to-service-account-key.json")), // Sostituisci con il percorso del file JSON scaricato da Firebase
});

module.exports = admin;
