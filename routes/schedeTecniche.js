const express = require("express");
const router = express.Router();
const db = require("../config/db");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token mancante" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: "Token non valido" });
  }
}
function estraiHashtag(testo) {
  const matches = testo.match(/#\w+/g);
  return matches ? matches.map(tag => tag.substring(1)) : [];
}

/**
// GET /api/schedeTecniche/tag - restituisce tutti i tag distinti usati nelle note
router.get("/tag", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT DISTINCT tag FROM SchedeTag ORDER BY tag ASC"
    );
    const tagList = rows.map(r => r.tag);
    res.json(tagList);
  } catch (err) {
    console.error("Errore nel recupero dei tag:", err);
    res.status(500).json({ error: "Errore nel recupero dei tag" });
  }
});
**/
router.get("/tipiSchedaTecnica", async (req, res) => {
  try {
    const [tipi] = await db.query(
      `SELECT id, nome, categoria FROM TipiSchedaTecnica ORDER BY nome ASC`
    );
    res.json(tipi);
  } catch (err) {
    console.error("Errore nel recupero tipi scheda:", err);
    res.status(500).send("Errore nel recupero tipi scheda");
  }
});

// GET /api/schedeTecniche/tag?reparto=software&includeGlobal=1&search=uca
router.get("/tag", async (req, res) => {
  try {
    const { reparto, includeGlobal, search } = req.query;
    const includeGlobalBool = includeGlobal === "1";

    let sql = `
      SELECT id, prefisso, nome, reparto, colore
      FROM tag
      WHERE attivo = 1
    `;
    const params = [];

    if (reparto) {
      if (includeGlobalBool) {
        sql += ` AND (reparto = ? OR reparto IS NULL)`;
        params.push(reparto);
      } else {
        sql += ` AND reparto = ?`;
        params.push(reparto);
      }
    }

    if (search && search.trim()) {
      sql += ` AND (nome LIKE CONCAT('%', ?, '%') OR prefisso LIKE CONCAT('%', ?, '%'))`;
      params.push(search.trim(), search.trim());
    }

    sql += ` ORDER BY (reparto IS NULL), prefisso, nome`;

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Errore nel recupero dei tag:", err);
    res.status(500).json({ error: "Errore nel recupero dei tag" });
  }
});

router.post('/tipiSchedaTecnica', async (req, res) => {
  const { nome } = req.body;
  const [result] = await db.query(
    `INSERT INTO TipiSchedaTecnica (nome) VALUES (?)`,
    [nome]
  );
  res.json({ id: result.insertId, nome });
});
// GET /api/schedeTecniche/:id/tags
router.get("/:id/tags", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      `
      SELECT t.id, t.prefisso, t.nome, t.reparto, t.colore
      FROM scheda_tag st
      JOIN tag t ON t.id = st.tag_id
      WHERE st.scheda_id = ?
      ORDER BY t.prefisso, t.nome
      `,
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Errore nel recupero tag scheda:", err);
    res.status(500).json({ error: "Errore nel recupero tag scheda" });
  }
});

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

// GET /api/schedeTecniche/by-tag/:tagId
router.get("/by-tag/:tagId", async (req, res) => {
  const { tagId } = req.params;
  try {
    const [rows] = await db.query(`
      SELECT s.*
      FROM SchedeTecniche s
      JOIN scheda_tag st ON st.scheda_id = s.id
      WHERE st.tag_id = ?
      ORDER BY s.data_modifica DESC
    `, [tagId]);

    res.json(rows);
  } catch (err) {
    console.error("Errore ricerca schede per tag:", err);
    res.status(500).json({ error: "Errore interno del server" });
  }
});

