const express = require("express");
const router = express.Router();
const db = require("../config/db"); // Assicurati che il percorso sia corretto

// Ottenere tutti gli stati
router.get("/", async (req, res) => {
  const sql = "SELECT * FROM stati_commessa";
  try {
    const [results] = await db.query(sql);
    res.json(results);
  } catch (err) {
    console.error("Errore durante il recupero degli stati:", err);
    res.status(500).send("Errore durante il recupero degli stati.");
  }
});

// Aggiungere un nuovo stato
router.post("/", async (req, res) => {
  const { nome_stato } = req.body;

  // Prima recuperiamo il valore massimo di 'ordine' dalla tabella
  const maxOrdineSql =
    "SELECT COALESCE(MAX(ordine), 0) AS max_ordine FROM stati_commessa";

  try {
    const [result] = await db.query(maxOrdineSql);
    const nuovoOrdine = result[0].max_ordine + 1; // Incrementiamo il massimo valore di ordine

    // Inseriamo il nuovo stato con l'ordine progressivo
    const insertSql =
      "INSERT INTO stati_commessa (nome_stato, ordine) VALUES (?, ?)";
    await db.query(insertSql, [nome_stato, nuovoOrdine]);

    res.status(201).send("Stato commessa aggiunto con successo!");
  } catch (err) {
    console.error("Errore durante l'aggiunta dello stato:", err);
    res.status(500).send("Errore durante l'aggiunta dello stato.");
  }
});

// Eliminare uno stato
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM stati_commessa WHERE id = ?"; // Correzione qui
  try {
    const [result] = await db.query(sql, [id]);
    if (result.affectedRows === 0) {
      return res.status(404).send("Stato non trovato.");
    }
    res.send("Stato eliminato con successo!");
  } catch (err) {
    console.error("Errore durante l'eliminazione dello stato:", err);
    res.status(500).send("Errore durante l'eliminazione dello stato.");
  }
});

// Modificare uno stato esistente
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { nome_stato } = req.body; // I dati che vuoi aggiornare

  // Verifica che sia stato fornito il nome
  if (!nome_stato) {
    return res.status(400).json({ error: "Il nome dello stato è richiesto." });
  }

  const sql = "UPDATE stati_commessa SET nome_stato = ? WHERE id = ?"; // Query per l'aggiornamento
  try {
    const [result] = await db.query(sql, [nome_stato, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Stato non trovato." }); // Se non è stato aggiornato nulla
    }

    res.status(200).json({ message: "Stato aggiornato con successo." });
  } catch (err) {
    console.error("Errore durante l'aggiornamento dello stato:", err);
    res.status(500).send("Errore durante l'aggiornamento dello stato.");
  }
});

module.exports = router;
