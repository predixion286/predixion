export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  
  try {
    const [scorers, matches] = await Promise.all([
      fetch("https://api.football-data.org/v4/competitions/WC/scorers?season=2026", {
        headers: { "X-Auth-Token": "368a2224700a4ef9abca96eb9b8c4d9d" }
      }).then(r => r.json()),
      fetch("https://api.football-data.org/v4/competitions/WC/matches?season=2026&status=FINISHED", {
        headers: { "X-Auth-Token": "368a2224700a4ef9abca96eb9b8c4d9d" }
      }).then(r => r.json()),
    ]);

    // Build player stats map: name → { goals, cards }
    const stats = {};
    
    // Goals from scorers endpoint
    (scorers.scorers || []).forEach(s => {
      if (s.player?.name) {
        stats[s.player.name] = {
          goals: s.numberOfGoals || 0,
          cards: 0,
        };
      }
    });

    // Cards from match bookings
    for (const match of (matches.matches || [])) {
      try {
        const detail = await fetch(
          `https://api.football-data.org/v4/matches/${match.id}`,
          { headers: { "X-Auth-Token": "368a2224700a4ef9abca96eb9b8c4d9d" } }
        ).then(r => r.json());
        
        (detail.bookings || []).forEach(b => {
          if (b.player?.name) {
            if (!stats[b.player.name]) stats[b.player.name] = { goals: 0, cards: 0 };
            stats[b.player.name].cards += b.card === "RED_CARD" ? 2 : 1;
          }
        });
      } catch {}
    }

    res.status(200).json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
