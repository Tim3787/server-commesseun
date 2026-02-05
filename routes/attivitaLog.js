const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');

// Middleware per ottenere l'id utente dal token JWT
const getUserIdFromToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Accesso negato. Nessun token fornito.');
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id; // Salva l'id utente decodificato nella richiesta
    next();
  } catch (err) {
    res.status(403).send('Token non valido.', err);
  }
};
// Rotta per aggiornare lo stato dell'attività
router.put('/update-status/:id', getUserIdFromToken, async (req, res) => {
  const { id } = req.params;
  const { stato } = req.body;
  const userId = req.userId;

  if (stato === undefined || ![0, 1, 2].includes(stato)) {
    return res.status(400).send('Stato non valido.');
  }

  try {
    await db.query('UPDATE attivita_commessa SET stato = ? WHERE id = ?', [stato, id]);

    await db.query(
      'INSERT INTO activity_status_log (attivita_commessa_id, stato, updated_by) VALUES (?, ?, ?)',
      [id, stato, userId]
    );

    res.status(200).send('Stato aggiornato con successo.');
  } catch (err) {
    console.error("Errore durante l'aggiornamento dello stato:", err);
    res.status(500).send("Errore durante l'aggiornamento dello stato.");
  }
});

module.exports = router;
