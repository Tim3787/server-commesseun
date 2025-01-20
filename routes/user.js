const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const db = require("../config/db");
const router = express.Router();



const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer TOKEN"

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.error("Formato del token non valido o assente.");
    return res.status(401).send("Accesso negato. Nessun token fornito o formato non valido.");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Token decodificato con successo:", decoded);

    // Verifica dei campi richiesti
    if (!decoded.id || !decoded.role_id) {
      console.error("Token decodificato privo di campi obbligatori:", decoded);
      return res.status(403).send("Token non valido.");
    }

    // Aggiungi le informazioni utente alla richiesta
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

module.exports = authenticateToken;



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
    console.log("Password originale:", password);
console.log("Password hashata:", hashedPassword);
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

// Rotta di login
router.post("/login", async (req, res) => {
  console.log("Body ricevuto:", req.body);
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send("Tutti i campi sono obbligatori.");
  }

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [
      username,
    ]);

    if (rows.length === 0) {
      return res.status(401).send("Credenziali non valide.");
    }

    const user = rows[0]; // Ottieni il primo utente trovato

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).send("Credenziali non valide.");
    }

    const token = jwt.sign({ id: user.id, role_id: user.role_id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    res.json({ token, role_id: user.role_id });
  } catch (error) {
    console.error("Errore nel login:", error);
    res.status(500).send("Errore nel login.");
  }
});

// Rotta per il recupero password
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).send("Email obbligatoria.");
  }

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    if (rows.length === 0) {
      return res.status(404).send("Email non trovata.");
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpires = new Date(Date.now() + 3600000); // Valido per 1 ora

    await db.query(
      "UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE email = ?",
      [resetToken, resetTokenExpires, email]
    );

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // Variabile d'ambiente per l'email
        pass: process.env.EMAIL_PASS, // Variabile d'ambiente per la password
      },
    });

    const resetLink = `http://localhost:3000/reset-password?token=${resetToken}`;
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

// Rotta per reimpostare la password
router.post("/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).send("Tutti i campi sono obbligatori.");
  }

  try {
    const [rows] = await db.query(
      "SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > NOW()",
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).send("Token non valido o scaduto.");
    }

    const user = rows[0];
    const hashedPassword = await bcrypt.hash(newPassword, 10);

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
    const [result] = await db.query("DELETE FROM users WHERE id = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).send("Utente non trovato.");
    }

    res.send("Utente eliminato con successo!");
  } catch (error) {
    console.error("Errore durante l'eliminazione dell'utente:", error);
    res.status(500).send("Errore durante l'eliminazione dell'utente.");
  }
});

// Rotta per ottenere utenti
router.get("/", async (req, res) => {
  const sql = `
    SELECT 
      users.id, 
      users.username, 
      users.email, 
      users.role_id, 
      users.risorsa_id, 
      roles.role_name
    FROM users
    LEFT JOIN roles ON users.role_id = roles.id
  `;
  try {
    const [results] = await db.query(sql);
    res.json(results);
  } catch (err) {
    console.error("Errore nel recupero degli utenti:", err);
    res.status(500).send("Errore durante il recupero degli utenti.");
  }
});
router.get("/roles", async (req, res) => {
  try {
    const [results] = await db.query("SELECT * FROM roles");
    res.json(results);
  } catch (error) {
    console.error("Errore durante il recupero dei ruoli:", error);
    res.status(500).send("Errore durante il recupero dei ruoli.");
  }
});

router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { username, email, role_id, risorsa_id } = req.body;

  if (!username || !email) {
    return res.status(400).send("Username ed email sono obbligatori.");
  }

  try {
    // Recupera l'utente attuale per ottenere il valore di risorsa_id se non è stato inviato
    const [currentUser] = await db.query("SELECT risorsa_id FROM users WHERE id = ?", [id]);
    if (currentUser.length === 0) {
      return res.status(404).send("Utente non trovato.");
    }

    const currentRisorsaId = risorsa_id !== undefined ? risorsa_id : currentUser[0].risorsa_id;

    const sql = `
      UPDATE users 
      SET username = ?, email = ?, role_id = ?, risorsa_id = ? 
      WHERE id = ?
    `;

    const [result] = await db.query(sql, [username, email, role_id, currentRisorsaId, id]);

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
  const userId = req.user.id;  // ID dell'utente autenticato
  console.log("ID dell'utente autenticato:", userId);  // Verifica che l'ID sia corretto

  const sql = `
    SELECT a.*, c.numero_commessa, att.nome_attivita
    FROM attivita_commessa a
    JOIN commesse c ON a.commessa_id = c.id
    JOIN attivita att ON a.attivita_id = att.id
    WHERE a.risorsa_id = (SELECT risorsa_id FROM users WHERE id = ?);
  `;

  try {
    const [results] = await db.query(sql, [userId]); // Passa userId come parametro
    console.log("Attività recuperate:", results);  // Verifica che i risultati siano quelli giusti
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


module.exports = router;
