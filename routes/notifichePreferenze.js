const express = require("express");
const router = express.Router();
const db = require("../config/db");






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

// 📥 GET preferenze dell’utente
router.get("/", getUserIdFromToken, async (req, res) => {
  try {
    const userId = req.userId;

    const [rows] = await db.query(`
      SELECT categoria, via_push, via_email
      FROM notifiche_preferenze
      WHERE user_id = ?
    `, [userId]);

    res.json(rows);
  } catch (err) {
    console.error("Errore nel recupero preferenze:", err);
    res.status(500).send("Errore nel recupero preferenze");
  }
});

// 🔁 POST o UPDATE preferenze
router.post("/", getUserIdFromToken, async (req, res) => {
  const userId = req.userId;
  const { categoria, via_push, via_email } = req.body;

  if (!categoria) {
    return res.status(400).send("Categoria obbligatoria.");
  }

  try {
    await db.query(`
      INSERT INTO notifiche_preferenze (user_id, categoria, via_push, via_email)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE via_push = VALUES(via_push), via_email = VALUES(via_email)
    `, [userId, categoria, via_push, via_email]);

    res.send("Preferenze salvate.");
  } catch (err) {
    console.error("Errore nel salvataggio delle preferenze:", err);
    res.status(500).send("Errore nel salvataggio delle preferenze.");
  }
});


// PUT - Aggiorna una preferenza
router.put("/", async (req, res) => {
  const { user_id, categoria, push, email } = req.body;

  if (!user_id || !categoria) {
    return res.status(400).send("user_id e categoria sono obbligatori.");
  }

  try {
    const [result] = await db.query(
      "UPDATE notifiche_preferenze SET push = ?, email = ? WHERE user_id = ? AND categoria = ?",
      [!!push, !!email, user_id, categoria]
    );

    if (result.affectedRows === 0) {
      return res.status(404).send("Preferenza non trovata.");
    }

    res.send("Preferenza aggiornata.");
  } catch (err) {
    console.error("Errore durante l'aggiornamento della preferenza:", err);
    res.status(500).send("Errore durante l'aggiornamento della preferenza.");
  }
});

// DELETE - Rimuovi una preferenza
router.delete("/", async (req, res) => {
  const { user_id, categoria } = req.body;

  if (!user_id || !categoria) {
    return res.status(400).send("user_id e categoria sono obbligatori.");
  }

  try {
    const [result] = await db.query(
      "DELETE FROM notifiche_preferenze WHERE user_id = ? AND categoria = ?",
      [user_id, categoria]
    );

    if (result.affectedRows === 0) {
      return res.status(404).send("Preferenza non trovata.");
    }

    res.send("Preferenza eliminata.");
  } catch (err) {
    console.error("Errore durante l'eliminazione della preferenza:", err);
    res.status(500).send("Errore durante l'eliminazione della preferenza.");
  }
});

module.exports = router;
