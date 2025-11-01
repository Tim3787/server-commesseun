const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Ottenere tutte le risorse attive
router.get("/", async (req, res) => {
  const sql = `
    SELECT r.id, r.nome, r.reparto_id, rep.nome AS reparto_nome
    FROM risorse r
    LEFT JOIN reparti rep ON r.reparto_id = rep.id
        WHERE r.is_active = 1
    ORDER BY r.nome
  `;
  try {
    const [results] = await db.query(sql);
    res.json(results);
  } catch (err) {
    console.error("Errore durante il recupero delle risorse:", err);
    res.status(500).send("Errore durante il recupero delle risorse.");
  }
});

// Ottenere tutte le risorse 
router.get("/all", async (req, res) => {
  const sql = `
    SELECT r.id, r.nome, r.reparto_id, rep.nome AS reparto_nome, r.is_active, r.data_uscita, r.note_uscita
    FROM risorse r
    LEFT JOIN reparti rep ON r.reparto_id = rep.id
    ORDER BY r.is_active DESC, r.nome
  `;
  try {
    const [results] = await db.query(sql);
    res.json(results);
  } catch (err) {
    console.error("Errore durante il recupero di tutte le risorse:", err);
    res.status(500).send("Errore durante il recupero di tutte le risorse.");
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

/**
 * PATCH /api/risorse/:id/disattiva
 * Soft delete (non elimina record, imposta is_active = 0)
 */
router.patch("/:id/disattiva", async (req, res) => {
  const { id } = req.params;
  const { data_uscita = null, note_uscita = null } = req.body || {};

  try {
    const [result] = await db.query(
      `UPDATE risorse
       SET is_active = 0, data_uscita = ?, note_uscita = ?
       WHERE id = ?`,
      [data_uscita, note_uscita, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).send("Risorsa non trovata.");
    }
    res.sendStatus(204);
  } catch (err) {
    console.error("Errore durante la disattivazione della risorsa:", err);
    res.status(500).send("Errore durante la disattivazione della risorsa.");
  }
});

/**
 * PATCH /api/risorse/:id/attiva
 * Riattiva una risorsa (se serve)
 */
router.patch("/:id/attiva", async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await db.query(
      `UPDATE risorse
       SET is_active = 1, data_uscita = NULL, note_uscita = NULL
       WHERE id = ?`,
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).send("Risorsa non trovata.");
    }
    res.sendStatus(204);
  } catch (err) {
    console.error("Errore durante la riattivazione della risorsa:", err);
    res.status(500).send("Errore durante la riattivazione della risorsa.");
  }
});

module.exports = router;