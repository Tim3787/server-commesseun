const admin = require("firebase-admin");

// Inizializza l'SDK Firebase Admin se non lo hai ancora fatto
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const sendNotification = async (deviceToken, title, body) => {
  const message = {
    notification: {
      title,
      body,
    },
    token: deviceToken,  // Token del dispositivo a cui inviare la notifica
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("Notifica inviata con successo:", response);
  } catch (err) {
    console.error("Errore durante l'invio della notifica:", err);
  }
};

module.exports = sendNotification;
