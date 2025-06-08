const express = require("express");
const router = express.Router();
const db = require("../config/db");
const path = require("path");
const fs = require("fs");


// 🔹 GET tutte le schede per una commessa
router.get("/:commessaId/schede", async (req, res) => {
  const { commessaId } = req.params;
  try {
    const [results] = await db.query(
      `SELECT 
        s.id, s.commessa_id, s.tipo_id, s.titolo,
        s.intestazione, s.contenuto, s.note,
        s.data_modifica, s.data_creazione, s.creata_da,
        t.nome AS tipo,
        u.username AS creato_da_nome
      FROM SchedeTecniche s
      JOIN TipiSchedaTecnica t ON s.tipo_id = t.id
      LEFT JOIN users u ON s.creata_da = u.id
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



// 🔹 GET tutte le schede tecniche con tipo leggibile
router.get("/", async (req, res) => {
  try {
    const [results] = await db.query(`
SELECT 
  s.id, s.commessa_id, s.tipo_id, s.titolo,
  s.intestazione, s.contenuto, s.note,
  s.data_modifica, s.data_creazione, s.creata_da,
  t.nome AS tipo,
  u.username AS creato_da_nome,
  c.numero_commessa  -- 🔹 AGGIUNGI QUESTO
FROM SchedeTecniche s
JOIN TipiSchedaTecnica t ON s.tipo_id = t.id
LEFT JOIN users u ON s.creata_da = u.id
LEFT JOIN commesse c ON s.commessa_id = c.id  -- 🔹 AGGIUNGI QUESTO JOIN
ORDER BY s.data_modifica DESC
    `);
    res.json(results);
  } catch (err) {
    console.error("Errore nel recupero di tutte le schede:", err.message);
    res.status(500).send("Errore nel recupero delle schede.");
  }
});


// 🔹 POST nuova scheda
router.post("/", async (req, res) => {
  try {
    const { commessa_id, tipo_id, titolo, creata_da } = req.body;

    if (!commessa_id || !tipo_id) {
      return res.status(400).send("Dati mancanti");
    }

  const sql = `
  INSERT INTO SchedeTecniche (commessa_id, tipo_id, creata_da, titolo, intestazione, contenuto, note)
  VALUES (?, ?, ?, ?, JSON_OBJECT(), JSON_OBJECT(), "")
`;

    const titoloDaInserire = titolo || ""; // se non c'è, metti stringa vuota

    const [result] = await db.query(sql, [
  commessa_id,
  tipo_id,
  creata_da,
  titoloDaInserire
]);

const [newScheda] = await db.query(
  `SELECT s.id, s.commessa_id, s.tipo_id, s.titolo, s.data_creazione, s.data_modifica,
       s.creata_da, u.username as creato_da_nome, t.nome as tipo
FROM SchedeTecniche s
JOIN TipiSchedaTecnica t ON s.tipo_id = t.id
LEFT JOIN users u ON s.creata_da = u.id
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

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 🔍 Recupera tutte le immagini associate
    const [immagini] = await conn.query("SELECT url FROM SchedeImmagini WHERE scheda_id = ?", [id]);

    // 🧹 Elimina i file fisici
    for (const img of immagini) {
      const imagePath = path.join(__dirname, "../../public", img.url);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // ❌ Elimina i record delle immagini
    await conn.query("DELETE FROM SchedeImmagini WHERE scheda_id = ?", [id]);

    // 🧨 Elimina la scheda
    await conn.query("DELETE FROM SchedeTecniche WHERE id = ?", [id]);

    await conn.commit();
    res.status(200).send("Scheda e immagini eliminate con successo.");
  } catch (err) {
    await conn.rollback();
    console.error("Errore durante l'eliminazione della scheda:", err.message);
    res.status(500).send("Errore durante l'eliminazione della scheda.");
  } finally {
    conn.release();
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

router.get('/tipiSchedaTecnica', async (req, res) => {
  const [tipi] = await db.query(`SELECT id, nome FROM TipiSchedaTecnica`);
  res.json(tipi);
});

router.post('/tipiSchedaTecnica', async (req, res) => {
  const { nome } = req.body;
  const [result] = await db.query(
    `INSERT INTO TipiSchedaTecnica (nome) VALUES (?)`,
    [nome]
  );
  res.json({ id: result.insertId, nome });
});

router.delete('/tipiSchedaTecnica/:id', async (req, res) => {
  const { id } = req.params;
  await db.query(`DELETE FROM TipiSchedaTecnica WHERE id = ?`, [id]);
  res.json({ success: true });
});


// DELETE /api/schede/immagini/:id
router.delete("/immagini/:id", async (req, res) => {
  const id = req.params.id;

  try {
    // 1. Recupera il percorso del file dal database
    const [rows] = await db.query("SELECT url FROM SchedeImmagini WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Immagine non trovata" });
    }

    const imagePath = path.join(__dirname, "../../public", rows[0].url);

    // 2. Elimina il file fisico, se esiste
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    // 3. Elimina il record dal database
    await db.query("DELETE FROM SchedeImmagini WHERE id = ?", [id]);

    res.json({ success: true });
  } catch (error) {
    console.error("Errore eliminazione immagine:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});

module.exports = router;
