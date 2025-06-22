const express = require("express");
const router = express.Router();
const db = require("../config/db");




router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT nd.id, nd.categoria, nd.id_utente, r.nome
      FROM notifiche_destinatari nd
      JOIN users u ON nd.id_utente = u.id
      JOIN risorse r ON u.risorsa_id = r.id
    `);
    res.json(rows);
  } catch (err) {
    console.error("Errore nel recupero destinatari:", err);
    res.status(500).send("Errore nel recupero destinatari.");
  }
});

router.post("/", async (req, res) => {
  const { categoria, idUtenti } = req.body;

  if (!categoria || !Array.isArray(idUtenti)) {
    return res.status(400).send("Dati mancanti o non validi.");
  }

  try {
    const values = idUtenti.map(id => [categoria, id]);
    const [result] = await db.query(
      "INSERT INTO notifiche_destinatari (categoria, id_utente) VALUES ?",
      [values]
    );

    const insertId = result.insertId;
    const insertedIds = Array.from({ length: idUtenti.length }, (_, i) => insertId + i);

    const [newRows] = await db.query(`
      SELECT nd.id, nd.categoria, nd.id_utente, u.nome
      FROM notifiche_destinatari nd
      JOIN users u ON nd.id_utente = u.id
      WHERE nd.id IN (?)
    `, [insertedIds]);

    res.status(201).json({ message: "Assegnazioni salvate", newAssignments: newRows });
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


