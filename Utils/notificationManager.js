const admin = require("firebase-admin");
const db = require("../config/db");

/**
 * Invia notifiche a uno o più utenti (salva nel DB + push se previsto dalle preferenze)
 * @param {Object} options
 * @param {number[]} options.userIds - Array di ID utente destinatari
 * @param {string} options.titolo - Titolo della notifica
 * @param {string} options.messaggio - Testo della notifica
 * @param {string} [options.categoria] - Categoria della notifica (es. 'commessa', 'urgente', ecc.)
 */
const inviaNotificheUtenti = async ({
  userIds,
  titolo,
  messaggio,
  categoria = "generale"
}) => {
  if (!userIds || userIds.length === 0) return;

  try {
    // Prendi le preferenze di notifica per gli utenti e la categoria
    const [preferenze] = await db.query(
      `SELECT * FROM notifiche_preferenze WHERE user_id IN (?) AND categoria = ?`,
      [userIds, categoria]
    );

    // Prendi i token dei destinatari
    const [utenti] = await db.query(
      "SELECT id, device_token, email FROM users WHERE id IN (?)",
      [userIds]
    );

    for (const utente of utenti) {
      const prefs = preferenze.find(p => p.user_id === utente.id);

      const preferiscePush = prefs ? prefs.push === 1 : false;
      const preferisceEmail = prefs ? prefs.email === 1 : false;

      // Salva in ogni caso nel database
      await db.query(
        "INSERT INTO notifications (user_id, titolo, message, category, is_read, created_at) VALUES (?, ?, ?, ?, false, NOW())",
        [utente.id, titolo, messaggio, categoria]
      );

      // Se vuole anche push ed è disponibile il device token
      if (preferiscePush && utente.device_token) {
        const msg = {
          token: utente.device_token,
          data: {
            title: titolo,
            body: messaggio,
            categoria: categoria,
          },
        };

        try {
          await admin.messaging().send(msg);
        } catch (err) {
          console.warn(`Errore notifica push a utente ${utente.id}:`, err.message);
        }
      }

      // Se vuole anche email (puoi implementarla dopo)
      if (preferisceEmail && utente.email) {
        // TODO: implementa invio email se necessario
        console.log(`(Mock) Invio email a ${utente.email}: ${titolo}`);
      }
    }

  } catch (err) {
    console.error("Errore nell'invio delle notifiche:", err);
  }
};


/**
 * Invia notifiche per categoria, usando notifiche_destinatari + notifiche_preferenze
 * @param {Object} options
 * @param {string} options.categoria - Categoria notifica (es. 'Stato attività')
 * @param {string} options.titolo - Titolo della notifica
 * @param {string} options.messaggio - Messaggio della notifica
 * @param {number|null} [options.commessaId] - Filtra per commessa (opzionale)
 * @param {number|null} [options.repartoId] - Filtra per reparto (opzionale)
 */
const inviaNotificaCategoria = async ({ categoria, titolo, messaggio, commessaId = null, repartoId = null }) => {
  try {
    // 1. Prendi tutti i destinatari (user_id, reparto_id, ruolo)
    const [destinatari] = await db.query(`
      SELECT user_id, reparto_id, ruolo
      FROM notifiche_destinatari
      WHERE categoria = ?
        AND (commessa_id IS NULL OR commessa_id = ?)
        AND (reparto_id IS NULL OR reparto_id = ?)
    `, [categoria, commessaId, repartoId]);

    if (destinatari.length === 0) return;

    // 2. Prendi tutti gli utenti con reparto e ruolo associati
    const [utenti] = await db.query(`
      SELECT u.id, u.reparto_id, u.role_id, u.device_token, u.email, r.role_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
    `);

    // 3. Filtra gli utenti che devono ricevere la notifica
    const userIds = utenti
      .filter(u =>
        destinatari.some(d =>
          (d.user_id && d.user_id === u.id) ||
          (d.reparto_id && d.reparto_id === u.reparto_id) ||
          (d.ruolo && d.ruolo === u.role_name)
        )
      )
      .map(u => u.id);

    const uniqueUserIds = [...new Set(userIds)];

    if (uniqueUserIds.length === 0) return;

    // 4. Prendi preferenze notifica per categoria
    const [preferenze] = await db.query(`
      SELECT user_id, via_push, via_email, solo_app
      FROM notifiche_preferenze
      WHERE categoria = ? AND user_id IN (?)
    `, [categoria, uniqueUserIds]);

    const prefsMap = {};
    for (const pref of preferenze) {
      prefsMap[pref.user_id] = {
        via_push: !!pref.via_push,
        via_email: !!pref.via_email,
        solo_app: !!pref.solo_app
      };
    }

    // 5. Info utenti
    const [utentiFinali] = await db.query(`
      SELECT id, device_token, email
      FROM users
      WHERE id IN (?)
    `, [uniqueUserIds]);

    // 6. Invio Notifiche
    for (const u of utentiFinali) {
      const prefs = prefsMap[u.id] || { via_push: true, via_email: false, solo_app: false };

      // a. Salva sempre nel DB
      await db.query(`
        INSERT INTO notifications (user_id, titolo, message, category, is_read, created_at)
        VALUES (?, ?, ?, ?, false, NOW())
      `, [u.id, titolo, messaggio, categoria]);

      // b. Push
      if (prefs.via_push && u.device_token) {
        try {
          await admin.messaging().send({
            token: u.device_token,
            notification: {
              title: titolo,
              body: messaggio,
            },
            data: { categoria },
          });
        } catch (err) {
          console.warn(`Errore push utente ${u.id}:`, err.message);
        }
      }

      // c. Email
      if (prefs.via_email && u.email) {
        console.log(`[Fake Email] → ${u.email}: ${titolo} - ${messaggio}`);
        // TODO: nodemailer se vuoi inviare davvero
      }
    }

  } catch (err) {
    console.error("Errore in inviaNotificaCategoria:", err);
  }
};



module.exports = {
  inviaNotificheUtenti,
  inviaNotificaCategoria,
};