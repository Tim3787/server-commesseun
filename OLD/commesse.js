const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Utility per la formattazione dei dati delle commesse
const formatCommesseData = (results) => {
  return results.reduce((acc, row) => {
    const commessa = acc.find((c) => c.id === row.commessa_id);
    const stato = {
      stato_id: row.stato_id,
      nome_stato: row.nome_stato,
      reparto_nome: row.reparto_nome,
      reparto_id: row.reparto_id,
      data_inizio: row.data_inizio,
      data_fine: row.data_fine,
    };

    if (!commessa) {
      acc.push({
        id: row.commessa_id,
        numero_commessa: row.numero_commessa,
        tipo_macchina: row.tipo_macchina,
        stati_avanzamento: [stato],
      });
    } else {
      commessa.stati_avanzamento.push(stato);
    }

    return acc;
  }, []);
};

// Ottenere tutte le commesse con stati avanzamento raggruppati
router.get("/", async (req, res) => {
  const sql = `
    SELECT 
      c.id, 
      c.numero_commessa, 
      c.tipo_macchina, 
      c.descrizione, 
      c.data_consegna, 
      c.altri_particolari,
      GROUP_CONCAT(CONCAT(r.nome, ': ', sa.nome_stato) SEPARATOR '; ') AS stati_avanzamento
    FROM commesse c
    LEFT JOIN commessa_stati cs ON c.id = cs.commessa_id
    LEFT JOIN reparti r ON cs.reparto_id = r.id
    LEFT JOIN stati_avanzamento sa ON cs.stato_avanzamento_id = sa.id
    GROUP BY c.id
  `;
  try {
    const [results] = await db.query(sql);
    res.json(results);
  } catch (err) {
    console.error("Errore durante il recupero delle commesse:", err);
    res.status(500).send("Errore durante il recupero delle commesse.");
  }
});


