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

const sendNotification = require("./sendNotification");

sendNotification(
  "d_Z9qYkTnVlmN0SeMist2v:APA91bH_zQRsD2ZWDXiRiemZn3Bfy5_SLDzfMJZd38swESdBFJJvKMGiKyMTxqUYCDADE1MkvMJBijDdmii01gyib-dauznxP3Iy5J2aNPu5bC8t_thXaCA", 
  "Test Notifica", 
  "Questa è una notifica di test."
);



module.exports = sendNotification;
