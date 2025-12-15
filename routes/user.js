const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const db = require("../config/db");
const router = express.Router();



const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; 

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.error("Formato del token non valido o assente.");
    return res.status(401).send("Accesso negato. Nessun token fornito o formato non valido.");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Non serve più verificare `role_id` se è stato aggiunto correttamente nel token
    if (!decoded.id) {
      console.error("Token decodificato privo dell'ID:", decoded);
      return res.status(403).send("Token non valido.");
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      console.error("Token scaduto:", token);
      return res.status(401).send("Token scaduto. Effettua nuovamente il login.");
    }

    console.error("Errore durante la verifica del token JWT:", err.message);
    res.status(403).send("Token non valido.");
  }
};



// Middleware per ottenere l'id utente dal token JWT
const getUserIdFromToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send("Accesso negato. Nessun token fornito.");
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id; // Salva l'id utente decodificato nella richiesta
    next();
  } catch (err) {
    res.status(403).send("Token non valido.");
  }
};


// Rotta di registrazione
router.post("/register", async (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password || !email) {
    return res.status(400).send("Tutti i campi sono obbligatori.");
  }

  try {
    // Controlla che username ed email siano unici
    const [existingUsers] = await db.query(
      "SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)",
      [username, email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).send("Username o email già in uso.");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      "INSERT INTO users (username, password, email, role_id) VALUES (?, ?, ?, ?)",
      [username, hashedPassword, email, 3] // Imposta di default il ruolo a "User"
    );

    res.status(201).send("Registrazione completata.");
  } catch (error) {
    console.error("Errore durante la registrazione:", error);
    res.status(500).send("Errore durante la registrazione.");
  }
});


router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  console.log("Dati ricevuti nel login:", req.body);  // Logga i dati ricevuti

  if (!username || !password) {
    return res.status(400).send("Tutti i campi sono obbligatori.");
  }

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [username]);
    console.log("Risultato query utente:", rows);  // Logga il risultato della query

    if (rows.length === 0) {
      return res.status(401).send("Credenziali non valide.");
    }

    const user = rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password);
    console.log("Confronto password:", passwordMatch);  // Logga il confronto delle password

    if (!passwordMatch) {
      return res.status(401).send("Credenziali non valide.");
    }

    const token = jwt.sign({ id: user.id, role_id: user.role_id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    const refreshToken = jwt.sign({ id: user.id }, process.env.REFRESH_TOKEN_SECRET, {
      expiresIn: "7d",
    });

    await db.query("UPDATE users SET refresh_token = ? WHERE id = ?", [refreshToken, user.id]);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,  // In produzione con HTTPS
      sameSite: "None", // Necessario se il client e il server sono su domini differenti (es. subdomain)
     // domain: "commesseun.netlify.app", // Sostituisci con il dominio effettivo della tua applicazione
      path: "/",     // Assicurati che sia "/" per rendere il cookie disponibile a tutto il dominio
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    console.log("Login riuscito, token generato.");
    res.json({ token, role_id: user.role_id });
  } catch (error) {
    console.error("Errore nel login:", error);
    res.status(500).send("Errore nel login.");
  }
});




