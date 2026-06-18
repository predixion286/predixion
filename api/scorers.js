export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  try {
    // Fetch both in parallel — fault tolerant, one failing won't break the other
    const [scorersResult, rostersResult] = await Promise.allSettled([
      fetch(
        "https://api.football-data.org/v4/competitions/WC/scorers?season=2026",
        { headers: { "X-Auth-Token": "368a2224700a4ef9abca96eb9b8c4d9d" } }
      ).then(r => r.json()),
      fetch(
        "https://api.balldontlie.io/fifa/worldcup/v1/rosters?seasons[]=2026&per_page=200",
        { headers: { "Authorization": "30302acf-095e-44e0-bee6-f5754cc26c94" } }
      ).then(r => r.json()),
    ]);

    const stats = {};

    // Goals from football-data.org
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

    // Cards from BallDontLie (yellow=1pt, red=2pts)
    if (rostersResult.status === "fulfilled") {
      (rostersResult.value.data || []).forEach(p => {
        const name = p.player?.name;
        if (!name) return;
        const yellow = p.yellow_cards || 0;
        const red = p.red_cards || 0;
        const cardPoints = yellow + (red * 2);
        if (!stats[name]) stats[name] = { goals: 0, cards: 0 };
        stats[name].cards = cardPoints;
      });
    }

    res.status(200).json({ stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
