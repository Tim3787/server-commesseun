const express = require('express');
const router = express.Router();
const db = require("../config/db"); 

// ------------------------------------------------------------------
// MACCHINE - CRUD
// ------------------------------------------------------------------

// POST: Aggiungi una nuova macchina
router.post('/macchine', async (req, res) => {
  const { macchina, modello } = req.body;
  if (!macchina || !modello) {
    return res.status(400).send("I campi macchina e modello sono obbligatori.");
  }
  try {
    const insertSql = `INSERT INTO Macchine (macchina, modello) VALUES (?, ?)`;
    const [result] = await db.query(insertSql, [macchina, modello]);
    res.status(201).json({ message: "Macchina aggiunta con successo.", macchinaId: result.insertId });
  } catch (err) {
    console.error("Errore durante l'aggiunta della macchina:", err);
    res.status(500).send("Errore durante l'aggiunta della macchina.");
  }
});

// GET: Recupera tutte le macchine
router.get('/macchine', async (req, res) => {
  try {
    const [macchine] = await db.query(`SELECT * FROM Macchine`);
    res.status(200).json(macchine);
  } catch (err) {
    console.error("Errore durante il recupero delle macchine:", err);
    res.status(500).send("Errore durante il recupero delle macchine.");
  }
});

// PUT: Aggiorna una macchina per ID
router.put('/macchine/:id', async (req, res) => {
  const { id } = req.params;
  const { macchina, modello } = req.body;
  if (!macchina || !modello) {
    return res.status(400).send("I campi macchina e modello sono obbligatori per l'aggiornamento.");
  }
  try {
    const updateSql = `UPDATE Macchine SET macchina = ?, modello = ? WHERE id = ?`;
    await db.query(updateSql, [macchina, modello, id]);
    res.status(200).json({ message: "Macchina aggiornata con successo." });
  } catch (err) {
    console.error("Errore durante l'aggiornamento della macchina:", err);
    res.status(500).send("Errore durante l'aggiornamento della macchina.");
  }
});


// ------------------------------------------------------------------
// COMPONENTI - CRUD
// Il campo "tipo" è parte della tabella Componenti.  
// Puoi inserirvi anche solo un tipo (es. "1 motore") o più tipi separati da virgola (es. "1 motore, 2 motori").
// ------------------------------------------------------------------

// POST: Aggiungi un nuovo componente
router.post('/componenti', async (req, res) => {
  const { nome_componente, macchina, tipo } = req.body;
  if (!nome_componente || !macchina || !tipo) {
    return res.status(400).send("I campi nome_componente, macchina e tipo sono obbligatori.");
  }
  try {
    const insertSql = `INSERT INTO Componenti (componente, macchina, tipo) VALUES (?, ?, ?)`;
    const [result] = await db.query(insertSql, [nome_componente, macchina, tipo]);
    res.status(201).json({ message: "Componente aggiunto con successo.", componenteId: result.insertId });
  } catch (err) {
    console.error("Errore durante l'aggiunta del componente:", err);
    res.status(500).send("Errore durante l'aggiunta del componente.");
  }
});


// GET: Recupera tutti i componenti
router.get('/componenti', async (req, res) => {
  try {
    const [componenti] = await db.query(`SELECT * FROM Componenti`);
    res.status(200).json(componenti);
  } catch (err) {
    console.error("Errore durante il recupero dei componenti:", err);
    res.status(500).send("Errore durante il recupero dei componenti.");
  }
});

// PUT: Aggiorna un componente per ID
router.put('/componenti/:id', async (req, res) => {
  const { id } = req.params;
  const { nome_componente, macchina, tipo } = req.body;
  if (!nome_componente || !macchina || !tipo) {
    return res.status(400).send("I campi nome_componente, macchina e tipo sono obbligatori per l'aggiornamento.");
  }
  try {
    const updateSql = `UPDATE Componenti SET componente = ?, macchina = ?, tipo = ? WHERE id = ?`;
    await db.query(updateSql, [nome_componente, macchina, tipo, id]);
    res.status(200).json({ message: "Componente aggiornato con successo." });
  } catch (err) {
    console.error("Errore durante l'aggiornamento del componente:", err);
    res.status(500).send("Errore durante l'aggiornamento del componente.");
  }
});



// ------------------------------------------------------------------
// ASSOCIAZIONI CON COMMESSE (tavole: Commesse_Dettagli e Commesse_Componenti)
// La tabella "commesse" non va toccata: da lì attingiamo l'id per effettuare le associazioni.
// ------------------------------------------------------------------