router.post("/refresh-token", async (req, res) => {
  const refreshToken = req.cookies.refreshToken; // Ottieni il token dal cookie
  if (!refreshToken) {
    return res.status(400).send("Token di refresh mancante.");
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    const [rows] = await db.query("SELECT * FROM users WHERE id = ? AND refresh_token = ?", [
      decoded.id,
      refreshToken,
    ]);

    if (rows.length === 0) {
      return res.status(401).send("Token di refresh non valido.");
    }

    const newAccessToken = jwt.sign({ id: decoded.id, role_id: rows[0].role_id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error("Errore durante il refresh del token:", err);
    return res.status(403).send("Token di refresh non valido o scaduto.");
  }
});


router.post("/logout", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  console.log("Cookie refreshToken:", req.cookies.refreshToken);
  if (!refreshToken) {
    return res.status(400).send("Token di refresh mancante.");
  }

  try {
    await db.query("UPDATE users SET refresh_token = NULL WHERE refresh_token = ?", [refreshToken]);
    res.clearCookie("refreshToken");
    res.status(200).send("Logout effettuato con successo.");
  } catch (err) {
    console.error("Errore durante il logout:", err);
    res.status(500).send("Errore durante il logout.");
  }
});


// Rotta per il recupero password (Forgot Password)
router.post("/forgot-password", async (req, res) => {
  // Estrae l'email dal body della richiesta
  const { email } = req.body;

  // Se l'email non è fornita, restituisce un errore 400
  if (!email) {
    return res.status(400).send("Email obbligatoria.");
  }
  console.log("EMAIL:", process.env.EMAIL_USER);
  console.log("PASS:", process.env.EMAIL_PASS);
  
  try {
    // Cerca l'utente in base all'email
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);

    // Se l'utente non viene trovato, restituisce un errore 404
    if (rows.length === 0) {
      return res.status(404).send("Email non trovata.");
    }

    // Genera un token casuale e calcola la scadenza (1 ora)
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 ora in millisecondi

    // Aggiorna l'utente impostando il token e la scadenza
    await db.query(
      "UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE email = ?",
      [resetToken, resetTokenExpires, email]
    );

    // Configura il trasportatore di nodemailer per inviare l'email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // Email da utilizzare (variabile d'ambiente)
        pass: process.env.EMAIL_PASS, // Password o password per app
      },
    });

    // Costruisce il link per il reset password (modifica l'URL secondo le tue esigenze)
    const resetLink = `https://commesseun.netlify.app/reset-password?token=${resetToken}`;

    // Invia l'email con il link per il reset
    await transporter.sendMail({
      to: email,
      subject: "Recupero Password",
      html: `<p>Clicca sul link per reimpostare la tua password:</p><a href="${resetLink}">${resetLink}</a>`,
    });

    res.status(200).send("Email di recupero inviata.");
  } catch (error) {
    console.error("Errore durante il recupero password:", error);
    res.status(500).send("Errore durante il recupero password.");
  }
});

// Rotta per reimpostare la password (Reset Password)
router.post("/reset-password", async (req, res) => {
  // Estrae il token e la nuova password dal body della richiesta
  const { token, newPassword } = req.body;

  // Se uno dei campi non è fornito, restituisce un errore 400
  if (!token || !newPassword) {
    return res.status(400).send("Tutti i campi sono obbligatori.");
  }

  try {
    // Verifica che esista un utente con il token fornito e che il token non sia scaduto
    const [rows] = await db.query(
      "SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > NOW()",
      [token]
    );

    // Se non viene trovato nessun utente, restituisce un errore 400
    if (rows.length === 0) {
      return res.status(400).send("Token non valido o scaduto.");
    }

    const user = rows[0];
    // Hash della nuova password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Aggiorna l'utente con la nuova password e resetta il token
    await db.query(
      "UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?",
      [hashedPassword, user.id]
    );

    res.status(200).send("Password aggiornata con successo.");
  } catch (error) {
    console.error("Errore durante il reset della password:", error);
    res.status(500).send("Errore durante il reset della password.");
  }
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Elimina tutte le notifiche associate all'utente
    await db.query("DELETE FROM notifications WHERE user_id = ?", [id]);

    // Elimina l'utente
    const [result] = await db.query("DELETE FROM users WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).send("Utente non trovato.");
    }

    res.send("Utente e relative notifiche eliminati con successo!");
  } catch (error) {
    console.error("Errore durante l'eliminazione dell'utente:", error);
    res.status(500).send("Errore durante l'eliminazione dell'utente.");
  }
});

// Rotta per ottenere utenti con nome della risorsa
router.get("/", async (req, res) => {
  const sql = `
    SELECT 
      users.id, 
      users.username, 
      users.email, 
      users.role_id, 
      users.risorsa_id, 
      roles.role_name,
      risorse.nome AS nome_risorsa
    FROM users
    LEFT JOIN roles ON users.role_id = roles.id
    LEFT JOIN risorse ON users.risorsa_id = risorse.id
  `;
  try {
    const [results] = await db.query(sql);
    res.json(results);
  } catch (err) {
    console.error("Errore nel recupero degli utenti:", err);
    res.status(500).send("Errore durante il recupero degli utenti.");
  }
});