/**
// POST /api/schedeTecniche/tags - aggiunge un nuovo tag per una scheda
router.post("/tags", async (req, res) => {
  const { scheda_id, tags } = req.body;

  if (!scheda_id || !Array.isArray(tags)) {
    return res.status(400).json({ error: "scheda_id e array di tags sono obbligatori." });
  }

  try {
    for (const tag of tags) {
      const [existing] = await db.query(
        "SELECT * FROM SchedeTag WHERE scheda_id = ? AND tag = ?",
        [scheda_id, tag]
      );

      if (existing.length === 0) {
        await db.query(
          "INSERT INTO SchedeTag (scheda_id, tag) VALUES (?, ?)",
          [scheda_id, tag]
        );
      }
    }

    res.status(201).json({ success: true });
  } catch (err) {
    console.error("Errore salvataggio tag:", err);
    res.status(500).json({ error: "Errore interno durante il salvataggio dei tag." });
  }
});
**/
// PUT /api/schedeTecniche/:id/tags-by-names
// Body: { names: ["pippo","plc_test"] }
router.put("/:id/tags-by-names", authenticateToken, async (req, res) => {
  const schedaId = Number(req.params.id);
  const { names } = req.body;

  if (!schedaId || !Array.isArray(names)) {
    return res.status(400).json({ error: "Parametri non validi" });
  }

  // pulizia nomi
  const cleanNames = [...new Set(
    names
      .map((s) => String(s || "").trim().toLowerCase())
      .filter(Boolean)
  )];

  // reparto dal token (tu lo hai già nel token)
  const reparto = (req.user?.reparto || "").toLowerCase();
  const repartoId = req.user?.reparto_id || null;

  // prefisso: usa quello del reparto (fallback hardcoded)
  const prefixMap = {
    software: "SW",
    meccanico: "ME",
    elettrico: "EL",
    quadristi: "QE",
    service: "SV",
    "Tecnico elettrico":"TE",
  };
  const prefisso = prefixMap[reparto] || "GEN";

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // verifica scheda esiste
    const [schedaRows] = await conn.query(
      "SELECT id FROM SchedeTecniche WHERE id = ?",
      [schedaId]
    );
    if (!schedaRows.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Scheda non trovata" });
    }

    // 1) per ogni nome: crea tag se non esiste, poi prendi id
    const tagIds = [];
    for (const nome of cleanNames) {
      const [found] = await conn.query(
  `SELECT id FROM \`tag\`
   WHERE attivo = 1
     AND prefisso = ?
     AND nome = ?
     AND (reparto = ? OR reparto IS NULL)
   LIMIT 1`,
  [prefisso, nome, reparto || null]
);

      if (found.length) {
        tagIds.push(found[0].id);
      } else {
const defaultColor = "#888888"; // scegli tu

const [ins] = await conn.query(
  `INSERT INTO \`tag\` (prefisso, nome, reparto, colore, attivo)
   VALUES (?, ?, ?, ?, 1)`,
  [prefisso, nome, reparto || null, defaultColor]
);

        tagIds.push(ins.insertId);
      }
    }

    // 2) aggiorna relazioni scheda_tag
    await conn.query(`DELETE FROM scheda_tag WHERE scheda_id = ?`, [schedaId]);

    if (tagIds.length) {
      const values = tagIds.map((tid) => [schedaId, tid]);
      await conn.query(
        `INSERT INTO scheda_tag (scheda_id, tag_id) VALUES ?`,
        [values]
      );
    }

    await conn.commit();

    res.json({
      success: true,
      reparto,
      repartoId,
      prefisso,
      names: cleanNames,
      tagIds,
    });
  } catch (err) {
    await conn.rollback();
    console.error("tags-by-names ERROR:", err);
    console.error(err?.stack);
    res.status(500).json({ error: "Errore interno", detail: err?.message });
  } finally {
    conn.release();
  }
});


// PUT /api/schedeTecniche/:id/tags
// Body: { tagIds: [1,2,3] }
router.put("/:id/tags", async (req, res) => {
  const { id } = req.params;
  const { tagIds } = req.body;

  if (!Array.isArray(tagIds)) {
    return res.status(400).json({ error: "tagIds deve essere un array" });
  }

  const cleanTagIds = [...new Set(tagIds.map(Number))].filter(
    (n) => Number.isInteger(n) && n > 0
  );

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // verifica scheda esiste
    const [scheda] = await conn.query(`SELECT id FROM SchedeTecniche WHERE id = ?`, [id]);
    if (!scheda.length) {
      await conn.rollback();
      return res.status(404).json({ error: "Scheda non trovata" });
    }

    // cancella relazioni esistenti
    await conn.query(`DELETE FROM scheda_tag WHERE scheda_id = ?`, [id]);

    // inserisci nuove relazioni (solo tag validi e attivi)
    if (cleanTagIds.length) {
      const [valid] = await conn.query(
        `SELECT id FROM tag WHERE attivo = 1 AND id IN (${cleanTagIds
          .map(() => "?")
          .join(",")})`,
        cleanTagIds
      );

      const validSet = new Set(valid.map((r) => r.id));
      const finalIds = cleanTagIds.filter((tid) => validSet.has(tid));

      if (finalIds.length) {
        const values = finalIds.map((tid) => [Number(id), tid]);
        await conn.query(`INSERT INTO scheda_tag (scheda_id, tag_id) VALUES ?`, [values]);
      }
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error("Errore salvataggio tag scheda:", err);
    res.status(500).json({ error: "Errore interno durante il salvataggio dei tag." });
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



router.delete('/tipiSchedaTecnica/:id', async (req, res) => {
  const { id } = req.params;
  await db.query(`DELETE FROM TipiSchedaTecnica WHERE id = ?`, [id]);
  res.json({ success: true });
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

    /**
    // 🏷️ 1. Estrai hashtag dalla nota
    const tags = estraiHashtag(note);

    // 🏷️ 2. Cancella i vecchi tag della scheda
    await conn.query("DELETE FROM SchedeTag WHERE scheda_id = ?", [id]);

    // 🏷️ 3. Inserisci i nuovi tag
    for (const tag of tags) {
      await conn.query("INSERT INTO SchedeTag (scheda_id, tag) VALUES (?, ?)", [id, tag]);
    }
     **/
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

/**
// GET /api/schedeTecniche/tag/:tag
router.get("/tag/:tag", async (req, res) => {
  const { tag } = req.params;
  try {
    const [righe] = await db.query(`
      SELECT st.*
      FROM SchedeTecniche st
      JOIN SchedeTag t ON st.id = t.scheda_id
      WHERE t.tag = ?
    `, [tag]);

    res.json(righe);
  } catch (error) {
    console.error("Errore ricerca per tag:", error);
    res.status(500).json({ error: "Errore interno del server" });
  }
});
/**/

module.exports = router;
