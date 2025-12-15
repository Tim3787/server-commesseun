const express = require("express");
const router = express.Router();
const db = require("../config/db"); // o come si chiama il tuo pool


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
      [cliente, reparto_id || null, titolo, descrizione]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error("Errore POST /clienti-specifiche:", err);
    res.status(500).json({ error: "Errore nella creazione della scheda cliente" });
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
        attivo !== undefined ? attivo : 1,
        id,
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Errore PUT /clienti-specifiche:", err);
    res.status(500).json({ error: "Errore nell'aggiornamento della scheda cliente" });
  }
});

// DELETE /api/clienti-specifiche/:id (soft delete volendo)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    await db.query(
      "UPDATE ClientiSpecifiche SET attivo = 0 WHERE id = ?",
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Errore DELETE /clienti-specifiche:", err);
    res.status(500).json({ error: "Errore nella cancellazione della scheda cliente" });
  }
});



module.exports = router;