router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { username, email, role_id, risorsa_id } = req.body;

  console.log("ID ricevuto:", id);
  console.log("Body ricevuto:", req.body);

  if (!username || !email) {
    return res.status(400).send("Username ed email sono obbligatori.");
  }

  try {
    const [currentUser] = await db.query("SELECT risorsa_id FROM users WHERE id = ?", [id]);
    if (currentUser.length === 0) {
      console.log("Utente non trovato nel database.");
      return res.status(404).send("Utente non trovato.");
    }

    const currentRisorsaId = risorsa_id !== undefined ? risorsa_id : currentUser[0].risorsa_id;
    console.log("Risorsa attuale:", currentRisorsaId);

    const sql = `
      UPDATE users 
      SET username = ?, email = ?, role_id = ?, risorsa_id = ? 
      WHERE id = ?
    `;

    const [result] = await db.query(sql, [username, email, role_id, currentRisorsaId, id]);
    console.log("Risultato aggiornamento:", result);

    if (result.affectedRows === 0) {
      return res.status(404).send("Utente non trovato.");
    }

    res.status(200).send("Utente aggiornato con successo.");
  } catch (error) {
    console.error("Errore durante l'aggiornamento dell'utente:", error);
    res.status(500).send("Errore durante l'aggiornamento dell'utente.");
  }
});

router.get("/dashboard", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  const sql = `
    SELECT 
      a.*,
      c.numero_commessa,
      c.cliente,
      att.nome_attivita,
      EXISTS (
        SELECT 1
        FROM ClientiSpecifiche cs
        WHERE TRIM(cs.cliente) = TRIM(c.cliente)
          AND cs.attivo = 1
          AND (cs.reparto_id IS NULL OR cs.reparto_id = a.reparto_id)
      ) AS client_has_specs
    FROM attivita_commessa a
    JOIN commesse c ON a.commessa_id = c.id
    JOIN attivita att ON a.attivita_id = att.id
    WHERE a.risorsa_id = (SELECT risorsa_id FROM users WHERE id = ?);
  `;

  try {
    const [rows] = await db.query(sql, [userId]);

    const results = rows.map(a => ({
      ...a,
      includedWeekends: Array.isArray(a.included_weekends)
        ? a.included_weekends
        : (a.included_weekends
            ? JSON.parse(a.included_weekends)
            : []),
      client_has_specs: !!a.client_has_specs,   // 👈 unica aggiunta nel map
    }));

    res.json(results);

  } catch (err) {
    console.error("Errore nel recupero delle attività:", err);
    res.status(500).send("Errore nel recupero delle attività.");
  }
});


router.put("/:id/assign-resource", async (req, res) => {
  const { id } = req.params;
  const { risorsa_id } = req.body;

  if (!risorsa_id) {
    return res.status(400).send("ID risorsa obbligatorio.");
  }

  try {
    const sql = `UPDATE users SET risorsa_id = ? WHERE id = ?`;
    const [result] = await db.query(sql, [risorsa_id, id]);

    if (result.affectedRows === 0) {
      return res.status(404).send("Utente non trovato.");
    }

    res.status(200).send("Risorsa assegnata con successo all'utente.");
  } catch (err) {
    console.error("Errore durante l'assegnazione della risorsa:", err);
    res.status(500).send("Errore durante l'assegnazione della risorsa.");
  }
});


// Endpoint per salvare il token dispositivo
router.post("/device-token", getUserIdFromToken, async (req, res) => {
  const userId = req.userId;
  const { token } = req.body;

  if (!token) {
    return res.status(400).send("Token dispositivo mancante.");
  }

  try {
    // Verifica se il token è già presente
    const [existingToken] = await db.query(
      "SELECT device_token FROM users WHERE id = ?",
      [userId]
    );

    if (existingToken.length > 0 && existingToken[0].device_token === token) {
      return res.status(200).send("Il token dispositivo è già registrato.");
    }

    // Aggiorna il token solo se è diverso
    await db.query(
      "UPDATE users SET device_token = ? WHERE id = ?",
      [token, userId]
    );

    res.status(200).send("Token dispositivo salvato con successo.");
  } catch (err) {
    console.error("Errore durante il salvataggio del token dispositivo:", err);
    res.status(500).send("Errore durante il salvataggio del token.");
  }
});

router.get("/roles", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT id, role_name FROM roles ORDER BY role_name ASC");
    res.json(rows);
  } catch (error) {
    console.error("Errore nel recupero dei ruoli:", error);
    res.status(500).send("Errore nel recupero dei ruoli");
  }
});


module.exports = router;
