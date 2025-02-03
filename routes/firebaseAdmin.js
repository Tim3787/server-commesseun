const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(require("../commesseun-firebase-adminsdk-fbsvc-2ea2e5c207.json")), // Sostituisci con il percorso del file JSON scaricato da Firebase
});

module.exports = admin;
