const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");

// Middleware per ottenere l'id utente dal token
const getUserIdFromToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send("Accesso negato. Nessun token fornito.");
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id; // Salva l'id utente decodificato nella richiesta
    next();
  } catch (err) {
    res.status(403).send("Token non valido.");
  }
};



// Recupera tutte le notifiche di un utente
router.get("/", getUserIdFromToken, async (req, res) => {
  const userId = req.userId;

  try {
    const [notifications] = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC",
      [userId]
    );
    console.log(`Notifiche trovate per l'utente ${userId}:`, notifications);
    res.json(notifications);
  } catch (err) {
    console.error(`Errore nel recupero delle notifiche per l'utente ${userId}:`, err);
    res.status(500).send("Errore durante il recupero delle notifiche.");
  }
});



router.get("/global", async (req, res) => {
  try {
    const [notifications] = await db.query(
      "SELECT * FROM notifications WHERE user_id IS NULL ORDER BY created_at DESC"
    );
    res.json(notifications);
  } catch (err) {
    console.error("Errore nel recupero delle notifiche globali:", err);
    res.status(500).send("Errore durante il recupero delle notifiche globali.");
  }
});


// Crea una nuova notifica per l'utente
router.post("/", getUserIdFromToken, async (req, res) => {
  const userId = req.userId; // Ottieni l'id utente dal middleware
  const { message } = req.body;

  try {
    await db.query(
      "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
      [userId, message]
    );
    res.status(201).send("Notifica creata con successo.");
  } catch (err) {
    console.error("Errore durante la creazione della notifica:", err);
    res.status(500).send("Errore durante la creazione della notifica.");
  }
});

// Elimina una notifica
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("DELETE FROM notifications WHERE id = ?", [id]);
    res.status(200).send("Notifica eliminata con successo.");
  } catch (err) {
    console.error("Errore durante l'eliminazione della notifica:", err);
    res.status(500).send("Errore durante l'eliminazione della notifica.");
  }
});


// PUT: Aggiorna solo le note
router.put("/:id/note", getUserIdFromToken, async (req, res) => {
  const { id } = req.params; 
  const { note } = req.body;

  try {
    const [result] = await db.query(
      "UPDATE attivita_commessa SET note = ? WHERE id = ?",
      [note || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).send("Attività non trovata.");
    }

    res.status(200).json({ message: "Note aggiornate con successo" });
  } catch (error) {
    console.error("Errore durante l'aggiornamento delle note:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});



router.put("/:id/stato", getUserIdFromToken, async (req, res) => {
  const { id } = req.params; // Ottieni l'id dal parametro della richiesta
  const { stato } = req.body; // Stato richiesto: 1 = iniziata, 2 = completata

  if (stato === undefined) {
    return res.status(400).send("Il campo 'stato' è obbligatorio.");
  }

  try {
    // Recupera i dettagli dell'attività
    const [activity] = await db.query(`
      SELECT 
        ac.id, ac.commessa_id, ac.risorsa_id, ac.attivita_id,
        c.numero_commessa, ad.nome_attivita, r.reparto_id
      FROM attivita_commessa ac
      JOIN commesse c ON ac.commessa_id = c.id
      JOIN attivita ad ON ac.attivita_id = ad.id
      JOIN risorse r ON ac.risorsa_id = r.id
      WHERE ac.id = ?
    `, [id]);

    if (activity.length === 0) {
      return res.status(404).send("Attività non trovata.");
    }

    const numeroCommessa = activity[0].numero_commessa;
    const tipoAttivita = activity[0].nome_attivita;
    const repartoId = activity[0].reparto_id;
    const risorsaId = activity[0].risorsa_id;

    // Aggiorna lo stato dell'attività
    const [result] = await db.query(
      "UPDATE attivita_commessa SET stato = ? WHERE id = ?",
      [stato, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).send("Attività non trovata.");
    }

    // Determina l'utente da notificare
    let userIdToNotify = null;
    if (repartoId === 1) {
      // Reparto software
      userIdToNotify = 26; // ID utente per il reparto software
    } else if (repartoId === 2) {
      // Reparto elettrico
      userIdToNotify = 44; // ID utente per il reparto elettrico
    }

    if (userIdToNotify) {
      // Crea una notifica per il responsabile
      const message = `Lo stato dell'attività è stato aggiornato:
        - Commessa: ${numeroCommessa}
        - Tipo attività: ${tipoAttivita}
        - Nuovo stato: ${stato === 1 ? "Iniziata" : "Completata"}.`;
      await db.query(
        "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
        [userIdToNotify, message]
      );
    }

    res.status(200).send("Stato dell'attività aggiornato con successo e notifica inviata.");
  } catch (err) {
    console.error("Errore durante l'aggiornamento dello stato dell'attività:", err);
    res.status(500).send("Errore durante l'aggiornamento dello stato dell'attività.");
  }
});






router.put("/:id/read", getUserIdFromToken, async (req, res) => {
  const { id } = req.params; // Ottieni l'id della notifica
  try {
    await db.query("UPDATE notifications SET is_read = TRUE WHERE id = ?", [id]);
    res.status(200).send("Notifica contrassegnata come letta.");
  } catch (err) {
    console.error("Errore durante l'aggiornamento della notifica:", err);
    res.status(500).send("Errore durante l'aggiornamento della notifica.");
  }
});


router.get("/count", getUserIdFromToken, async (req, res) => {
  const userId = req.userId; // Ottieni l'id utente dal middleware
  try {
    const [result] = await db.query(
      "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?",
      [userId]
    );
    res.json(result[0]);
  } catch (err) {
    console.error("Errore durante il conteggio delle notifiche:", err);
    res.status(500).send("Errore durante il conteggio delle notifiche.");
  }
});

router.get("/unread", getUserIdFromToken, async (req, res) => {
  const userId = req.userId; // Ottieni l'id utente dal middleware
  try {
    const [notifications] = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? AND is_read = FALSE ORDER BY created_at DESC",
      [userId]
    );
    res.json(notifications);
  } catch (err) {
    console.error("Errore nel recupero delle notifiche non lette:", err);
    res.status(500).send("Errore durante il recupero delle notifiche non lette.");
  }
});

module.exports = router;
