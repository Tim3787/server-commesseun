const express = require('express');
const router = express.Router();
const db = require('../config/db');

/**
 * GET /api/tags
 * Query params:
 * - reparto: "software" | "elettrico" | ...
 * - includeGlobal: "1" (include reparto IS NULL)
 * - search: string (cerca su nome)
 * - attivo: "1" | "0" (default 1)
 */
router.get('/', async (req, res) => {
  try {
    const { reparto, includeGlobal, search, attivo } = req.query;

    const includeGlobalBool = includeGlobal === '1';
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
    console.error('Errore durante il recupero dei tag:', err);
    res.status(500).send('Errore durante il recupero dei tag.');
  }
});

/**
 * POST /api/tags
 * Body:
 * { nome, reparto, prefisso, colore, descrizione, attivo }
 */
router.post('/', async (req, res) => {
  const {
    nome,
    reparto = null,
    prefisso,
    colore = '#cccccc',
    descrizione = null,
    attivo = 1,
  } = req.body;

  if (!nome || !prefisso) {
    return res.status(400).send('Nome e prefisso sono obbligatori.');
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

    res.status(201).send('Tag creato con successo.');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).send('Esiste già un tag con lo stesso prefisso e nome.');
    }
    console.error('Errore durante la creazione del tag:', err);
    res.status(500).send('Errore durante la creazione del tag.');
  }
});

/**
 * PUT /api/tags/:id
 * Body: { nome, reparto, prefisso, colore, descrizione, attivo }
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, reparto = null, prefisso, colore, descrizione, attivo } = req.body;

  if (!nome || !prefisso) {
    return res.status(400).send('Nome e prefisso sono obbligatori.');
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
      colore ?? '#cccccc',
      descrizione ?? null,
      attivo === undefined ? 1 : attivo ? 1 : 0,
      id,
    ]);

    res.send('Tag aggiornato con successo');
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).send('Esiste già un tag con lo stesso prefisso e nome.');
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
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const sql = `UPDATE tag SET attivo = 0 WHERE id = ?`;
    await db.query(sql, [id]);
    res.status(200).send('Tag disattivato con successo!');
  } catch (err) {
    console.error('Errore durante la disattivazione del tag:', err);
    res.status(500).send('Errore durante la disattivazione del tag.');
  }
});

/**
 * GET /api/tags/scheda/:schedaId
 * Tag associati ad una scheda tecnica
 */
router.get('/scheda/:schedaId', async (req, res) => {
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
    console.error('Errore durante il recupero tag della scheda:', err);
    res.status(500).send('Errore durante il recupero tag della scheda.');
  }
});

/**
 * PUT /api/tags/scheda/:schedaId
 * Body: { tagIds: [1,2,3] }
 * Replace totale (transazione)
 */