// POST: Associa macchine a una commessa (inserimento in Commesse_Dettagli)
router.post('/commesse/:commessaId/macchine', async (req, res) => {
  const { commessaId } = req.params;
  let { macchina_ids } = req.body; // si aspetta un array di ID delle macchine

  // Se macchina_ids non è un array, lo trasformiamo in array
  if (!Array.isArray(macchina_ids)) {
    macchina_ids = [macchina_ids];
  }

  if (macchina_ids.length === 0) {
    return res.status(400).send("Il campo macchina_ids è obbligatorio e deve contenere almeno una macchina.");
  }

  try {
    // Verifica se la commessa esiste
    const [commessa] = await db.query('SELECT * FROM commesse WHERE id = ?', [commessaId]);
    if (commessa.length === 0) {
      return res.status(404).send("Commessa non trovata.");
    }
    
    // Elimina tutte le associazioni esistenti per la commessa
    await db.query('DELETE FROM Commesse_Dettagli WHERE commessa_id = ?', [commessaId]);

    // Inserisci le nuove associazioni
    const insertSql = `INSERT INTO Commesse_Dettagli (commessa_id, macchina_id) VALUES (?, ?)`;
    for (const macchinaId of macchina_ids) {
      await db.query(insertSql, [commessaId, macchinaId]);
    }
    res.status(201).json({ message: "Macchine associate con successo alla commessa." });
  } catch (err) {
    console.error("Errore durante l'associazione delle macchine alla commessa:", err);
    res.status(500).send("Errore durante l'associazione delle macchine alla commessa.");
  }
});

// GET: Recupera le macchine associate a una commessa
router.get('/commesse/:commessaId/macchine', async (req, res) => {
  const { commessaId } = req.params;
  try {
    const [macchine] = await db.query(`
      SELECT m.id, m.macchina, m.modello
      FROM Macchine m
      JOIN Commesse_Dettagli cd ON m.id = cd.macchina_id
      WHERE cd.commessa_id = ?
    `, [commessaId]);
    res.status(200).json(macchine);
  } catch (err) {
    console.error("Errore durante il recupero delle macchine associate:", err);
    res.status(500).send("Errore durante il recupero delle macchine associate.");
  }
});

// PUT: Aggiorna le macchine associate a una commessa (sostituzione completa)
router.put('/commesse/:commessaId/macchine', async (req, res) => {
  const { commessaId } = req.params;
  const { macchina_ids } = req.body;
  if (!macchina_ids || !Array.isArray(macchina_ids) || macchina_ids.length === 0) {
    return res.status(400).send("Il campo macchina_ids è obbligatorio e deve contenere almeno una macchina.");
  }
  try {
    const [commessa] = await db.query('SELECT * FROM commesse WHERE id = ?', [commessaId]);
    if (commessa.length === 0) {
      return res.status(404).send("Commessa non trovata.");
    }
    // Elimina le associazioni esistenti
    await db.query('DELETE FROM Commesse_Dettagli WHERE commessa_id = ?', [commessaId]);
    // Inserisci le nuove associazioni
    const insertSql = `INSERT INTO Commesse_Dettagli (commessa_id, macchina_id) VALUES (?, ?)`;
    for (const macchinaId of macchina_ids) {
      await db.query(insertSql, [commessaId, macchinaId]);
    }
    res.status(200).json({ message: "Macchine associate aggiornate con successo." });
  } catch (err) {
    console.error("Errore durante l'aggiornamento delle macchine associate:", err);
    res.status(500).send("Errore durante l'aggiornamento delle macchine associate.");
  }
});


// ------------------------------------------------------------------
// ASSOCIAZIONI: COMMESSE E COMPONENTI CON TIPO ASSOCIATO
// ------------------------------------------------------------------

// GET: Recupera i componenti associati a una commessa e a una specifica macchina
router.get('/commesse/:commessaId/macchine/:macchinaId/componenti', async (req, res) => {
  const { commessaId, macchinaId } = req.params;
  
  try {
    console.log(`Recupero componenti per la commessa ${commessaId} e la macchina ${macchinaId}...`);

    const [componenti] = await db.query(`
      SELECT cc.commessa_id, cc.macchina_id, cc.componente_id, c.componente, cc.tipo_associato
      FROM Commesse_Componenti cc
      JOIN Componenti c ON cc.componente_id = c.id
      WHERE cc.commessa_id = ? AND cc.macchina_id = ?
    `, [commessaId, macchinaId]);

    res.status(200).json(componenti);
  } catch (err) {
    console.error("Errore nel recupero dei componenti associati:", err);
    res.status(500).json({ error: "Errore nel recupero dei componenti associati.", details: err.message });
  }
});


