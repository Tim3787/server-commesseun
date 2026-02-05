const express = require("express");
const router = express.Router();
const db = require("../config/db"); // o come si chiama il tuo pool

// GET /api/clienti-specifiche
// Filtra per cliente e/o reparto_id
router.get("/", async (req, res) => {
  const { cliente, reparto_id, tutte } = req.query;

  let sql = "SELECT * FROM ClientiSpecifiche WHERE 1=1";
  const params = [];

  // solo attive di default, TUTTE se ?tutte=1
  if (!tutte) {
    sql += " AND attivo = 1";
  }

  if (cliente) {
    // Match parziale come in dashboard:
    // es. clienteFull = "Ehcolo x KMC Brande", cliente (tabella) = "Ehcolo"
    sql += " AND TRIM(?) LIKE CONCAT('%', TRIM(cliente), '%')";
    params.push(cliente);
  }

  if (reparto_id) {
    sql += " AND (reparto_id = ? OR reparto_id IS NULL)";
    params.push(reparto_id);
  }

  sql += " ORDER BY titolo ASC";

  try {
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Errore GET /clienti-specifiche:", err);
    res.status(500).json({ error: "Errore nel recupero specifiche cliente" });
  }
});

// POST /api/clienti-specifiche
router.post("/", async (req, res) => {
  const { cliente, reparto_id, titolo, descrizione } = req.body;

  if (!cliente || !titolo || !descrizione) {
    return res.status(400).json({ error: "Campi obbligatori mancanti" });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO ClientiSpecifiche (cliente, reparto_id, titolo, descrizione)
       VALUES (?, ?, ?, ?)`,
      [cliente, reparto_id || null, titolo, descrizione],
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error("Errore POST /clienti-specifiche:", err);
    res
      .status(500)
      .json({ error: "Errore nella creazione della scheda cliente" });
  }
});

// PUT /api/clienti-specifiche/:id
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { cliente, reparto_id, titolo, descrizione, attivo } = req.body;

  try {
    await db.query(
      `UPDATE ClientiSpecifiche
       SET cliente = ?,
           reparto_id = ?,
           titolo = ?,
           descrizione = ?,
           attivo = ?
       WHERE id = ?`,
      [
        cliente,
        reparto_id || null,
        titolo,
        descrizione,
        attivo !== undefined ? attivo : attivo,
        id,
      ],
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Errore PUT /clienti-specifiche:", err);
    res
      .status(500)
      .json({ error: "Errore nell'aggiornamento della scheda cliente" });
  }
});

// DELETE /api/clienti-specifiche/:id (soft delete volendo)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("UPDATE ClientiSpecifiche SET attivo = 0 WHERE id = ?", [
      id,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error("Errore DELETE /clienti-specifiche:", err);
    res
      .status(500)
      .json({ error: "Errore nella cancellazione della scheda cliente" });
  }
});

// DELETE HARD (per admin/debug)
router.delete("/:id/hard", async (req, res) => {
  const { id } = req.params;

  try {
    await db.query("DELETE FROM ClientiSpecifiche WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Errore DELETE HARD /clienti-specifiche:", err);
    res.status(500).json({ error: "Errore nella cancellazione definitiva" });
  }
});

module.exports = router;
