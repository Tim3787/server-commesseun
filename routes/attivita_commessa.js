const express = require('express');
const router = express.Router();
const db = require('../config/db');
const jwt = require('jsonwebtoken');
const { inviaNotificheUtenti } = require('../Utils/notificationManager');

(req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('Formato del token non valido o assente.');
    return res.status(401).send('Accesso negato. Nessun token fornito o formato non valido.');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Non serve più verificare `role_id` se è stato aggiunto correttamente nel token
    if (!decoded.id) {
      console.error("Token decodificato privo dell'ID:", decoded);
      return res.status(403).send('Token non valido.');
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      console.error('Token scaduto:', token);
      return res.status(401).send('Token scaduto. Effettua nuovamente il login.');
    }

    console.error('Errore durante la verifica del token JWT:', err.message);
    res.status(403).send('Token non valido.');
  }
};

// Middleware per ottenere l'id utente dal token JWT
const getUserIdFromToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send('Accesso negato. Nessun token fornito.');
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id; // Salva l'id utente decodificato nella richiesta
    next();
  } catch (err) {
    res.status(403).send('Token non valido.', err);
  }
};

// ====== CONFIG ======
const SERVICE_REPARTO_ID = 18;
const SERVICE_ONLINE_RISORSA_ID = 52;

// ✅ Calendario Assistenze (service online) - GET
// GET /attivita-commessa/service-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/service-calendar', getUserIdFromToken, async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).send('Parametri richiesti: from, to (YYYY-MM-DD)');
  }

  try {
    const sql = `
      SELECT 
        ac.id, ac.commessa_id, c.numero_commessa,
        ac.risorsa_id, r.nome AS risorsa,
        rep.nome AS reparto,
        ac.attivita_id, ad.nome_attivita,
        ac.data_inizio, ac.durata, ac.stato,
        ac.descrizione AS descrizione_attivita,
        ac.note, ac.included_weekends,
        ac.service_lane
      FROM attivita_commessa ac
      JOIN commesse c ON ac.commessa_id = c.id
      LEFT JOIN risorse r ON ac.risorsa_id = r.id
      JOIN attivita ad ON ac.attivita_id = ad.id
      JOIN reparti rep ON ac.reparto_id = rep.id
      WHERE ac.reparto_id = ?
        AND ac.risorsa_id = ?
        AND ac.data_inizio >= ?
       AND ac.data_inizio < DATE_ADD(?, INTERVAL 1 DAY)
      ORDER BY ac.data_inizio ASC, ac.service_lane ASC, ac.id ASC
    `;

    const [rows] = await db.query(sql, [SERVICE_REPARTO_ID, SERVICE_ONLINE_RISORSA_ID, from, to]);

    const results = rows.map((a) => ({
      ...a,
      includedWeekends:
        typeof a.included_weekends === 'string'
          ? JSON.parse(a.included_weekends || '[]')
          : a.included_weekends || [],
    }));

    res.json(results);
  } catch (err) {
    console.error('Errore service-calendar:', err);
    res.status(500).send('Errore server.');
  }
});

// ✅ Aggiorna lane (riga) assistenza
// PUT /attivita-commessa/:id/service-lane  body: { service_lane: 1..N }
router.put('/:id/service-lane', getUserIdFromToken, async (req, res) => {
  const { id } = req.params;
  const { service_lane } = req.body;

  const lane = Number(service_lane);
  if (!Number.isFinite(lane) || lane < 1 || lane > 20) {
    return res.status(400).send('service_lane non valido (1..20).');
  }

  try {
    // opzionale: sicurezza → aggiorna solo se è davvero service-online
    const [result] = await db.query(
      `
      UPDATE attivita_commessa
      SET service_lane = ?
      WHERE id = ?
        AND reparto_id = ?
        AND risorsa_id = ?
      `,
      [lane, id, SERVICE_REPARTO_ID, SERVICE_ONLINE_RISORSA_ID]
    );

    if (result.affectedRows === 0) {
      return res.status(404).send('Attività non trovata o non è service-online.');
    }

    res.status(200).send('Lane aggiornata.');
  } catch (err) {
    console.error('Errore update service_lane:', err);
    res.status(500).send('Errore server.');
  }
});

