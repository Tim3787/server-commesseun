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

// 📤 Route per l'upload (es. /upload-image)
router.post("/upload-image", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file caricato" });

  const fileUrl = `/uploads/${req.file.filename}`;

  // Qui puoi anche salvare nel DB se serve

  res.json({
    success: true,
    filename: req.file.filename,
    url: fileUrl,
  });
});

router.post("/upload-image", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nessun file caricato" });

  const { scheda_id } = req.body;
  const filename = req.file.filename;
  const url = `/uploads/${filename}`;

  try {
    // Inserisci nel DB
    await db.query(
      "INSERT INTO SchedeImmagini (scheda_id, filename, url) VALUES (?, ?, ?)",
      [scheda_id, filename, url]
    );

    res.json({
      success: true,
      filename: filename,
      url: url,
    });
  } catch (err) {
    console.error("Errore salvataggio immagine nel DB:", err);
    res.status(500).json({ error: "Errore salvataggio immagine" });
  }
});

module.exports = router;
