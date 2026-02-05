const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Ottieni tutte le prenotazioni
router.get("/", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM prenotazioni_sale");
    res.json(rows);
  } catch (error) {
    console.error("Errore nel recupero delle prenotazioni:", error);
    res.status(500).send("Errore durante il recupero delle prenotazioni.");
  }
});

// Aggiungi una nuova prenotazione
router.post("/", async (req, res) => {
  const { salaId, dataOra, durata, descrizione, utente } = req.body;

  if (!salaId || !dataOra || !durata || !descrizione || !utente) {
    return res.status(400).send("Tutti i campi sono obbligatori.");
  }

  try {
    const result = await db.query(
      "INSERT INTO prenotazioni_sale (salaId, dataOra, durata, descrizione, utente) VALUES (?, ?, ?, ?, ?)",
      [salaId, dataOra, durata, descrizione, utente],
    );
    res
      .status(201)
      .json({
        id: result[0].insertId,
        salaId,
        dataOra,
        durata,
        descrizione,
        utente,
      });
  } catch (error) {
    console.error("Errore durante l'aggiunta della prenotazione:", error);
    res.status(500).send("Errore durante l'aggiunta della prenotazione.");
  }
});

// Aggiorna una prenotazione esistente
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { salaId, dataOra, durata, descrizione, utente } = req.body;

  if (!salaId || !dataOra || !durata || !descrizione || !utente) {
    return res.status(400).send("Tutti i campi sono obbligatori.");
  }

  try {
    const [result] = await db.query(
      "UPDATE prenotazioni_sale SET salaId = ?, dataOra = ?, durata = ?, descrizione = ?, utente = ? WHERE id = ?",
      [salaId, dataOra, durata, descrizione, utente, id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).send("Prenotazione non trovata.");
    }

    res.status(200).json({ id, salaId, dataOra, durata, descrizione, utente });
  } catch (error) {
    console.error("Errore durante l'aggiornamento della prenotazione:", error);
    res.status(500).send("Errore durante l'aggiornamento della prenotazione.");
  }
});

// Elimina una prenotazione
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await db.query(
      "DELETE FROM prenotazioni_sale WHERE id = ?",
      [id],
    );

    if (result.affectedRows === 0) {
      return res.status(404).send("Prenotazione non trovata.");
    }

    res.status(200).send("Prenotazione eliminata con successo.");
  } catch (error) {
    console.error("Errore durante l'eliminazione della prenotazione:", error);
    res.status(500).send("Errore durante l'eliminazione della prenotazione.");
  }
});
module.exports = router;