// ✅ Ottieni le attività aperte dell'utente loggato
router.get('/me/aperte', getUserIdFromToken, async (req, res) => {
  const userId = req.userId;

  const sql = `
    SELECT 
      ac.id,
      ac.commessa_id,
      c.numero_commessa,
      ac.attivita_id,
      ad.nome_attivita,
      ac.data_inizio,
      ac.durata,
      ac.descrizione,
      ac.stato,
      ac.note
    FROM attivita_commessa ac
    JOIN commesse c ON ac.commessa_id = c.id
    JOIN attivita ad ON ac.attivita_id = ad.id
    JOIN users u ON u.risorsa_id = ac.risorsa_id
    WHERE u.id = ? AND ac.stato = 1
    ORDER BY ac.data_inizio ASC;
  `;

  try {
    const [rows] = await db.query(sql, [userId]);
    res.json(rows);
  } catch (err) {
    console.error('Errore fetch my open activities:', err);
    res.status(500).send('Errore server.');
  }
});

// ✅ Ottieni le attività dell’utente con note aperte
router.get('/me/note-aperte', getUserIdFromToken, async (req, res) => {
  const userId = req.userId;

  const sql = `
    SELECT 
      ac.id,
      ac.commessa_id,
      c.numero_commessa,
      ac.attivita_id,
      ad.nome_attivita,
      ac.data_inizio,
      ac.durata,
      ac.descrizione,
      ac.stato,
      ac.note
    FROM attivita_commessa ac
    JOIN commesse c ON ac.commessa_id = c.id
    JOIN attivita ad ON ac.attivita_id = ad.id
    JOIN users u ON u.risorsa_id = ac.risorsa_id
    WHERE u.id = ?
      AND ac.note IS NOT NULL
      AND ac.note NOT LIKE '[CHIUSA]%'
    ORDER BY ac.data_inizio ASC;
  `;

  try {
    const [rows] = await db.query(sql, [userId]);
    res.json(rows);
  } catch (err) {
    console.error('Errore fetch my notes:', err);
    res.status(500).send('Errore server.');
  }
});

router.get('/reparto/:repartoId/dashboard', async (req, res) => {
  const { repartoId } = req.params;

  try {
    // ✅ Prendi info reparto
    const [[reparto]] = await db.query(`SELECT id, nome FROM reparti WHERE id = ?`, [repartoId]);

    if (!reparto) {
      return res.status(404).json({ message: 'Reparto non trovato' });
    }

    // ✅ Attività aperte del reparto
    const [openActivities] = await db.query(
      `
      SELECT 
        ac.id, ac.commessa_id, c.numero_commessa, ac.attivita_id,
        ad.nome_attivita, ac.data_inizio, ac.durata, ac.descrizione,
        ac.stato, ac.note,
         r.nome AS risorsa_nome 
      FROM attivita_commessa ac
      JOIN commesse c ON ac.commessa_id = c.id
      JOIN attivita ad ON ac.attivita_id = ad.id
         JOIN risorse r  ON r.id = ac.risorsa_id 
      WHERE ac.reparto_id = ?
          AND ac.stato = 1
      ORDER BY ac.data_inizio ASC
    `,
      [repartoId]
    );

    // ✅ Note aperte del reparto
    const [openNotes] = await db.query(
      `
      SELECT 
        ac.id, ac.commessa_id, c.numero_commessa, ac.attivita_id,
        ad.nome_attivita, ac.data_inizio, ac.durata, ac.descrizione,
        ac.stato, ac.note,
         r.nome AS risorsa_nome 
      FROM attivita_commessa ac
      JOIN commesse c ON ac.commessa_id = c.id
      JOIN attivita ad ON ac.attivita_id = ad.id
         JOIN risorse r  ON r.id = ac.risorsa_id 
      WHERE ac.reparto_id = ?
        AND ac.note IS NOT NULL
        AND ac.note NOT LIKE '[CHIUSA]%'
      ORDER BY ac.data_inizio ASC
    `,
      [repartoId]
    );

    res.json({
      reparto_id: reparto.id,
      reparto_nome: reparto.nome, // ✅ campo corretto
      openActivitiesCount: openActivities.length,
      openNotesCount: openNotes.length,
      openActivities,
      openNotes,
    });
  } catch (err) {
    console.error('Errore dashboard reparto:', err);
    res.status(500).send('Errore server.');
  }
});

