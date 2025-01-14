// Rotta per aggiornare lo stato dell'attività
router.put("/update-status/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { stato } = req.body;
    const userId = req.user.id;
  
    if (stato === undefined || ![0, 1, 2].includes(stato)) {
      return res.status(400).send("Stato non valido.");
    }
  
    try {
      // Aggiorna lo stato dell'attività
      await db.query("UPDATE attivita_commessa SET stato = ? WHERE id = ?", [
        stato,
        id,
      ]);
  
      // Inserisci un log per l'aggiornamento dello stato
      await db.query(
        "INSERT INTO activity_status_log (attivita_commessa_id, stato, updated_by) VALUES (?, ?, ?)",
        [id, stato, userId]
      );
  
      res.status(200).send("Stato aggiornato con successo.");
    } catch (err) {
      console.error("Errore durante l'aggiornamento dello stato:", err);
      res.status(500).send("Errore durante l'aggiornamento dello stato.");
    }
  });
  