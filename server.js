const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser'); // Importa body-parser
require('dotenv').config(); // Carica variabili d'ambiente

const commesseRoutes = require('./routes/commesse');
const risorseRoutes = require('./routes/risorse');
const attivitaRoutes = require('./routes/attivita');
const attivitaCommessaRoutes = require('./routes/attivita_commessa');
const repartiRoutes = require('./routes/reparti');
const userRoutes = require('./routes/user');
const statiAvanzamentoRoutes = require('./routes/stati-avanzamento');
const commessaStatiRoutes = require('./routes/stati-avanzamento');
const notificheRoutes = require('./routes/notifiche');
const statoCommessaRoutes = require('./routes/stato-commessa.js');
const PrenotazioneSaleRoutes = require('./routes/sale-riunioni.js');
const CommessaDettagliRoutes = require('./routes/commessa-dettagli.js');
const schedeTecnicheRoutes = require('./routes/schedeTecniche');
const schedeMultiRoutes = require('./routes/schedeMulti');
const uploadRoute = require('./routes/upload');
const notifichePreferenzeRoute = require('./routes/notifichePreferenze');
const notificheDestinatariRoute = require('./routes/notificheDestinatari');
const clientiSpecificheRoutes = require('./routes/clientiSpecifiche');
const app = express();
const cookieParser = require('cookie-parser');
app.use(cookieParser());
const tagsRoutes = require('./routes/tags');
const uploadRoute = require('./routes/upload');

// Middleware di sicurezza e configurazione
app.use(helmet()); // Aggiunge intestazioni di sicurezza

const corsOptions = {
  origin: ['http://localhost:3000', 'https://commesseun.netlify.app', 'https://www.unitech-app.it'], // Permetti sia localhost che Netlify
  credentials: true, // Necessario per i cookie HTTP-only
};

app.use(cors(corsOptions));
app.use(bodyParser.json()); // Gestisce le richieste JSON
app.use(bodyParser.urlencoded({ extended: true })); // Gestisce i dati URL-encoded

// Rotte API
app.use('/api/commesse', commesseRoutes);
app.use('/api/risorse', risorseRoutes);
app.use('/api/attivita', attivitaRoutes);
app.use('/api/attivita_commessa', attivitaCommessaRoutes);
app.use('/api/reparti', repartiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stati-avanzamento', statiAvanzamentoRoutes);
app.use('/api/commessa-stati', commessaStatiRoutes);
app.use('/api/notifiche', notificheRoutes);
app.use('/api/stato-commessa', statoCommessaRoutes);
app.use('/api/sale-riunioni', PrenotazioneSaleRoutes);
app.use('/api/commessa-dettagli', CommessaDettagliRoutes);
app.use('/api/schedeTecniche', schedeTecnicheRoutes);
app.use('/api/schede-multi', schedeMultiRoutes);
app.use('/api/notifichePreferenze', notifichePreferenzeRoute);
app.use('/api/notificheDestinatari', notificheDestinatariRoute);
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/upload', uploadRoute);

app.use('/api/tags', tagsRoutes);

app.use('/api/clienti-specifiche', clientiSpecificheRoutes);

// Middleware di gestione degli errori
app.use((err, req, res, next) => {
  console.error('Errore globale:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Errore interno del server',
  });
});

// Avvio del server
const PORT = process.env.PORT || 5000; // Usa variabile d'ambiente PORT, se disponibile
app.listen(PORT, () => {});
