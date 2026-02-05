const express = require('express');
const db = require('../config/db');
const router = express.Router();
const { verificaStatiCommesse, allineaStatiCommesse } = require('./statiAvanzamentoUtils');

// Recupera tutti gli stati di avanzamento per un reparto specifico
router.get('/reparto/:reparto_id', async (req, res) => {
  const { reparto_id } = req.params;

  try {
    const [commesse] = await db.query(`
      SELECT id AS commessa_id, numero_commessa, tipo_macchina, stati_avanzamento 
      FROM commesse
    `);

    const results = commesse.flatMap((commessa) => {
      const stati = JSON.parse(commessa.stati_avanzamento || '[]');
      return stati
        .filter((stato) => stato.reparto_id === parseInt(reparto_id, 10))
        .map((stato) => ({
          commessa_id: commessa.commessa_id,
          numero_commessa: commessa.numero_commessa,
          tipo_macchina: commessa.tipo_macchina,
          stato_avanzamento_id: stato.stato_id,
          nome_stato: stato.nome_stato,
        }));
    });

    res.json(results);
  } catch (error) {
    console.error('Errore durante il recupero degli stati di avanzamento:', error);
    res.status(500).send('Errore durante il recupero degli stati di avanzamento.');
  }
});

// Recupera tutti gli stati di avanzamento
router.get('/', async (req, res) => {
  const sql = 'SELECT * FROM stati_avanzamento';
  try {
    const [results] = await db.query(sql);
    res.json(results);
  } catch (err) {
    console.error('Errore durante il recupero dei reparti:', err);
    res.status(500).send('Errore durante il recupero dei reparti.');
  }
});

/**
// Aggiungi uno stato di avanzamento a un reparto
router.post("/", async (req, res) => {
  const { nome_stato, reparto_id } = req.body;
  if (!nome_stato || !reparto_id) {
    return res.status(400).send("Nome dello stato e reparto sono obbligatori.");
  }

  try {
    // Verifica se esiste già uno stato con lo stesso nome per il reparto
    const [existingState] = await db.query(
      "SELECT * FROM stati_avanzamento WHERE nome_stato = ? AND reparto_id = ?",
      [nome_stato, reparto_id]
    );

    // Se esiste già, non creiamo un nuovo stato, ma usiamo quello esistente
    if (existingState.length > 0) {
      return res.status(400).send("Stato di avanzamento già esistente per questo reparto.");
    }

    // Determina l'ordine per il nuovo stato
    const ordineSql = `
      SELECT COALESCE(MAX(ordine), 0) + 1 AS nuovo_ordine
      FROM stati_avanzamento
      WHERE reparto_id = ?
    `;
    const [ordineResult] = await db.query(ordineSql, [reparto_id]);
    const nuovoOrdine = ordineResult[0].nuovo_ordine;

    // Inserisci il nuovo stato con il valore dell'ordine calcolato
    const sql = `
      INSERT INTO stati_avanzamento (nome_stato, reparto_id, ordine)
      VALUES (?, ?, ?)
    `;
    const [insertResult] = await db.query(sql, [nome_stato, reparto_id, nuovoOrdine]);

    // Ottieni l'ID appena inserito
    const stato_id = insertResult.insertId;

    // Ora aggiorniamo tutte le commesse per aggiungere questo nuovo stato
    const updateCommesseSql = `
      SELECT id, stati_avanzamento
      FROM commesse
      WHERE stati_avanzamento IS NOT NULL
    `;

    // Recupera tutte le commesse
    const [commesse] = await db.query(updateCommesseSql);

    for (const commessa of commesse) {
      // Verifica se il nuovo stato è già presente nel JSON della commessa
      let statiAvanzamento = commessa.stati_avanzamento;

      // Controlla se `stati_avanzamento` è una stringa
      if (typeof statiAvanzamento === 'string') {
        statiAvanzamento = JSON.parse(statiAvanzamento);  // Parsing se è una string
      }

      // Verifica se lo stato esiste già
      const statoEsistente = statiAvanzamento.find(
        (stato) => stato.reparto_id === parseInt(reparto_id) && stato.nome_stato === nome_stato
      );

      // Se il nuovo stato non è presente, aggiungilo
      if (!statoEsistente) {
        statiAvanzamento.push({
          stato_id: stato_id,  // Usa l'ID del nuovo stato appena creato
          nome_stato: nome_stato,
          reparto_id: parseInt(reparto_id),  // Converti reparto_id in intero
          data_inizio: null,
          data_fine: null,
          isActive: false,
          ordine: nuovoOrdine,  // Puoi assegnare un ordine se necessario
        });

        // Aggiorna la commessa con il nuovo stato
        await db.query(
          "UPDATE commesse SET stati_avanzamento = ? WHERE id = ?",
          [JSON.stringify(statiAvanzamento), commessa.id]
          
        );
        await verificaStatiCommesse();
    await allineaStatiCommesse();
      }
    }

    res.status(201).send("Stato di avanzamento aggiunto con successo");
  } catch (err) {
    console.error("Errore durante l'aggiunta dello stato di avanzamento:", err);
    res.status(500).send("Errore durante l'aggiunta dello stato di avanzamento");
  }
});
 **/

