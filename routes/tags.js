const express = require("express");
const router = express.Router();
const db = require("../config/db");

/**
 * GET /api/tags
 * Query params:
 * - reparto: "software" | "elettrico" | ...
 * - includeGlobal: "1" (include reparto IS NULL)
 * - search: string (cerca su nome)
 * - attivo: "1" | "0" (default 1)
 */
router.get("/", async (req, res) => {
  try {
    const { reparto, includeGlobal, search, attivo } = req.query;

    const includeGlobalBool = includeGlobal === "1";
    const attivoVal = attivo === undefined ? 1 : Number(attivo);

    let sql = `
      SELECT id, nome, reparto, prefisso, colore, descrizione, attivo, created_at
      FROM tag
      WHERE 1=1
    `;
    const params = [];

    // attivo filter (default 1)
    if (!Number.isNaN(attivoVal)) {
      sql += ` AND attivo = ?`;
      params.push(attivoVal);
    }

    // reparto + globali
    if (reparto) {
      if (includeGlobalBool) {
        sql += ` AND (reparto = ? OR reparto IS NULL)`;
        params.push(reparto);
      } else {
        sql += ` AND reparto = ?`;
        params.push(reparto);
      }
    }

    // search su nome (e volendo anche prefisso)
    if (search && search.trim()) {
      sql += ` AND (nome LIKE CONCAT('%', ?, '%') OR prefisso LIKE CONCAT('%', ?, '%'))`;
      params.push(search.trim(), search.trim());
    }

    sql += ` ORDER BY (reparto IS NULL), prefisso, nome`;

    const [results] = await db.query(sql, params);
    res.json(results);
  } catch (err) {
    console.error("Errore durante il recupero dei tag:", err);
    res.status(500).send("Errore durante il recupero dei tag.");
  }
});

/**
 * POST /api/tags
 * Body:
 * { nome, reparto, prefisso, colore, descrizione, attivo }
 */
router.post("/", async (req, res) => {
  const { nome, reparto = null, prefisso, colore = "#cccccc", descrizione = null, attivo = 1 } = req.body;

  if (!nome || !prefisso) {
    return res.status(400).send("Nome e prefisso sono obbligatori.");
  }

  try {
    const insertSql = `
      INSERT INTO tag (nome, reparto, prefisso, colore, descrizione, attivo)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    await db.query(insertSql, [
      String(nome).trim(),
      reparto ? String(reparto).trim() : null,
      String(prefisso).trim().toUpperCase(),
      colore,
      descrizione,
      attivo ? 1 : 0,
    ]);

    res.status(201).send("Tag creato con successo.");
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).send("Esiste già un tag con lo stesso prefisso e nome.");
    }
    console.error("Errore durante la creazione del tag:", err);
    res.status(500).send("Errore durante la creazione del tag.");
  }
});

/**
 * PUT /api/tags/:id
 * Body: { nome, reparto, prefisso, colore, descrizione, attivo }
 */
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { nome, reparto = null, prefisso, colore, descrizione, attivo } = req.body;

  if (!nome || !prefisso) {
    return res.status(400).send("Nome e prefisso sono obbligatori.");
  }

  try {
    const updateSql = `
      UPDATE tag
      SET nome = ?, reparto = ?, prefisso = ?, colore = ?, descrizione = ?, attivo = ?
      WHERE id = ?
    `;

    await db.query(updateSql, [
      String(nome).trim(),
      reparto ? String(reparto).trim() : null,
      String(prefisso).trim().toUpperCase(),
      colore ?? "#cccccc",
      descrizione ?? null,
      attivo === undefined ? 1 : (attivo ? 1 : 0),
      id,
    ]);

    res.send("Tag aggiornato con successo");
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).send("Esiste già un tag con lo stesso prefisso e nome.");
    }
    console.error("Errore durante l'aggiornamento del tag:", err);
    res.status(500).send("Errore durante l'aggiornamento del tag");
  }
});

/**
 * DELETE /api/tags/:id
 * Soft delete: attivo = 0
 * (così non rompi lo storico delle schede già taggate)
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const sql = `UPDATE tag SET attivo = 0 WHERE id = ?`;
    await db.query(sql, [id]);
    res.status(200).send("Tag disattivato con successo!");
  } catch (err) {
    console.error("Errore durante la disattivazione del tag:", err);
    res.status(500).send("Errore durante la disattivazione del tag.");
  }
});

/**
 * GET /api/tags/scheda/:schedaId
 * Tag associati ad una scheda tecnica
 */
router.get("/scheda/:schedaId", async (req, res) => {
  const { schedaId } = req.params;

  try {
    const sql = `
      SELECT t.id, t.prefisso, t.nome, t.reparto, t.colore
      FROM scheda_tag st
      JOIN tag t ON t.id = st.tag_id
      WHERE st.scheda_id = ?
      ORDER BY t.prefisso, t.nome
    `;
    const [rows] = await db.query(sql, [schedaId]);
    res.json(rows);
  } catch (err) {
    console.error("Errore durante il recupero tag della scheda:", err);
    res.status(500).send("Errore durante il recupero tag della scheda.");
  }
});

/**
 * PUT /api/tags/scheda/:schedaId
 * Body: { tagIds: [1,2,3] }
 * Replace totale (transazione)
 */
router.put("/scheda/:schedaId", async (req, res) => {
  const { schedaId } = req.params;
  const { tagIds } = req.body;

  if (!Array.isArray(tagIds)) {
    return res.status(400).send("tagIds deve essere un array.");
  }

  // normalizza: numeri unici
  const cleanTagIds = [...new Set(tagIds.map(Number))].filter((n) => Number.isInteger(n) && n > 0);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // verifica che la scheda esista
    const [schede] = await conn.query(`SELECT id FROM SchedeTecniche WHERE id = ?`, [schedaId]);
    if (!schede || schede.length === 0) {
      await conn.rollback();
      return res.status(404).send("Scheda tecnica non trovata.");
    }

    // pulisci relazioni esistenti
    await conn.query(`DELETE FROM scheda_tag WHERE scheda_id = ?`, [schedaId]);

    // inserisci nuove
    if (cleanTagIds.length > 0) {
      // opzionale: verifica che i tag esistano e siano attivi
      const [validTags] = await conn.query(
        `SELECT id FROM tag WHERE id IN (${cleanTagIds.map(() => "?").join(",")}) AND attivo = 1`,
        cleanTagIds
      );
      const validTagIds = new Set(validTags.map((t) => t.id));
      const finalIds = cleanTagIds.filter((id) => validTagIds.has(id));

      if (finalIds.length > 0) {
        const values = finalIds.map((id) => [Number(schedaId), id]);
        await conn.query(`INSERT INTO scheda_tag (scheda_id, tag_id) VALUES ?`, [values]);
      }
    }

    await conn.commit();
    res.send("Tag della scheda aggiornati con successo.");
  } catch (err) {
    await conn.rollback();
    console.error("Errore durante l'aggiornamento tag scheda:", err);
    res.status(500).send("Errore durante l'aggiornamento tag scheda.");
  } finally {
    conn.release();
  }
});

module.exports = router;
