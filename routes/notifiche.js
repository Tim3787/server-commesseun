const express = require("express");
const router = express.Router();
const db = require("../config/db");
const jwt = require("jsonwebtoken");
const sendNotification = require("./sendNotification");



(req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; 

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.error("Formato del token non valido o assente.");
    return res.status(401).send("Accesso negato. Nessun token fornito o formato non valido.");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Non serve più verificare `role_id` se è stato aggiunto correttamente nel token
    if (!decoded.id) {
      console.error("Token decodificato privo dell'ID:", decoded);
      return res.status(403).send("Token non valido.");
    }

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



// Middleware per ottenere l'id utente dal token JWT
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
    // Recupera il device_token associato all'utente
    const [user] = await db.query("SELECT device_token FROM users WHERE id = ?", [userId]);

    if (user.length === 0 || !user[0].device_token) {
      console.log("Nessun dispositivo registrato per l'utente:", userId);
      return res.status(400).send("Nessun dispositivo registrato per l'utente.");
    }

    const deviceToken = user[0].device_token;

    // Inserisci la notifica nel database
    await db.query("INSERT INTO notifications (user_id, message) VALUES (?, ?)", [userId, message]);
    console.log("Notifica salvata nel database per l'utente:", userId);

    // Invia la notifica push
    await sendNotification(deviceToken, "Nuova Notifica", message);
    console.log("Notifica push inviata con successo.");

    res.status(201).send("Notifica creata e inviata con successo.");
  } catch (err) {
    console.error("Errore durante la creazione e invio della notifica:", err);
    res.status(500).send("Errore durante la creazione e invio della notifica.");
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




// Rotta per aggiornare lo stato di un'attività
router.put("/:id/stato", getUserIdFromToken, async (req, res) => {
  const { id } = req.params; // Ottieni l'id dell'attività
  const { stato } = req.body; // Stato richiesto: ad esempio 1 = Iniziata, 2 = Completata

  if (stato === undefined) {
    return res.status(400).send("Il campo 'stato' è obbligatorio.");
  }

  try {
    // Recupera i dettagli dell'attività
    const [activity] = await db.query(`
      SELECT 
        ac.id, 
        ac.commessa_id, 
        ac.risorsa_id, 
        ac.attivita_id,
        c.numero_commessa, 
        ad.nome_attivita, 
        r.reparto_id
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
    // Non serve recuperare risorsaId in questo caso

    console.log("Dati attività recuperati:", activity[0]);

    // Aggiorna lo stato dell'attività
    const [result] = await db.query(
      "UPDATE attivita_commessa SET stato = ? WHERE id = ?",
      [stato, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).send("Attività non trovata.");
    }

    // Ora invia la notifica ai manager di reparto.
    // Ad esempio, supponiamo che i manager abbiano role_id = 1.
    // Recupera i device_token dei manager del reparto specificato.
    const managerMapping = {
      1: 26,  // Manager per il reparto 1
      2: 44,  // Manager per il reparto 2
    
      // Aggiungi le altre associazioni come necessario...
    };
// Usa la mappatura per ottenere l'id del manager per questo reparto
const managerId = managerMapping[repartoId];
if (!managerId) {
  console.log("Nessun manager associato per il reparto:", repartoId);
  // Puoi decidere di non inviare la notifica o gestirla in altro modo
}

// Ora recupera il device_token del manager usando il managerId
const [manager] = await db.query("SELECT device_token FROM users WHERE id = ?", [managerId]);

if (manager.length > 0 && manager[0].device_token) {
  const deviceToken = manager[0].device_token;
  const message = `Lo stato dell'attività ${tipoAttivita} della commessa ${numeroCommessa} è stato aggiornato a ${
    stato === 1 ? "Iniziata" : "Completata"
  }.`;

  const sendNotification = require("./sendNotification");
  await sendNotification(deviceToken, "Aggiornamento attività", message);
  console.log("Notifica push inviata con successo al manager con id:", managerId);
} else {
  console.log("Nessun dispositivo registrato per il manager con id:", managerId);
}

    res.status(200).send("Stato dell'attività aggiornato con successo.");
  } catch (err) {
    console.error("Errore durante l'aggiornamento dello stato dell'attività:", err);
    res.status(500).send("Errore durante l'aggiornamento dello stato dell'attività.");
  }
});

module.exports = router;




// Elimina tutte le notifiche per una determinata risorsa
router.delete("/:resourceId", async (req, res) => {
  const { resourceId } = req.params;

  try {
    // Elimina tutte le notifiche dove il campo user_id corrisponde a resourceId
    await db.query("DELETE FROM notifications WHERE user_id = ?", [resourceId]);
    res.status(200).send("Notifiche eliminate con successo.");
  } catch (err) {
    console.error("Errore durante l'eliminazione delle notifiche:", err);
    res.status(500).send("Errore durante l'eliminazione delle notifiche.");
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
