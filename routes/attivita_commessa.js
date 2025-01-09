const express = require("express");
const router = express.Router();
const db = require("../config/db");



// Rotta per ottenere le attività
router.get("/", async (req, res) => {
  const { commessa_id, risorsa_id, reparto, settimana } = req.query;

  let sql = `
  SELECT 
  ac.id, 
  ac.commessa_id, 
  c.numero_commessa, 
  ac.risorsa_id, 
  r.nome AS risorsa, 
  rep.nome AS reparto, -- Aggiungi il nome del reparto
  ac.attivita_id, 
  ad.nome_attivita, 
  ac.data_inizio, 
  ac.durata 
FROM attivita_commessa ac
JOIN commesse c ON ac.commessa_id = c.id
LEFT JOIN risorse r ON ac.risorsa_id = r.id
JOIN attivita ad ON ac.attivita_id = ad.id
JOIN reparti rep ON ac.reparto_id = rep.id -- Associazione con la tabella reparti
WHERE 1=1;
`;

  const params = [];

  if (commessa_id) {
    sql += " AND ac.commessa_id = ?";
    params.push(commessa_id);
  }

  if (risorsa_id) {
    sql += " AND ac.risorsa_id = ?";
    params.push(risorsa_id);
  }

  if (reparto) {
    sql += " AND r.reparto = ?";
    params.push(reparto);
  }

  if (settimana) {
    sql += ` AND WEEK(ac.data_inizio) = WEEK(?)`;
    params.push(settimana);
  }

  try {
    console.log("Query SQL:", sql);
    console.log("Parametri:", params);
    const [results] = await db.query(sql, params);
    res.json(results);
  } catch (err) {
    console.error("Errore durante il recupero delle attività assegnate:", err);
    res.status(500).send("Errore durante il recupero delle attività assegnate.");
  }
});


// Assegnare un'attività a una commessa
router.post("/", async (req, res) => {
  const { commessa_id, reparto_id, risorsa_id, attivita_id, data_inizio, durata } = req.body;

  if (!commessa_id || !reparto_id || !attivita_id || !risorsa_id || !data_inizio || !durata) {
    return res.status(400).send("Tutti i campi sono obbligatori.");
  }

  try {
    const query = `
      INSERT INTO attivita_commessa (commessa_id, reparto_id, risorsa_id, attivita_id, data_inizio, durata)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    await db.query(query, [commessa_id, reparto_id, risorsa_id, attivita_id, data_inizio, durata]);

    res.status(201).send("Attività assegnata con successo!");
  } catch (error) {
    console.error("Errore durante l'assegnazione dell'attività:", error);
    res.status(500).send("Errore durante l'assegnazione dell'attività.");
  }
});





const formatDateForMySQL = (isoDate) => {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Modificare un'attività
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { commessa_id, risorsa_id, attivita_id, data_inizio, durata } = req.body;

  const formattedDataInizio = formatDateForMySQL(data_inizio);

  const sql = `
    UPDATE attivita_commessa 
    SET commessa_id = ?, risorsa_id = ?, attivita_id = ?, data_inizio = ?, durata = ? 
    WHERE id = ?
  `;
  try {
    console.log("Formatted data_inizio:", formattedDataInizio);
    await db.query(sql, [commessa_id, risorsa_id, attivita_id, formattedDataInizio, durata, id]);
    res.send("Attività aggiornata con successo!");
  } catch (err) {
    console.error("Errore durante la modifica dell'attività:", err);
    res.status(500).send("Errore durante la modifica dell'attività.");
  }
});

// Eliminare un'attività
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const sql = `DELETE FROM attivita_commessa WHERE id = ?`;

  try {
    await db.query(sql, [id]);
    res.send("Attività eliminata con successo!");
  } catch (err) {
    console.error("Errore durante l'eliminazione dell'attività:", err);
    res.status(500).send("Errore durante l'eliminazione dell'attività.");
  }
});

module.exports = router;