// Aggiungi uno stato di avanzamento a un reparto
router.post('/', async (req, res) => {
  const { nome_stato, reparto_id } = req.body;
  if (!nome_stato || !reparto_id) {
    return res.status(400).send('Nome dello stato e reparto sono obbligatori.');
  }

  try {
    // 1) Esistenza già presente (consigliato indice UNIQUE su (reparto_id, nome_stato))
    const [existingState] = await db.query(
      'SELECT id, nome_stato, reparto_id, ordine FROM stati_avanzamento WHERE nome_stato = ? AND reparto_id = ?',
      [nome_stato, reparto_id]
    );
    if (existingState.length > 0) {
      // 409 più semantico, ma tieni pure 400 se preferisci
      return res.status(409).send('Stato di avanzamento già esistente per questo reparto.');
    }

    // 2) Calcolo ordine
    const [ordineResult] = await db.query(
      `SELECT COALESCE(MAX(ordine), 0) + 1 AS nuovo_ordine
       FROM stati_avanzamento
       WHERE reparto_id = ?`,
      [reparto_id]
    );
    const nuovoOrdine = ordineResult[0]?.nuovo_ordine ?? 1;

    // 3) Insert stato
    const [insertResult] = await db.query(
      `INSERT INTO stati_avanzamento (nome_stato, reparto_id, ordine)
       VALUES (?, ?, ?)`,
      [nome_stato, reparto_id, nuovoOrdine]
    );
    const stato_id = insertResult.insertId;

    // 4) Risposta IMMEDIATA al client (evita timeout lato Axios)
    const created = {
      id: stato_id,
      nome_stato,
      reparto_id: Number(reparto_id),
      ordine: nuovoOrdine,
    };
    res.status(201).json(created);

    // 5) Lavoro pesante DOPO la risposta (no await): aggiorna commesse e allinea
    //    Se preferisci comunque attendere tutto prima di chiudere la route, togli il blocco auto-invocato e metti await.
    (async () => {
      try {
        // Prendi solo le commesse con JSON presente (come facevi) — opzionale: limita a commesse attive
        const [rows] = await db.query(
          `SELECT id, stati_avanzamento
           FROM commesse
           WHERE stati_avanzamento IS NOT NULL`
        );

        const updates = [];
        for (const row of rows) {
          let sa = row.stati_avanzamento;
          try {
            if (typeof sa === 'string') sa = JSON.parse(sa);
            if (!Array.isArray(sa)) sa = [];
          } catch (e) {
            console.error('JSON stati_avanzamento non valido per commessa', row.id, e);
            sa = Array.isArray(sa) ? sa : [];
          }

          const giàPresente = sa.some(
            (st) => Number(st.reparto_id) === Number(reparto_id) && st.nome_stato === nome_stato
          );
          if (giàPresente) continue;

          // aggiunta nuovo stato
          sa.push({
            stato_id,
            nome_stato,
            reparto_id: Number(reparto_id),
            data_inizio: null,
            data_fine: null,
            isActive: false,
            ordine: nuovoOrdine,
          });

          updates.push(
            db.query('UPDATE commesse SET stati_avanzamento = ? WHERE id = ?', [
              JSON.stringify(sa),
              row.id,
            ])
          );
        }

        if (updates.length > 0) {
          // batch update
          await Promise.all(updates);
        }

        // Chiamale UNA SOLA VOLTA, non nel for
        await verificaStatiCommesse();
        await allineaStatiCommesse();
      } catch (bgErr) {
        console.error("Errore durante l'allineamento post-creazione stato:", bgErr);
      }
    })();
  } catch (err) {
    console.error("Errore durante l'aggiunta dello stato di avanzamento:", err);
    return res.status(500).send("Errore durante l'aggiunta dello stato di avanzamento");
  }
});

