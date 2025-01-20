const express = require("express");
const router = express.Router();
const db = require("../config/db");
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).send("Accesso negato.");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).send("Token non valido.");
  }
};

router.use(authenticate);

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
  const { stato, reparto_id } = req.body; // `stato`: 1 = iniziata, 2 = completata
  const userId = req.user.id; // Ottieni l'ID utente dal token JWT

  try {
    // Aggiorna lo stato dell'attività
    await db.query("UPDATE attivita SET stato = ? WHERE id = ?", [stato, id]);

    // Controlla se il reparto è "Software" (id del reparto software)
    if (reparto_id === 1) {
      const message =
        stato === 1
          ? `L'utente ${userId} ha iniziato l'attività con ID ${id} nel reparto Software.`
          : `L'utente ${userId} ha completato l'attività con ID ${id} nel reparto Software.`;

      // Crea una notifica per il responsabile (sostituisci `responsabileId` con l'ID del responsabile)
      const responsabileId = 26; // Supponiamo che l'ID sia 1
      await db.query(
        "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
        [responsabileId, message]
      );
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
