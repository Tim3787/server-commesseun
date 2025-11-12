const express = require("express");
const router = express.Router();
const db = require("../config/db"); // Assicurati che il percorso sia corretto
const { verificaStatiCommesse, allineaStatiCommesse } = require("./statiAvanzamentoUtils");
const { inviaNotificheUtenti, inviaNotificaCategoria } = require("../Utils/notificationManager");

// Recupera tutti gli stati di avanzamento di una commessa specifica
router.get("/:commessa_id", async (req, res) => {
  const { commessa_id } = req.params;

  try {
    const sql = `SELECT stati_avanzamento FROM commesse WHERE id = ?`;
    const [results] = await db.query(sql, [commessa_id]);

    if (results.length === 0) {
      return res.status(404).send("Commessa non trovata.");
    }

    const statiAvanzamento = JSON.parse(results[0].stati_avanzamento || "[]");

    res.json(statiAvanzamento);
  } catch (error) {
    console.error("Errore durante il recupero degli stati di avanzamento della commessa:", error);
    res.status(500).send("Errore durante il recupero degli stati di avanzamento della commessa.");
  }
});


// Aggiungi un nuovo stato di avanzamento per una commessa
router.post("/", async (req, res) => {
  const { commessa_id, reparto_id, stato_avanzamento_id, data_inizio, data_fine } = req.body;

  try {
    const sql = `SELECT stati_avanzamento FROM commesse WHERE id = ?`;
    const [results] = await db.query(sql, [commessa_id]);

    if (results.length === 0) {
      return res.status(404).send("Commessa non trovata.");
    }

    const statiAvanzamento = JSON.parse(results[0].stati_avanzamento || "[]");

    statiAvanzamento.push({
      reparto_id,
      stato_id: stato_avanzamento_id,
      data_inizio,
      data_fine,
      ordine: statiAvanzamento.length + 1,
    });

    const updateSql = `UPDATE commesse SET stati_avanzamento = ? WHERE id = ?`;
    await db.query(updateSql, [JSON.stringify(statiAvanzamento), commessa_id]);
    await verificaStatiCommesse();
    await allineaStatiCommesse();
    res.status(201).send("Stato di avanzamento aggiunto con successo!");
  } catch (error) {
    console.error("Errore durante l'aggiunta dello stato di avanzamento:", error);
    res.status(500).send("Errore durante l'aggiunta dello stato di avanzamento.");
  }
});


// Modifica uno stato di avanzamento per una commessa
router.put("/:commessa_id/stati/:stato_id", async (req, res) => {
  const { commessa_id, stato_id } = req.params;
  const { data_inizio, data_fine } = req.body;

  try {

    // 1️⃣ Legge lo stato attuale della commessa
    const sql = `SELECT stati_avanzamento FROM commesse WHERE id = ?`;
    const [results] = await db.query(sql, [commessa_id]);

    if (results.length === 0) {
      return res.status(404).send("Commessa non trovata.");
    }

    let statiAvanzamento = JSON.parse(results[0].stati_avanzamento || "[]");
const numeroCommessa = results[0].numero_commessa;

    // 2️⃣ Identifica lo stato e il reparto modificato
    let repartoId = null;
    let statoNome = null;

    statiAvanzamento = statiAvanzamento.map((stato) => {
      if (stato.stato_id === parseInt(stato_id)) {
        repartoId = stato.reparto_id;
        statoNome = stato.nome;
        return {
          ...stato,
          data_inizio: data_inizio || stato.data_inizio,
          data_fine: data_fine || stato.data_fine,
        };
      }
      return stato;
    });

     // 3️⃣ Aggiorna la commessa nel DB
    const updateSql = `UPDATE commesse SET stati_avanzamento = ? WHERE id = ?`;
    await db.query(updateSql, [JSON.stringify(statiAvanzamento), commessa_id]);

        // 4️⃣ Recupera il nome del reparto
    let repartoNome = "Sconosciuto";
    if (repartoId) {
      const [[r]] = await db.query(`SELECT nome FROM reparti WHERE id = ?`, [repartoId]);
      if (r) repartoNome = r.nome;
    }

      // 5️⃣ 🔔 Invia la notifica automatica
if (repartoId && statoNome) {
  await inviaNotificaCategoria({
    categoria: "stato_avanzamento",
    titolo: "Aggiornamento stato avanzamento",
    messaggio: `Il reparto ${repartoNome} ha aggiornato lo stato "${statoNome}" per la commessa ${numeroCommessa}.`,
    commessaId: commessa_id,
    repartoId, // serve per filtrare i destinatari
    includiGlobali: true // opzionale: notifica anche i reparti interessati globalmente
  });
}
    // 6️⃣ Risposta finale
    res.send("Stato avanzamento aggiornato con successo!");
  } catch (error) {
    console.error("Errore durante l'aggiornamento dello stato avanzamento:", error);
    res.status(500).send("Errore durante l'aggiornamento dello stato avanzamento.");
  }
});


// Elimina uno stato di avanzamento di una commessa
router.delete("/:commessa_id/stati/:stato_id", async (req, res) => {
  const { commessa_id, stato_id } = req.params;

  try {
    const sql = `SELECT stati_avanzamento FROM commesse WHERE id = ?`;
    const [results] = await db.query(sql, [commessa_id]);

    if (results.length === 0) {
      return res.status(404).send("Commessa non trovata.");
    }

    let statiAvanzamento = JSON.parse(results[0].stati_avanzamento || "[]");

    statiAvanzamento = statiAvanzamento.filter((stato) => stato.stato_id !== parseInt(stato_id));

    const updateSql = `UPDATE commesse SET stati_avanzamento = ? WHERE id = ?`;
    await db.query(updateSql, [JSON.stringify(statiAvanzamento), commessa_id]);
    await verificaStatiCommesse();
    await allineaStatiCommesse();
    res.send("Stato di avanzamento eliminato con successo!");
  } catch (error) {
    console.error("Errore durante l'eliminazione dello stato di avanzamento:", error);
    res.status(500).send("Errore durante l'eliminazione dello stato di avanzamento.");
  }
});


//Aggiorna l'ordine degli stati per una commessa
router.put("/:commessa_id/reparti/:reparto_id/stati-ordine", async (req, res) => {
  const { commessa_id, reparto_id } = req.params;
  const stati = req.body; // Deve essere un array ordinato

  if (!Array.isArray(stati)) {
    return res.status(400).send("Il payload deve essere un array di stati con ID e ordine.");
  }

  try {
    const sql = `SELECT stati_avanzamento FROM commesse WHERE id = ?`;
    const [results] = await db.query(sql, [commessa_id]);

    if (results.length === 0) {
      return res.status(404).send("Commessa non trovata.");
    }

    let statiAvanzamento = JSON.parse(results[0].stati_avanzamento || "[]");

    statiAvanzamento = statiAvanzamento.map((stato) => {
      const nuovoOrdine = stati.find((s) => s.stato_id === stato.stato_id);
      return nuovoOrdine
        ? { ...stato, ordine: nuovoOrdine.ordine }
        : stato;
    });

    const updateSql = `UPDATE commesse SET stati_avanzamento = ? WHERE id = ?`;
    await db.query(updateSql, [JSON.stringify(statiAvanzamento), commessa_id]);

    res.status(200).send("Ordine degli stati aggiornato con successo!");
  } catch (error) {
    console.error("Errore durante l'aggiornamento dell'ordine degli stati:", error);
    res.status(500).send("Errore durante l'aggiornamento dell'ordine degli stati.");
  }
});



module.exports = router;
