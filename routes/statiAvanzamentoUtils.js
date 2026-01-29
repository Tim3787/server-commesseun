const db = require("../config/db"); // Assumi che db sia la tua connessione al database
    const normalizeName = (s) =>
      String(s || "")
        .trim()
        .toLowerCase()
        .replace(/[-_]/g, " ")
        .replace(/\s+/g, " ");
      const TARGET_STATE = "in entrata";
const parseJsonField = (raw) => {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;

  // se arriva già parsato dal driver (json column)
  if (typeof raw === "object") {
    // accetto solo array, altrimenti fallback vuoto
    return [];
  }

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  }

  return [];
};




// ✅ Funzione per verificare e aggiornare le commesse con gli stati mancanti
const verificaStatiCommesse = async () => {
  try {
    const [reparti] = await db.query(`SELECT id AS reparto_id FROM reparti`);
    if (reparti.length === 0) return console.log("Nessun reparto trovato.");
let updated = 0;
let skipped = 0;

    const [statiPerReparto] = await db.query(`
      SELECT reparto_id, id AS stato_id, nome_stato, ordine
      FROM stati_avanzamento
    `);
    if (statiPerReparto.length === 0)
      return console.log("Nessuno stato avanzamento trovato.");

    const [commesse] = await db.query(`SELECT id, stati_avanzamento FROM commesse`);


    const sortFn = (a, b) => {
      const ar = Number(a.reparto_id);
      const br = Number(b.reparto_id);
      if (ar !== br) return ar - br;

      const ao = a.ordine ?? 0;
      const bo = b.ordine ?? 0;
      if (ao !== bo) return ao - bo;

      const as = Number(a.stato_id ?? 0);
      const bs = Number(b.stato_id ?? 0);
      return as - bs;
    };

    for (const commessa of commesse) {
      let statiAvanzamento = [];
      try {
        statiAvanzamento = parseJsonField(commessa.stati_avanzamento);
        if (!Array.isArray(statiAvanzamento)) statiAvanzamento = [];

      } catch (err) {
        console.error(
          `Errore parsing stati_avanzamento per commessa ${commessa.id}:`,
          err
        );
        skipped++;
        continue;
      }

      let statiAggiornati = [...statiAvanzamento];

      for (const reparto of reparti) {
  const repartoId = reparto.reparto_id;

  const statiReparto = statiPerReparto.filter(
    (st) => Number(st.reparto_id) === Number(repartoId)
  );

  // 1) Aggiungo gli stati mancanti (sempre isActive:false)
  for (const stato of statiReparto) {
    const esiste = statiAggiornati.some(
      (stComm) =>
        Number(stComm.reparto_id) === Number(stato.reparto_id) &&
        Number(stComm.stato_id) === Number(stato.stato_id)
    );

    if (!esiste) {
      statiAggiornati.push({
        reparto_id: stato.reparto_id,
        stato_id: stato.stato_id,
        nome_stato: stato.nome_stato,
        ordine: stato.ordine,
        data_inizio: null,
        data_fine: null,
        isActive: false,
      });
    }
  }

  // 2) FIX unico: se per questo reparto non c'è nessuno stato attivo,
  // attivo "In Entrata" se esiste, altrimenti il primo per ordine.
  const statiDelReparto = statiAggiornati.filter(
    (s) => Number(s.reparto_id) === Number(repartoId)
  );
if (statiDelReparto.length > 0) {
  const haAttivo = statiDelReparto.some((s) => s.isActive === true);

  // 1) se nessun attivo -> accendo In Entrata o fallback
  if (!haAttivo) {
    const inEntrata = statiDelReparto.find(
      (s) => normalizeName(s.nome_stato) === TARGET_STATE
    );

    if (inEntrata) {
      inEntrata.isActive = true;
    } else {
      statiDelReparto.sort(sortFn);
      statiDelReparto[0].isActive = true;
    }
  }

  // 2) opzionale: se più attivi -> ne tengo UNO solo (il primo per ordine)
const attivi = statiDelReparto.filter(s => s.isActive === true);
if (attivi.length > 1) {
  // preferisci "In Entrata", altrimenti il più basso per ordine
  let keep =
    statiDelReparto.find(s => s.isActive && normalizeName(s.nome_stato) === TARGET_STATE) ||
    attivi.sort((a,b) => (a.ordine ?? 0) - (b.ordine ?? 0))[0];

  for (const s of statiDelReparto) s.isActive = (s === keep);
}
}

}


      // ✅ ordino entrambi prima del confronto (evita UPDATE inutili)
      statiAggiornati.sort(sortFn);
      statiAvanzamento.sort(sortFn);

      if (JSON.stringify(statiAggiornati) !== JSON.stringify(statiAvanzamento)) {
       await db.query(
  `UPDATE commesse SET stati_avanzamento = ? WHERE id = ?`,
  [JSON.stringify(statiAggiornati), commessa.id]
);
        updated++
      }
    }

    console.log(`✅ Verifica stati avanzamento completata. Updated: ${updated} | Skipped JSON: ${skipped}`);
  } catch (err) {
    console.error("Errore durante la verifica degli stati avanzamento:", err);
  }
};