// POST: Associa componenti a una commessa registrando il tipo specificato
// Il body deve contenere un array di oggetti con "componente_id" e "tipo_associato"
// POST: Associa componenti a una commessa registrando il tipo specificato
router.post('/commesse/:commessaId/componenti', async (req, res) => {
  const { commessaId } = req.params;
  const { componenti } = req.body; // array di oggetti { macchina_id, componente_id, tipo_associato }

  if (!componenti || !Array.isArray(componenti) || componenti.length === 0) {
    return res.status(400).send("Devi fornire un array di componenti con macchina_id, componente_id e tipo_associato.");
  }
  
  try {
    // Verifica se la commessa esiste
    const [commessa] = await db.query('SELECT * FROM commesse WHERE id = ?', [commessaId]);
    if (commessa.length === 0) {
      return res.status(404).send("Commessa non trovata.");
    }

    // Query di inserimento con macchina_id incluso
    const insertSql = `
      INSERT INTO Commesse_Componenti (commessa_id, macchina_id, componente_id, tipo_associato)
      VALUES (?, ?, ?, ?)
    `;

    for (const comp of componenti) {
      const { macchina_id, componente_id, tipo_associato } = comp;

      // Controllo se tutti i valori richiesti sono presenti
      if (!macchina_id || !componente_id || !tipo_associato) {
        return res.status(400).send("Ogni oggetto deve contenere macchina_id, componente_id e tipo_associato.");
      }

      // Inserimento nel database
      await db.query(insertSql, [commessaId, macchina_id, componente_id, tipo_associato]);
    }
    
    res.status(201).json({
      message: "Componenti associati con successo alla commessa con i rispettivi tipi e macchine."
    });
  } catch (err) {
    console.error("Errore durante l'associazione dei componenti:", err);
    res.status(500).send("Errore durante l'associazione dei componenti alla commessa.");
  }
});

/// PUT: Aggiorna i componenti associati a una commessa (sostituzione completa)
router.put('/commesse/:commessaId/componenti', async (req, res) => {
  const { commessaId } = req.params;
  const { componenti } = req.body; // array di oggetti { macchina_id, componente_id, tipo_associato }

  if (!componenti || !Array.isArray(componenti) || componenti.length === 0) {
    return res.status(400).send("Devi fornire un array di componenti con macchina_id, componente_id e tipo_associato.");
  }
  
  try {
    // Verifica se la commessa esiste
    const [commessa] = await db.query('SELECT * FROM commesse WHERE id = ?', [commessaId]);
    if (commessa.length === 0) {
      return res.status(404).send("Commessa non trovata.");
    }

    // Elimina le associazioni esistenti per la commessa
    await db.query('DELETE FROM Commesse_Componenti WHERE commessa_id = ?', [commessaId]);
    
    // Inserisci le nuove associazioni con macchina_id incluso
    const insertSql = `
      INSERT INTO Commesse_Componenti (commessa_id, macchina_id, componente_id, tipo_associato)
      VALUES (?, ?, ?, ?)
    `;

    for (const comp of componenti) {
      const { macchina_id, componente_id, tipo_associato } = comp;

      if (!macchina_id || !componente_id || !tipo_associato) {
        return res.status(400).send("Ogni oggetto deve contenere macchina_id, componente_id e tipo_associato.");
      }

      await db.query(insertSql, [commessaId, macchina_id, componente_id, tipo_associato]);
    }
    
    res.status(200).json({ message: "Componenti aggiornati con successo alla commessa." });
  } catch (err) {
    console.error("Errore durante l'aggiornamento dei componenti associati:", err);
    res.status(500).send("Errore durante l'aggiornamento dei componenti associati.");
  }
});

// DELETE: Rimuove un'associazione componente da una commessa e da una macchina specifica
router.delete('/commesse/:commessaId/macchine/:macchinaId/componenti/:componenteId', async (req, res) => {
  const { commessaId, macchinaId, componenteId } = req.params;
  
  try {
    // Verifica se la commessa esiste
    const [commessa] = await db.query('SELECT * FROM commesse WHERE id = ?', [commessaId]);
    if (commessa.length === 0) {
      return res.status(404).send("Commessa non trovata.");
    }

    // Esegue la cancellazione dell'associazione
    const result = await db.query(
      'DELETE FROM Commesse_Componenti WHERE commessa_id = ? AND macchina_id = ? AND componente_id = ?',
      [commessaId, macchinaId, componenteId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).send("Associazione componente non trovata.");
    }

    res.status(200).json({ message: "Associazione componente eliminata con successo." });
  } catch (err) {
    console.error("Errore durante la rimozione dell'associazione componente:", err);
    res.status(500).send("Errore durante la rimozione dell'associazione componente.");
  }
});


module.exports = router;
