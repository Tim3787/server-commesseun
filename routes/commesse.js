const express = require("express");
const router = express.Router();
const db = require("../config/db");

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
    stato,
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
        stato, // Corretto: stato prima di id
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







// Creare una nuova commessa con stati avanzamento iniziali
router.post("/", async (req, res) => {
  const { numero_commessa, tipo_macchina, descrizione, data_consegna, altri_particolari,cliente, stato  } = req.body;

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
      isActive: stato.nome_stato === 'In Entrata', // Solo "In Entrata" è attivo inizialmente
    }));

    // Continua con l'inserimento della commessa
    const insertCommessaSql = `
      INSERT INTO commesse (numero_commessa, tipo_macchina, descrizione, data_consegna, altri_particolari, stati_avanzamento, cliente, stato)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(insertCommessaSql, [
      numero_commessa,
      tipo_macchina,
      descrizione,
      data_consegna,
      altri_particolari,
      JSON.stringify(statiAvanzamento), // Salva gli stati come JSON
      cliente,
      stato,
    ]);

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



// CREA ATTIVITÀ INIZIALI
router.post("/assegna-attivita-predefinite", async (req, res) => {
  const attivitaDaAggiungere = req.body;

  if (!Array.isArray(attivitaDaAggiungere) || attivitaDaAggiungere.length === 0) {
    return res.status(400).send("Dati attività non validi.");
  }

  try {
    const query = `
      INSERT INTO attivita_commessa (commessa_id, reparto_id, attivita_id)
      VALUES (?, ?, ?)
    `;
    for (const { commessa_id, reparto_id, attivita_id } of attivitaDaAggiungere) {
      await db.query(query, [commessa_id, reparto_id, attivita_id]);
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
router.put("/:id/stato", async (req, res) => {
  const { id } = req.params; // ID della commessa
  const { stato_commessa } = req.body; // Nuovo stato da impostare

  // Verifica che stato_commessa sia stato fornito
  if (!stato_commessa) {
    return res.status(400).json({ error: "Lo stato della commessa è richiesto." });
  }

  const sql = "UPDATE commesse SET stato_commessa = ? WHERE id = ?"; // Query per aggiornare lo stato della commessa
  try {
    const [result] = await db.query(sql, [stato_commessa, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Commessa non trovata o stato non aggiornato." });
    }

    res.status(200).json({ message: "Stato della commessa aggiornato con successo." });
  } catch (err) {
    console.error("Errore durante l'aggiornamento dello stato della commessa:", err);
    res.status(500).send("Errore durante l'aggiornamento dello stato.");
  }
});

// Controllare e aggiornare le commesse esistenti con gli stati avanzamento mancanti e garantire che almeno uno stato sia attivo
router.post("/verifica-stati-commesse", async (req, res) => {
  try {
    // Recupera tutti i reparti
    const [reparti] = await db.query(`SELECT id AS reparto_id FROM reparti`);

    if (reparti.length === 0) {
      return res.status(400).send("Nessun reparto trovato nel database.");
    }

    // Recupera tutti gli stati avanzamento per i reparti
    const [statiPerReparto] = await db.query(`
      SELECT reparto_id, id AS stato_id, nome_stato, ordine
      FROM stati_avanzamento
    `);

    if (statiPerReparto.length === 0) {
      return res.status(400).send("Nessuno stato avanzamento trovato.");
    }

    // Recupera tutte le commesse
    const [commesse] = await db.query(`SELECT id, stati_avanzamento FROM commesse`);

    for (const commessa of commesse) {
      let statiAvanzamento;

      // Verifica se `stati_avanzamento` è un JSON valido o un oggetto
      if (typeof commessa.stati_avanzamento === "string") {
        try {
          statiAvanzamento = JSON.parse(commessa.stati_avanzamento);
        } catch (err) {
          console.error(`Errore nel parsing degli stati_avanzamento per la commessa ${commessa.id}:`, err);
          continue; // Passa alla prossima commessa
        }
      } else if (Array.isArray(commessa.stati_avanzamento)) {
        statiAvanzamento = commessa.stati_avanzamento;
      } else {
        statiAvanzamento = [];
      }

      let statiAggiornati = [...statiAvanzamento]; // Copia degli stati esistenti

      for (const reparto of reparti) {
        const statiReparto = statiPerReparto.filter(
          (stato) => stato.reparto_id === reparto.reparto_id
        );

        for (const stato of statiReparto) {
          // Verifica se lo stato è già presente negli stati della commessa
          const esiste = statiAvanzamento.some(
            (statoCommessa) =>
              statoCommessa.reparto_id === stato.reparto_id &&
              statoCommessa.stato_id === stato.stato_id
          );

          if (!esiste) {
            // Aggiungi lo stato mancante
            statiAggiornati.push({
              reparto_id: stato.reparto_id,
              stato_id: stato.stato_id,
              nome_stato: stato.nome_stato,
              ordine: stato.ordine,
              data_inizio: null,
              data_fine: null,
              isActive: false, // Gli stati aggiunti non sono attivi per default
            });
          }
        }

        // Controlla se almeno uno stato del reparto è attivo
        const statiRepartoAttivi = statiAggiornati.filter(
          (stato) => stato.reparto_id === reparto.reparto_id && stato.isActive
        );

        if (statiRepartoAttivi.length === 0) {
          // Se nessuno stato è attivo, attiva lo stato con l'ordine più basso
          const statoDaAttivare = statiAggiornati
            .filter((stato) => stato.reparto_id === reparto.reparto_id)
            .sort((a, b) => a.ordine - b.ordine)[0];

          if (statoDaAttivare) {
            statoDaAttivare.isActive = true;
          }
        }
      }

      // Aggiorna la commessa con gli stati avanzamento aggiornati
      const statiAggiornatiJson = JSON.stringify(statiAggiornati);
      if (statiAggiornatiJson !== JSON.stringify(statiAvanzamento)) {
        await db.query(`UPDATE commesse SET stati_avanzamento = ? WHERE id = ?`, [
          statiAggiornatiJson,
          commessa.id,
        ]);
      }
    }

    res.status(200).send("Verifica e aggiornamento degli stati avanzamento completati.");
  } catch (err) {
    console.error("Errore durante la verifica e l'aggiornamento delle commesse:", err);
    res.status(500).send("Errore durante la verifica e l'aggiornamento delle commesse.");
  }
});

router.post("/allinea-stati-commesse", async (req, res) => {
  try {
    // Recupera tutti gli stati avanzamento dal database
    const [statiPerReparto] = await db.query(`
      SELECT reparto_id, id AS stato_id, nome_stato, ordine
      FROM stati_avanzamento
    `);

    if (statiPerReparto.length === 0) {
      return res.status(400).send("Nessuno stato avanzamento trovato.");
    }

    // Recupera tutte le commesse
    const [commesse] = await db.query(`SELECT id, stati_avanzamento FROM commesse`);

    for (const commessa of commesse) {
      let statiAvanzamento;

      // Verifica se `stati_avanzamento` è un JSON valido o un oggetto
      if (typeof commessa.stati_avanzamento === "string") {
        try {
          statiAvanzamento = JSON.parse(commessa.stati_avanzamento);
        } catch (err) {
          console.error(`Errore nel parsing degli stati_avanzamento per la commessa ${commessa.id}:`, err);
          continue; // Passa alla prossima commessa
        }
      } else if (Array.isArray(commessa.stati_avanzamento)) {
        statiAvanzamento = commessa.stati_avanzamento;
      } else {
        statiAvanzamento = [];
      }

      // Filtra gli stati obsoleti
      statiAvanzamento = statiAvanzamento.filter((stato) =>
        statiPerReparto.some(
          (s) => s.stato_id === stato.stato_id && s.reparto_id === stato.reparto_id
        )
      );

      // Aggiorna i nomi degli stati e rimuovi duplicati
      statiAvanzamento = statiAvanzamento.map((stato) => {
        const statoValido = statiPerReparto.find(
          (s) => s.stato_id === stato.stato_id && s.reparto_id === stato.reparto_id
        );
        return {
          ...stato,
          nome_stato: statoValido ? statoValido.nome_stato : stato.nome_stato, // Aggiorna il nome
          ordine: statoValido ? statoValido.ordine : stato.ordine, // Aggiorna l'ordine
        };
      });

      // Verifica che ci sia almeno uno stato attivo per ogni reparto
      const repartiPresenti = [...new Set(statiAvanzamento.map((s) => s.reparto_id))];
      for (const repartoId of repartiPresenti) {
        const statiReparto = statiAvanzamento.filter((s) => s.reparto_id === repartoId);

        // Se nessuno stato è attivo, attiva quello con l'ordine più basso
        if (!statiReparto.some((s) => s.isActive)) {
          const statoDaAttivare = statiReparto.sort((a, b) => a.ordine - b.ordine)[0];
          if (statoDaAttivare) {
            statoDaAttivare.isActive = true;
          }
        }
      }

      // Aggiorna la commessa nel database
      const statiAggiornatiJson = JSON.stringify(statiAvanzamento);
      await db.query(`UPDATE commesse SET stati_avanzamento = ? WHERE id = ?`, [
        statiAggiornatiJson,
        commessa.id,
      ]);
    }

    res.status(200).send("Allineamento degli stati avanzamento completato.");
  } catch (err) {
    console.error("Errore durante l'allineamento degli stati avanzamento:", err);
    res.status(500).send("Errore durante l'allineamento degli stati avanzamento.");
  }
});



module.exports = router;
