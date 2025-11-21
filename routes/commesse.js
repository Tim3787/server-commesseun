const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { inviaNotificheUtenti, inviaNotificaCategoria } = require("../Utils/notificationManager");

const formatMySQLDate = (isoDate) => {
  if (!isoDate || isNaN(new Date(isoDate))) return null; // Verifica se la data è valida
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const formatDate = (dateString) => {
  if (!dateString || isNaN(new Date(dateString))) {
    return '';  // Gestisce il caso di data non valida o mancante
  }
  const date = new Date(dateString);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

// Usa `formatDate` in GestioneStatiAvanzamento.js
const handleDateFormatting = (data) => {
  // Verifica che la data sia presente
  if (data && data.data_consegna) {
    return formatDate(data.data_consegna);
  }
  return '';  // Se non c'è data, restituisci una stringa vuota
}


// Endpoint per ottenere tutte le commesse con stati avanzamento dettagliati
router.get("/", async (req, res) => {
  const sql = `
SELECT 
  c.id AS commessa_id,
  c.numero_commessa,
  c.tipo_macchina,
  c.descrizione,
  c.data_consegna,
  c.altri_particolari,
  c.cliente, 
  c.stato_commessa,  -- Solo l'ID dello stato
  r.id AS reparto_id,
  r.nome AS reparto_nome,
  c.data_FAT,
  c.data_Riunione,
  c.stati_avanzamento
FROM commesse c
LEFT JOIN stati_commessa sc ON c.stato_commessa = sc.id  -- Associa l'ID dello stato alla commessa
JOIN reparti r ON r.id IS NOT NULL
ORDER BY c.id, r.id

  `;

  try {
    const [results] = await db.query(sql);

    const commesse = {};

    results.forEach((row) => {
      if (!commesse[row.commessa_id]) {
        commesse[row.commessa_id] = {
          commessa_id: row.commessa_id,
          numero_commessa: row.numero_commessa,
          tipo_macchina: row.tipo_macchina,
          descrizione: row.descrizione,
          data_consegna: row.data_consegna,
          data_FAT: row.data_FAT,
          altri_particolari: row.altri_particolari,
          cliente: row.cliente,  // Aggiungi cliente nei dati
          stato: row.stato_commessa,
          stati_avanzamento: [] // Lista di reparti
        };
      }

      let statiAvanzamento = row.stati_avanzamento;
      if (typeof statiAvanzamento === 'string') {
        statiAvanzamento = JSON.parse(statiAvanzamento);
      }

      // Filtra gli stati per il reparto specifico
      statiAvanzamento = statiAvanzamento.filter(stato => stato.reparto_id === row.reparto_id);

      // Aggiungiamo gli stati avanzamento per il reparto specifico
      const existingReparto = commesse[row.commessa_id].stati_avanzamento.find(
        (reparto) => reparto.reparto_id === row.reparto_id
      );

      if (existingReparto) {
        existingReparto.stati_disponibili = [
          ...new Set([...existingReparto.stati_disponibili, ...statiAvanzamento])
        ];
      } else {
        commesse[row.commessa_id].stati_avanzamento.push({
          reparto_id: row.reparto_id,
          reparto_nome: row.reparto_nome,
          stati_disponibili: statiAvanzamento
        });
      }
    });

    // Converte l'oggetto in un array per inviarlo
    const commesseArray = Object.values(commesse);
    res.json(commesseArray); // Rispondi con la struttura corretta
  } catch (err) {
    console.error("Errore durante il recupero delle commesse:", err);
    res.status(500).send("Errore durante il recupero delle commesse.");
  }
});



// Endpoint per aggiornare le caratteristiche della commessa


// Endpoint per aggiornare le caratteristiche della commessa
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const {
    numero_commessa = "",
    tipo_macchina = "",
    descrizione = "",
    data_consegna = null,
    data_FAT = null,
    altri_particolari = "",
    cliente = "",
    stato_commessa,
  } = req.body;

  try {
    // Controllo per i campi obbligatori
    if (!numero_commessa || !tipo_macchina) {
      return res.status(400).send("I campi numero_commessa e tipo_macchina sono obbligatori.");
    }

    // Recupera gli stati di avanzamento esistenti dalla commessa
    const [existingCommessa] = await db.query("SELECT stati_avanzamento FROM commesse WHERE id = ?", [id]);
    const statiAvanzamentoEsistenti = existingCommessa[0]?.stati_avanzamento;

    if (!statiAvanzamentoEsistenti) {
      return res.status(404).send("Stati avanzamento non trovati per la commessa.");
    }

    // Esegui l'aggiornamento della commessa, mantenendo invariato il campo 'stati_avanzamento'
    await db.query(
      `UPDATE commesse SET numero_commessa = ?, tipo_macchina = ?, descrizione = ?, data_consegna = ?, data_FAT = ?, altri_particolari = ?, cliente = ?, stato_commessa = ? WHERE id = ?`,
      [
        numero_commessa,
        tipo_macchina,
        descrizione,
        data_consegna,
        data_FAT,
        altri_particolari,
        cliente,
        stato_commessa,// Corretto: stato prima di id
        id,    // id va come ultimo elemento
      ]
    );

    // Non modificare stati_avanzamento, lo lasciamo invariato
    res.status(200).send("Commessa aggiornata con successo senza alterare gli stati di avanzamento.");
  } catch (error) {
    console.error("Errore durante l'aggiornamento della commessa:", error);
    res.status(500).send("Errore durante l'aggiornamento della commessa.");
  }
});