// Rotta per ottenere le attività
router.get('/', async (req, res) => {
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
  ac.durata,
  ac.stato,
  ac.descrizione AS descrizione_attivita,
   ac.note,
   ac.included_weekends 
FROM attivita_commessa ac
JOIN commesse c ON ac.commessa_id = c.id
LEFT JOIN risorse r ON ac.risorsa_id = r.id
JOIN attivita ad ON ac.attivita_id = ad.id
JOIN reparti rep ON ac.reparto_id = rep.id -- Associazione con la tabella reparti
WHERE 1=1
`;

  const params = [];

  if (commessa_id) {
    sql += ' AND ac.commessa_id = ?';
    params.push(commessa_id);
  }

  if (risorsa_id) {
    sql += ' AND ac.risorsa_id = ?';
    params.push(risorsa_id);
  }

  if (reparto) {
    sql += ' AND r.reparto = ?';
    params.push(reparto);
  }

  if (settimana) {
    sql += ` AND WEEK(ac.data_inizio) = WEEK(?)`;
    params.push(settimana);
  }

  try {
    const [rows] = await db.query(sql, params);
    const results = rows.map((a) => ({
      ...a,
      includedWeekends: a.included_weekends || [],
    }));
    res.json(results);
  } catch (err) {
    console.error('Errore durante il recupero delle attività assegnate:', err);
    res.status(500).send('Errore durante il recupero delle attività assegnate.');
  }
});

// Assegnare un'attività a una commessa
router.post('/', getUserIdFromToken, async (req, res) => {
  const {
    commessa_id,
    reparto_id,
    risorsa_id,
    attivita_id,
    data_inizio,
    durata,
    descrizione = 'Nessuna descrizione fornita',
    stato,
    includedWeekends,
    service_lane,
  } = req.body;

  const lane = Number(service_lane) || 1;

  if (!commessa_id || !reparto_id || !attivita_id || !risorsa_id || !data_inizio || !durata) {
    return res.status(400).send('Tutti i campi sono obbligatori.');
  }

  try {
    // Verifica se la risorsa esiste
    const [risorsaExists] = await db.query('SELECT id FROM risorse WHERE id = ?', [risorsa_id]);
    if (risorsaExists.length === 0) {
      return res.status(400).send('Errore: La risorsa specificata non esiste.');
    }

    // Recupera l'utente associato alla risorsa (includi device_token)
    const [user] = await db.query('SELECT id, device_token FROM users WHERE risorsa_id = ?', [
      risorsa_id,
    ]);
    if (user.length === 0) {
      return res.status(400).send('Errore: Nessun utente associato a questa risorsa.');
    }
    const userId = user[0].id; // Ottieni l'ID utente

    // Recupera il numero commessa
    const [commessa] = await db.query('SELECT numero_commessa FROM commesse WHERE id = ?', [
      commessa_id,
    ]);
    if (commessa.length === 0) {
      return res.status(400).send('Errore: La commessa specificata non esiste.');
    }
    const numeroCommessa = commessa[0].numero_commessa;

    // Recupera il tipo di attività
    const [attivita] = await db.query('SELECT nome_attivita FROM attivita WHERE id = ?', [
      attivita_id,
    ]);
    if (attivita.length === 0) {
      return res.status(400).send("Errore: L'attività specificata non esiste.");
    }
    const tipoAttivita = attivita[0].nome_attivita;

    // Inserisce l'attività
    const query = `
        INSERT INTO attivita_commessa
    (commessa_id, reparto_id, risorsa_id, attivita_id, data_inizio, durata, descrizione, stato, included_weekends, service_lane)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
    const [result] = await db.query(query, [
      commessa_id,
      reparto_id,
      risorsa_id,
      attivita_id,
      data_inizio,
      durata,
      descrizione,
      stato,
      JSON.stringify(includedWeekends || []),
      lane,
    ]);

    // Crea il messaggio

    const message = `Nuova attività, Commessa: ${numeroCommessa}
      - Tipo attività: ${tipoAttivita}
      - Data inizio: ${new Date(data_inizio).toLocaleDateString('it-IT')}
      - Durata: ${durata} giorni

      .`;

    // Invia notifica (salva in DB + push)
    await inviaNotificheUtenti({
      userIds: [userId],
      titolo: "Ti è stata assegnata un'attività:",
      messaggio: message,
      categoria: 'Attività creata',
      push: true,
    });
    // Recupera l’attività appena inserita, completa di nome_risorsa, nome_attivita e nome_reparto
    const [attivitaCreata] = await db.query(
      `
  SELECT 
    a.id,
    a.commessa_id,
    c.numero_commessa,
    a.risorsa_id,
    ri.nome AS nome_risorsa,
    a.attivita_id,
    at.nome_attivita,
    a.data_inizio,
    a.durata,
    a.descrizione,
    a.stato,
    a.included_weekends,
    a.service_lane, 
    r.id AS reparto_id,
    r.nome AS nome_reparto
  FROM attivita_commessa a
  JOIN commesse c ON c.id = a.commessa_id
  JOIN attivita at ON at.id = a.attivita_id
  JOIN risorse ri ON ri.id = a.risorsa_id
  JOIN reparti r ON r.id = ri.reparto_id
  WHERE a.id = ?
`,
      [result.insertId]
    );

    const created = attivitaCreata[0];

    res.status(201).json({
      ...created,
      includedWeekends:
        typeof created.included_weekends === 'string'
          ? JSON.parse(created.included_weekends || '[]')
          : created.included_weekends || [],
    });
  } catch (error) {
    console.error("Errore durante l'assegnazione dell'attività:", error);
    res.status(500).send("Errore durante l'assegnazione dell'attività.");
  }
});