// Ottenere tutte le commesse con dettagli stati avanzamento
router.get("/stati", async (req, res) => {
  const sql = `
    SELECT 
      c.id AS commessa_id,
      c.numero_commessa,
      c.tipo_macchina,
      r.nome AS reparto_nome,
      cs.reparto_id,
      sa.id AS stato_id,
      sa.nome_stato,
      cs.data_inizio,
      cs.data_fine
    FROM commessa_stati cs
    JOIN commesse c ON cs.commessa_id = c.id
    JOIN stati_avanzamento sa ON cs.stato_avanzamento_id = sa.id
    JOIN reparti r ON cs.reparto_id = r.id
    ORDER BY c.id, r.id, sa.id;
  `;

  try {
    const [results] = await db.query(sql);
    const commesse = formatCommesseData(results);
    res.json(commesse);
  } catch (err) {
    console.error("Errore nel recupero stati avanzamento:", err);
    res.status(500).send("Errore nel recupero stati avanzamento.");
  }
});
// Aggiornare le date di uno stato avanzamento
router.put("/stati-avanzamento/:statoId", async (req, res) => {
  const { statoId } = req.params;
  const { data_inizio, data_fine } = req.body;

  if (!data_inizio && !data_fine) {
    return res.status(400).json({ error: "Data inizio o data fine richieste." });
  }

  const query = `
    UPDATE commessa_stati
    SET data_inizio = ?, data_fine = ?
    WHERE id = ?
  `;

  try {
    const [result] = await db.query(query, [data_inizio, data_fine, statoId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Stato non trovato." });
    }
    res.status(200).json({ message: "Date aggiornate con successo." });
  } catch (error) {
    console.error("Errore durante l'aggiornamento delle date:", error);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

// Aggiornare lo stato avanzamento per un reparto di una commessa
router.put("/:commessaId/reparti/:repartoId/stato", async (req, res) => {
  const { commessaId, repartoId } = req.params;
  const { stato_id } = req.body;

  if (!stato_id) {
    return res.status(400).json({ error: "Stato ID è richiesto." });
  }

  const query = `
    UPDATE commessa_stati
    SET stato_avanzamento_id = ?
    WHERE commessa_id = ? AND reparto_id = ?
  `;

  try {
    const [result] = await db.query(query, [stato_id, commessaId, repartoId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Stato o commessa non trovati." });
    }
    res.status(200).json({ message: "Stato aggiornato con successo." });
  } catch (error) {
    console.error("Errore durante l'aggiornamento dello stato:", error);
    res.status(500).json({ error: "Errore interno del server." });
  }
});

router.put("/stati", async (req, res) => {
  const { id, stato_id, reparto_id, data_inizio, data_fine } = req.body;

  // Log dei dati ricevuti
  console.log("Dati ricevuti dal frontend:", req.body);

  if (!id || !stato_id || !reparto_id) {
    console.error("Errore: Parametri mancanti.");
    return res.status(400).json({ error: "id, stato_id e reparto_id sono richiesti." });
  }

  if (!data_inizio && !data_fine) {
    console.error("Errore: Nessuna data fornita.");
    return res.status(400).json({ error: "Almeno una data è richiesta (data_inizio o data_fine)." });
  }

  // Query SQL
  const query = `
    UPDATE commessa_stati
    SET data_inizio = ?, data_fine = ?
    WHERE commessa_id = ? AND stato_avanzamento_id = ? AND reparto_id = ?
  `;

  try {
    const [result] = await db.query(query, [data_inizio, data_fine, id, stato_id, reparto_id]);

    if (result.affectedRows === 0) {
      console.error("Errore: Nessun record aggiornato.");
      return res.status(404).json({ error: "Commessa, stato avanzamento o reparto non trovato." });
    }

    res.status(200).json({ message: "Date aggiornate con successo." });
  } catch (error) {
    console.error("Errore interno:", error);
    res.status(500).json({ error: "Errore interno del server." });
  }
});




// Eliminare una commessa e i relativi stati avanzamento
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM commessa_stati WHERE commessa_id = ?", [id]);
    const [result] = await db.query("DELETE FROM commesse WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).send("Commessa non trovata.");
    }
    res.send("Commessa eliminata con successo!");
  } catch (err) {
    console.error("Errore durante l'eliminazione della commessa:", err);
    res.status(500).send("Errore durante l'eliminazione della commessa.");
  }
});

// Creare una nuova commessa con stati avanzamento iniziali
router.post("/", async (req, res) => {
  const { numero_commessa, tipo_macchina, descrizione, data_consegna, altri_particolari } = req.body;

  const insertCommessaSql = `
    INSERT INTO commesse (numero_commessa, tipo_macchina, descrizione, data_consegna, altri_particolari)
    VALUES (?, ?, ?, ?, ?)
  `;

  try {
    const connection = await db.getConnection();
    await connection.beginTransaction();

    const [result] = await connection.query(insertCommessaSql, [
      numero_commessa,
      tipo_macchina,
      descrizione,
      data_consegna,
      altri_particolari,
    ]);

    const commessaId = result.insertId;

    const queryStatiPerReparto = `
      SELECT reparto_id, id AS stato_avanzamento_id 
      FROM stati_avanzamento 
      WHERE nome_stato = 'In Entrata'
    `;
    const [statiPerReparto] = await connection.query(queryStatiPerReparto);

    const valoriStati = statiPerReparto.map((stato) => [
      commessaId,
      stato.reparto_id,
      stato.stato_avanzamento_id,
      new Date(),
      null,
      null,
    ]);

    const insertStatiSql = `
      INSERT INTO commessa_stati (commessa_id, reparto_id, stato_avanzamento_id, data_aggiornamento, data_inizio, data_fine)
      VALUES ?
    `;
    await connection.query(insertStatiSql, [valoriStati]);

    await connection.commit();
    connection.release();

    res.status(201).json({
      message: "Commessa creata con successo e stati avanzamento associati.",
      commessaId: commessaId,
    });
  } catch (err) {
    console.error("Errore durante l'inserimento della commessa:", err);
    res.status(500).send("Errore durante l'inserimento della commessa.");
  }
});


module.exports = router;
