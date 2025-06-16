const admin = require("firebase-admin");
const db = require("../config/db");

/**
 * Invia notifiche a uno o più utenti (salva nel DB + push se possibile)
 * @param {Object} options
 * @param {number[]} options.userIds - Array di ID utente destinatari
 * @param {string} options.titolo - Titolo della notifica
 * @param {string} options.messaggio - Testo della notifica
 * @param {string} [options.categoria] - Categoria della notifica (es. 'commessa', 'urgente', ecc.)
* @param {boolean}  [options.push=true]  Se false, NON manda il push
 */
const inviaNotificheUtenti = async ({ userIds, titolo, messaggio, categoria = "generale" }) => {
  if (!userIds || userIds.length === 0) return;

  try {
    // Prende gli utenti con i token
    const [users] = await db.query(
      "SELECT id, device_token FROM users WHERE id IN (?)",
      [userIds]
    );

    // Salva ogni notifica nel database
    for (const utente of users) {
await db.query(
  "INSERT INTO notifications (user_id, titolo, message, category, is_read, created_at) VALUES (?, ?, ?, ?, false, NOW())",
  [utente.id, titolo, messaggio, categoria]
);
    }

    // Crea i messaggi push per chi ha token
const pushMessages = users
  .filter(u => u.device_token)
  .map(u => ({
    token: u.device_token,
    data: {
      title: titolo,
      body: messaggio,
      categoria: categoria,
    },
  }));

  // 3. (opzionale) push
    if (push) {
      const pushMessages = users
        .filter(u => u.device_token)
        .map(u => ({
          token: u.device_token,
          data: {
            title: titolo,
            body: messaggio,
            categoria
          }
        }));

      const results = await Promise.allSettled(
        pushMessages.map(m => admin.messaging().send(m))
      );

      results.forEach((r, i) => {
        if (r.status === "rejected") {
          console.warn(
            `Errore notifica push a ${pushMessages[i].token}:`,
            r.reason
          );
        }
      });
    }
  } catch (err) {
    console.error("Errore nell'invio delle notifiche:", err);
  }
};