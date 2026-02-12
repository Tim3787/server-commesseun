// routes/upload.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const router = express.Router();

const db = require('../config/db');

// 📦 Configura la cartella dove salvare le immagini
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// 📦 Configura cartella allegati
const allegatiStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/allegati');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'file-' + uniqueSuffix + ext);
  },
});

const uploadFile = multer({
  storage: allegatiStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

// 📎 Upload allegato
router.post('/upload-file', uploadFile.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });

  const { scheda_id, utente_upload } = req.body;
  const nome_file = req.file.filename;
  const url = `/uploads/allegati/${nome_file}`;
  const timestamp_upload = new Date();

  try {
    const [result] = await db.execute(
      `INSERT INTO SchedeAllegati (scheda_id, url, nome_file, original_name, mimetype, size, utente_upload, timestamp_upload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scheda_id,
        url,
        nome_file,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        utente_upload || null,
        timestamp_upload,
      ]
    );

    res.json({ success: true, id: result.insertId, filename: nome_file, url });
  } catch (err) {
    console.error('Errore inserimento allegato nel DB:', err);
    res.status(500).json({ error: 'Errore nel salvataggio nel database' });
  }
});

// 📎 Lista allegati per scheda
router.get('/allegati/:scheda_id', async (req, res) => {
  const { scheda_id } = req.params;

  try {
    const [rows] = await db.execute(
      `SELECT id, url, nome_file, original_name, mimetype, size, utente_upload, timestamp_upload
       FROM SchedeAllegati
       WHERE scheda_id = ?`,
      [scheda_id]
    );

    res.json({ success: true, allegati: rows });
  } catch (err) {
    console.error('Errore nel recupero allegati:', err);
    res.status(500).json({ success: false, error: 'Errore nel recupero allegati' });
  }
});

// 📤 Route upload con salvataggio nel DB
router.post('/upload-image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });

  const { scheda_id, utente_upload } = req.body;

  const originalPath = req.file.path;

  try {
    const optimizedFilename = 'opt-' + path.parse(req.file.filename).name + '.jpg';
    const optimizedPath = path.join(path.dirname(originalPath), optimizedFilename);

    await sharp(originalPath)
      .rotate()
      .resize({
        width: 1400,
        withoutEnlargement: true,
      })
      .jpeg({ quality: 70 })
      .toFile(optimizedPath);

    // elimina originale
    fs.unlinkSync(originalPath);

    const url = `/uploads/${optimizedFilename}`;
    const timestamp_upload = new Date();

    const [result] = await db.execute(
      `INSERT INTO SchedeImmagini (scheda_id, url, nome_file, utente_upload, timestamp_upload)
     VALUES (?, ?, ?, ?, ?)`,
      [scheda_id, url, optimizedFilename, utente_upload || null, timestamp_upload]
    );

    res.json({
      success: true,
      id: result.insertId,
      filename: optimizedFilename,
      url,
    });
  } catch (err) {
    console.error('Errore upload immagine:', err);

    if (fs.existsSync(originalPath)) {
      try {
        fs.unlinkSync(originalPath);
      } catch (e) {}
    }

    res.status(500).json({ error: 'Errore upload immagine' });
  }
});

// GET /api/upload/immagini/:scheda_id
router.get('/immagini/:scheda_id', async (req, res) => {
  const { scheda_id } = req.params;

  try {
    const [rows] = await db.execute(
      'SELECT id, url, nome_file, utente_upload, timestamp_upload FROM SchedeImmagini WHERE scheda_id = ?',
      [scheda_id]
    );

    res.json({ success: true, immagini: rows });
  } catch (err) {
    console.error('Errore nel recupero immagini:', err);
    res.status(500).json({ success: false, error: 'Errore nel recupero immagini' });
  }
});

module.exports = router;
