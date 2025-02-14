const db = require("../config/db"); // Assumi che db sia la tua connessione al database

// ✅ Funzione per verificare e aggiornare le commesse con gli stati mancanti
const verificaStatiCommesse = async () => {
  try {
    const [reparti] = await db.query(`SELECT id AS reparto_id FROM reparti`);
    if (reparti.length === 0) return console.log("Nessun reparto trovato.");

    const [statiPerReparto] = await db.query(`
      SELECT reparto_id, id AS stato_id, nome_stato, ordine FROM stati_avanzamento
    `);
    if (statiPerReparto.length === 0) return console.log("Nessuno stato avanzamento trovato.");

    const [commesse] = await db.query(`SELECT id, stati_avanzamento FROM commesse`);

    for (const commessa of commesse) {
      let statiAvanzamento = [];

      try {
        statiAvanzamento = JSON.parse(commessa.stati_avanzamento || "[]");
      } catch (err) {
        console.error(`Errore parsing stati_avanzamento per commessa ${commessa.id}:`, err);
        continue;
      }

      let statiAggiornati = [...statiAvanzamento];

      for (const reparto of reparti) {
        const statiReparto = statiPerReparto.filter(stato => stato.reparto_id === reparto.reparto_id);

        for (const stato of statiReparto) {
          const esiste = statiAvanzamento.some(
            statoCommessa => statoCommessa.reparto_id === stato.reparto_id && statoCommessa.stato_id === stato.stato_id
          );

          if (!esiste) {
            statiAggiornati.push({
              reparto_id: stato.reparto_id,
              stato_id: stato.stato_id,
              nome_stato: stato.nome_stato,
              ordine: stato.ordine,
              data_inizio: null,
              data_fine: null,
              isActive: false, // I nuovi stati non sono attivi di default
            });
          }
        }

        const statiAttivi = statiAggiornati.filter(s => s.reparto_id === reparto.reparto_id && s.isActive);
        if (statiAttivi.length === 0) {
          const statoDaAttivare = statiAggiornati
            .filter(s => s.reparto_id === reparto.reparto_id)
            .sort((a, b) => a.ordine - b.ordine)[0];

          if (statoDaAttivare) statoDaAttivare.isActive = true;
        }
      }

      if (JSON.stringify(statiAggiornati) !== JSON.stringify(statiAvanzamento)) {
        await db.query(`UPDATE commesse SET stati_avanzamento = ? WHERE id = ?`, [
          JSON.stringify(statiAggiornati),
          commessa.id,
        ]);
      }
    }
    console.log("✅ Verifica stati avanzamento completata.");
  } catch (err) {
    console.error("Errore durante la verifica degli stati avanzamento:", err);
  }
};

// ✅ Funzione per allineare gli stati avanzamento eliminando quelli obsoleti
const allineaStatiCommesse = async () => {
  try {
    const [statiPerReparto] = await db.query(`
      SELECT reparto_id, id AS stato_id, nome_stato, ordine FROM stati_avanzamento
    `);
    if (statiPerReparto.length === 0) return console.log("Nessuno stato avanzamento trovato.");

    const [commesse] = await db.query(`SELECT id, stati_avanzamento FROM commesse`);

    for (const commessa of commesse) {
      let statiAvanzamento = [];

      try {
        statiAvanzamento = JSON.parse(commessa.stati_avanzamento || "[]");
      } catch (err) {
        console.error(`Errore parsing stati_avanzamento per commessa ${commessa.id}:`, err);
        continue;
      }

      statiAvanzamento = statiAvanzamento.filter(stato =>
        statiPerReparto.some(s => s.stato_id === stato.stato_id && s.reparto_id === stato.reparto_id)
      );

      statiAvanzamento = statiAvanzamento.map(stato => {
        const statoValido = statiPerReparto.find(s => s.stato_id === stato.stato_id && s.reparto_id === stato.reparto_id);
        return {
          ...stato,
          nome_stato: statoValido ? statoValido.nome_stato : stato.nome_stato,
          ordine: statoValido ? statoValido.ordine : stato.ordine,
        };
      });

      const repartiPresenti = [...new Set(statiAvanzamento.map(s => s.reparto_id))];

      for (const repartoId of repartiPresenti) {
        const statiReparto = statiAvanzamento.filter(s => s.reparto_id === repartoId);
        if (!statiReparto.some(s => s.isActive)) {
          const statoDaAttivare = statiReparto.sort((a, b) => a.ordine - b.ordine)[0];
          if (statoDaAttivare) statoDaAttivare.isActive = true;
        }
      }

      await db.query(`UPDATE commesse SET stati_avanzamento = ? WHERE id = ?`, [
        JSON.stringify(statiAvanzamento),
        commessa.id,
      ]);
    }
    console.log("✅ Allineamento stati avanzamento completato.");
  } catch (err) {
    console.error("Errore durante l'allineamento degli stati avanzamento:", err);
  }
};

module.exports = { verificaStatiCommesse, allineaStatiCommesse };
