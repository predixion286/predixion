// ============================================================
// PrediXIon — Round Email Notification Function
// Deployed as a Vercel Serverless Function
// Triggered by Vercel Cron (see vercel.json)
// ============================================================

const RESEND_KEY = "re_fDhZnz58_Bqre4GyFun97gkffF3DVMxzK";
const SUPABASE_URL = "https://etjullbcuyvefiqknhxk.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Set in Vercel env vars
const FD_KEY = "368a2224700a4ef9abca96eb9b8c4d9d";
const FROM_EMAIL = "PrediXIon <noreply@predi-xi-on.com>";
const THRESHOLD = 11;

// ── PLAYERS (same list as frontend) ──
const PLAYERS = [
  {id:1,name:"Kylian Mbappé",nation:"France",pos:"ST",goals:0,cards:0,flag:"🇫🇷"},
  {id:2,name:"Erling Haaland",nation:"Norway",pos:"ST",goals:0,cards:0,flag:"🇳🇴"},
  {id:3,name:"Vinicius Jr",nation:"Brazil",pos:"LW",goals:0,cards:0,flag:"🇧🇷"},
  {id:4,name:"Jude Bellingham",nation:"England",pos:"CAM",goals:0,cards:0,flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿"},
  {id:5,name:"Pedri",nation:"Spain",pos:"CM",goals:0,cards:0,flag:"🇪🇸"},
  {id:6,name:"Lautaro Martínez",nation:"Argentina",pos:"ST",goals:0,cards:0,flag:"🇦🇷"},
  {id:7,name:"Bukayo Saka",nation:"England",pos:"RW",goals:0,cards:0,flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿"},
  {id:8,name:"Rodri",nation:"Spain",pos:"CDM",goals:0,cards:0,flag:"🇪🇸"},
  {id:9,name:"Phil Foden",nation:"England",pos:"CAM",goals:0,cards:0,flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿"},
  {id:10,name:"Federico Valverde",nation:"Uruguay",pos:"CM",goals:0,cards:0,flag:"🇺🇾"},
  {id:11,name:"Raphinha",nation:"Brazil",pos:"RW",goals:0,cards:0,flag:"🇧🇷"},
  {id:12,name:"Antoine Griezmann",nation:"France",pos:"CF",goals:0,cards:0,flag:"🇫🇷"},
  {id:13,name:"Álvaro Morata",nation:"Spain",pos:"ST",goals:0,cards:0,flag:"🇪🇸"},
  {id:14,name:"Nicolás González",nation:"Argentina",pos:"LW",goals:0,cards:0,flag:"🇦🇷"},
  {id:15,name:"Jamal Musiala",nation:"Germany",pos:"CAM",goals:0,cards:0,flag:"🇩🇪"},
  {id:16,name:"Florian Wirtz",nation:"Germany",pos:"CAM",goals:0,cards:0,flag:"🇩🇪"},
  {id:17,name:"Christian Pulisic",nation:"USA",pos:"CAM",goals:0,cards:0,flag:"🇺🇸"},
  {id:18,name:"Hirving Lozano",nation:"Mexico",pos:"RW",goals:0,cards:0,flag:"🇲🇽"},
  {id:19,name:"Achraf Hakimi",nation:"Morocco",pos:"RB",goals:0,cards:0,flag:"🇲🇦"},
  {id:20,name:"Sadio Mané",nation:"Senegal",pos:"LW",goals:0,cards:0,flag:"🇸🇳"},
  {id:21,name:"Son Heung-min",nation:"South Korea",pos:"LW",goals:0,cards:0,flag:"🇰🇷"},
  {id:22,name:"Kaoru Mitoma",nation:"Japan",pos:"LW",goals:0,cards:0,flag:"🇯🇵"},
  {id:23,name:"Cody Gakpo",nation:"Netherlands",pos:"LW",goals:0,cards:0,flag:"🇳🇱"},
  {id:24,name:"Memphis Depay",nation:"Netherlands",pos:"ST",goals:0,cards:0,flag:"🇳🇱"},
  {id:25,name:"Richarlison",nation:"Brazil",pos:"ST",goals:0,cards:0,flag:"🇧🇷"},
  {id:26,name:"Gabriel Martinelli",nation:"Brazil",pos:"LW",goals:0,cards:0,flag:"🇧🇷"},
  {id:27,name:"Nico Williams",nation:"Spain",pos:"LW",goals:0,cards:0,flag:"🇪🇸"},
  {id:28,name:"Dani Carvajal",nation:"Spain",pos:"RB",goals:0,cards:0,flag:"🇪🇸"},
  {id:29,name:"Virgil van Dijk",nation:"Netherlands",pos:"CB",goals:0,cards:0,flag:"🇳🇱"},
  {id:30,name:"Marquinhos",nation:"Brazil",pos:"CB",goals:0,cards:0,flag:"🇧🇷"},
  {id:31,name:"Ruben Dias",nation:"Portugal",pos:"CB",goals:0,cards:0,flag:"🇵🇹"},
  {id:32,name:"João Cancelo",nation:"Portugal",pos:"RB",goals:0,cards:0,flag:"🇵🇹"},
  {id:33,name:"Bruno Fernandes",nation:"Portugal",pos:"CAM",goals:0,cards:0,flag:"🇵🇹"},
  {id:34,name:"Rafael Leão",nation:"Portugal",pos:"LW",goals:0,cards:0,flag:"🇵🇹"},
  {id:35,name:"Gonçalo Ramos",nation:"Portugal",pos:"ST",goals:0,cards:0,flag:"🇵🇹"},
  {id:36,name:"Leon Goretzka",nation:"Germany",pos:"CM",goals:0,cards:0,flag:"🇩🇪"},
  {id:37,name:"Leroy Sané",nation:"Germany",pos:"RW",goals:0,cards:0,flag:"🇩🇪"},
  {id:38,name:"Kai Havertz",nation:"Germany",pos:"ST",goals:0,cards:0,flag:"🇩🇪"},
  {id:39,name:"Alexis Mac Allister",nation:"Argentina",pos:"CM",goals:0,cards:0,flag:"🇦🇷"},
  {id:40,name:"Enzo Fernández",nation:"Argentina",pos:"CM",goals:0,cards:0,flag:"🇦🇷"},
  {id:41,name:"Casemiro",nation:"Brazil",pos:"CDM",goals:0,cards:0,flag:"🇧🇷"},
  {id:42,name:"Toni Kroos",nation:"Germany",pos:"CM",goals:0,cards:0,flag:"🇩🇪"},
  {id:43,name:"Lamine Yamal",nation:"Spain",pos:"RW",goals:0,cards:0,flag:"🇪🇸"},
  {id:44,name:"Ousmane Dembélé",nation:"France",pos:"RW",goals:0,cards:0,flag:"🇫🇷"},
  {id:45,name:"Marcus Rashford",nation:"England",pos:"LW",goals:0,cards:0,flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿"},
];

// ── SCORING ──
const calcScore = (total) => {
  if (total >= THRESHOLD) return { score: 0, bust: true };
  return { score: parseFloat((10 - (THRESHOLD - total) * 0.5).toFixed(1)), bust: false };
};

// ── SUPABASE ──
const supabase = {
  headers: {
    "Content-Type": "application/json",
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
  },
  async select(table, query = "") {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, { headers: supabase.headers });
    if (!r.ok) throw new Error(`Supabase error: ${await r.text()}`);
    return r.json();
  },
  async update(table, data, query) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
      method: "PATCH",
      headers: { ...supabase.headers, "Prefer": "return=representation" },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`Supabase update error: ${await r.text()}`);
    return r.json();
  },
};

// ── FOOTBALL API ──
const getScorers = async () => {
  try {
    const r = await fetch(`https://api.football-data.org/v4/competitions/WC/scorers?season=2026`, {
      headers: { "X-Auth-Token": FD_KEY },
    });
    const data = await r.json();
    const map = {};
    (data.scorers || []).forEach(s => {
      if (s.player?.name) map[s.player.name] = { goals: s.numberOfGoals || 0, cards: 0 };
    });
    return map;
  } catch { return {}; }
};

const getCompletedRound = async () => {
  try {
    const r = await fetch(`https://api.football-data.org/v4/competitions/WC/matches?season=2026`, {
      headers: { "X-Auth-Token": FD_KEY },
    });
    const data = await r.json();
    const matches = data.matches || [];

    // Group matches by matchday
    const byMatchday = {};
    matches.forEach(m => {
      const md = m.matchday || m.stage;
      if (!byMatchday[md]) byMatchday[md] = [];
      byMatchday[md].push(m);
    });

    // Find the most recently completed full matchday
    for (const [md, mdMatches] of Object.entries(byMatchday).reverse()) {
      const allFinished = mdMatches.every(m => m.status === "FINISHED");
      const anyFinished = mdMatches.some(m => m.status === "FINISHED");
      if (allFinished && anyFinished) {
        return { matchday: md, matches: mdMatches };
      }
    }
    return null;
  } catch { return null; }
};

// ── EMAIL TEMPLATE ──
const buildEmailHTML = ({ username, roundName, goalsEntry, cardsEntry, playerStats, groupRank, globalRank }) => {
  const renderXI = (entry, type) => {
    if (!entry) return `<p style="color:#7a9a7a;font-size:14px;">No ${type} XI submitted.</p>`;
    const players = PLAYERS.filter(p => (entry.xi || []).includes(p.id));
    const total = players.reduce((s, p) => {
      const live = playerStats[p.name];
      return s + (type === "goals" ? (live?.goals ?? p.goals) : (live?.cards ?? p.cards));
    }, 0);
    const { score, bust } = calcScore(total);

    const rows = players.map(p => {
      const live = playerStats[p.name];
      const stat = type === "goals" ? (live?.goals ?? p.goals) : (live?.cards ?? p.cards);
      return `
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#e8f5e9;">${p.flag} ${p.name}</td>
          <td style="padding:8px 12px;font-size:13px;color:#7a9a7a;text-align:center;">${p.nation}</td>
          <td style="padding:8px 12px;font-size:14px;font-weight:700;text-align:center;color:${stat > 0 ? "#ffd700" : "#3a5a3a"};">${stat}</td>
        </tr>
      `;
    }).join("");

    const pct = Math.min((total / THRESHOLD) * 100, 100);
    const barColor = pct >= 100 ? "#ff3d3d" : pct >= 80 ? "#ffcc00" : "#00c853";
    const statusColor = bust ? "#ff3d3d" : score >= 9 ? "#ffd700" : "#00c853";
    const statusText = bust ? "💥 BUST" : `${score} pts`;

    return `
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:12px;color:#7a9a7a;">${total} / ${THRESHOLD}</span>
          <span style="font-size:12px;color:#7a9a7a;">${THRESHOLD - total > 0 ? `${THRESHOLD - total} remaining` : "BUST"}</span>
        </div>
        <div style="height:6px;background:#122612;border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${barColor};border-radius:3px;"></div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
        <thead>
          <tr style="border-bottom:1px solid #1a3a1a;">
            <th style="padding:6px 12px;font-size:10px;color:#3a5a3a;text-align:left;letter-spacing:1px;">PLAYER</th>
            <th style="padding:6px 12px;font-size:10px;color:#3a5a3a;text-align:center;letter-spacing:1px;">NATION</th>
            <th style="padding:6px 12px;font-size:10px;color:#3a5a3a;text-align:center;letter-spacing:1px;">${type === "goals" ? "GOALS" : "CARDS"}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="text-align:right;">
        <span style="font-family:monospace;font-size:28px;font-weight:900;color:${statusColor};">${statusText}</span>
      </div>
    `;
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>PrediXIon — ${roundName} Update</title>
</head>
<body style="margin:0;padding:0;background:#050e05;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050e05;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr>
          <td style="background:#0c210c;border:1px solid #1a3a1a;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
            <div style="font-size:36px;font-weight:900;letter-spacing:4px;margin-bottom:4px;">
              <span style="color:#00c853;">PREDI</span><span style="color:#ffd700;">XI</span><span style="color:#00c853;">ON</span>
            </div>
            <div style="font-size:11px;letter-spacing:3px;color:#3a5a3a;text-transform:uppercase;">FIFA World Cup 2026</div>
          </td>
        </tr>

        <!-- ROUND BANNER -->
        <tr>
          <td style="background:linear-gradient(135deg,#00c853,#007a33);padding:16px 32px;text-align:center;">
            <div style="font-size:11px;letter-spacing:3px;color:rgba(255,255,255,0.7);text-transform:uppercase;margin-bottom:4px;">Round Complete</div>
            <div style="font-size:24px;font-weight:900;color:#fff;letter-spacing:1px;">${roundName}</div>
          </td>
        </tr>

        <!-- GREETING -->
        <tr>
          <td style="background:#0c210c;border-left:1px solid #1a3a1a;border-right:1px solid #1a3a1a;padding:24px 32px;">
            <p style="font-size:16px;color:#e8f5e9;margin:0 0 8px;">Hey <strong>${username}</strong> 👋</p>
            <p style="font-size:14px;color:#7a9a7a;margin:0;line-height:1.6;">
              ${roundName} is complete. Here's how your PrediXIon entries are looking — 
              remember, stay under <strong style="color:#ffd700;">11</strong> to score points.
            </p>
          </td>
        </tr>

        <!-- STANDINGS -->
        <tr>
          <td style="background:#0c210c;border-left:1px solid #1a3a1a;border-right:1px solid #1a3a1a;padding:0 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:50%;padding:8px;text-align:center;background:#122612;border:1px solid #1a3a1a;border-radius:8px;">
                  <div style="font-size:10px;letter-spacing:2px;color:#3a5a3a;text-transform:uppercase;margin-bottom:4px;">Group Rank</div>
                  <div style="font-size:32px;font-weight:900;color:#ffd700;">${groupRank ? `#${groupRank}` : "—"}</div>
                </td>
                <td style="width:8px;"></td>
                <td style="width:50%;padding:8px;text-align:center;background:#122612;border:1px solid #1a3a1a;border-radius:8px;">
                  <div style="font-size:10px;letter-spacing:2px;color:#3a5a3a;text-transform:uppercase;margin-bottom:4px;">Global Rank</div>
                  <div style="font-size:32px;font-weight:900;color:#00c853;">${globalRank ? `#${globalRank}` : "—"}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- GOALS XI -->
        <tr>
          <td style="background:#0c210c;border-left:1px solid #1a3a1a;border-right:1px solid #1a3a1a;padding:0 32px 8px;">
            <div style="border-top:1px solid #1a3a1a;padding-top:20px;margin-bottom:16px;">
              <div style="font-size:11px;letter-spacing:2px;color:#3a5a3a;text-transform:uppercase;margin-bottom:4px;">Competition 1</div>
              <div style="font-size:20px;font-weight:900;color:#e8f5e9;">⚽ Goals XI</div>
            </div>
            ${renderXI(goalsEntry, "goals")}
          </td>
        </tr>

        <!-- CARDS XI -->
        <tr>
          <td style="background:#0c210c;border-left:1px solid #1a3a1a;border-right:1px solid #1a3a1a;padding:20px 32px 24px;">
            <div style="border-top:1px solid #1a3a1a;padding-top:20px;margin-bottom:16px;">
              <div style="font-size:11px;letter-spacing:2px;color:#3a5a3a;text-transform:uppercase;margin-bottom:4px;">Competition 2</div>
              <div style="font-size:20px;font-weight:900;color:#e8f5e9;">🟨 Cards XI</div>
            </div>
            ${renderXI(cardsEntry, "cards")}
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="background:#122612;border:1px solid #1a3a1a;border-top:none;padding:24px 32px;text-align:center;">
            <a href="https://www.predi-xi-on.com" style="display:inline-block;background:linear-gradient(135deg,#00c853,#00a844);color:#050e05;font-weight:900;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;padding:12px 28px;border-radius:6px;text-decoration:none;">
              View Full Leaderboard →
            </a>
          </td>
        </tr>

        <!-- TIP JAR -->
        <tr>
          <td style="background:#0c210c;border:1px solid #1a3a1a;border-top:none;padding:16px 32px;text-align:center;">
            <div style="font-size:10px;letter-spacing:2px;color:#3a5a3a;text-transform:uppercase;margin-bottom:8px;">☕ Enjoying PrediXIon? Tip the creator</div>
            <div style="font-size:13px;color:#7a9a7a;">
              🅿️ PayPal <strong style="color:#ffd700;">@predixion</strong> &nbsp;·&nbsp; 
              💸 Venmo <strong style="color:#ffd700;">@predixion</strong>
            </div>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#050e05;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
            <div style="font-size:11px;color:#3a5a3a;line-height:1.6;">
              © 2026 PrediXIon · Not affiliated with FIFA<br>
              <a href="https://www.predi-xi-on.com" style="color:#3a5a3a;">predi-xi-on.com</a>
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
  `;
};

// ── SEND EMAIL VIA RESEND ──
const sendEmail = async ({ to, subject, html }) => {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_KEY}`,
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  return r.json();
};

// ── COMPUTE RANKINGS ──
const computeRankings = (entries, userId, type) => {
  const typed = entries.filter(e => e.type === type);
  const scored = typed.map(e => {
    const players = PLAYERS.filter(p => (e.xi || []).includes(p.id));
    const total = players.reduce((s, p) => s + (type === "goals" ? p.goals : p.cards), 0);
    return { userId: e.user_id, groupId: e.group_id, ...calcScore(total) };
  }).sort((a, b) => b.score - a.score);

  const globalRank = scored.findIndex(e => e.userId === userId) + 1;
  const groupEntries = scored.filter(e => {
    const myEntry = typed.find(e => e.user_id === userId);
    return myEntry && e.groupId === myEntry.group_id;
  });
  const groupRank = groupEntries.findIndex(e => e.userId === userId) + 1;

  return { globalRank: globalRank || null, groupRank: groupRank || null };
};

// ── MAIN HANDLER ──
export default async function handler(req, res) {
  // Security: only allow Vercel Cron or a secret header
  const authHeader = req.headers["authorization"];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("🔍 Checking for completed rounds...");

    // 1. Check which rounds haven't been emailed yet
    const pendingRounds = await supabase.select("email_rounds", "?is_sent=eq.false");
    if (!pendingRounds?.length) {
      return res.status(200).json({ message: "No pending rounds" });
    }

    // 2. Check football API for completed round
    const completedRound = await getCompletedRound();
    if (!completedRound) {
      return res.status(200).json({ message: "No newly completed round found" });
    }

    // 3. Match completed round to our email_rounds table
    const roundToSend = pendingRounds.find(r =>
      r.round_name.toLowerCase().includes(completedRound.matchday?.toString().toLowerCase()) ||
      completedRound.matchday?.toString().includes(r.round_name)
    ) || pendingRounds[0]; // fallback to first unsent

    // 4. Get live player stats
    const playerStats = await getScorers();

    // 5. Get all users and their entries
    const [users, entries] = await Promise.all([
      supabase.select("users", "?select=id,username,email"),
      supabase.select("entries", "?select=*"),
    ]);

    console.log(`📧 Sending ${roundToSend.round_name} emails to ${users.length} users...`);

    // 6. Send email to each user
    let sent = 0;
    let failed = 0;

    for (const user of users) {
      try {
        const goalsEntry = entries.find(e => e.user_id === user.id && e.type === "goals");
        const cardsEntry = entries.find(e => e.user_id === user.id && e.type === "cards");

        if (!goalsEntry && !cardsEntry) continue; // Skip users with no entries

        const { globalRank, groupRank } = computeRankings(entries, user.id, "goals");

        const html = buildEmailHTML({
          username: user.username,
          roundName: roundToSend.round_name,
          goalsEntry,
          cardsEntry,
          playerStats,
          groupRank,
          globalRank,
        });

        await sendEmail({
          to: user.email,
          subject: `PrediXIon ⚽ ${roundToSend.round_name} Update`,
          html,
        });

        sent++;

        // Rate limit: 2 emails per second (Resend free tier)
        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        console.error(`Failed to send to ${user.email}:`, err);
        failed++;
      }
    }

    // 7. Mark round as sent
    await supabase.update(
      "email_rounds",
      { is_sent: true, sent_at: new Date().toISOString() },
      `?id=eq.${roundToSend.id}`
    );

    console.log(`✅ Done. Sent: ${sent}, Failed: ${failed}`);
    return res.status(200).json({
      success: true,
      round: roundToSend.round_name,
      sent,
      failed,
    });

  } catch (err) {
    console.error("Round email error:", err);
    return res.status(500).json({ error: err.message });
  }
}
