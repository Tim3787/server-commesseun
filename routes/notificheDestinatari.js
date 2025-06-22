const express = require("express");
const router = express.Router();
const db = require("../config/db");




router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
  SELECT 
    nd.id, 
    nd.categoria, 
    nd.user_id, 
    u.username AS nome_utente,
    r.nome AS nome_risorsa
  FROM notifiche_destinatari nd
  JOIN users u ON nd.user_id = u.id
  JOIN risorse r ON u.risorsa_id = r.id
`);
res.json(rows);
  } catch (err) {
    console.error("Errore nel recupero destinatari:", err);
    res.status(500).send("Errore nel recupero destinatari.");
  }
});
router.post("/", async (req, res) => {
  const { categoria, idUtenti = [], reparto_id, ruolo } = req.body;

  if (!categoria || (!Array.isArray(idUtenti) && !reparto_id && !ruolo)) {
    return res.status(400).send("Dati mancanti o non validi.");
  }

  try {
    const values = [];

    // Inserimento per utenti specifici
    if (Array.isArray(idUtenti) && idUtenti.length > 0) {
      idUtenti.forEach((id) => {
        values.push([categoria, id, null, null]); // user_id, null, null
      });
    }

    // Inserimento per reparto
    if (reparto_id) {
      values.push([categoria, null, reparto_id, null]);
    }

    // Inserimento per ruolo
    if (ruolo) {
      values.push([categoria, null, null, ruolo]);
    }

    if (values.length === 0) {
      return res.status(400).send("Nessun destinatario valido fornito.");
    }

    const [result] = await db.query(
      `INSERT INTO notifiche_destinatari (categoria, user_id, reparto_id, ruolo) VALUES ?`,
      [values]
    );

    res.status(201).json({ message: "Assegnazioni salvate", inserted: result.affectedRows });
  } catch (err) {
    console.error("Errore nel salvataggio assegnazioni:", err);
    res.status(500).send("Errore nel salvataggio assegnazioni.");
  }
});


router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query(
      "DELETE FROM notifiche_destinatari WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).send("Assegnazione non trovata.");
    }

    res.json({ message: "Assegnazione eliminata", idEliminato: parseInt(id) });
  } catch (err) {
    console.error("Errore eliminazione:", err);
    res.status(500).send("Errore eliminazione assegnazione.");
  }
});

module.exports = router;


