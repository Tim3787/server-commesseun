const admin = require("./firebaseAdmin");

const sendNotification = (token, title, body) => {
  const message = {
    notification: {
      title: title,
      body: body,
    },
    token: token,
  };

  admin.messaging().send(message)
    .then((response) => {
      console.log("Notifica inviata con successo:", response);
    })
    .catch((error) => {
      console.error("Errore durante l'invio della notifica:", error);
    });
};

module.exports = sendNotification;
