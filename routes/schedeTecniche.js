const express = require("express");
const router = express.Router();
const db = require("../config/db");

// 🔹 GET tutte le schede per una commessa
router.get("/commesse/:commessaId/schede", async (req, res) => {
  const { commessaId } = req.params;
  try {
    const [results] = await db.query(
      "SELECT * FROM SchedeTecniche WHERE commessa_id = ? ORDER BY data_modifica DESC",
      [commessaId]
    );
    res.json(results);
  } catch (err) {
    console.error("Errore nel recupero delle schede:", err);
    res.status(500).send("Errore nel recupero delle schede.");
  }
});

// 🔹 POST nuova scheda
router.post("/schede", async (req, res) => {
  const { commessa_id, tipo, titolo } = req.body;

  if (!commessa_id || !tipo || !titolo) {
    return res.status(400).send("Dati obbligatori mancanti.");
  }

  try {
    const sql = `
      INSERT INTO SchedeTecniche (commessa_id, tipo, titolo, intestazione, contenuto, note)
      VALUES (?, ?, ?, JSON_OBJECT(), JSON_OBJECT(), "")
    `;
    const [result] = await db.query(sql, [commessa_id, tipo, titolo]);

    const [newScheda] = await db.query("SELECT * FROM SchedeTecniche WHERE id = ?", [result.insertId]);
    res.status(201).json(newScheda[0]);
  } catch (err) {
    console.error("Errore durante la creazione della scheda:", err);
    res.status(500).send("Errore durante la creazione della scheda.");
  }
});

// 🔹 PUT aggiorna una scheda
router.put("/schede/:id", async (req, res) => {
  const { id } = req.params;
  const { intestazione, contenuto, note, allegati_standard, risorsa_id, descrizione } = req.body;

  const conn = await db.getConnection(); // se usi pool, altrimenti usa `db.query` direttamente
  try {
    await conn.beginTransaction();

    // 🔧 Aggiorna la scheda
    await conn.query(`
      UPDATE SchedeTecniche
      SET intestazione = ?, contenuto = ?, note = ?, allegati_standard = ?, data_modifica = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      JSON.stringify(intestazione),
      JSON.stringify(contenuto),
      note,
      JSON.stringify(allegati_standard),
      id
    ]);

    // 📝 Inserisci log modifica, se specificato
    if (risorsa_id && descrizione) {
      await conn.query(`
        INSERT INTO SchedeModifiche (scheda_id, risorsa_id, descrizione)
        VALUES (?, ?, ?)
      `, [id, risorsa_id, descrizione]);
    }

    await conn.commit();
    res.send("Scheda aggiornata con successo.");
  } catch (err) {
    await conn.rollback();
    console.error("Errore durante l'aggiornamento della scheda:", err);
    res.status(500).send("Errore durante l'aggiornamento della scheda.");
  } finally {
    conn.release();
  }
});


// 🔹 DELETE elimina una scheda
router.delete("/schede/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM SchedeTecniche WHERE id = ?", [id]);
    res.status(200).send("Scheda eliminata con successo.");
  } catch (err) {
    console.error("Errore durante l'eliminazione della scheda:", err);
    res.status(500).send("Errore durante l'eliminazione della scheda.");
  }
});


router.get("/:schedaId/modifiche", async (req, res) => {
  const { schedaId } = req.params;
  try {
    const [results] = await db.query(`
      SELECT sm.id, sm.data_modifica, sm.descrizione, r.nome AS risorsa_nome
      FROM SchedeModifiche sm
      LEFT JOIN Risorse r ON sm.risorsa_id = r.id
      WHERE sm.scheda_id = ?
      ORDER BY sm.data_modifica DESC
    `, [schedaId]);

    res.json(results);
  } catch (err) {
    console.error("Errore nel recupero modifiche:", err);
    res.status(500).send("Errore nel recupero modifiche.");
  }
});


module.exports = router;
