export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  try {
    const [scorersResult, cardsResult] = await Promise.allSettled([
      // Goals from football-data.org
      fetch(
        "https://api.football-data.org/v4/competitions/WC/scorers?season=2026",
        { headers: { "X-Auth-Token": "368a2224700a4ef9abca96eb9b8c4d9d" } }
      ).then(r => r.json()),
      // Cards from Supabase (manually entered via admin panel)
      fetch(
        "https://etjullbcuyvefiqknhxk.supabase.co/rest/v1/card_events?select=player_name,card_type,points",
        { headers: {
          "apikey": "sb_publishable_66mUbfYgpIWK9a6L_Svczw_WNC1BXkD",
          "Authorization": "Bearer sb_publishable_66mUbfYgpIWK9a6L_Svczw_WNC1BXkD"
        }}
      ).then(r => r.json()),
    ]);

    const stats = {};

    // Goals
    if (scorersResult.status === "fulfilled") {
      (scorersResult.value.scorers || []).forEach(s => {
        if (s.player?.name) {
          stats[s.player.name] = {
            goals: s.goals || s.numberOfGoals || 0,
            cards: 0,
          };
        }
      });
    }

    // Cards — aggregate from card_events table
    if (cardsResult.status === "fulfilled") {
      (cardsResult.value || []).forEach(c => {
        if (!c.player_name) return;
        if (!stats[c.player_name]) stats[c.player_name] = { goals: 0, cards: 0 };
        stats[c.player_name].cards += c.points || 0;
      });
    }

    res.status(200).json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
