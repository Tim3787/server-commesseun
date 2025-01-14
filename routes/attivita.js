const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Ottenere tutte le attività definite
router.get("/", async (req, res) => {
  try {
    const [results] = await db.query("SELECT * FROM attivita");
    res.json(results);
  } catch (err) {
    console.error("Errore durante il recupero delle attività:", err);
    res.status(500).send("Errore durante il recupero delle attività.");
  }
});


// Aggiungere una nuova attività
router.post("/", async (req, res) => {
  const { nome_attivita, reparto_id } = req.body;

  console.log("Dati ricevuti nel backend:", req.body);

  // Validazione input
  if (!nome_attivita || !reparto_id) {
    return res.status(400).send("Nome dell'attività e reparto sono obbligatori.");
  }

  try {
    // Verifica che il reparto esista
    const checkRepartoSql = `SELECT id FROM reparti WHERE id = ?`;
    const [reparto] = await db.query(checkRepartoSql, [reparto_id]);
    if (!reparto || reparto.length === 0) {
      return res.status(404).send("Reparto non trovato.");
    }

    // Inserire l'attività nella tabella "attivita"
    const insertAttivitaSql = `
      INSERT INTO attivita (nome_attivita, reparto_id) 
      VALUES (?, ?)
    `;
    const [result] = await db.query(insertAttivitaSql, [nome_attivita, reparto_id]);
    console.log("Risultato inserimento attività:", result);

    res.status(201).send("Attività aggiunta con successo.");
  } catch (err) {
    console.error("Errore durante l'aggiunta dell'attività:", err);
    res.status(500).send("Errore durante l'aggiunta dell'attività.");
  }
});





// Modifica di un'attività
router.put("/:id", async (req, res) => {
  const { nome_attivita, reparto } = req.body;
  const { id } = req.params;
  try {
    const sql = "UPDATE attivita SET nome_attivita = ?, reparto = ? WHERE id = ?";
    await db.query(sql, [nome_attivita, reparto, id]);
    res.send("Attività aggiornata con successo");
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).send("Un'attività con lo stesso nome esiste già in questo reparto");
    }
    console.error("Errore durante l'aggiornamento dell'attività:", err);
    res.status(500).send("Errore durante l'aggiornamento dell'attività");
  }
});

// Eliminazione di un'attività
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const sql = "DELETE FROM attivita WHERE id = ?";
    await db.query(sql, [id]);
    res.status(200).send("Attività eliminata con successo!");
  } catch (err) {
    console.error("Errore durante l'eliminazione dell'attività:", err);
    res.status(500).send("Errore durante l'eliminazione dell'attività.");
  }
});

module.exports = router;