// Modifica uno stato di avanzamento
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nome_stato, reparto_id } = req.body;
  if (!nome_stato || !reparto_id) {
    return res.status(400).send('Nome dello stato e reparto sono obbligatori.');
  }
  const sql = 'UPDATE stati_avanzamento SET nome_stato = ?, reparto_id = ? WHERE id = ?';
  try {
    const [result] = await db.query(sql, [nome_stato, reparto_id, id]);
    await verificaStatiCommesse();
    await allineaStatiCommesse();
    if (result.affectedRows === 0) {
      return res.status(404).send('Stato di avanzamento non trovato.');
    }
    res.send('Stato di avanzamento modificato con successo');
  } catch (err) {
    console.error('Errore durante la modifica dello stato di avanzamento:', err);
    res.status(500).send('Errore durante la modifica dello stato di avanzamento');
  }
});

// Elimina uno stato di avanzamento
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const sql = 'DELETE FROM stati_avanzamento WHERE id = ?';
  try {
    const [result] = await db.query(sql, [id]);
    await verificaStatiCommesse();
    await allineaStatiCommesse();
    if (result.affectedRows === 0) {
      return res.status(404).send('Stato di avanzamento non trovato.');
    }
    res.send('Stato di avanzamento eliminato con successo');
  } catch (err) {
    console.error("Errore durante l'eliminazione dello stato di avanzamento:", err);
    res.status(500).send("Errore durante l'eliminazione dello stato di avanzamento");
  }
});

//Aggiorna l'ordine degli stati di avanzamento
router.put('/:id/ordine', async (req, res) => {
  const { id } = req.params;
  const { nuovoOrdine, repartoId } = req.body;

  if (!nuovoOrdine || !repartoId) {
    return res.status(400).send('Reparto e ordine sono obbligatori.');
  }

  try {
    // Verifica se l'ordine esiste già in quel reparto
    const [existing] = await db.query(
      'SELECT * FROM stati_avanzamento WHERE ordine = ? AND reparto_id = ? AND id != ?',
      [nuovoOrdine, repartoId, id]
    );

    if (existing.length > 0) {
      return res.status(409).send("L'ordine è già utilizzato da un altro stato in questo reparto.");
    }

    // Aggiorna l'ordine
    await db.query('UPDATE stati_commessa SET ordine = ? WHERE id = ?', [nuovoOrdine, id]);

    res.status(200).send('Ordine aggiornato con successo.');
  } catch (error) {
    console.error("Errore durante l'aggiornamento dell'ordine:", error);
    res.status(500).send("Errore durante l'aggiornamento dell'ordine.");
  }
});

//Ordina stati avanzamento per reparto
router.put('/:id/reparti/:repartoId/ordina-stati', async (req, res) => {
  const { repartoId } = req.params;
  const { stati } = req.body;

  try {
    const queries = stati.map((stato, index) =>
      db.query('UPDATE stati_avanzamento SET ordine = ? WHERE id = ? AND reparto_id = ?', [
        index + 1,
        stato.stato_id,
        repartoId,
      ])
    );
    await Promise.all(queries);

    res.status(200).send('Ordine degli stati avanzamento aggiornato con successo!');
  } catch (error) {
    console.error("Errore durante l'aggiornamento dell'ordine:", error);
    res.status(500).send("Errore durante l'aggiornamento dell'ordine.");
  }
});

module.exports = router;
