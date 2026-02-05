const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const sendNotification = require('./sendNotification');
const { inviaNotificaCategoria } = require('../Utils/notificationManager');

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

// Recupera tutte le notifiche di un utente, con filtro opzionale per categoria
router.get('/', getUserIdFromToken, async (req, res) => {
  const userId = req.userId;
  const categoria = req.query.categoria;

  try {
    let query = 'SELECT * FROM notifications WHERE user_id = ?';
    const params = [userId];

    if (categoria) {
      query += ' AND categoria = ?';
      params.push(categoria);
    }

    query += ' ORDER BY created_at DESC';

    const [notifications] = await db.query(query, params);
    res.json(notifications);
  } catch (err) {
    console.error(`Errore nel recupero delle notifiche per l'utente ${userId}:`, err);
    res.status(500).send('Errore durante il recupero delle notifiche.');
  }
});

router.get('/global', async (req, res) => {
  try {
    const [notifications] = await db.query(
      'SELECT * FROM notifications WHERE user_id IS NULL ORDER BY created_at DESC'
    );
    res.json(notifications);
  } catch (err) {
    console.error('Errore nel recupero delle notifiche globali:', err);
    res.status(500).send('Errore durante il recupero delle notifiche globali.');
  }
});

// Crea una nuova notifica per l'utente
router.post('/', getUserIdFromToken, async (req, res) => {
  const userId = req.userId; // Ottieni l'id utente dal middleware
  const { message, titolo = null, categoria = 'generale' } = req.body;

  try {
    // Recupera il device_token associato all'utente
    const [user] = await db.query('SELECT device_token FROM users WHERE id = ?', [userId]);

    if (user.length === 0 || !user[0].device_token) {
      return res.status(400).send("Nessun dispositivo registrato per l'utente.");
    }

    const deviceToken = user[0].device_token;

    // Inserisci la notifica nel database

    await db.query(
      'INSERT INTO notifications (user_id, titolo, message, category, is_read, created_at) VALUES (?, ?, ?, ?, false, NOW())',
      [userId, titolo, message, categoria]
    );

    // Invia la notifica push
    await sendNotification(deviceToken, 'Nuova Notifica', message);

    res.status(201).send('Notifica creata e inviata con successo.');
  } catch (err) {
    console.error('Errore durante la creazione e invio della notifica:', err);
    res.status(500).send('Errore durante la creazione e invio della notifica.');
  }
});

// Elimina una notifica
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await db.query('DELETE FROM notifications WHERE id = ?', [id]);
    res.status(200).send('Notifica eliminata con successo.');
  } catch (err) {
    console.error("Errore durante l'eliminazione della notifica:", err);
    res.status(500).send("Errore durante l'eliminazione della notifica.");
  }
});

