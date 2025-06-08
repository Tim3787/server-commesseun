// routes/upload.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();

const db = require("../config/db");

// 📦 Configura la cartella dove salvare le immagini
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

const upload = multer({ storage: storage });

// 📤 Route upload con salvataggio nel DB
router.post("/upload-image", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file caricato" });

  const { scheda_id, utente_upload } = req.body;
  const nome_file = req.file.filename;
  const url = `/uploads/${nome_file}`;
  const timestamp_upload = new Date();

  try {
    const [result] = await db.execute(
      `INSERT INTO SchedeImmagini (scheda_id, url, nome_file, utente_upload, timestamp_upload)
       VALUES (?, ?, ?, ?, ?)`,
      [scheda_id, url, nome_file, utente_upload || null, timestamp_upload]
    );

    res.json({
      success: true,
      id: result.insertId,
      filename: nome_file,
      url,
    });
  } catch (err) {
    console.error("Errore inserimento nel DB:", err);
    res.status(500).json({ error: "Errore nel salvataggio nel database" });
  }
});


module.exports = router;