// ✅ Funzione per allineare gli stati avanzamento eliminando quelli obsoleti
const allineaStatiCommesse = async () => {
  try {
    const [statiPerReparto] = await db.query(`
      SELECT reparto_id, id AS stato_id, nome_stato, ordine
      FROM stati_avanzamento
    `);
    if (statiPerReparto.length === 0) {
      console.log("Nessuno stato avanzamento trovato.");
      return;
    }

    const [commesse] = await db.query(`SELECT id, stati_avanzamento FROM commesse`);
let updated = 0;
let skipped = 0;

    const sortFn = (a, b) => {
      const ar = Number(a.reparto_id);
      const br = Number(b.reparto_id);
      if (ar !== br) return ar - br;

      const ao = a.ordine ?? 0;
      const bo = b.ordine ?? 0;
      if (ao !== bo) return ao - bo;

      const as = Number(a.stato_id ?? 0);
      const bs = Number(b.stato_id ?? 0);
      return as - bs;
    };

    for (const commessa of commesse) {
      let statiAvanzamento = [];

      try {
        statiAvanzamento = parseJsonField(commessa.stati_avanzamento);

        if (!Array.isArray(statiAvanzamento)) statiAvanzamento = [];
      } catch (err) {
        console.error(`Errore parsing stati_avanzamento per commessa ${commessa.id}:`, err);
          skipped++;
  continue;
      }

      const original = global.structuredClone
  ? structuredClone(statiAvanzamento)
  : JSON.parse(JSON.stringify(statiAvanzamento));


      // 1) rimuovo stati obsoleti
      statiAvanzamento = statiAvanzamento.filter((stato) =>
        statiPerReparto.some(
          (s) => Number(s.stato_id) === Number(stato.stato_id) && Number(s.reparto_id) === Number(stato.reparto_id)
        )
      );

      // 2) aggiorno nome/ordine dagli stati validi
      statiAvanzamento = statiAvanzamento.map((stato) => {
        const statoValido = statiPerReparto.find(
          (s) => Number(s.stato_id) === Number(stato.stato_id) && Number(s.reparto_id) === Number(stato.reparto_id)
        );
        return {
          ...stato,
          nome_stato: statoValido ? statoValido.nome_stato : stato.nome_stato,
          ordine: statoValido ? statoValido.ordine : stato.ordine,
        };
      });

      // 3) se un reparto non ha attivo -> preferisci "In Entrata"
      const repartiPresenti = [...new Set(statiAvanzamento.map((s) => Number(s.reparto_id)))];

      for (const repartoId of repartiPresenti) {
        const statiReparto = statiAvanzamento.filter((s) => Number(s.reparto_id) === Number(repartoId));
// 1) se nessun attivo -> accendo In Entrata o fallback
if (!statiReparto.some((s) => s.isActive === true)) {
  const inEntrata = statiReparto.find(
    (s) => normalizeName(s.nome_stato) === TARGET_STATE
  );

  if (inEntrata) {
    inEntrata.isActive = true;
  } else {
    statiReparto.sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0));
    if (statiReparto[0]) statiReparto[0].isActive = true;
  }
}
// 2) opzionale: se più attivi -> ne tengo UNO solo (preferisci "In Entrata", altrimenti ordine più basso)
const attivi = statiReparto.filter(s => s.isActive === true);
if (attivi.length > 1) {
  const keep =
    statiReparto.find(s => s.isActive && normalizeName(s.nome_stato) === TARGET_STATE) ||
    attivi.sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0))[0];

  for (const s of statiReparto) s.isActive = (s === keep);
}


      }

      // 4) confronto ordinato e UPDATE solo se cambia
      statiAvanzamento.sort(sortFn);
      original.sort(sortFn);

      if (JSON.stringify(statiAvanzamento) !== JSON.stringify(original)) {
       await db.query(
  `UPDATE commesse SET stati_avanzamento = ? WHERE id = ?`,
  [JSON.stringify(statiAvanzamento), commessa.id]
);

        updated++;
      }
    }

    console.log(`✅ Allineamento stati avanzamento completato. Updated: ${updated} | Skipped JSON: ${skipped}`);

  } catch (err) {
    console.error("Errore durante l'allineamento degli stati avanzamento:", err);
  }
};

module.exports = { verificaStatiCommesse, allineaStatiCommesse };
