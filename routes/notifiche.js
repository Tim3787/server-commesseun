const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");
const sendNotification = require("./sendNotification");

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
    await sendPushNotification(userId, message);
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

  console.log("ID ricevuto:", id);
  console.log("Nota ricevuta:", note);

  try {
    const [result] = await db.query(
      "UPDATE attivita_commessa SET note = ? WHERE id = ?",
      [note || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).send("Attività non trovata.");
    }

    console.log("Aggiornamento riuscito, invio risposta al client.");
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

    console.log("Dati attività recuperati:", activity[0]);

    // Aggiorna lo stato dell'attività
    const [result] = await db.query(
      "UPDATE attivita_commessa SET stato = ? WHERE id = ?",
      [stato, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).send("Attività non trovata.");
    }
    console.log("Risorsa ID per la query device_token:", risorsaId);

    // Recupera il device_token dall'utente usando risorsa_id
    const [user] = await db.query(
      "SELECT device_token FROM users WHERE risorsa_id = ?",
      [risorsaId]
    );
    
    if (user.length > 0) {
      console.log("Device token recuperato dal database:", user[0].device_token);
    } else {
      console.log("Nessun utente trovato con il risorsa_id:", risorsaId);
    }
    
    if (user.length > 0 && user[0].device_token) {
      const deviceToken = user[0].device_token;
      const message = `Lo stato dell'attività ${tipoAttivita} della commessa ${numeroCommessa} è stato aggiornato a ${
        stato === 1 ? "Iniziata" : "Completata"
      }.`;

      // Invoca la funzione per inviare la notifica
      await sendNotification(deviceToken, "Aggiornamento attività", message);
      console.log("Notifica push inviata con successo.");
    } else {
      console.log("Nessun dispositivo registrato per ricevere la notifica.");
    }

    res.status(200).send("Stato dell'attività aggiornato con successo.");
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
