const express = require("express");
const router = express.Router();
const db = require("../config/db"); // Assicurati che il percorso sia corretto

// Ottenere tutti i reparti
router.get("/", async (req, res) => {
  const sql = "SELECT * FROM reparti";
  try {
    const [results] = await db.query(sql);
    res.json(results);
  } catch (err) {
    console.error("Errore durante il recupero dei reparti:", err);
    res.status(500).send("Errore durante il recupero dei reparti.");
  }
});

// Aggiungere un nuovo reparto
router.post("/", async (req, res) => {
  const { nome } = req.body;
  const sql = "INSERT INTO reparti (nome) VALUES (?)";
  try {
    const [result] = await db.query(sql, [nome]);
    res.status(201).send("Reparto aggiunto con successo!");
  } catch (err) {
    console.error("Errore durante l'aggiunta del reparto:", err);
    res.status(500).send("Errore durante l'aggiunta del reparto.");
  }
});

// Eliminare un reparto
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM reparti WHERE id = ?";
  try {
    const [result] = await db.query(sql, [id]);
    if (result.affectedRows === 0) {
      return res.status(404).send("Reparto non trovato.");
    }
    res.send("Reparto eliminato con successo!");
  } catch (err) {
    console.error("Errore durante l'eliminazione del reparto:", err);
    res.status(500).send("Errore durante l'eliminazione del reparto.");
  }
});

module.exports = router;