const formatDateForMySQL = (isoDate) => {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Modificare un'attività
router.put('/:id', getUserIdFromToken, async (req, res) => {
  const { id } = req.params;
  const {
    commessa_id,
    risorsa_id,
    attivita_id,
    data_inizio,
    durata,
    descrizione,
    stato,
    includedWeekends,
  } = req.body;

  const formattedDataInizio = formatDateForMySQL(data_inizio);

  try {
    // Recupera il numero della commessa
    const [commessa] = await db.query('SELECT numero_commessa FROM commesse WHERE id = ?', [
      commessa_id,
    ]);
    const numeroCommessa = commessa.length > 0 ? commessa[0].numero_commessa : 'Sconosciuta';

    // Recupera il tipo di attività
    const [attivita] = await db.query('SELECT nome_attivita FROM attivita WHERE id = ?', [
      attivita_id,
    ]);
    const tipoAttivita = attivita.length > 0 ? attivita[0].nome_attivita : 'Sconosciuta';

    // Recupera l'utente associato alla risorsa per ottenere l'id e il device token
    const [risorsa] = await db.query('SELECT id, device_token FROM users WHERE risorsa_id = ?', [
      risorsa_id,
    ]);
    const userId = risorsa.length > 0 ? risorsa[0].id : null;

    if (!userId) {
      return res.status(400).send('Errore: Nessun utente associato a questa risorsa.');
    }

    // Aggiorna l'attività
    const sql = `
      UPDATE attivita_commessa 
      SET commessa_id = ?, risorsa_id = ?, attivita_id = ?, data_inizio = ?, durata = ?, descrizione = ?, stato = ?, included_weekends = ?
      WHERE id = ?
    `;
    await db.query(sql, [
      commessa_id,
      risorsa_id,
      attivita_id,
      formattedDataInizio,
      durata,
      descrizione,
      stato,
      JSON.stringify(includedWeekends || []),
      id,
    ]);

    const message = `Attività modificata, Commessa: ${numeroCommessa}
      - Tipo attività: ${tipoAttivita}
      - Data inizio: ${new Date(data_inizio).toLocaleDateString('it-IT')}
      - Durata: ${durata} giorni
      .`;

    await inviaNotificheUtenti({
      userIds: [userId],
      titolo: "E' stata modificata un'attività:",
      messaggio: message,
      categoria: 'Attività modificata',
      push: false,
    });

    // Recupera l'attività aggiornata con join per reparto e risorsa
    const [attivitaAggiornata] = await db.query(
      `
  SELECT 
    a.id,
    a.commessa_id,
    c.numero_commessa,
    a.risorsa_id,
    ri.nome AS nome_risorsa,
    a.attivita_id,
    at.nome_attivita,
    a.data_inizio,
    a.durata,
    a.descrizione,
    a.stato,
    a.included_weekends,
    r.id AS reparto_id,
    r.nome AS nome_reparto
  FROM attivita_commessa a
  JOIN commesse c ON c.id = a.commessa_id
  JOIN attivita at ON at.id = a.attivita_id
  JOIN risorse ri ON ri.id = a.risorsa_id
  JOIN reparti r ON r.id = ri.reparto_id
  WHERE a.id = ?
`,
      [id]
    );

    res.json(attivitaAggiornata[0]);
  } catch (err) {
    console.error("Errore durante la modifica dell'attività:", err);
    res.status(500).send("Errore durante la modifica dell'attività.");
  }
});

// Eliminare un'attività
router.delete('/:id', getUserIdFromToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Recupera i dettagli dell'attività per la notifica
    const [activity] = await db.query(
      `
      SELECT 
        ac.commessa_id, c.numero_commessa, ac.attivita_id, ad.nome_attivita, ac.risorsa_id
      FROM attivita_commessa ac
      JOIN commesse c ON ac.commessa_id = c.id
      JOIN attivita ad ON ac.attivita_id = ad.id
      WHERE ac.id = ?
    `,
      [id]
    );

    if (activity.length === 0) {
      return res.status(404).send('Attività non trovata.');
    }

    const numeroCommessa = activity[0].numero_commessa;
    const tipoAttivita = activity[0].nome_attivita;
    const risorsaId = activity[0].risorsa_id;

    // Recupera l'utente associato alla risorsa, se esiste
    const [user] = await db.query('SELECT id, device_token FROM users WHERE risorsa_id = ?', [
      risorsaId,
    ]);
    const userId = user.length > 0 ? user[0].id : null;

    // Se non esiste un utente associato, logga un avviso e prosegui
    if (!userId) {
      console.warn('Attività cancellata, ma nessun utente associato a questa risorsa.');
    }

    // Elimina l'attività
    const sql = `DELETE FROM attivita_commessa WHERE id = ?`;
    await db.query(sql, [id]);

    // Crea una notifica solo se esiste un utente associato

    const message = `Attività eliminata, Commessa: ${numeroCommessa}
      - Tipo attività: ${tipoAttivita}`;

    await inviaNotificheUtenti({
      userIds: [userId],
      titolo: "Un'attività è stata eliminata:",
      messaggio: message,
      categoria: 'Attività eliminata',
      push: true,
    });

    res.send('Attività eliminata con successo!');
  } catch (err) {
    console.error("Errore durante l'eliminazione dell'attività:", err);
    res.status(500).send("Errore durante l'eliminazione dell'attività.");
  }
});
// ✅ Note aperte collegate (stessa commessa + reparto)
router.get('/open-notes', getUserIdFromToken, async (req, res) => {
  const { commessa_id, reparto_id, exclude_id } = req.query;

  if (!commessa_id || !reparto_id) {
    return res.status(400).json({ message: 'commessa_id e reparto_id sono richiesti' });
  }

  const params = [commessa_id, reparto_id];

  let sql = `
    SELECT
      ac.id,
      ac.commessa_id,
      c.numero_commessa,
      ac.reparto_id,
      ac.attivita_id,
      ad.nome_attivita,
      ac.risorsa_id,
      r.nome AS risorsa_nome,
      ac.data_inizio,
      ac.stato,
      ac.descrizione,
      ac.note
    FROM attivita_commessa ac
    JOIN commesse c ON c.id = ac.commessa_id
    JOIN attivita ad ON ad.id = ac.attivita_id
    LEFT JOIN risorse r ON r.id = ac.risorsa_id
    WHERE ac.commessa_id = ?
      AND ac.reparto_id = ?
      AND ac.note IS NOT NULL
      AND TRIM(ac.note) <> ''
      AND UPPER(ac.note) NOT LIKE '[CHIUSA]%'
  `;

  if (exclude_id) {
    sql += ` AND ac.id <> ?`;
    params.push(exclude_id);
  }

  sql += ` ORDER BY ac.data_inizio DESC`;

  try {
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error('Errore open-notes:', e);
    res.status(500).json({ message: 'Errore recupero note aperte' });
  }
});

module.exports = router;