// Endpoint per aggiornare solo la data_consegna di una commessa
router.put("/:id/data-consegna", async (req, res) => {
  const { id } = req.params;
  const { data_consegna } = req.body;

  if (!data_consegna) {
    return res.status(400).send("Il campo 'data_consegna' è obbligatorio.");
  }

  try {
    const [rows] = await db.query("SELECT id FROM commesse WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res.status(404).send("Commessa non trovata.");
    }

    await db.query(
      "UPDATE commesse SET data_consegna = ? WHERE id = ?",
      [data_consegna, id]
    );

    res.status(200).send("Data di consegna aggiornata con successo.");
  } catch (error) {
    console.error("Errore durante l'aggiornamento della data_consegna:", error);
    res.status(500).send("Errore durante l'aggiornamento della data_consegna.");
  }
});



/**
  ANDAVA

// Cambiare stato attuale di una commessa da pagina aggiorna stato
router.put("/:commessaId/reparti/:repartoId/stato", async (req, res) => {
  const { commessaId, repartoId } = req.params;
  const { stato_id, data_inizio, data_fine } = req.body;

  if (!stato_id) {
    return res.status(400).send("Lo stato_id è obbligatorio.");
  }

  try {
    // Recupera la commessa con il campo stati_avanzamento
    const [commessaResult] = await db.query("SELECT stati_avanzamento FROM commesse WHERE id = ?", [commessaId]);

    if (!commessaResult || commessaResult.length === 0) {
      return res.status(404).send("Commessa non trovata.");
    }

    let statiAvanzamento = commessaResult[0].stati_avanzamento;
    if (typeof statiAvanzamento === "string") {
      statiAvanzamento = JSON.parse(statiAvanzamento); // Parsing se è una stringa
    }

    // Aggiorna le date senza modificare il valore di isActive
    statiAvanzamento = statiAvanzamento.map((stato) => {
      if (stato.reparto_id === parseInt(repartoId, 10) && stato.stato_id === parseInt(stato_id, 10)) {
        return {
          ...stato,
          data_inizio: data_inizio ? new Date(data_inizio) : stato.data_inizio, // Se non viene fornita una data, mantieni quella esistente
          data_fine: data_fine ? new Date(data_fine) : stato.data_fine // Se non viene fornita una data, mantieni quella esistente
        };
      }
      return stato;
    });

    // Disattiva tutti gli stati di questo reparto e attiva solo quello selezionato
    statiAvanzamento = statiAvanzamento.map((stato) => {
      if (stato.reparto_id === parseInt(repartoId, 10)) {  // Assicurati che repartoId sia un numero
        if (stato.stato_id === parseInt(stato_id, 10)) {
          return { ...stato, isActive: true }; // Attiva solo lo stato selezionato
        } else {
          return { ...stato, isActive: false }; // Disattiva gli altri stati
        }
        return {
          ...stato,
          data_inizio: data_inizio ? new Date(data_inizio) : null,
          data_fine: data_fine ? new Date(data_fine) : null
        };
      }
      return stato;
    });

    // Salva gli stati avanzamento aggiornati nel database
    await db.query("UPDATE commesse SET stati_avanzamento = ? WHERE id = ?", [
      JSON.stringify(statiAvanzamento),  // Serializza i dati in formato JSON
      commessaId,
    ]);


    res.status(200).send("Stato avanzamento aggiornato con successo.");
  } catch (error) {
    console.error("Errore durante l'aggiornamento dello stato avanzamento:", error);
    res.status(500).send("Errore interno del server.");
  }
});

   */

