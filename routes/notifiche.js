const express = require("express");
const router = express.Router();
const db = require("../config/db");

router.get("/", async (req, res) => {
  try {
    const oggi = new Date();

    const [commesse] = await db.query(`
      SELECT id AS commessa_id, numero_commessa, stati_avanzamento 
      FROM commesse
    `);

    const notifiche = commesse.flatMap((commessa) => {
      const statiAvanzamento = JSON.parse(commessa.stati_avanzamento || "[]");

      return statiAvanzamento
        .filter(
          (stato) =>
            new Date(stato.data_inizio) < oggi &&
            stato.isActive !== true // Verifica anomalie se lo stato non è corrente
        )
        .map((stato) => ({
          commessa_id: commessa.commessa_id,
          numero_commessa: commessa.numero_commessa,
          stato_attuale: statiAvanzamento.find((s) => s.isActive)?.nome_stato || "Non definito",
          stato_atteso: stato.nome_stato,
          data_inizio: stato.data_inizio,
          reparto: stato.reparto_nome,
        }));
    });

    if (notifiche.length === 0) {
      return res.json({ message: "Nessuna anomalia rilevata." });
    }

    res.json({ notifiche });
  } catch (error) {
    console.error("Errore durante il recupero delle notifiche:", error);
    res.status(500).send("Errore durante il recupero delle notifiche.");
  }
});

  


module.exports = router;