const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const bodyParser = require("body-parser"); // Importa body-parser
require("dotenv").config(); // Carica variabili d'ambiente

const commesseRoutes = require("./routes/commesse");
const risorseRoutes = require("./routes/risorse");
const attivitaRoutes = require("./routes/attivita");
const attivitaCommessaRoutes = require("./routes/attivita_commessa");
const repartiRoutes = require("./routes/reparti");
const userRoutes = require("./routes/user");
const statiAvanzamentoRoutes = require("./routes/stati-avanzamento");
const commessaStatiRoutes = require("./routes/stati-avanzamento");
const notificheRoutes = require("./routes/notifiche");

const app = express();

// Middleware di sicurezza e configurazione
app.use(helmet()); // Aggiunge intestazioni di sicurezza
app.use(cors()); // Abilita le richieste cross-origin
app.use(bodyParser.json()); // Gestisce le richieste JSON
app.use(bodyParser.urlencoded({ extended: true })); // Gestisce i dati URL-encoded

// Rotte API
app.use("/api/commesse", commesseRoutes);
app.use("/api/risorse", risorseRoutes);
app.use("/api/attivita", attivitaRoutes);
app.use("/api/attivita_commessa", attivitaCommessaRoutes);
app.use("/api/reparti", repartiRoutes);
app.use("/api/users", userRoutes);
app.use("/api/stati-avanzamento", statiAvanzamentoRoutes);
app.use("/api/commessa-stati", commessaStatiRoutes);
app.use("/api/notifiche", notificheRoutes)

// Middleware di gestione degli errori
app.use((err, req, res, next) => {
  console.error("Errore globale:", err.message);
  res.status(err.status || 500).send({
    message: err.message || "Errore interno del server",
  });
});

// Avvio del server
const PORT = process.env.PORT || 5000; // Usa variabile d'ambiente PORT, se disponibile
app.listen(PORT, () => {
  console.log(`Server in esecuzione sulla porta ${PORT}`);
});