// PUT: Aggiorna solo le note
router.put('/:id/note', getUserIdFromToken, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;

  try {
    const [result] = await db.query('UPDATE attivita_commessa SET note = ? WHERE id = ?', [
      note || null,
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).send('Attività non trovata.');
    }

    res.status(200).json({ message: 'Note aggiornate con successo' });
  } catch (error) {
    console.error("Errore durante l'aggiornamento delle note:", error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
});

// Rotta per aggiornare lo stato di un'attività
router.put('/:id/stato', getUserIdFromToken, async (req, res) => {
  const { id } = req.params; // Ottieni l'id dell'attività
  const { stato } = req.body; // Stato richiesto: ad esempio 1 = Iniziata, 2 = Completata

  if (stato === undefined) {
    return res.status(400).send("Il campo 'stato' è obbligatorio.");
  }

  try {
    // Recupera i dettagli dell'attività
    const [activity] = await db.query(
      `
SELECT 
  ac.id, 
  ac.commessa_id, 
  ac.risorsa_id, 
  ac.attivita_id,
  c.numero_commessa, 
  ad.nome_attivita, 
  r.reparto_id,
  u.username AS nome_risorsa
FROM attivita_commessa ac
JOIN commesse c ON ac.commessa_id = c.id
JOIN attivita ad ON ac.attivita_id = ad.id
JOIN risorse r ON ac.risorsa_id = r.id
JOIN users u ON r.id = u.risorsa_id
WHERE ac.id = ?
    `,
      [id]
    );

    if (activity.length === 0) {
      return res.status(404).send('Attività non trovata.');
    }

    const numeroCommessa = activity[0].numero_commessa;
    const tipoAttivita = activity[0].nome_attivita;
    const repartoId = activity[0].reparto_id;
    // Non serve recuperare risorsaId in questo caso

    // Aggiorna lo stato dell'attività
    const [result] = await db.query('UPDATE attivita_commessa SET stato = ? WHERE id = ?', [
      stato,
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).send('Attività non trovata.');
    }

    // Costruisci il messaggio
    const nomeRisorsa = activity[0].nome_risorsa;
    const statoStr =
      stato === 1 ? 'Iniziata' : stato === 2 ? 'Completata' : `Aggiornata (${stato})`;
    const message = `${nomeRisorsa} ha aggiornato lo stato dell'attività ${tipoAttivita} della commessa ${numeroCommessa} a: ${statoStr}.`;

    await inviaNotificaCategoria({
      categoria: 'Stato attività',
      titolo: 'Aggiornamento attività',
      messaggio: message,
      // QUALE COMMESSA
      commessaId: activity[0].commessa_id,
      // CHI HA COMPLETATO L'ATTIVITA'
      repartoId: repartoId,
      // includi globali true manda la notifica in base alla tabella, false guarda i destinatari del repartoId
      includiGlobali: false,
    });

    res.status(200).send("Stato dell'attività aggiornato con successo.");
  } catch (err) {
    console.error("Errore durante l'aggiornamento dello stato dell'attività:", err);
    res.status(500).send("Errore durante l'aggiornamento dello stato dell'attività.");
  }
});

// Elimina tutte le notifiche per una determinata risorsa
router.delete('/utente/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const [result] = await db.query('DELETE FROM notifications WHERE user_id = ?', [userId]);

    if (result.affectedRows > 0) {
      res.status(200).send('Notifiche eliminate con successo.');
    } else {
      res.status(404).send('Nessuna notifica trovata per questo userId.');
    }
  } catch (err) {
    console.error("Errore durante l'eliminazione delle notifiche:", err);
    res.status(500).send("Errore durante l'eliminazione delle notifiche.");
  }
});

router.put('/:id/read', getUserIdFromToken, async (req, res) => {
  const { id } = req.params; // Ottieni l'id della notifica
  try {
    await db.query('UPDATE notifications SET is_read = TRUE WHERE id = ?', [id]);
    res.status(200).send('Notifica contrassegnata come letta.');
  } catch (err) {
    console.error("Errore durante l'aggiornamento della notifica:", err);
    res.status(500).send("Errore durante l'aggiornamento della notifica.");
  }
});

router.get('/count', getUserIdFromToken, async (req, res) => {
  const userId = req.userId; // Ottieni l'id utente dal middleware
  try {
    const [result] = await db.query(
      'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?',
      [userId]
    );
    res.json(result[0]);
  } catch (err) {
    console.error('Errore durante il conteggio delle notifiche:', err);
    res.status(500).send('Errore durante il conteggio delle notifiche.');
  }
});

router.get('/unread', getUserIdFromToken, async (req, res) => {
  const userId = req.userId; // Ottieni l'id utente dal middleware
  try {
    const [notifications] = await db.query(
      'SELECT * FROM notifications WHERE user_id = ? AND is_read = FALSE ORDER BY created_at DESC',
      [userId]
    );
    res.json(notifications);
  } catch (err) {
    console.error('Errore nel recupero delle notifiche non lette:', err);
    res.status(500).send('Errore durante il recupero delle notifiche non lette.');
  }
});

router.put('/read/all', getUserIdFromToken, async (req, res) => {
  const userId = req.userId;
  try {
    await db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [userId]);
    res.status(200).send('Tutte le notifiche contrassegnate come lette.');
  } catch (err) {
    console.error("Errore durante l'aggiornamento delle notifiche:", err);
    res.status(500).send("Errore durante l'aggiornamento delle notifiche.");
  }
});

// GET /api/notifiche/categorie
router.get('/categorie', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT category FROM notifications
      WHERE category IS NOT NULL AND category != ''
      ORDER BY category
    `);
    res.json(rows.map((r) => r.category));
  } catch (err) {
    console.error('Errore nel recupero categorie:', err);
    res.status(500).send('Errore nel recupero delle categorie.');
  }
});

module.exports = router;
