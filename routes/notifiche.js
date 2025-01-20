const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");



const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.error("Formato del token non valido o assente.");
    return res.status(401).send("Accesso negato. Nessun token fornito o formato non valido.");
  }

  const token = authHeader.split(" ")[1]; // Estrai il token (rimuovi "Bearer ")
  console.log("Token ricevuto:", token);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Token decodificato con successo:", decoded);

    // Verifica dei campi richiesti
    if (!decoded.id || !decoded.role_id) {
      console.error("Token decodificato privo di campi obbligatori:", decoded);
      return res.status(403).send("Token non valido.");
    }

    // Aggiungi le informazioni utente alla richiesta
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      console.error("Token scaduto:", token);
      return res.status(401).send("Token scaduto. Effettua nuovamente il login.");
    }

    console.error("Errore durante la verifica del token JWT:", err.message);
    res.status(403).send("Token non valido.");
  }
};

module.exports = authenticateToken;




router.get("/", async (req, res) => {
  try {
    // Ottieni il risorsa_id dall'utente autenticato
    const risorsa_id = req.user?.risorsa_id;
    if (!risorsa_id) {
      return res.status(400).send("Errore: risorsa_id non trovato per l'utente autenticato.");
    }

    // Verifica se l'utente associato alla risorsa esiste
    const [userExists] = await db.query(
      "SELECT id FROM users WHERE risorsa_id = ?",
      [risorsa_id]
    );
    console.log("Utente autenticato:", req.user);
    console.log("ID utente:", req.user.id);
    if (userExists.length === 0) {
      return res.status(400).send("Errore: Nessun utente associato a questa risorsa.");
    }

    const userId = userExists[0].id;

    // Recupera i parametri di paginazione
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Recupera le notifiche
    const [notifications] = await db.query(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [userId, limit, offset]
    );

    res.json(notifications);
  } catch (err) {
    console.error("Errore nel recupero delle notifiche:", err);
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

router.post("/", async (req, res) => {
  const { nome_attivita, durata, user_id, reparto_id } = req.body;

  try {
    // Crea l'attività nel database
    const [result] = await db.query(
      "INSERT INTO attivita (nome_attivita, durata, user_id, reparto_id) VALUES (?, ?, ?, ?)",
      [nome_attivita, durata, user_id, reparto_id]
    );

    const attivitaId = result.insertId;

    // Crea una notifica per l'utente
    const message = `Ti è stata assegnata una nuova attività: "${nome_attivita}".`;
    await db.query(
      "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
      [user_id, message]
    );

    res.status(201).json({ message: "Attività creata con successo.", attivitaId });
  } catch (err) {
    console.error("Errore durante la creazione dell'attività:", err);
    res.status(500).send("Errore durante la creazione dell'attività.");
  }
});

router.put("/:id/stato", async (req, res) => {
  const { id } = req.params;
  const { stato } = req.body; // Stato richiesto: 1 = iniziata, 2 = completata

  if (stato === undefined) {
    return res.status(400).send("Il campo 'stato' è obbligatorio.");
  }

  try {
    // Aggiorna lo stato dell'attività
    const [result] = await db.query("UPDATE attivita_commessa SET stato = ? WHERE id = ?", [stato, id]);

    if (result.affectedRows === 0) {
      return res.status(404).send("Attività non trovata.");
    }

    res.status(200).send("Stato dell'attività aggiornato con successo.");
  } catch (err) {
    console.error("Errore durante l'aggiornamento dello stato dell'attività:", err);
    res.status(500).send("Errore durante l'aggiornamento dello stato dell'attività.");
  }
});


router.put("/:id/read", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(
      "UPDATE notifications SET is_read = TRUE WHERE id = ?",
      [id]
    );
    res.status(200).send("Notifica contrassegnata come letta.");
  } catch (err) {
    console.error("Errore durante l'aggiornamento della notifica:", err);
    res.status(500).send("Errore durante l'aggiornamento della notifica.");
  }
});
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(
      "DELETE FROM notifications WHERE id = ?",
      [id]
    );
    res.status(200).send("Notifica eliminata con successo.");
  } catch (err) {
    console.error("Errore durante l'eliminazione della notifica:", err);
    res.status(500).send("Errore durante l'eliminazione della notifica.");
  }
});

router.get("/count", async (req, res) => {
  const userId = req.user.id;
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

router.get("/unread", async (req, res) => {
  const userId = req.user.id;
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
