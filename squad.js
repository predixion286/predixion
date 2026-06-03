export default async function handler(req, res) {
res.setHeader("Access-Control-Allow-Origin", "*");
res.setHeader("Access-Control-Allow-Methods", "GET");

try {
const r = await fetch(
"https://api.football-data.org/v4/competitions/WC/teams?season=2026",
{ headers: { "X-Auth-Token": "368a2224700a4ef9abca96eb9b8c4d9d" } }
);
const data = await r.json();
res.status(200).json(data);
} catch (err) {
res.status(500).json({ error: err.message });
}
}
