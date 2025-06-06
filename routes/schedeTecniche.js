const express = require("express");
const router = express.Router();
const db = require("../config/db");


// 🔹 GET tutte le schede per una commessa
router.get("/commesse/:commessaId/schede", async (req, res) => {
  const { commessaId } = req.params;
  try {
    const [results] = await db.query(
      `SELECT s.id, s.commessa_id, t.codice AS tipo, s.titolo, s.intestazione, s.contenuto, s.note, s.data_modifica
       FROM SchedeTecniche s
       JOIN TipiSchedaTecnica t ON s.tipo_id = t.id
       WHERE s.commessa_id = ?
       ORDER BY s.data_modifica DESC`,
      [commessaId]
    );
    res.json(results);
  } catch (err) {
    console.error("Errore nel recupero delle schede:", err.message);
    res.status(500).send("Errore nel recupero delle schede.");
  }
});


// 🔹 GET tutte le schede tecniche
// 🔹 GET tutte le schede tecniche con tipo leggibile
router.get("/", async (req, res) => {
  try {
    const [results] = await db.query(`
      SELECT s.id, s.commessa_id, t.codice AS tipo, s.titolo, s.intestazione, s.contenuto, s.note, s.data_modifica
      FROM SchedeTecniche s
      JOIN TipiSchedaTecnica t ON s.tipo_id = t.id
      ORDER BY s.data_modifica DESC
    `);
    res.json(results);
  } catch (err) {
    console.error("Errore nel recupero di tutte le schede:", err.message);
    res.status(500).send("Errore nel recupero delle schede.");
  }
});


// 🔹 POST nuova scheda
// 🔹 POST nuova scheda
router.post("/", async (req, res) => {
  try {
    const { commessa_id, tipo_id, titolo } = req.body;

    if (!commessa_id || !tipo_id || !titolo) {
      return res.status(400).send("Dati mancanti");
    }

    const sql = `
      INSERT INTO SchedeTecniche (commessa_id, tipo_id, titolo, intestazione, contenuto, note)
      VALUES (?, ?, ?, JSON_OBJECT(), JSON_OBJECT(), "")
    `;
    const [result] = await db.query(sql, [commessa_id, tipo_id, titolo]);

    // Recupera la nuova scheda creata, con nome tipo
    const [newScheda] = await db.query(
      `SELECT s.id, s.commessa_id, t.codice as tipo, s.titolo
       FROM SchedeTecniche s
       JOIN TipiSchedaTecnica t ON s.tipo_id = t.id
       WHERE s.id = ?`,
      [result.insertId]
    );

    res.status(201).json(newScheda[0]);
  } catch (err) {
    console.error("Errore durante la creazione della scheda:", err.message);
    res.status(500).send("Errore durante la creazione della scheda.");
  }
});


// 🔹 PUT aggiorna una scheda
router.put("/:id", async (req, res) => {
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
    console.error("Errore durante l'aggiornamento della scheda:", err.message);
    console.error(err);
    res.status(500).send("Errore durante l'aggiornamento della scheda.");
  } finally {
    conn.release();
  }
});


// 🔹 DELETE elimina una scheda
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM SchedeTecniche WHERE id = ?", [id]);
    res.status(200).send("Scheda eliminata con successo.");
  } catch (err) {
    console.error("Errore durante l'eliminazione della scheda:", err.message);
    console.error(err);
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
    console.error("Errore nel recupero modifiche:", err.message);
    console.error(err);
    res.status(500).send("Errore nel recupero modifiche.");
  }
});


router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [results] = await db.query("SELECT * FROM SchedeTecniche WHERE id = ?", [id]);
    if (results.length === 0) return res.status(404).send("Scheda non trovata.");
    res.json(results[0]);
  } catch (err) {
    console.error("Errore nel recupero della scheda:", err.message);
    console.error(err);
    res.status(500).send("Errore nel recupero della scheda.");
  }
});


module.exports = router;
