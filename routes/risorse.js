const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Ottenere tutte le risorse
router.get("/", async (req, res) => {
  const sql = `
    SELECT r.id, r.nome, r.reparto_id, rep.nome AS reparto_nome
    FROM risorse r
    LEFT JOIN reparti rep ON r.reparto_id = rep.id
  `;
  try {
    const [results] = await db.query(sql);
    res.json(results);
  } catch (err) {
    console.error("Errore durante il recupero delle risorse:", err);
    res.status(500).send("Errore durante il recupero delle risorse.");
  }
});

// Aggiungere una nuova risorsa
router.post("/", async (req, res) => {
  const { nome, reparto_id } = req.body;

  if (!nome || !reparto_id) {
    return res.status(400).send("Nome e reparto_id sono obbligatori.");
  }

  try {
    // Recupera il nome del reparto basato sul reparto_id
    const [repartoResult] = await db.query(
      "SELECT nome FROM reparti WHERE id = ?",
      [reparto_id]
    );

    if (repartoResult.length === 0) {
      return res.status(404).send("Reparto non trovato.");
    }

    const repartoNome = repartoResult[0].nome;

    // Inserisci la risorsa con il nome del reparto
    const [result] = await db.query(
      "INSERT INTO risorse (nome, reparto, reparto_id) VALUES (?, ?, ?)",
      [nome, repartoNome, reparto_id]
    );

    res.status(201).send("Risorsa aggiunta con successo!");
  } catch (err) {
    console.error("Errore durante l'aggiunta della risorsa:", err);
    res.status(500).send("Errore durante l'aggiunta della risorsa.");
  }
});


// Modificare una risorsa
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { nome, reparto_id } = req.body;

  if (!nome || !reparto_id) {
    return res.status(400).send("Nome e reparto_id sono obbligatori.");
  }

  const sql = `
    UPDATE risorse
    SET nome = ?, reparto_id = ?
    WHERE id = ?
  `;
  try {
    const [result] = await db.query(sql, [nome, reparto_id, id]);
    if (result.affectedRows === 0) {
      return res.status(404).send("Risorsa non trovata.");
    }
    res.status(200).send("Risorsa aggiornata con successo!");
  } catch (err) {
    console.error("Errore durante la modifica della risorsa:", err);
    res.status(500).send("Errore durante la modifica della risorsa.");
  }
});

// Eliminare una risorsa
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const sql = "DELETE FROM risorse WHERE id = ?";
  try {
    const [result] = await db.query(sql, [id]);
    if (result.affectedRows === 0) {
      return res.status(404).send("Risorsa non trovata.");
    }
    res.status(200).send("Risorsa eliminata con successo!");
  } catch (err) {
    console.error("Errore durante l'eliminazione della risorsa:", err);
    res.status(500).send("Errore durante l'eliminazione della risorsa.");
  }
});

module.exports = router;