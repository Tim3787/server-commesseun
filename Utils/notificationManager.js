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

const inviaNotificaCategoria = async ({ 
  categoria, 
  titolo, 
  messaggio, 
  commessaId = null, 
  repartoId = null, 
  includiGlobali = false
}) => {
  try {
    console.log("➡️ inviaNotificaCategoria → categoria:", categoria, " | repartoId:", repartoId, " | includiGlobali:", includiGlobali);

    // 1. Carica i destinatari
    const [destinatari] = await db.query(`
      SELECT user_id, reparto_id, ruolo
      FROM notifiche_destinatari
      WHERE categoria = ?
        AND (commessa_id IS NULL OR commessa_id = ?)
    `, [categoria, commessaId]);

    console.log("📥 Destinatari trovati in tabella:", destinatari.length);

    if (destinatari.length === 0) return;

    // 2. Tutti gli utenti
    const [utenti] = await db.query(`
      SELECT u.id, ru.reparto_id, r.role_name, u.device_token, u.email
      FROM users u
      LEFT JOIN risorse ru ON ru.id = u.risorsa_id
      LEFT JOIN roles r ON u.role_id = r.id
    `);

    // 3. Filtro logico
    let userIds = [];

    if (includiGlobali) {
      userIds = utenti
        .filter(u =>
          destinatari.some(d =>
            (d.user_id && d.user_id === u.id) ||
            (d.reparto_id && d.reparto_id === u.reparto_id) ||
            (d.ruolo && d.ruolo === u.role_name)
          )
        )
        .map(u => u.id);
    } else {
      userIds = utenti
        .filter(u =>
          destinatari.some(d =>
            d.user_id === u.id && u.reparto_id === repartoId
          )
        )
        .map(u => u.id);
    }

    const uniqueUserIds = [...new Set(userIds)];
    console.log("✅ Utenti finali da notificare:", uniqueUserIds);

    if (uniqueUserIds.length === 0) {
      console.log("📭 Nessun utente finale da notificare.");
      return;
    }

    // 4. Preferenze
    const [preferenze] = await db.query(`
      SELECT user_id, via_push, via_email
      FROM notifiche_preferenze
      WHERE categoria = ? AND user_id IN (?)
    `, [categoria, uniqueUserIds]);

    const prefsMap = {};
    for (const pref of preferenze) {
      prefsMap[pref.user_id] = {
        via_push: !!pref.via_push,
        via_email: !!pref.via_email
      };
    }

    // 5. Utenti completi
    const [utentiFinali] = await db.query(`
      SELECT id, device_token, email
      FROM users
      WHERE id IN (?)
    `, [uniqueUserIds]);

    // 6. Invia notifiche
    for (const u of utentiFinali) {
      const prefs = prefsMap[u.id] || { via_push: true, via_email: false };

      await db.query(`
        INSERT INTO notifications (user_id, titolo, message, category, is_read, created_at)
        VALUES (?, ?, ?, ?, false, NOW())
      `, [u.id, titolo, messaggio, categoria]);

      console.log(`📨 Notifica DB inserita per utente: ${u.id}`);

      if (prefs.via_push && u.device_token) {
        try {
          await admin.messaging().send({
            token: u.device_token,
            notification: { title: titolo, body: messaggio },
            data: { categoria },
          });
          console.log(`📲 Push inviata a utente: ${u.id}`);
        } catch (err) {
          console.warn(`⚠️ Errore push utente ${u.id}:`, err.message);
        }
      }

      if (prefs.via_email && u.email) {
        console.log(`[✉️ Fake Email] ${u.email}: ${titolo} - ${messaggio}`);
      }
    }

  } catch (err) {
    console.error("❌ Errore in inviaNotificaCategoria:", err);
  }
};


module.exports = {
  inviaNotificheUtenti,
  inviaNotificaCategoria,
};