router.put('/scheda/:schedaId', async (req, res) => {
  const { schedaId } = req.params;
  const { tagIds } = req.body;

  if (!Array.isArray(tagIds)) {
    return res.status(400).send('tagIds deve essere un array.');
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
      return res.status(404).send('Scheda tecnica non trovata.');
    }

    // pulisci relazioni esistenti
    await conn.query(`DELETE FROM scheda_tag WHERE scheda_id = ?`, [schedaId]);

    // inserisci nuove
    if (cleanTagIds.length > 0) {
      // opzionale: verifica che i tag esistano e siano attivi
      const [validTags] = await conn.query(
        `SELECT id FROM tag WHERE id IN (${cleanTagIds.map(() => '?').join(',')}) AND attivo = 1`,
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
    res.send('Tag della scheda aggiornati con successo.');
  } catch (err) {
    await conn.rollback();
    console.error("Errore durante l'aggiornamento tag scheda:", err);
    res.status(500).send("Errore durante l'aggiornamento tag scheda.");
  } finally {
    conn.release();
  }
});

/**
 * GET /api/tags/autocomplete
 * Query params:
 * - q: stringa di ricerca (senza #)
 * - reparto: opzionale
 * - includeGlobal: "1" per includere reparto IS NULL
 * - limit: opzionale (default 10)
 *
 * Ritorna i tag con conteggio schede/commesse
 */
router.get('/autocomplete', async (req, res) => {
  try {
    const { q = '', reparto, includeGlobal, limit = 10 } = req.query;

    const includeGlobalBool = includeGlobal === '1';
    const cleanQ = String(q).trim();
    const cleanLimit = Math.min(Math.max(Number(limit) || 10, 1), 20);

    let sql = `
      SELECT
        t.id,
        t.nome,
        t.prefisso,
        t.reparto,
        t.colore,
        COUNT(DISTINCT st.id) AS schede_count,
        COUNT(DISTINCT st.commessa_id) AS commesse_count
      FROM tag t
      LEFT JOIN scheda_tag stg ON stg.tag_id = t.id
      LEFT JOIN SchedeTecniche st ON st.id = stg.scheda_id
      WHERE t.attivo = 1
    `;
    const params = [];

    // filtro reparto
    if (reparto) {
      if (includeGlobalBool) {
        sql += ` AND (t.reparto = ? OR t.reparto IS NULL)`;
        params.push(reparto);
      } else {
        sql += ` AND t.reparto = ?`;
        params.push(reparto);
      }
    }

    // ricerca
    if (cleanQ) {
      sql += ` AND (t.nome LIKE CONCAT('%', ?, '%') OR t.prefisso LIKE CONCAT('%', ?, '%'))`;
      params.push(cleanQ, cleanQ);
    }

    sql += `
      GROUP BY t.id, t.nome, t.prefisso, t.reparto, t.colore
      ORDER BY
        CASE
          WHEN t.nome LIKE CONCAT(?, '%') THEN 0
          ELSE 1
        END,
        commesse_count DESC,
        t.nome ASC
      LIMIT ?
    `;
    params.push(cleanQ, cleanLimit);

    const [rows] = await db.query(sql, params);

    res.json(
      rows.map((row) => ({
        type: 'tag',
        id: row.id,
        nome: row.nome,
        label: `#${row.nome}`,
        prefisso: row.prefisso,
        reparto: row.reparto,
        colore: row.colore,
        schedeCount: Number(row.schede_count || 0),
        commesseCount: Number(row.commesse_count || 0),
      }))
    );
  } catch (err) {
    console.error('Errore durante autocomplete tag:', err);
    res.status(500).send('Errore durante autocomplete tag.');
  }
});

/**
 * GET /api/tags/commesse-by-tag
 * Query params:
 * - tag: nome tag (senza #) oppure id
 *
 * Ritorna le commesse che hanno almeno una scheda con quel tag
 */
router.get('/commesse-by-tag', async (req, res) => {
  try {
    const rawTag = String(req.query.tag || '').trim();
    const tagId = Number(req.query.tagId);

    if (!rawTag && !Number.isInteger(tagId)) {
      return res.status(400).send('tag o tagId obbligatorio.');
    }

    let whereClause = '';
    const params = [];

    if (Number.isInteger(tagId) && tagId > 0) {
      whereClause = `t.id = ?`;
      params.push(tagId);
    } else {
      const cleanTag = rawTag.startsWith('#') ? rawTag.slice(1) : rawTag;
      whereClause = `t.nome = ?`;
      params.push(cleanTag);
    }

    const sql = `
      SELECT
        c.id AS commessa_id,
        c.numero_commessa,
        c.cliente,
        COUNT(DISTINCT st.id) AS schede_count,
        MAX(st.data_modifica) AS ultima_modifica,
        t.id AS tag_id,
        t.nome AS tag_nome
      FROM tag t
      JOIN scheda_tag stg ON stg.tag_id = t.id
      JOIN SchedeTecniche st ON st.id = stg.scheda_id
      JOIN Commesse c ON c.id = st.commessa_id
      WHERE t.attivo = 1
        AND ${whereClause}
      GROUP BY c.id, c.numero_commessa, c.cliente, t.id, t.nome
      ORDER BY c.numero_commessa DESC
      LIMIT 30
    `;

    const [rows] = await db.query(sql, params);

    res.json(
      rows.map((row) => ({
        type: 'commessaByTag',
        commessa_id: row.commessa_id,
        numero_commessa: row.numero_commessa,
        cliente: row.cliente,
        schedeCount: Number(row.schede_count || 0),
        ultimaModifica: row.ultima_modifica,
        tag: {
          id: row.tag_id,
          nome: row.tag_nome,
          label: `#${row.tag_nome}`,
        },
      }))
    );
  } catch (err) {
    console.error('Errore durante ricerca commesse per tag:', err);
    res.status(500).send('Errore durante ricerca commesse per tag.');
  }
});

module.exports = router;
