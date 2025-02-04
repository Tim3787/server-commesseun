const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Ottieni tutte le prenotazioni
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM prenotazioni_sale');
    res.json(rows);
  } catch (error) {
    console.error('Errore nel recupero delle prenotazioni:', error);
    res.status(500).send('Errore durante il recupero delle prenotazioni.');
  }
});

// Aggiungi una nuova prenotazione
router.post('/', async (req, res) => {
  const { salaId, dataOra, durata, descrizione, utente } = req.body;

  if (!salaId || !dataOra || !durata || !descrizione || !utente) {
    return res.status(400).send('Tutti i campi sono obbligatori.');
  }

  try {
    const result = await db.query(
      'INSERT INTO prenotazioni_sale (salaId, dataOra, durata, descrizione, utente) VALUES (?, ?, ?, ?, ?)',
      [salaId, dataOra, durata, descrizione, utente]
    );
    res.status(201).json({ id: result[0].insertId, salaId, dataOra, durata, descrizione, utente });
  } catch (error) {
    console.error('Errore durante l\'aggiunta della prenotazione:', error);
    res.status(500).send('Errore durante l\'aggiunta della prenotazione.');
  }
});

module.exports = router;