router.put("/:commessaId/reparti/:repartoId/stato", async (req, res) => {
  const { commessaId, repartoId } = req.params;
  const { stato_id, data_inizio, data_fine } = req.body;

  const repartoIdInt = parseInt(repartoId, 10);
  const statoIdInt = parseInt(stato_id, 10);

  if (!stato_id) {
    return res.status(400).send("Lo stato_id è obbligatorio.");
  }

  try {
    // 1. Recupera la commessa
    const [commessaResult] = await db.query(  "SELECT numero_commessa, stati_avanzamento FROM commesse WHERE id = ?", [commessaId]);

    if (!commessaResult || commessaResult.length === 0) {
      return res.status(404).send("Commessa non trovata.");
    }
   const numeroCommessa = commessaResult[0].numero_commessa;
    let statiAvanzamento = commessaResult[0].stati_avanzamento;
    if (typeof statiAvanzamento === "string") {
      statiAvanzamento = JSON.parse(statiAvanzamento);
    }

       const [statoDb] = await db.query(
      `SELECT nome_stato, ordine FROM stati_avanzamento WHERE id = ? AND reparto_id = ?`,
      [statoIdInt, repartoIdInt]
    );

    if (!statoDb.length) {
      return res.status(404).send("Stato avanzamento non trovato nel database.");
    }

    const { nome_stato, ordine } = statoDb[0];

    // 2. Controlla se esiste già lo stato
    const esiste = statiAvanzamento.some(
      (stato) => stato.reparto_id === repartoIdInt && stato.stato_id === statoIdInt
    );

    // 3. Se non esiste, recuperalo dal DB e aggiungilo
    if (!esiste) {
      const [statoDb] = await db.query(
        `SELECT nome_stato, ordine FROM stati_avanzamento WHERE id = ? AND reparto_id = ?`,
        [statoIdInt, repartoIdInt]
      );

      if (!statoDb.length) {
        return res.status(404).send("Stato avanzamento non trovato nel database.");
      }

      const { nome_stato, ordine } = statoDb[0];

      statiAvanzamento.push({
        reparto_id: repartoIdInt,
        stato_id: statoIdInt,
        nome_stato,
        ordine,
        data_inizio: data_inizio ? new Date(data_inizio).toISOString().slice(0, 10) : null,
        data_fine: data_fine ? new Date(data_fine).toISOString().slice(0, 10) : null,
        isActive: false, // sarà attivato nel passaggio successivo
      });
    }

    // 4. Aggiorna date e isActive
    statiAvanzamento = statiAvanzamento.map((stato) => {
  if (stato.reparto_id === repartoIdInt) {
    if (stato.stato_id === statoIdInt) {
      return {
        ...stato,
        isActive: true,
        data_inizio: data_inizio != null ? new Date(data_inizio) : null,
        data_fine: data_fine != null ? new Date(data_fine) : null
      };
    } else {
      return { ...stato, isActive: false };
    }
  }
  return stato;
});


    // 5. Salva
    await db.query("UPDATE commesse SET stati_avanzamento = ? WHERE id = ?", [
      JSON.stringify(statiAvanzamento),
      commessaId,
    ]);

    console.log("🟢 STEP 2 - Aggiornamento salvato nel DB");

    // 6️⃣ Recupera il nome del reparto
    const [[reparto]] = await db.query(
      "SELECT nome FROM reparti WHERE id = ?",
      [repartoIdInt]
    );
    const repartoNome = reparto?.nome || "Sconosciuto";

    console.log("🟢 STEP 3 - Reparto:", repartoNome);

    // 7️⃣ Invia notifica
    await inviaNotificaCategoria({
      categoria: "stato_avanzamento",
      titolo: "Aggiornamento stato avanzamento",
      messaggio: `Il reparto ${repartoNome} ha spostato la commessa ${numeroCommessa} nello stato "${nome_stato}".`,
      commessaId,
      repartoId: repartoIdInt,
      includiGlobali: true,
    });

    console.log("🟢 STEP 4 - Notifica inviata");
    res.status(200).send(esiste ? "Stato avanzamento aggiornato." : "Stato avanzamento creato e attivato.");
  } catch (error) {
    console.error("Errore durante l'aggiornamento dello stato avanzamento:", error);
    res.status(500).send("Errore interno del server.");
  }
});



// Creare una nuova commessa con stati avanzamento iniziali
router.post("/", async (req, res) => {
  const { numero_commessa, tipo_macchina, descrizione, data_consegna, altri_particolari, cliente, stato_commessa, stato_iniziale } = req.body;


  if (!numero_commessa || !tipo_macchina) {
    return res.status(400).send("I campi numero_commessa e tipo_macchina sono obbligatori.");
  }

  try {
    // Recupera tutti i reparti esistenti
    const [reparti] = await db.query(`SELECT id FROM reparti`);

    // Verifica se la lista di reparti è vuota
    if (!reparti || reparti.length === 0) {
      return res.status(400).send("Nessun reparto trovato nel database.");
    }

    // Estrai gli ID dei reparti
    const repartoIds = reparti.map(reparto => reparto.id);

    // Se non ci sono reparti validi, non eseguire la query
    if (repartoIds.length === 0) {
      return res.status(400).send("Nessun reparto valido trovato.");
    }

    // Costruisci la query solo se ci sono reparti validi
    const query = `
      SELECT reparto_id, id AS stato_id, nome_stato, ordine
      FROM stati_avanzamento
      WHERE reparto_id IN (${repartoIds.join(", ")})
    `;

    // Esegui la query
    const [statiPerReparto] = await db.query(query);

    if (statiPerReparto.length === 0) {
      return res.status(400).send("Nessun stato avanzamento trovato per i reparti.");
    }

    // Crea gli stati avanzamento iniziali in formato JSON
    const statiAvanzamento = statiPerReparto.map((stato) => ({
      reparto_id: stato.reparto_id,
      stato_id: stato.stato_id,
      nome_stato: stato.nome_stato,
      ordine: stato.ordine,
      data_inizio: null,
      data_fine: null,
      isActive: stato.nome_stato.trim().toLowerCase() === (stato_iniziale[stato.reparto_id] || "").trim().toLowerCase(),
    }));

    // Continua con l'inserimento della commessa
    const insertCommessaSql = `
      INSERT INTO commesse (numero_commessa, tipo_macchina, descrizione, data_consegna, altri_particolari, stati_avanzamento, cliente, stato_commessa)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(insertCommessaSql, [
      numero_commessa,
      tipo_macchina,
      descrizione,
      data_consegna,
      altri_particolari,
      JSON.stringify(statiAvanzamento), // Salva gli stati come JSON
      cliente,
      stato_commessa,
    ]);

const messaggio = `È stata creata una nuova commessa: ${numero_commessa} | In consegna il: ${new Date(data_consegna).toLocaleDateString("it-IT")}`;
await inviaNotificaCategoria({
  categoria: "Commessa",
  titolo: "Nuova commessa",
  messaggio,
  includiGlobali: true
});
    res.status(201).json({
      message: "Commessa creata con successo e stati avanzamento iniziali associati.",
      commessaId: result.insertId,
      stati_avanzamento: statiAvanzamento,  // Invia gli stati al frontend
    });

  } catch (err) {
    console.error("Errore durante l'inserimento della commessa:", err);
    res.status(500).send("Errore durante l'inserimento della commessa.");
  }
});






// Elimina una commessa
// API delete per eliminare la commessa
router.delete("/:commessaId", async (req, res) => {
  const commessaId = req.params.commessaId;
  if (!commessaId) {
    return res.status(400).send("ID della commessa non fornito.");
  }

  try {
    const result = await db.query("DELETE FROM commesse WHERE id = ?", [commessaId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).send("Commessa non trovata.");
    }

    res.status(200).send("Commessa eliminata con successo.");
  } catch (error) {
    console.error("Errore durante l'eliminazione della commessa:", error);
    res.status(500).send("Errore durante l'eliminazione della commessa.");
  }
});



// CREA ATTIVITà QUANDO CREI COMMESSA
router.post("/assegna-attivita-predefinite", async (req, res) => {
  const attivitaDaAggiungere = req.body;

  if (!Array.isArray(attivitaDaAggiungere) || attivitaDaAggiungere.length === 0) {
    return res.status(400).send("Dati attività non validi.");
  }

  try {
    const query = `
      INSERT INTO attivita_commessa (commessa_id, reparto_id, attivita_id, durata)
      VALUES (?, ?, ?, ?)
    `;
    for (const { commessa_id, reparto_id, attivita_id, durata } of attivitaDaAggiungere) {
      // Usa la durata fornita, oppure un default (es. 1)
      await db.query(query, [commessa_id, reparto_id, attivita_id, durata || 1]);
    }

    res.status(201).send("Attività assegnate con successo!");
  } catch (error) {
    console.error("Errore durante l'inserimento delle attività:", error);
    res.status(500).send("Errore durante l'inserimento delle attività.");
  }
});


// Endpoint per aggiornare uno specifico stato avanzamento di una commessa
router.put("/:commessaId/stati-avanzamento/:statoId", async (req, res) => {
  const { commessaId, statoId } = req.params;
  const { data_inizio, data_fine } = req.body;

  try {
    const [commessaResult] = await db.query(`SELECT stati_avanzamento FROM commesse WHERE id = ?`, [commessaId]);

    if (!commessaResult.length) {
      return res.status(404).send("Commessa non trovata.");
    }

    let statiAvanzamento = [];
    try {
      statiAvanzamento = JSON.parse(commessaResult[0].stati_avanzamento || "[]");
    } catch (error) {
      return res.status(500).send("Errore durante il parsing del JSON.");
    }

    // Mappa gli stati e aggiorna quelli che corrispondono a statoId
    statiAvanzamento = statiAvanzamento.map((stato) =>
      stato.stato_id === parseInt(statoId)
        ? { ...stato, data_inizio: data_inizio || stato.data_inizio, data_fine: data_fine || stato.data_fine }
        : stato
    );

    await db.query(`UPDATE commesse SET stati_avanzamento = ? WHERE id = ?`, [
      JSON.stringify(statiAvanzamento),
      commessaId,
    ]);

    res.status(200).send("Stato avanzamento aggiornato con successo.");
  } catch (error) {
    console.error("Errore durante l'aggiornamento dello stato avanzamento:", error);
    res.status(500).send("Errore interno del server.");
  }
});

// Modificare uno stato esistente della commessa
router.put("/:id/stato",  async (req, res) => {
  const { id } = req.params;
  const { stato_commessa } = req.body;

  if (!stato_commessa) {
    return res.status(400).json({ error: "Lo stato della commessa è richiesto." });
  }

  const sql = "UPDATE commesse SET stato_commessa = ? WHERE id = ?";
  try {
    const [result] = await db.query(sql, [stato_commessa, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Commessa non trovata o stato non aggiornato." });
    }

    const [commessaInfo] = await db.query("SELECT numero_commessa, data_consegna FROM commesse WHERE id = ?", [id]);
// Recupera nome dello stato_commessa
const [statoInfo] = await db.query("SELECT nome_stato FROM stati_commessa WHERE id = ?", [stato_commessa]);

const nomeStato = statoInfo.length > 0 ? statoInfo[0].nome_stato : `Stato ${stato_commessa}`;

    if (!commessaInfo.length) {
      return res.status(404).json({ error: "Commessa non trovata dopo l'aggiornamento." });
    }

    const { numero_commessa, data_consegna } = commessaInfo[0];
    const userIds = [44, 26];

    const messaggio = `È stato aggiornato lo stato della commessa: ${numero_commessa} | In consegna il: ${new Date(data_consegna).toLocaleDateString("it-IT")} | Nuovo stato: ${nomeStato}`;

    await inviaNotificheUtenti({
      userIds,
      titolo: "Cambiamento stato commessa",
      messaggio,
      categoria: "Commessa",
      push: true  
    });

    res.status(200).json({ message: "Stato della commessa aggiornato con successo." });
  } catch (err) {
    console.error("Errore durante l'aggiornamento dello stato della commessa:", err);
    res.status(500).send("Errore durante l'aggiornamento dello stato.");
  }
});


router.get("/by-tag", async (req, res) => {
  const { tag } = req.query;
  try {
    const result = await db.query(`
      SELECT DISTINCT c.*
      FROM SchedeTecniche st
      JOIN SchedeTag sg ON st.id = sg.scheda_id
      JOIN commesse c ON st.id = c.id
      WHERE sg.tag = $1
    `, [tag]);

    res.json(result.rows);
  } catch (error) {
    console.error("Errore nella ricerca per tag:", error);
    res.status(500).json({ error: "Errore server" });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const [rows] = await db.query('SELECT * FROM commesse WHERE id = ?', [id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Commessa non trovata' });
  }
  res.json(rows[0]);
});



module.exports = router;
