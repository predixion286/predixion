import { useState, useEffect, useCallback } from "react";

// ============================================================
// FOOTBALL-DATA.ORG API
// ============================================================
const FD_KEY = "368a2224700a4ef9abca96eb9b8c4d9d";
const FD_BASE = "https://api.football-data.org/v4";

const footballAPI = {
  // Fetch top scorers for the World Cup (competition code: WC)
  async getScorers() {
    try {
      const r = await fetch(`${FD_BASE}/competitions/WC/scorers?season=2026`, {
        headers: { "X-Auth-Token": FD_KEY },
      });
      if (!r.ok) return null;
      const data = await r.json();
      // Returns array of { player: { name, id }, numberOfGoals, team }
      return data.scorers || [];
    } catch { return null; }
  },

  // Fetch all matches to extract bookings (cards)
  async getMatches() {
    try {
      const r = await fetch(`${FD_BASE}/competitions/WC/matches?season=2026&status=FINISHED`, {
        headers: { "X-Auth-Token": FD_KEY },
      });
      if (!r.ok) return null;
      const data = await r.json();
      return data.matches || [];
    } catch { return null; }
  },

  // Fetch a single match's details including bookings
  async getMatchDetails(matchId) {
    try {
      const r = await fetch(`${FD_BASE}/matches/${matchId}`, {
        headers: { "X-Auth-Token": FD_KEY },
      });
      if (!r.ok) return null;
      return r.json();
    } catch { return null; }
  },

  // Build a player stats map: { playerName: { goals, cards } }
  // This merges scorer data + booking data into one lookup
  async buildPlayerStats() {
    const cached = sessionStorage.getItem("px_player_stats");
    const cachedTime = sessionStorage.getItem("px_player_stats_time");
    // Cache for 5 minutes to respect rate limits
    if (cached && cachedTime && Date.now() - parseInt(cachedTime) < 300000) {
      return JSON.parse(cached);
    }

    const stats = {};

    // Goals from scorers endpoint
    const scorers = await footballAPI.getScorers();
    if (scorers) {
      scorers.forEach(s => {
        const name = s.player?.name;
        if (name) {
          if (!stats[name]) stats[name] = { goals: 0, cards: 0 };
          stats[name].goals = s.numberOfGoals || 0;
        }
      });
    }

    // Cache result
    sessionStorage.setItem("px_player_stats", JSON.stringify(stats));
    sessionStorage.setItem("px_player_stats_time", Date.now().toString());
    return stats;
  },

  // Get live/recent matches for the feed
  async getLiveMatches() {
    try {
      const r = await fetch(`${FD_BASE}/competitions/WC/matches?season=2026&status=IN_PLAY,FINISHED`, {
        headers: { "X-Auth-Token": FD_KEY },
      });
      if (!r.ok) return null;
      const data = await r.json();
      return (data.matches || []).slice(0, 10);
    } catch { return null; }
  },
};

// Merge live API stats into our player list
// Falls back to mock data if API not yet available (pre-tournament)
const mergeLiveStats = (players, liveStats) => {
  if (!liveStats || Object.keys(liveStats).length === 0) return players;
  return players.map(p => {
    const live = liveStats[p.name];
    if (!live) return p;
    return { ...p, goals: live.goals ?? p.goals, cards: live.cards ?? p.cards };
  });
};

// ============================================================
// SUPABASE CONFIG
// ============================================================
const SUPABASE_URL = "https://etjullbcuyvefiqknhxk.supabase.co";
const SUPABASE_KEY = "sb_publishable_66mUbfYgpIWK9a6L_Svczw_WNC1BXkD";

// Lightweight Supabase client (no npm needed in artifact)
const sb = {
  headers: {
    "Content-Type": "application/json",
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
  },

  // ── AUTH ──
  auth: {
    async signUp({ email, password, username }) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
        body: JSON.stringify({ email, password, data: { username } }),
      });
      return r.json();
    },
    async signIn({ email, password }) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY },
        body: JSON.stringify({ email, password }),
      });
      return r.json();
    },
    async signOut(token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
      });
    },
    async getUser(token) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${token}` },
      });
      return r.json();
    },
  },

  // ── DATABASE ──
  async select(table, query = "") {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
      headers: { ...sb.headers, "Prefer": "return=representation" },
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async insert(table, data, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        ...sb.headers,
        "Authorization": `Bearer ${token || SUPABASE_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async update(table, data, query, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
      method: "PATCH",
      headers: {
        ...sb.headers,
        "Authorization": `Bearer ${token || SUPABASE_KEY}`,
        "Prefer": "return=representation",
      },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async delete(table, query, token) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
      method: "DELETE",
      headers: {
        ...sb.headers,
        "Authorization": `Bearer ${token || SUPABASE_KEY}`,
      },
    });
    if (!r.ok) throw new Error(await r.text());
    return true;
  },
};

// ============================================================
// CONSTANTS
// ============================================================
const THRESHOLD = 11;

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

const LIVE_EVENTS = [
  {id:1,type:"goal",player:"Kylian Mbappé",match:"France vs Morocco",min:23,time:"2 mins ago"},
  {id:2,type:"yellow",player:"Rodri",match:"Spain vs Germany",min:41,time:"18 mins ago"},
  {id:3,type:"goal",player:"Erling Haaland",match:"Norway vs Brazil",min:67,time:"34 mins ago"},
  {id:4,type:"red",player:"Enzo Fernández",match:"Argentina vs Netherlands",min:88,time:"1 hour ago"},
  {id:5,type:"goal",player:"Vinicius Jr",match:"Norway vs Brazil",min:71,time:"1 hour ago"},
];

const GOAL_BONUS_QS = [
  {id:"first_scorer",label:"First scorer of the 2026 World Cup",points:2,type:"player"},
  {id:"golden_boot",label:"Golden Boot winner",points:1,type:"player"},
  {id:"top_nation_goals",label:"Top scoring nation",points:1,type:"nation"},
];
const CARD_BONUS_QS = [
  {id:"first_yellow",label:"First yellow card of the 2026 World Cup",points:2,type:"player"},
  {id:"first_red",label:"First red card of the 2026 World Cup",points:1,type:"player"},
  {id:"most_carded_nation",label:"Most carded nation",points:1,type:"nation"},
];

// ============================================================
// SESSION STORAGE (token only — no user data in localStorage)
// ============================================================
const session = {
  get: () => { try { return JSON.parse(localStorage.getItem("px_token")); } catch { return null; } },
  set: (v) => localStorage.setItem("px_token", JSON.stringify(v)),
  clear: () => localStorage.removeItem("px_token"),
};

// ============================================================
// SCORING — score = total (max 11), bust if >= THRESHOLD
// ============================================================
const calcScore = (total) => {
  if (total >= THRESHOLD) return { score: 0, bust: true };
  return { score: total, bust: false };
};
// Accent-insensitive search — typing "Muller" finds "Müller"
const normalize = (str) =>
  (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Live stats cache — fetches from /api/scorers proxy
let liveStatsCache = null;
let liveStatsCacheTime = 0;

const getLiveStats = async () => {
  if (liveStatsCache && Date.now() - liveStatsCacheTime < 300000) return liveStatsCache;
  try {
    const r = await fetch("/api/scorers");
    if (!r.ok) return {};
    const data = await r.json();
    liveStatsCache = data.stats || {};
    liveStatsCacheTime = Date.now();
    return liveStatsCache;
  } catch { return {}; }
};

const getEntryTotals = (entry, liveStats = {}) => {
  // Use xi_names if available (new entries) — most accurate
  const names = entry.xi_names ||
    (entry.slot_names ? Object.values(entry.slot_names) : null);

  if (names && names.length > 0 && Object.keys(liveStats).length > 0) {
    return {
      goals: names.reduce((s, name) => s + (liveStats[name]?.goals ?? 0), 0),
      cards: names.reduce((s, name) => s + (liveStats[name]?.cards ?? 0), 0),
    };
  }

  // Fallback: match by ID against mock PLAYERS array
  const players = PLAYERS.filter(p => (entry.xi || []).includes(p.id));
  return {
    goals: players.reduce((s, p) => s + (liveStats[p.name]?.goals ?? p.goals ?? 0), 0),
    cards: players.reduce((s, p) => s + (liveStats[p.name]?.cards ?? p.cards ?? 0), 0),
  };
};
const genCode = () => Math.random().toString(36).substring(2, 7).toUpperCase();

// ============================================================
// STYLES
// ============================================================
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@300;400;600;700&family=Barlow:wght@300;400;500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{background:#050e05;color:#e8f5e9;font-family:'Barlow',sans-serif;min-height:100vh;}

  .nav{position:sticky;top:0;z-index:100;background:rgba(5,14,5,0.96);backdrop-filter:blur(14px);border-bottom:1px solid #1a3a1a;padding:0 28px;height:62px;display:flex;align-items:center;justify-content:space-between;}
  .nav-logo{font-family:'Bebas Neue',sans-serif;font-size:30px;letter-spacing:3px;cursor:pointer;display:flex;align-items:baseline;user-select:none;}
  .logo-green{color:#00c853;} .logo-xi{color:#ffd700;}
  .nav-links{display:flex;gap:2px;}
  .nav-btn{background:none;border:none;color:#7a9a7a;font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:8px 12px;border-radius:6px;cursor:pointer;transition:all .2s;}
  .nav-btn:hover{color:#e8f5e9;background:#0c210c;}
  .nav-btn.active{color:#ffd700;background:#122612;}
  .nav-user{display:flex;align-items:center;gap:10px;}
  .avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#00c853,#ffd700);display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:15px;color:#050e05;}
  .sign-out-btn{background:none;border:1px solid #1a3a1a;color:#7a9a7a;font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:5px 10px;border-radius:4px;cursor:pointer;transition:all .2s;}
  .sign-out-btn:hover{border-color:#ff3d3d;color:#ff3d3d;}

  .page{max-width:1100px;margin:0 auto;padding:40px 28px 80px;animation:fadeUp .35s ease;}
  .page-narrow{max-width:700px;margin:0 auto;padding:40px 28px 80px;animation:fadeUp .35s ease;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}

  .hero{min-height:calc(100vh - 62px);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative;overflow:hidden;padding:60px 28px 40px;}
  .hero-bg{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 80% 55% at 50% -5%,rgba(0,200,83,.09) 0%,transparent 70%),radial-gradient(ellipse 50% 35% at 80% 90%,rgba(255,215,0,.05) 0%,transparent 60%),repeating-linear-gradient(0deg,transparent,transparent 59px,rgba(255,255,255,.012) 59px,rgba(255,255,255,.012) 60px),repeating-linear-gradient(90deg,transparent,transparent 59px,rgba(255,255,255,.012) 59px,rgba(255,255,255,.012) 60px);}
  .hero-badge{display:inline-flex;align-items:center;gap:6px;background:#0c210c;border:1px solid #2a5a2a;border-radius:20px;padding:6px 18px;margin-bottom:28px;font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#ffd700;}
  .hero-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(72px,13vw,148px);letter-spacing:5px;line-height:.92;margin-bottom:6px;display:flex;align-items:baseline;justify-content:center;}
  .ht-green{color:#00c853;} .ht-xi{color:#ffd700;}
  .hero-sub{font-family:'Barlow Condensed',sans-serif;font-size:clamp(14px,2.5vw,20px);font-weight:600;letter-spacing:7px;text-transform:uppercase;color:#7a9a7a;margin-bottom:28px;}
  .hero-desc{max-width:540px;font-size:16px;line-height:1.75;color:#7a9a7a;margin-bottom:44px;}
  .hero-ctas{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-bottom:64px;}
  .how-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;max-width:960px;width:100%;}
  .how-card{background:#0c210c;border:1px solid #1a3a1a;border-radius:12px;padding:24px;text-align:left;transition:border-color .2s;}
  .how-card:hover{border-color:#2a5a2a;}
  .how-num{font-family:'Bebas Neue',sans-serif;font-size:44px;color:#1a3a1a;line-height:1;margin-bottom:10px;}
  .how-card-title{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:15px;letter-spacing:1px;margin-bottom:6px;color:#ffd700;}
  .how-text{font-size:13px;line-height:1.6;color:#7a9a7a;}

  .btn{display:inline-flex;align-items:center;gap:8px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;padding:12px 26px;border-radius:6px;border:none;cursor:pointer;transition:all .2s;white-space:nowrap;}
  .btn-primary{background:linear-gradient(135deg,#00c853,#00a844);color:#050e05;box-shadow:0 0 20px rgba(0,200,83,.25);}
  .btn-primary:hover{transform:translateY(-2px);box-shadow:0 4px 28px rgba(0,200,83,.45);}
  .btn-gold{background:linear-gradient(135deg,#ffd700,#c8a800);color:#050e05;box-shadow:0 0 20px rgba(255,215,0,.2);}
  .btn-gold:hover{transform:translateY(-2px);box-shadow:0 4px 28px rgba(255,215,0,.4);}
  .btn-outline{background:transparent;color:#e8f5e9;border:1px solid #2a5a2a;}
  .btn-outline:hover{border-color:#00c853;color:#00c853;background:rgba(0,200,83,.04);}
  .btn-ghost{background:transparent;color:#7a9a7a;border:1px solid #1a3a1a;}
  .btn-ghost:hover{color:#e8f5e9;border-color:#2a5a2a;}
  .btn-sm{padding:7px 14px;font-size:11px;}
  .btn-xs{padding:5px 10px;font-size:10px;}
  .btn:disabled{opacity:.35;cursor:not-allowed;transform:none!important;box-shadow:none!important;}

  .card{background:#0c210c;border:1px solid #1a3a1a;border-radius:12px;padding:24px;}
  .surface{background:#122612;border:1px solid #1a3a1a;border-radius:8px;padding:12px 16px;}

  .sh{margin-bottom:28px;}
  .sh-eyebrow{font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#3a5a3a;margin-bottom:4px;}
  .sh-title{font-family:'Bebas Neue',sans-serif;font-size:38px;letter-spacing:2px;line-height:1;}
  .sh-sub{font-size:14px;color:#7a9a7a;margin-top:4px;}

  .stat-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:28px;}
  .stat-card{background:#0c210c;border:1px solid #1a3a1a;border-radius:10px;padding:14px;text-align:center;}
  .stat-label{font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#3a5a3a;margin-bottom:5px;}
  .stat-val{font-family:'Bebas Neue',sans-serif;font-size:34px;line-height:1;}
  .c-green{color:#00c853;}.c-gold{color:#ffd700;}.c-red{color:#ff3d3d;}.c-blue{color:#1e90ff;}.c-yellow{color:#ffcc00;}.c-dim{color:#7a9a7a;}

  .form-group{margin-bottom:18px;}
  .form-label{display:block;font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#7a9a7a;margin-bottom:7px;}
  .form-input{width:100%;background:#122612;border:1px solid #1a3a1a;border-radius:6px;padding:11px 14px;color:#e8f5e9;font-family:'Barlow',sans-serif;font-size:15px;transition:border-color .2s;outline:none;}
  .form-input:focus{border-color:#00c853;}
  .form-input::placeholder{color:#3a5a3a;}
  .form-select{width:100%;background:#122612;border:1px solid #1a3a1a;border-radius:6px;padding:11px 14px;color:#e8f5e9;font-family:'Barlow',sans-serif;font-size:14px;outline:none;cursor:pointer;}

  .auth-wrap{min-height:calc(100vh - 62px);display:flex;align-items:center;justify-content:center;padding:40px 24px;}
  .auth-box{width:100%;max-width:420px;background:#0c210c;border:1px solid #1a3a1a;border-radius:16px;padding:40px;}
  .auth-logo{display:flex;justify-content:center;margin-bottom:6px;}
  .auth-tagline{text-align:center;color:#7a9a7a;font-size:13px;margin-bottom:32px;}
  .auth-tabs{display:flex;margin-bottom:26px;border-radius:8px;overflow:hidden;border:1px solid #1a3a1a;}
  .auth-tab{flex:1;padding:10px;background:none;border:none;font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#7a9a7a;cursor:pointer;transition:all .2s;}
  .auth-tab.active{background:#122612;color:#ffd700;}
  .auth-error{background:rgba(255,61,61,.1);border:1px solid rgba(255,61,61,.3);border-radius:6px;padding:10px 14px;font-size:13px;color:#ff3d3d;margin-bottom:14px;}
  .auth-success{background:rgba(0,200,83,.1);border:1px solid rgba(0,200,83,.3);border-radius:6px;padding:10px 14px;font-size:13px;color:#00c853;margin-bottom:14px;}

  .tabs{display:flex;width:fit-content;margin-bottom:22px;border-radius:8px;overflow:hidden;border:1px solid #1a3a1a;}
  .tab-btn{padding:9px 20px;background:none;border:none;font-family:'Barlow Condensed',sans-serif;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#7a9a7a;cursor:pointer;transition:all .2s;}
  .tab-btn.active{background:#122612;color:#ffd700;}
  .tab-btn:hover:not(.active){color:#e8f5e9;background:rgba(255,255,255,.02);}

  .lb-row{display:flex;align-items:center;gap:14px;padding:14px 18px;border-radius:10px;margin-bottom:6px;background:#0c210c;border:1px solid #1a3a1a;transition:border-color .2s;}
  .lb-row:hover{border-color:#2a5a2a;}
  .lb-row.me{border-color:rgba(255,215,0,.5);background:rgba(255,215,0,.03);}
  .lb-row.bust{opacity:.45;}
  .lb-rank{font-family:'Bebas Neue',sans-serif;font-size:26px;color:#1a3a1a;width:34px;text-align:center;flex-shrink:0;}
  .lb-rank.r1{color:#ffd700;}.lb-rank.r2{color:#c0c0c0;}.lb-rank.r3{color:#cd7f32;}
  .lb-name{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:17px;}
  .lb-meta{font-size:11px;color:#3a5a3a;font-family:'Barlow Condensed',sans-serif;}
  .bust-badge{background:rgba(255,61,61,.12);color:#ff3d3d;border:1px solid rgba(255,61,61,.25);border-radius:4px;font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;padding:3px 8px;}
  .alive-badge{background:rgba(0,200,83,.1);color:#00c853;border:1px solid rgba(0,200,83,.25);border-radius:4px;font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;padding:3px 8px;}

  .prog-wrap{margin:8px 0;}
  .prog-labels{display:flex;justify-content:space-between;font-size:11px;color:#7a9a7a;margin-bottom:5px;font-family:'Barlow Condensed',sans-serif;font-weight:600;}
  .prog-bar{height:7px;background:#122612;border-radius:4px;overflow:hidden;border:1px solid #1a3a1a;}
  .prog-fill{height:100%;border-radius:4px;transition:width .5s ease;}
  .prog-fill.safe{background:linear-gradient(90deg,#00c853,#00a844);}
  .prog-fill.warn{background:linear-gradient(90deg,#ffcc00,#ff8c00);}
  .prog-fill.bust{background:#ff3d3d;}

  .player-card{background:#0c210c;border:1px solid #1a3a1a;border-radius:8px;padding:11px 12px;cursor:pointer;transition:all .15s;position:relative;user-select:none;}
  .player-card:hover:not(.pc-disabled){border-color:#2a5a2a;background:#122612;transform:translateY(-1px);}
  .player-card.pc-selected{border-color:#00c853;background:rgba(0,200,83,.07);}
  .player-card.pc-selected::after{content:"✓";position:absolute;top:7px;right:9px;color:#00c853;font-size:13px;font-weight:bold;}
  .player-card.pc-disabled{opacity:.38;cursor:not-allowed;}
  .pc-name{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:14px;margin-bottom:4px;}
  .pc-meta{display:flex;gap:7px;align-items:center;}
  .pc-nation{font-size:11px;color:#7a9a7a;}
  .pc-stat{font-size:11px;color:#7a9a7a;margin-top:5px;}
  .pc-stat span{color:#e8f5e9;font-weight:600;}
  .pos-badge{font-family:'Barlow Condensed',sans-serif;font-size:9px;font-weight:700;letter-spacing:1px;padding:2px 5px;border-radius:3px;background:#122612;color:#7a9a7a;border:1px solid #1a3a1a;}
  .pos-badge.GK{background:rgba(255,204,0,.12);color:#ffcc00;border-color:rgba(255,204,0,.25);}
  .pos-badge.CB,.pos-badge.LB,.pos-badge.RB{background:rgba(30,144,255,.12);color:#1e90ff;border-color:rgba(30,144,255,.25);}
  .pos-badge.CDM,.pos-badge.CM,.pos-badge.CAM{background:rgba(0,200,83,.12);color:#00c853;border-color:rgba(0,200,83,.25);}
  .pos-badge.LW,.pos-badge.RW,.pos-badge.ST,.pos-badge.CF{background:rgba(255,61,61,.12);color:#ff3d3d;border-color:rgba(255,61,61,.25);}

  .xi-builder-layout{display:grid;grid-template-columns:1fr 270px;gap:20px;align-items:start;}
  .players-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;max-height:500px;overflow-y:auto;padding-right:4px;}
  .players-grid::-webkit-scrollbar{width:3px;}
  .players-grid::-webkit-scrollbar-thumb{background:#2a5a2a;border-radius:2px;}
  .xi-panel{position:sticky;top:78px;}
  .xi-list{display:flex;flex-direction:column;gap:5px;}
  .xi-item{display:flex;align-items:center;gap:9px;background:#122612;border:1px solid #1a3a1a;border-radius:6px;padding:7px 10px;}
  .xi-item-name{flex:1;font-family:'Barlow Condensed',sans-serif;font-weight:600;font-size:13px;}
  .xi-remove{background:none;border:none;color:#3a5a3a;cursor:pointer;font-size:16px;transition:color .15s;padding:0 2px;line-height:1;}
  .xi-remove:hover{color:#ff3d3d;}
  .filter-bar{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px;}
  .filter-chip{padding:5px 11px;border-radius:20px;border:1px solid #1a3a1a;background:none;color:#7a9a7a;font-family:'Barlow Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:1px;cursor:pointer;transition:all .15s;}
  .filter-chip:hover{border-color:#2a5a2a;color:#e8f5e9;}
  .filter-chip.active{border-color:#00c853;background:rgba(0,200,83,.08);color:#00c853;}

  .group-card{background:#0c210c;border:1px solid #1a3a1a;border-radius:12px;padding:20px;cursor:pointer;transition:all .2s;}
  .group-card:hover{border-color:#00c853;transform:translateY(-2px);}
  .group-name{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:20px;margin-bottom:3px;}
  .group-meta{font-size:12px;color:#7a9a7a;margin-bottom:12px;}
  .invite-code{display:inline-flex;align-items:center;gap:6px;background:#122612;border:1px solid #1a3a1a;border-radius:5px;padding:4px 10px;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;letter-spacing:2.5px;color:#ffd700;}

  .feed-item{display:flex;align-items:flex-start;gap:12px;padding:13px 0;border-bottom:1px solid #1a3a1a;}
  .feed-item:last-child{border-bottom:none;}
  .feed-icon{font-size:18px;flex-shrink:0;margin-top:1px;}
  .feed-text{flex:1;font-size:13px;line-height:1.5;color:#7a9a7a;}
  .feed-text strong{color:#e8f5e9;}
  .feed-time{font-size:10px;color:#3a5a3a;white-space:nowrap;font-family:'Barlow Condensed',sans-serif;}

  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:200;padding:24px;backdrop-filter:blur(5px);animation:fadeIn .2s ease;}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  .modal{background:#0c210c;border:1px solid #2a5a2a;border-radius:16px;padding:32px;max-width:460px;width:100%;animation:slideUp .25s ease;}
  @keyframes slideUp{from{transform:translateY(18px);opacity:0}to{transform:translateY(0);opacity:1}}
  .modal-title{font-family:'Bebas Neue',sans-serif;font-size:30px;letter-spacing:2px;margin-bottom:6px;}
  .modal-sub{font-size:13px;color:#7a9a7a;margin-bottom:22px;line-height:1.5;}

  .toast{position:fixed;bottom:24px;right:24px;z-index:300;background:#122612;border:1px solid #00c853;border-radius:8px;padding:13px 20px;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;color:#00c853;letter-spacing:.5px;animation:slideLeft .3s ease;box-shadow:0 4px 20px rgba(0,200,83,.2);}
  @keyframes slideLeft{from{transform:translateX(36px);opacity:0}to{transform:translateX(0);opacity:1}}
  .toast-err{border-color:#ff3d3d;color:#ff3d3d;box-shadow:0 4px 20px rgba(255,61,61,.2);}

  .spinner{display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,.2);border-top-color:#00c853;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0;}
  @keyframes spin{to{transform:rotate(360deg)}}
  .loading-full{min-height:60vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;color:#7a9a7a;font-family:'Barlow Condensed',sans-serif;font-size:14px;letter-spacing:1px;}
  .loading-full .spinner{width:32px;height:32px;border-width:3px;}

  .code-block{background:#020a02;border:1px solid #1a3a1a;border-radius:6px;padding:13px 15px;font-family:'Courier New',monospace;font-size:12px;color:#00c853;line-height:1.65;overflow-x:auto;margin:8px 0;}
  hr{border:none;border-top:1px solid #1a3a1a;margin:20px 0;}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  @media(max-width:768px){.grid-2,.xi-builder-layout{grid-template-columns:1fr;}.xi-panel{position:static;}}
  .empty-state{text-align:center;padding:56px 24px;color:#3a5a3a;}
  .empty-icon{font-size:44px;margin-bottom:10px;}
  .empty-text{font-family:'Barlow Condensed',sans-serif;font-size:15px;letter-spacing:1px;margin-bottom:16px;}
  .info-box{background:rgba(30,144,255,.05);border:1px solid rgba(30,144,255,.2);border-radius:10px;padding:14px 18px;}
  .warn-box{background:rgba(255,215,0,.04);border:1px solid rgba(255,215,0,.18);border-radius:10px;padding:14px 18px;}
  .xi-callout{background:rgba(255,215,0,.05);border:1px solid rgba(255,215,0,.2);border-radius:10px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:14px;}
  .xi-callout-num{font-family:'Bebas Neue',sans-serif;font-size:52px;color:#ffd700;line-height:1;flex-shrink:0;}
  .xi-callout-text{font-size:13px;color:#7a9a7a;line-height:1.6;}
  .xi-callout-text strong{color:#e8f5e9;}

  .footer{border-top:1px solid #1a3a1a;padding:32px 28px;text-align:center;margin-top:40px;}
  .footer-logo{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:3px;display:flex;align-items:baseline;justify-content:center;margin-bottom:6px;}
  .footer-sub{font-size:12px;color:#3a5a3a;margin-bottom:20px;font-family:'Barlow Condensed',sans-serif;letter-spacing:1px;}
  .tip-jar{display:inline-flex;flex-direction:column;align-items:center;gap:6px;background:#0c210c;border:1px solid #1a3a1a;border-radius:10px;padding:14px 24px;margin-bottom:16px;}
  .tip-title{font-family:'Barlow Condensed',sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#3a5a3a;margin-bottom:4px;}
  .tip-row{display:flex;gap:20px;flex-wrap:wrap;justify-content:center;}
  .tip-item{display:flex;align-items:center;gap:6px;font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:700;color:#7a9a7a;}
  .tip-item span{color:#ffd700;}
  .footer-copy{font-size:11px;color:#3a5a3a;font-family:'Barlow Condensed',sans-serif;}

  @keyframes floatBall{0%,100%{transform:translateY(0) rotate(0deg);}33%{transform:translateY(-14px) rotate(8deg);}66%{transform:translateY(-6px) rotate(-5deg);}}
  @keyframes slideDrawer{from{transform:translateY(100%);}to{transform:translateY(0);}}

  /* Responsive layout helpers */
  .xi-desktop-only{display:grid;}
  .xi-mobile-only{display:none;}
  @media(max-width:768px){
    .grid-2,.xi-builder-layout{grid-template-columns:1fr;}
    .xi-panel{position:static;}
    .xi-desktop-only{display:none !important;}
    .xi-mobile-only{display:block !important;}
  }
`;

// ============================================================
// SHARED COMPONENTS
// ============================================================
const Logo = ({ size = 28 }) => (
  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: size, letterSpacing: 3, display:"flex", alignItems:"baseline" }}>
    <span className="logo-green">PREDI</span>
    <span className="logo-xi">XI</span>
    <span className="logo-green">ON</span>
  </span>
);

const ProgressBar = ({ current }) => {
  const pct = Math.min((current / THRESHOLD) * 100, 100);
  const cls = pct >= 100 ? "bust" : pct >= 80 ? "warn" : "safe";
  return (
    <div className="prog-wrap">
      <div className="prog-labels">
        <span>{current} / {THRESHOLD}</span>
        <span>{pct >= 100 ? "💥 BUST" : `${THRESHOLD - current} remaining`}</span>
      </div>
      <div className="prog-bar"><div className={`prog-fill ${cls}`} style={{ width:`${pct}%` }} /></div>
    </div>
  );
};

const Toast = ({ msg, isError, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, []);
  return <div className={`toast ${isError ? "toast-err" : ""}`}>{isError ? "✗" : "✓"} {msg}</div>;
};

const Spinner = ({ full }) => full
  ? <div className="loading-full"><div className="spinner" /><span>Loading...</span></div>
  : <div className="spinner" />;

const PlayerCard = ({ player, selected, disabled, onClick, type }) => (
  <div className={`player-card ${selected?"pc-selected":""} ${disabled?"pc-disabled":""}`} onClick={disabled ? undefined : onClick}>
    <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:4 }}>
      <span>{player.flag}</span>
      <span className={`pos-badge ${player.pos}`}>{player.pos}</span>
    </div>
    <div className="pc-name">{player.name}</div>
    <div className="pc-meta"><span className="pc-nation">{player.nation}</span></div>
    <div className="pc-stat">{type==="goals" ? <>⚽ <span>{player.goals}</span> goals</> : <>🟨 <span>{player.cards}</span> pts</>}</div>
  </div>
);

const Footer = () => (
  <footer className="footer">
    <div className="footer-logo"><span className="logo-green">PREDI</span><span className="logo-xi">XI</span><span className="logo-green">ON</span></div>
    <div className="footer-sub">FIFA WORLD CUP 2026 · PICK YOUR XI · BEAT ELEVEN</div>
    <div className="tip-jar">
      <div className="tip-title">☕ Enjoying PrediXIon? Tip the creator</div>
      <div className="tip-row">
        <div className="tip-item">🅿️ PayPal <span>@predixion</span></div>
        <div className="tip-item">💸 Venmo <span>@predixion</span></div>
      </div>
    </div>
    <div className="footer-copy">© 2026 PrediXIon · Not affiliated with FIFA</div>
  </footer>
);

// ============================================================
// LANDING
// ============================================================
const LandingPage = ({ onNav }) => (
  <div>
    <div className="hero">
      <div className="hero-bg" />

      {/* Floating animated balls only */}
      <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none"}}>
        <div style={{position:"absolute",top:"8%",right:"8%",fontSize:28,opacity:.1,animation:"floatBall 7s ease-in-out infinite"}}>⚽</div>
        <div style={{position:"absolute",top:"55%",left:"5%",fontSize:20,opacity:.07,animation:"floatBall 9s ease-in-out infinite reverse"}}>⚽</div>
        <div style={{position:"absolute",top:"30%",right:"3%",fontSize:14,opacity:.05,animation:"floatBall 11s ease-in-out infinite 2s"}}>⚽</div>
        <div style={{position:"absolute",bottom:"20%",left:"2%",fontSize:16,opacity:.06,animation:"floatBall 8s ease-in-out infinite 1s reverse"}}>⚽</div>
      </div>

      <div className="hero-badge">🏆 FIFA WORLD CUP 2026 · USA / CANADA / MEXICO</div>
      <div className="hero-title"><span className="ht-green">PREDI</span><span className="ht-xi">XI</span><span className="ht-green">ON</span></div>
      <p className="hero-sub">Three games. One tournament. Who knows best?</p>
      <p className="hero-desc">
        Pick your Goals XI, your Cards XI, and make 10 bold predictions about the 2026 World Cup.
        Stay under <strong style={{color:"#ffd700"}}>11</strong> on your XIs, nail your predictions, and top the leaderboard.
      </p>
      <div className="hero-ctas">
        <button className="btn btn-primary" onClick={() => onNav("auth",{mode:"register"})}>Register to Play</button>
        <button className="btn btn-ghost" onClick={() => onNav("auth",{mode:"login"})}>Sign In</button>
      </div>

      {/* Three competitions */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,maxWidth:760,width:"100%",marginBottom:48}}>
        {[
          {icon:"⚽",title:"Goals XI",desc:"Pick 11 players. Keep their combined goals under 11. Closest to the threshold without busting wins.",color:"#00c853"},
          {icon:"🟨",title:"Cards XI",desc:"Same mechanic, different chaos. Track card points — yellow=1, red=2. Stay under 11.",color:"#ffcc00"},
          {icon:"🎯",title:"Predictions",desc:"Who wins it? Golden Boot? Golden Ball? 10 bold calls, up to 60 bonus points.",color:"#ffd700"},
        ].map(c => (
          <div key={c.title} style={{background:"rgba(12,33,12,.8)",border:`1px solid ${c.color}22`,borderRadius:12,padding:"20px 18px",textAlign:"left",backdropFilter:"blur(8px)"}}>
            <div style={{fontSize:28,marginBottom:8}}>{c.icon}</div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:16,color:c.color,letterSpacing:1,marginBottom:6}}>{c.title}</div>
            <p style={{fontSize:13,color:"#7a9a7a",lineHeight:1.6}}>{c.desc}</p>
          </div>
        ))}
      </div>

      <div className="how-grid">
        {[
          {n:"01",t:"Register Free",d:"Create your account in seconds. No credit card ever needed."},
          {n:"02",t:"Pick Your XIs",d:"Choose a formation, fill each slot with a real World Cup player. One XI for Goals, one for Cards."},
          {n:"03",t:"Make Predictions",d:"Winners, Golden Boot, Dark Horse, Flop — 10 calls, 60 points up for grabs."},
          {n:"04",t:"Compete & Win",d:"Global leaderboard plus private groups. Three separate competitions, three chances to top the table."},
        ].map(h => (
          <div className="how-card" key={h.n}>
            <div className="how-num">{h.n}</div>
            <div className="how-card-title">{h.t}</div>
            <p className="how-text">{h.d}</p>
          </div>
        ))}
      </div>
    </div>

    {/* Scoring strip */}
    <div style={{background:"#0c210c",borderTop:"1px solid #1a3a1a",borderBottom:"1px solid #1a3a1a",padding:"44px 28px"}}>
      <div style={{maxWidth:960,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:36}}>How XI Scoring Works</div>
          <p style={{color:"#7a9a7a",fontSize:14,marginTop:4}}>Same rules for Goals XI and Cards XI</p>
        </div>
        <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap",marginBottom:28}}>
          {[
            {v:"10 pts",l:"Exactly 11 — perfect",c:"c-gold"},
            {v:"9.5 pts",l:"10 goals/cards",c:"c-green"},
            {v:"6 pts",l:"5 goals/cards",c:"c-dim"},
            {v:"💥 BUST",l:"11 or over",c:"c-red"},
          ].map(s => (
            <div key={s.l} style={{background:"#122612",border:"1px solid #1a3a1a",borderRadius:10,padding:"16px 22px",minWidth:140,textAlign:"center"}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,marginBottom:4}} className={s.c}>{s.v}</div>
              <div style={{fontSize:12,color:"#7a9a7a"}}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Predictions scoring */}
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28}}>Predictions Scoring</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8,maxWidth:760,margin:"0 auto"}}>
          {[
            {icon:"🏆",label:"Winners",pts:10},
            {icon:"⚽",label:"Top Scorer",pts:8},
            {icon:"🔥",label:"Dark Horse",pts:6},
            {icon:"🌟",label:"Golden Ball",pts:6},
            {icon:"🥈",label:"Runners-up",pts:6},
            {icon:"🎯",label:"Most Assists",pts:6},
            {icon:"👶",label:"Best Young Player",pts:5},
            {icon:"🧤",label:"Golden Glove",pts:5},
            {icon:"📉",label:"Flop",pts:4},
            {icon:"😮",label:"Disappointing Nation",pts:4},
          ].map(p => (
            <div key={p.label} style={{background:"#122612",border:"1px solid #1a3a1a",borderRadius:8,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,color:"#7a9a7a"}}>{p.icon} {p.label}</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:"#ffd700"}}>+{p.pts}</div>
            </div>
          ))}
        </div>
        <p style={{textAlign:"center",color:"#7a9a7a",fontSize:13,marginTop:16}}>
          Plus community votes for <strong style={{color:"#e8f5e9"}}>Flop, Dark Horse & Disappointing Nation</strong> — decided by all players from the semi-finals
        </p>
      </div>
    </div>

    {/* Stats strip */}
    <div style={{padding:"44px 28px",textAlign:"center"}}>
      <div style={{maxWidth:960,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:28}}>
        {[
          {v:"48",l:"Nations"},
          {v:"104",l:"Matches"},
          {v:"11",l:"The Threshold"},
          {v:"3",l:"Competitions"},
          {v:"60",l:"Max Prediction Pts"},
        ].map(s => (
          <div key={s.l}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:56,color:"#ffd700",lineHeight:1}}>{s.v}</div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:11,letterSpacing:2,textTransform:"uppercase",color:"#3a5a3a",marginTop:4}}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>

    {/* CTA */}
    <div style={{textAlign:"center",padding:"48px 28px 64px",position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse 60% 60% at 50% 50%,rgba(0,200,83,.04) 0%,transparent 70%)",pointerEvents:"none"}} />
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:44,marginBottom:8}}>Ready to play?</div>
      <p style={{color:"#7a9a7a",marginBottom:24,fontSize:15}}>Lock in your picks before June 11, 2026 kickoff. Free forever.</p>
      <button className="btn btn-gold" style={{fontSize:15,padding:"14px 36px"}} onClick={() => onNav("auth",{mode:"register"})}>
        Create Free Account →
      </button>
    </div>
    <Footer />
  </div>
);

// ============================================================
// AUTH — wired to Supabase Auth
// ============================================================
const AuthPage = ({ onAuth, initialMode = "login" }) => {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ username:"", email:"", password:"" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(""); setSuccess(""); setLoading(true);
    try {
      if (mode === "register") {
        if (!form.username || !form.email || !form.password) { setError("All fields required"); setLoading(false); return; }
        if (form.password.length < 6) { setError("Password must be at least 6 characters"); setLoading(false); return; }
        const data = await sb.auth.signUp({ email: form.email, password: form.password, username: form.username });
        if (data.error) { setError(data.error.message || "Registration failed"); setLoading(false); return; }
        // Auto-sign in after register
        const signInData = await sb.auth.signIn({ email: form.email, password: form.password });
        if (signInData.access_token) {
          const userRow = await sb.select("users", `?email=eq.${encodeURIComponent(form.email)}`);
          onAuth({ token: signInData.access_token, user: userRow[0] || { email: form.email, username: form.username } });
        } else {
          setSuccess("Account created! Check your email to confirm, then sign in.");
          setMode("login");
        }
      } else {
        const data = await sb.auth.signIn({ email: form.email, password: form.password });
        if (data.error || !data.access_token) { setError(data.error?.message || "Invalid email or password"); setLoading(false); return; }
        const userRow = await sb.select("users", `?email=eq.${encodeURIComponent(form.email)}`);
        // Always use the username from the database, never fall back to email prefix
        const userProfile = userRow?.[0];
        if (!userProfile) { setError("Account not found — please register first."); setLoading(false); return; }
        onAuth({ token: data.access_token, user: userProfile });
      }
    } catch (e) {
      setError("Connection error — check your internet and try again.");
    }
    setLoading(false);
  };

  return (
    <div className="auth-wrap">
      <div className="auth-box">
        <div className="auth-logo"><Logo size={38} /></div>
        <p className="auth-tagline">2026 FIFA World Cup Prediction Game</p>
        <div className="auth-tabs">
          <button className={`auth-tab ${mode==="login"?"active":""}`} onClick={() => { setMode("login"); setError(""); setSuccess(""); }}>Sign In</button>
          <button className={`auth-tab ${mode==="register"?"active":""}`} onClick={() => { setMode("register"); setError(""); setSuccess(""); }}>Register</button>
        </div>
        {error && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}
        {mode==="register" && (
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" placeholder="e.g. GoalMachine99" value={form.username} onChange={e => setForm({...form,username:e.target.value})} />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="form-input" type="email" placeholder="you@email.com" value={form.email} onChange={e => setForm({...form,email:e.target.value})} />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input className="form-input" type="password" placeholder="••••••••" value={form.password} onChange={e => setForm({...form,password:e.target.value})} onKeyDown={e => e.key==="Enter" && submit()} />
        </div>
        <button className="btn btn-primary" style={{width:"100%",gap:10}} onClick={submit} disabled={loading}>
          {loading && <Spinner />}
          {loading ? "Please wait..." : mode==="login" ? "Sign In" : "Create Account"}
        </button>
        <p style={{textAlign:"center",marginTop:14,fontSize:13,color:"#7a9a7a"}}>
          {mode==="login" ? "No account? " : "Have an account? "}
          <span style={{color:"#00c853",cursor:"pointer"}} onClick={() => { setMode(mode==="login"?"register":"login"); setError(""); setSuccess(""); }}>
            {mode==="login" ? "Register free" : "Sign in"}
          </span>
        </p>
      </div>
    </div>
  );
};

// ============================================================
// DASHBOARD — reads from Supabase
// ============================================================
const Dashboard = ({ auth, onNav, onToast }) => {
  const [groups, setGroups] = useState([]);
  const [entries, setEntries] = useState([]);
  const [predictions, setPredictions] = useState(null);
  const [liveStats, setLiveStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [mems, ents, preds, stats] = await Promise.all([
          sb.select("group_members", `?user_id=eq.${auth.user.id}&select=group_id,groups(*)`),
          sb.select("entries", `?user_id=eq.${auth.user.id}`),
          sb.select("predictions", `?user_id=eq.${auth.user.id}`),
          getLiveStats(),
        ]);
        setGroups((mems || []).map(m => m.groups).filter(Boolean));
        setEntries(ents || []);
        setPredictions(preds?.[0] || null);
        setLiveStats(stats || {});
      } catch { onToast("Failed to load data", true); }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <Spinner full />;

  const getDisplay = (entry) => {
    const { goals, cards } = getEntryTotals(entry, liveStats);
    const total = entry.type==="goals" ? goals : cards;
    return { total, ...calcScore(total) };
  };

  const goalsEntry = entries.find(e => e.type==="goals");
  const cardsEntry = entries.find(e => e.type==="cards");
  const bestScore = entries.length ? Math.max(...entries.map(e => getDisplay(e).score)) : null;
  const predCount = predictions ? Object.values(predictions).filter(v => v && typeof v === "string").length : 0;

  return (
    <div className="page">
      <div className="sh">
        <div className="sh-eyebrow">Welcome back</div>
        <h1 className="sh-title">Hey, {auth.user.username} 👋</h1>
        <p className="sh-sub">World Cup 2026 · Kicks off June 11</p>
        <p className="sh-sub">Threshold: <strong style={{color:"#ffd700"}}>11</strong></p>
      </div>

      <div className="stat-row">
        <div className="stat-card"><div className="stat-label">My Groups</div><div className="stat-val c-gold">{groups.length}</div></div>
        <div className="stat-card"><div className="stat-label">Entries</div><div className="stat-val c-green">{entries.length}</div></div>
        <div className="stat-card"><div className="stat-label">Busted</div><div className="stat-val c-red">{entries.filter(e=>getDisplay(e).bust).length}</div></div>
        <div className="stat-card"><div className="stat-label">Best Score</div><div className="stat-val c-gold">{bestScore ?? "—"}</div></div>
      </div>

      {/* My XI Entries */}
      <div style={{marginBottom:28}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:17,letterSpacing:1,marginBottom:14}}>My XI Entries</div>
        <div className="grid-2">
          {/* Goals XI */}
          <div className="card" style={goalsEntry && getDisplay(goalsEntry).bust ? {borderColor:"rgba(255,61,61,.3)"} : goalsEntry ? {borderColor:"rgba(0,200,83,.3)"} : {}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:16}}>⚽ Goals XI</div>
              {goalsEntry
                ? getDisplay(goalsEntry).bust
                  ? <span className="bust-badge">💥 BUST</span>
                  : <span className="alive-badge">ALIVE</span>
                : <span style={{fontSize:11,color:"#ffd700",fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:1}}>NOT PICKED</span>
              }
            </div>
            {goalsEntry ? (
              <>
                <ProgressBar current={getDisplay(goalsEntry).total} />
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                  <span style={{fontSize:12,color:"#7a9a7a"}}>Formation: <strong style={{color:"#e8f5e9"}}>{goalsEntry.formation||"—"}</strong></span>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:getDisplay(goalsEntry).bust?"#ff3d3d":getDisplay(goalsEntry).score>=9.5?"#ffd700":"#00c853"}}>
                    {getDisplay(goalsEntry).bust?"BUST":`${getDisplay(goalsEntry).score} pts`}
                  </div>
                </div>
                <button className="btn btn-ghost btn-xs" style={{marginTop:8,width:"100%"}} onClick={() => onNav("xi-builder",{type:"goals"})}>Edit Goals XI</button>
              </>
            ) : (
              <button className="btn btn-primary" style={{width:"100%",marginTop:8}} onClick={() => onNav("xi-builder",{type:"goals"})}>+ Pick Goals XI</button>
            )}
          </div>

          {/* Cards XI */}
          <div className="card" style={cardsEntry && getDisplay(cardsEntry).bust ? {borderColor:"rgba(255,61,61,.3)"} : cardsEntry ? {borderColor:"rgba(0,200,83,.3)"} : {}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:16}}>🟨 Cards XI</div>
              {cardsEntry
                ? getDisplay(cardsEntry).bust
                  ? <span className="bust-badge">💥 BUST</span>
                  : <span className="alive-badge">ALIVE</span>
                : <span style={{fontSize:11,color:"#ffd700",fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:1}}>NOT PICKED</span>
              }
            </div>
            {cardsEntry ? (
              <>
                <ProgressBar current={getDisplay(cardsEntry).total} />
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                  <span style={{fontSize:12,color:"#7a9a7a"}}>Formation: <strong style={{color:"#e8f5e9"}}>{cardsEntry.formation||"—"}</strong></span>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:getDisplay(cardsEntry).bust?"#ff3d3d":getDisplay(cardsEntry).score>=9.5?"#ffd700":"#00c853"}}>
                    {getDisplay(cardsEntry).bust?"BUST":`${getDisplay(cardsEntry).score} pts`}
                  </div>
                </div>
                <button className="btn btn-ghost btn-xs" style={{marginTop:8,width:"100%"}} onClick={() => onNav("xi-builder",{type:"cards"})}>Edit Cards XI</button>
              </>
            ) : (
              <button className="btn btn-primary" style={{width:"100%",marginTop:8}} onClick={() => onNav("xi-builder",{type:"cards"})}>+ Pick Cards XI</button>
            )}
          </div>
        </div>
      </div>

      {/* Predictions */}
      <div style={{marginBottom:28}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:17,letterSpacing:1,marginBottom:14}}>🎯 My Predictions</div>
        <div className="card" style={predictions ? {borderColor:"rgba(0,200,83,.3)"} : {}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:15}}>World Cup 2026 Predictions</div>
              <div style={{fontSize:12,color:"#7a9a7a",marginTop:3}}>{predCount} / 10 answered · Max 60 pts</div>
            </div>
            {predictions
              ? <button className="btn btn-ghost btn-sm" onClick={() => onNav("predictions")}>Edit</button>
              : <button className="btn btn-gold btn-sm" onClick={() => onNav("predictions")}>+ Make Predictions</button>
            }
          </div>
          {predictions && (
            <div style={{marginTop:12,display:"flex",flexWrap:"wrap",gap:6}}>
              {[
                {icon:"🏆",label:"Winners",val:predictions.winners},
                {icon:"🥈",label:"Runners-up",val:predictions.runners_up},
                {icon:"⚽",label:"Top Scorer",val:predictions.top_scorer},
                {icon:"🎯",label:"Assists",val:predictions.most_assists},
                {icon:"🌟",label:"Golden Ball",val:predictions.golden_ball},
              ].filter(p=>p.val).map(p => (
                <div key={p.label} style={{background:"#122612",borderRadius:6,padding:"4px 10px",fontSize:12,color:"#7a9a7a"}}>
                  {p.icon} <strong style={{color:"#e8f5e9"}}>{p.val}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Groups */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:17,letterSpacing:1}}>My Groups</div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-ghost btn-sm" onClick={() => onNav("groups",{modal:"join"})}>Join Group</button>
          <button className="btn btn-primary btn-sm" onClick={() => onNav("groups",{modal:"create"})}>+ Create</button>
        </div>
      </div>
      {groups.length===0 ? (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <div className="empty-text">No groups yet — compete with friends!</div>
          <div style={{display:"flex",gap:10,justifyContent:"center"}}>
            <button className="btn btn-primary" onClick={() => onNav("groups",{modal:"create"})}>Create Group</button>
            <button className="btn btn-outline" onClick={() => onNav("groups",{modal:"join"})}>Join Group</button>
          </div>
        </div>
      ) : (
        <div className="grid-2">
          {groups.map(g => (
            <div className="group-card" key={g.id} onClick={() => onNav("group-detail",{groupId:g.id})}>
              <div className="group-name">{g.name}</div>
              <div className="group-meta">{new Date(g.created_at).toLocaleDateString()}</div>
              <div className="invite-code">🔑 {g.code}</div>
            </div>
          ))}
        </div>
      )}
      <Footer />
    </div>
  );
};

// ============================================================
// GROUPS — create/join backed by Supabase
// ============================================================
const GroupsPage = ({ auth, initialModal, onToast, onNav }) => {
  const [modal, setModal] = useState(initialModal||null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const mems = await sb.select("group_members", `?user_id=eq.${auth.user.id}&select=group_id,groups(*)`);
      setGroups((mems||[]).map(m=>m.groups).filter(Boolean));
    } catch { onToast("Failed to load groups", true); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const createGroup = async () => {
    if (!groupName.trim()) { setError("Group name required"); return; }
    setSaving(true); setError("");
    try {
      const code = genCode();
      const [g] = await sb.insert("groups", { name: groupName.trim(), code, created_by: auth.user.id }, auth.token);
      await sb.insert("group_members", { group_id: g.id, user_id: auth.user.id }, auth.token);
      setModal(null); setGroupName(""); onToast(`Group "${g.name}" created!`); load();
    } catch { setError("Failed to create group — try again"); }
    setSaving(false);
  };

  const joinGroup = async () => {
    if (!joinCode.trim()) { setError("Enter an invite code"); return; }
    setSaving(true); setError("");
    try {
      const [g] = await sb.select("groups", `?code=eq.${joinCode.toUpperCase()}`);
      if (!g) { setError("Invalid invite code"); setSaving(false); return; }
      const existing = await sb.select("group_members", `?group_id=eq.${g.id}&user_id=eq.${auth.user.id}`);
      if (existing?.length) { setError("You're already in this group"); setSaving(false); return; }
      await sb.insert("group_members", { group_id: g.id, user_id: auth.user.id }, auth.token);
      setModal(null); setJoinCode(""); onToast(`Joined "${g.name}"!`); load();
    } catch { setError("Failed to join group — try again"); }
    setSaving(false);
  };

  if (loading) return <Spinner full />;

  return (
    <div className="page">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:28}}>
        <div className="sh" style={{marginBottom:0}}>
          <div className="sh-eyebrow">Compete with friends</div>
          <h1 className="sh-title">Groups</h1>
        </div>
        <div style={{display:"flex",gap:8,paddingTop:8}}>
          <button className="btn btn-ghost btn-sm" onClick={() => {setError("");setModal("join");}}>Join Group</button>
          <button className="btn btn-primary btn-sm" onClick={() => {setError("");setModal("create");}}>+ Create</button>
        </div>
      </div>
      <div className="xi-callout">
        <div className="xi-callout-num">11</div>
        <div className="xi-callout-text"><strong>The universal threshold.</strong> Every group, both competitions — stay under eleven to score points. Hit 11 exactly for maximum 10 points. Go over and you're bust. Each point below = -0.5 pts.</div>
      </div>
      {groups.length===0 ? (
        <div className="empty-state"><div className="empty-icon">🏟️</div><div className="empty-text">No groups yet</div></div>
      ) : (
        <div className="grid-2">
          {groups.map(g => (
            <div className="group-card" key={g.id} onClick={() => onNav("group-detail",{groupId:g.id})}>
              <div className="group-name">{g.name}</div>
              <div className="group-meta">Created {new Date(g.created_at).toLocaleDateString()}</div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div className="invite-code">🔑 {g.code}</div>
                {g.created_by===auth.user.id && <span style={{fontSize:10,color:"#ffd700",fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:1}}>👑 ADMIN</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal==="create" && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&setModal(null)}>
          <div className="modal">
            <div className="modal-title">Create Group</div>
            <p className="modal-sub">Give your group a name. An invite code is generated automatically. Threshold is always <strong style={{color:"#ffd700"}}>11</strong> for both competitions.</p>
            {error && <div className="auth-error">{error}</div>}
            <div className="form-group">
              <label className="form-label">Group Name</label>
              <input className="form-input" placeholder="e.g. Office World Cup" value={groupName} onChange={e => setGroupName(e.target.value)} onKeyDown={e => e.key==="Enter"&&createGroup()} />
            </div>
            <div style={{display:"flex",gap:10}}>
              <button className="btn btn-primary" style={{flex:1,gap:8}} onClick={createGroup} disabled={saving}>{saving&&<Spinner/>}Create Group</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {modal==="join" && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget&&setModal(null)}>
          <div className="modal">
            <div className="modal-title">Join a Group</div>
            <p className="modal-sub">Enter the 5-character invite code from your group admin.</p>
            {error && <div className="auth-error">{error}</div>}
            <div className="form-group">
              <label className="form-label">Invite Code</label>
              <input className="form-input" placeholder="AB3XY" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} style={{letterSpacing:5,fontSize:20,textTransform:"uppercase",textAlign:"center"}} onKeyDown={e => e.key==="Enter"&&joinGroup()} />
            </div>
            <div style={{display:"flex",gap:10}}>
              <button className="btn btn-primary" style={{flex:1,gap:8}} onClick={joinGroup} disabled={saving}>{saving&&<Spinner/>}Join Group</button>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <Footer />
    </div>
  );
};

// ============================================================
// GROUP DETAIL
// ============================================================
const GroupDetail = ({ auth, groupId, onNav, onToast }) => {
  const [compTab, setCompTab] = useState("goals");
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [entries, setEntries] = useState([]);
  const [liveStats, setLiveStats] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [gs, mems] = await Promise.all([
          sb.select("groups", `?id=eq.${groupId}`),
          sb.select("group_members", `?group_id=eq.${groupId}&select=user_id,users(*)`),
        ]);
        setGroup(gs?.[0]||null);
        const memberUsers = (mems||[]).map(m=>m.users).filter(Boolean);
        setMembers(memberUsers);

        // Fetch entries by member user IDs — not group_id
        // since entries are global (group_id is null)
        if (memberUsers.length > 0) {
          const userIds = memberUsers.map(u => u.id).join(",");
          const [ents, stats] = await Promise.all([
            sb.select("entries", `?user_id=in.(${userIds})`),
            getLiveStats(),
          ]);
          setEntries(ents||[]);
          setLiveStats(stats||{});
        }
      } catch { onToast("Failed to load group", true); }
      setLoading(false);
    };
    load();
  }, [groupId]);

  if (loading) return <Spinner full />;
  if (!group) return <div className="page"><p>Group not found.</p></div>;

  const myEntry = entries.find(e => e.user_id===auth.user.id && e.type===compTab);

  const ranked = members.map(u => {
    const entry = entries.find(e => e.user_id===u.id && e.type===compTab);
    if (!entry) return { user:u, entry:null, total:0, score:0, bust:false };
    const {goals,cards} = getEntryTotals(entry, liveStats);
    const total = compTab==="goals" ? goals : cards;
    const {score,bust} = calcScore(total);
    return {user:u,entry,total,score,bust};
  }).sort((a,b) => {
    if (a.bust&&!b.bust) return 1;
    if (!a.bust&&b.bust) return -1;
    return b.score-a.score;
  });

  return (
    <div className="page">
      <button className="btn btn-ghost btn-sm" style={{marginBottom:20}} onClick={() => onNav("groups")}>← Groups</button>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div>
          <div className="sh-eyebrow">Group</div>
          <h1 className="sh-title">{group.name}</h1>
          <div style={{display:"flex",gap:10,alignItems:"center",marginTop:6}}>
            <div className="invite-code">🔑 {group.code}</div>
            <span style={{fontSize:12,color:"#7a9a7a"}}>{members.length} members</span>
            {group.created_by===auth.user.id && <span style={{fontSize:10,color:"#ffd700",fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:1}}>👑 ADMIN</span>}
          </div>
        </div>
        {!myEntry && (
          <button className="btn btn-primary btn-sm" onClick={() => onNav("xi-builder",{groupId:group.id,type:compTab})}>
            + Pick {compTab==="goals"?"Goals":"Cards"} XI
          </button>
        )}
      </div>

      <div className="stat-row">
        <div className="stat-card"><div className="stat-label">Threshold</div><div className="stat-val c-gold">XI</div></div>
        <div className="stat-card"><div className="stat-label">Members</div><div className="stat-val c-green">{members.length}</div></div>
        <div className="stat-card"><div className="stat-label">Entries</div><div className="stat-val c-blue">{entries.filter(e=>e.type===compTab).length}</div></div>
        <div className="stat-card"><div className="stat-label">Busted</div><div className="stat-val c-red">{ranked.filter(r=>r.bust).length}</div></div>
      </div>

      <div className="tabs">
        <button className={`tab-btn ${compTab==="goals"?"active":""}`} onClick={() => setCompTab("goals")}>⚽ Goals XI</button>
        <button className={`tab-btn ${compTab==="cards"?"active":""}`} onClick={() => setCompTab("cards")}>🟨 Cards XI</button>
      </div>

      {myEntry
        ? <div className="info-box" style={{marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:13,color:"#7a9a7a"}}>Your {compTab} XI is locked in.</span><button className="btn btn-ghost btn-xs" onClick={() => onNav("xi-builder",{groupId:group.id,type:compTab})}>Edit</button></div>
        : <div className="warn-box" style={{marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:13,color:"#ffd700"}}>You haven't picked a {compTab} XI yet.</span><button className="btn btn-gold btn-xs" onClick={() => onNav("xi-builder",{groupId:group.id,type:compTab})}>Pick XI</button></div>
      }

      {ranked.map((r,i) => {
        const isMe = r.user.id===auth.user.id;
        const rankClass = i===0?"r1":i===1?"r2":i===2?"r3":"";
        return (
          <div key={r.user.id} className={`lb-row ${isMe?"me":""} ${r.bust?"bust":""}`}>
            <div className={`lb-rank ${rankClass}`}>{r.bust?"💥":i+1}</div>
            <div style={{flex:1}}>
              <div className="lb-name">{r.user.username} {isMe&&<span style={{fontSize:10,color:"#ffd700"}}>· YOU</span>}</div>
              {r.entry ? <ProgressBar current={r.total} /> : <div className="lb-meta" style={{marginTop:4}}>No entry yet</div>}
            </div>
            <div style={{textAlign:"right",minWidth:80}}>
              {r.bust
                ? <span className="bust-badge">BUST</span>
                : r.entry
                  ? <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:r.score>=9.5?"#ffd700":r.score>=7?"#00c853":"#7a9a7a"}}>{r.score}<span style={{fontSize:13,color:"#3a5a3a"}}> pts</span></div>
                  : <span style={{color:"#3a5a3a"}}>—</span>
              }
            </div>
          </div>
        );
      })}
      <Footer />
    </div>
  );
};

// ============================================================
// API-FOOTBALL CONFIG
// ============================================================
const AF_KEY = "5ab2d2c108fea228012ad20b0a7e0f0a";
const AF_BASE = "https://v3.football.api-sports.io";
const WC_LEAGUE = 1;
const WC_SEASON = 2026;

// Position groupings for formation slots
const POS_GROUPS = {
  GK: ["Goalkeeper"],
  DEF: ["Defender"],
  MID: ["Midfielder"],
  FWD: ["Attacker"],
};

// Formation slot definitions: [slotId, posGroup, label]
const FORMATIONS = {
  "4-4-2": [
    {id:"gk",group:"GK",label:"GK",row:0},
    {id:"rb",group:"DEF",label:"RB",row:1},{id:"cb1",group:"DEF",label:"CB",row:1},{id:"cb2",group:"DEF",label:"CB",row:1},{id:"lb",group:"DEF",label:"LB",row:1},
    {id:"rm",group:"MID",label:"RM",row:2},{id:"cm1",group:"MID",label:"CM",row:2},{id:"cm2",group:"MID",label:"CM",row:2},{id:"lm",group:"MID",label:"LM",row:2},
    {id:"st1",group:"FWD",label:"ST",row:3},{id:"st2",group:"FWD",label:"ST",row:3},
  ],
  "4-3-3": [
    {id:"gk",group:"GK",label:"GK",row:0},
    {id:"rb",group:"DEF",label:"RB",row:1},{id:"cb1",group:"DEF",label:"CB",row:1},{id:"cb2",group:"DEF",label:"CB",row:1},{id:"lb",group:"DEF",label:"LB",row:1},
    {id:"cm1",group:"MID",label:"CM",row:2},{id:"cm2",group:"MID",label:"CM",row:2},{id:"cm3",group:"MID",label:"CM",row:2},
    {id:"rw",group:"FWD",label:"RW",row:3},{id:"st",group:"FWD",label:"ST",row:3},{id:"lw",group:"FWD",label:"LW",row:3},
  ],
  "4-2-3-1": [
    {id:"gk",group:"GK",label:"GK",row:0},
    {id:"rb",group:"DEF",label:"RB",row:1},{id:"cb1",group:"DEF",label:"CB",row:1},{id:"cb2",group:"DEF",label:"CB",row:1},{id:"lb",group:"DEF",label:"LB",row:1},
    {id:"cdm1",group:"MID",label:"CDM",row:2},{id:"cdm2",group:"MID",label:"CDM",row:2},
    {id:"ram",group:"MID",label:"RAM",row:3},{id:"cam",group:"MID",label:"CAM",row:3},{id:"lam",group:"MID",label:"LAM",row:3},
    {id:"st",group:"FWD",label:"ST",row:4},
  ],
  "3-5-2": [
    {id:"gk",group:"GK",label:"GK",row:0},
    {id:"cb1",group:"DEF",label:"CB",row:1},{id:"cb2",group:"DEF",label:"CB",row:1},{id:"cb3",group:"DEF",label:"CB",row:1},
    {id:"rwb",group:"MID",label:"RWB",row:2},{id:"cm1",group:"MID",label:"CM",row:2},{id:"cm2",group:"MID",label:"CM",row:2},{id:"cm3",group:"MID",label:"CM",row:2},{id:"lwb",group:"MID",label:"LWB",row:2},
    {id:"st1",group:"FWD",label:"ST",row:3},{id:"st2",group:"FWD",label:"ST",row:3},
  ],
  "3-4-3": [
    {id:"gk",group:"GK",label:"GK",row:0},
    {id:"cb1",group:"DEF",label:"CB",row:1},{id:"cb2",group:"DEF",label:"CB",row:1},{id:"cb3",group:"DEF",label:"CB",row:1},
    {id:"rm",group:"MID",label:"RM",row:2},{id:"cm1",group:"MID",label:"CM",row:2},{id:"cm2",group:"MID",label:"CM",row:2},{id:"lm",group:"MID",label:"LM",row:2},
    {id:"rw",group:"FWD",label:"RW",row:3},{id:"st",group:"FWD",label:"ST",row:3},{id:"lw",group:"FWD",label:"LW",row:3},
  ],
  "4-5-1": [
    {id:"gk",group:"GK",label:"GK",row:0},
    {id:"rb",group:"DEF",label:"RB",row:1},{id:"cb1",group:"DEF",label:"CB",row:1},{id:"cb2",group:"DEF",label:"CB",row:1},{id:"lb",group:"DEF",label:"LB",row:1},
    {id:"rm",group:"MID",label:"RM",row:2},{id:"cm1",group:"MID",label:"CM",row:2},{id:"cam",group:"MID",label:"CAM",row:2},{id:"cm2",group:"MID",label:"CM",row:2},{id:"lm",group:"MID",label:"LM",row:2},
    {id:"st",group:"FWD",label:"ST",row:3},
  ],
  "5-3-2": [
    {id:"gk",group:"GK",label:"GK",row:0},
    {id:"rwb",group:"DEF",label:"RWB",row:1},{id:"cb1",group:"DEF",label:"CB",row:1},{id:"cb2",group:"DEF",label:"CB",row:1},{id:"cb3",group:"DEF",label:"CB",row:1},{id:"lwb",group:"DEF",label:"LWB",row:1},
    {id:"cm1",group:"MID",label:"CM",row:2},{id:"cm2",group:"MID",label:"CM",row:2},{id:"cm3",group:"MID",label:"CM",row:2},
    {id:"st1",group:"FWD",label:"ST",row:3},{id:"st2",group:"FWD",label:"ST",row:3},
  ],
  "5-4-1": [
    {id:"gk",group:"GK",label:"GK",row:0},
    {id:"rwb",group:"DEF",label:"RWB",row:1},{id:"cb1",group:"DEF",label:"CB",row:1},{id:"cb2",group:"DEF",label:"CB",row:1},{id:"cb3",group:"DEF",label:"CB",row:1},{id:"lwb",group:"DEF",label:"LWB",row:1},
    {id:"rm",group:"MID",label:"RM",row:2},{id:"cm1",group:"MID",label:"CM",row:2},{id:"cm2",group:"MID",label:"CM",row:2},{id:"lm",group:"MID",label:"LM",row:2},
    {id:"st",group:"FWD",label:"ST",row:3},
  ],
  "4-1-4-1": [
    {id:"gk",group:"GK",label:"GK",row:0},
    {id:"rb",group:"DEF",label:"RB",row:1},{id:"cb1",group:"DEF",label:"CB",row:1},{id:"cb2",group:"DEF",label:"CB",row:1},{id:"lb",group:"DEF",label:"LB",row:1},
    {id:"cdm",group:"MID",label:"CDM",row:2},
    {id:"rm",group:"MID",label:"RM",row:3},{id:"cm1",group:"MID",label:"CM",row:3},{id:"cm2",group:"MID",label:"CM",row:3},{id:"lm",group:"MID",label:"LM",row:3},
    {id:"st",group:"FWD",label:"ST",row:4},
  ],
};

// Cache squads in sessionStorage to save API calls
const getSquads = async () => {
  const cached = sessionStorage.getItem("px_squads_2026");
  const cachedTime = sessionStorage.getItem("px_squads_time");
  if (cached && cachedTime && Date.now() - parseInt(cachedTime) < 3600000) {
    return JSON.parse(cached);
  }
  try {
    // Call our Vercel proxy (avoids CORS issues with football-data.org)
    const r = await fetch("/api/squads");
    if (!r.ok) throw new Error("Squad fetch failed");
    const data = await r.json();
    const teams = data.teams || [];

    const allPlayers = [];
    teams.forEach(team => {
      const squad = team.squad || [];
      squad.forEach(p => {
        // Map football-data.org positions to our format
        const posMap = {
          "Goalkeeper": "GK",
          "Defence": "DEF",
          "Midfield": "MID",
          "Offence": "FWD",
        };
        allPlayers.push({
          id: p.id,
          name: p.name,
          pos: p.position || "MID",
          posGroup: posMap[p.position] || "MID",
          nation: team.name,
          flag: FLAG_MAP[team.name] || "🏳️",
          goals: 0,
          cards: 0,
          nationality: team.shortName || team.name,
        });
      });
    });

    sessionStorage.setItem("px_squads_2026", JSON.stringify(allPlayers));
    sessionStorage.setItem("px_squads_time", Date.now().toString());
    return allPlayers;
  } catch (e) {
    console.error("Squad fetch error:", e);
    return [];
  }
};

// Nation flag emoji lookup
const FLAG_MAP = {
  "France":"🇫🇷","Brazil":"🇧🇷","Argentina":"🇦🇷","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Spain":"🇪🇸",
  "Germany":"🇩🇪","Portugal":"🇵🇹","Netherlands":"🇳🇱","Belgium":"🇧🇪","Italy":"🇮🇹",
  "Uruguay":"🇺🇾","Croatia":"🇭🇷","USA":"🇺🇸","Mexico":"🇲🇽","Canada":"🇨🇦",
  "Morocco":"🇲🇦","Senegal":"🇸🇳","Japan":"🇯🇵","South Korea":"🇰🇷","Australia":"🇦🇺",
  "Saudi Arabia":"🇸🇦","Iran":"🇮🇷","Ecuador":"🇪🇨","Colombia":"🇨🇴","Chile":"🇨🇱",
  "Peru":"🇵🇪","Venezuela":"🇻🇪","Bolivia":"🇧🇴","Paraguay":"🇵🇾","Costa Rica":"🇨🇷",
  "Panama":"🇵🇦","Jamaica":"🇯🇲","Norway":"🇳🇴","Switzerland":"🇨🇭","Denmark":"🇩🇰",
  "Sweden":"🇸🇪","Poland":"🇵🇱","Ukraine":"🇺🇦","Turkey":"🇹🇷","Greece":"🇬🇷",
  "Egypt":"🇪🇬","Nigeria":"🇳🇬","Ghana":"🇬🇭","Cameroon":"🇨🇲","Algeria":"🇩🇿",
  "Tunisia":"🇹🇳","South Africa":"🇿🇦","Qatar":"🇶🇦","Serbia":"🇷🇸","Slovakia":"🇸🇰",
};

// ============================================================
// XI BUILDER — formation-based with real API squads
// ============================================================
const XIBuilder = ({ auth, group, type, onSave, onBack, onToast }) => {
  const [step, setStep] = useState("formation");
  const [formation, setFormation] = useState(null);
  const [slots, setSlots] = useState({});
  const [activeSlot, setActiveSlot] = useState(null);
  const [bonusAnswers, setBonusAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState(null);
  const [loadingEntry, setLoadingEntry] = useState(true);
  const [allPlayers, setAllPlayers] = useState(PLAYERS);
  const [loadingSquads, setLoadingSquads] = useState(false);
  const [search, setSearch] = useState("");
  const [nationFilter, setNationFilter] = useState("ALL");
  const [bonusSearch, setBonusSearch] = useState({});
  const [liveStats, setLiveStats] = useState({});

  const bonusQs = type === "goals" ? GOAL_BONUS_QS : CARD_BONUS_QS;

  // Load existing entry + squads + live stats together
  useEffect(() => {
    const load = async () => {
      try {
        const [rows, players, stats] = await Promise.all([
          sb.select("entries", `?user_id=eq.${auth.user.id}&type=eq.${type}`),
          getSquads(),
          getLiveStats(),
        ]);
        // Merge live stats into players
        const enrichedPlayers = players.map(p => ({
          ...p,
          goals: stats[p.name]?.goals ?? p.goals ?? 0,
          cards: stats[p.name]?.cards ?? p.cards ?? 0,
        }));
        setAllPlayers(enrichedPlayers);
        setLiveStats(stats);
        setLoadingSquads(false);
        if (rows?.length) {
          setExisting(rows[0]);
          setBonusAnswers(rows[0].bonus_answers || {});
          if (rows[0].formation) {
            setFormation(rows[0].formation);
            const savedSlots = rows[0].slots || {};
            const restoredSlots = {};
            Object.entries(savedSlots).forEach(([slotId, playerId]) => {
              const player = enrichedPlayers.find(p => p.id === playerId || p.id === parseInt(playerId));
              if (player) restoredSlots[slotId] = player;
            });
            setSlots(restoredSlots);
            setStep("pick");
          }
        }
      } catch (e) { console.error("Load entry error:", e); }
      setLoadingEntry(false);
    };
    load();
  }, []);

  const formationSlots = formation ? FORMATIONS[formation] : [];
  const selectedPlayers = Object.values(slots).filter(Boolean);
  const allFilled = formationSlots.length > 0 && Object.keys(slots).length === formationSlots.length && formationSlots.every(s => slots[s.id]);
  const total = selectedPlayers.reduce((s, p) => s + (type === "goals" ? (p.goals||0) : (p.cards||0)), 0);
  const { score, bust } = calcScore(total);

  // Get eligible players for active slot
  const getEligible = (slotGroup) => {
    return allPlayers.filter(p => {
      const eligible = p.posGroup === slotGroup;
      const alreadyPicked = Object.values(slots).some(sp => sp && sp.id === p.id);
      const matchSearch = !search || normalize(p.name).includes(normalize(search));
      const matchNation = nationFilter === "ALL" || p.nation === nationFilter;
      return eligible && !alreadyPicked && matchSearch && matchNation;
    });
  };

  const nations = ["ALL", ...Array.from(new Set(allPlayers.map(p => p.nation))).sort()];

  const pickPlayer = (player) => {
    setSlots(prev => ({ ...prev, [activeSlot]: player }));
    setActiveSlot(null);
    setSearch("");
    setNationFilter("ALL");
  };

  const removePlayer = (slotId) => {
    setSlots(prev => { const n = {...prev}; delete n[slotId]; return n; });
  };

  const save = async () => {
    if (!allFilled) return;
    setSaving(true);
    try {
      const xi = selectedPlayers.map(p => p.id);
      const payload = {
        user_id: auth.user.id,
        group_id: group.id,
        type,
        xi,
        xi_names: selectedPlayers.map(p => p.name),
        bonus_answers: bonusAnswers,
        formation,
        slots: Object.fromEntries(Object.entries(slots).map(([k,v]) => [k, v?.id])),
        slot_names: Object.fromEntries(Object.entries(slots).map(([k,v]) => [k, v?.name])),
      };
      if (existing) {
        await sb.update("entries", payload, `?id=eq.${existing.id}`, auth.token);
      } else {
        await sb.insert("entries", payload, auth.token);
      }
      onToast(`${type==="goals"?"⚽ Goals":"🟨 Cards"} XI locked in!`);
      onSave();
    } catch {
      onToast("Failed to save — try again", true);
    }
    setSaving(false);
  };

  if (loadingEntry) return <Spinner full />;

  // ── STEP 1: CHOOSE FORMATION ──
  if (step === "formation") return (
    <div className="page-narrow">
      <button className="btn btn-ghost btn-sm" style={{marginBottom:24}} onClick={onBack}>← Back</button>
      <div className="sh">
        <div className="sh-eyebrow">{type==="goals"?"⚽ Goals XI":"🟨 Cards XI"} · {group.name}</div>
        <h1 className="sh-title">Choose Formation</h1>
        <p className="sh-sub">Pick your tactical setup — you'll fill each slot with a real World Cup player</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        {Object.keys(FORMATIONS).map(f => {
          const fSlots = FORMATIONS[f];
          const rows = [...new Set(fSlots.map(s=>s.row))];
          return (
            <div
              key={f}
              onClick={() => { setFormation(f); setSlots({}); setStep("pick"); }}
              style={{
                background:"#0c210c",border:"1px solid #1a3a1a",borderRadius:10,
                padding:"12px",cursor:"pointer",transition:"all .2s",
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor="#00c853"; }}
              onMouseOut={e => { e.currentTarget.style.borderColor="#1a3a1a"; }}
            >
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:2,color:"#ffd700"}}>{f}</div>
                <div style={{fontSize:10,color:"#7a9a7a"}}>{fSlots.filter(s=>s.group==="DEF").length}-{fSlots.filter(s=>s.group==="MID").length}-{fSlots.filter(s=>s.group==="FWD").length}</div>
              </div>
              {/* Mini pitch preview — GK at top */}
              <div style={{background:"#071a07",borderRadius:6,padding:"8px 6px",border:"1px solid #1a3a1a"}}>
                {rows.map(row => (
                  <div key={row} style={{display:"flex",justifyContent:"center",gap:4,marginBottom:row<rows[rows.length-1]?5:0}}>
                    {fSlots.filter(s=>s.row===row).map(s => (
                      <div key={s.id} style={{
                        width:24,height:24,borderRadius:"50%",
                        background:"#122612",border:"1px solid #2a5a2a",
                        display:"flex",alignItems:"center",justifyContent:"center",
                        fontSize:6,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,
                        color:"#7a9a7a",
                      }}>{s.label}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── STEP 2: PICK PLAYERS FOR EACH SLOT ──
  if (step === "pick") {
    const rows = [...new Set(formationSlots.map(s=>s.row))];
    const activeSlotDef = formationSlots.find(s=>s.id===activeSlot);
    const groupLabel = activeSlotDef?.group === "GK" ? "Goalkeepers" : activeSlotDef?.group === "DEF" ? "Defenders" : activeSlotDef?.group === "MID" ? "Midfielders" : "Forwards";
    const eligiblePlayers = activeSlot ? getEligible(activeSlotDef?.group).slice(0, 50) : [];

    // Shared pitch component used by both layouts
    const PitchView = () => (
      <div>
        <div style={{
          background:"linear-gradient(180deg,#071a07 0%,#0a2a0a 100%)",
          border:"2px solid #1a3a1a",borderRadius:12,padding:"20px 12px",
          position:"relative",minHeight:360,
        }}>
          <div style={{position:"absolute",top:"50%",left:"10%",right:"10%",height:1,background:"rgba(255,255,255,.06)"}} />
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:60,height:60,borderRadius:"50%",border:"1px solid rgba(255,255,255,.06)"}} />
          {rows.map(row => (
            <div key={row} style={{display:"flex",justifyContent:"center",gap:8,marginBottom:16}}>
              {formationSlots.filter(s=>s.row===row).map(slot => {
                const player = slots[slot.id];
                const isActive = activeSlot === slot.id;
                return (
                  <div
                    key={slot.id}
                    style={{textAlign:"center",cursor:"pointer",width:64}}
                    onClick={() => { setActiveSlot(isActive ? null : slot.id); setSearch(""); setNationFilter("ALL"); }}
                  >
                    <div style={{
                      width:52,height:52,borderRadius:"50%",margin:"0 auto 4px",
                      background: player ? "rgba(0,200,83,.15)" : isActive ? "rgba(255,215,0,.15)" : "#122612",
                      border: player ? "2px solid #00c853" : isActive ? "2px solid #ffd700" : "2px dashed #2a5a2a",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      transition:"all .2s",position:"relative",
                    }}
                    onMouseOver={e => { if(player) e.currentTarget.style.borderColor="#ff3d3d"; }}
                    onMouseOut={e => { if(player) e.currentTarget.style.borderColor="#00c853"; }}
                    >
                      {player ? (
                        <>
                          <span style={{fontSize:18}}>{FLAG_MAP[player.nation]||"🏳"}</span>
                          <button
                            onClick={e => { e.stopPropagation(); removePlayer(slot.id); }}
                            style={{position:"absolute",top:-4,right:-4,width:16,height:16,borderRadius:"50%",background:"#ff3d3d",border:"none",color:"#fff",fontSize:9,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:"bold"}}
                          >×</button>
                        </>
                      ) : (
                        <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:10,fontWeight:700,color:isActive?"#ffd700":"#3a5a3a",letterSpacing:1}}>{slot.label}</span>
                      )}
                    </div>
                    <div style={{fontSize:9,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:600,color:player?"#e8f5e9":"#3a5a3a",letterSpacing:0.3,maxWidth:64,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {player ? player.name.split(" ").pop() : slot.label}
                    </div>
                    {player && <div style={{fontSize:9,color:"#7a9a7a"}}>{type==="goals"?`⚽${player.goals||0}`:`🟨${player.cards||0}`}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {selectedPlayers.length > 0 && (
          <div style={{marginTop:10,background:"#0c210c",border:"1px solid #1a3a1a",borderRadius:8,padding:"10px 14px"}}>
            <ProgressBar current={total} />
            <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
              <span style={{fontSize:12,color:"#7a9a7a"}}>{selectedPlayers.length}/11 picked</span>
              <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:bust?"#ff3d3d":score>=9?"#ffd700":"#00c853"}}>{bust?"💥 BUST":`${score} pts`}</span>
            </div>
          </div>
        )}
      </div>
    );

    // Shared player list used by both layouts
    const PlayerList = ({ maxHeight }) => (
      <div>
        <input
          className="form-input"
          style={{marginBottom:8,padding:"10px 12px",fontSize:14}}
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoFocus
        />
        <select className="form-select" style={{marginBottom:10,padding:"8px 10px",fontSize:13}} value={nationFilter} onChange={e => setNationFilter(e.target.value)}>
          {nations.map(n => <option key={n} value={n}>{n==="ALL"?"Nationality":n}</option>)}
        </select>
        <div style={{maxHeight:maxHeight||360,overflowY:"auto",display:"flex",flexDirection:"column",gap:8}}>
          {eligiblePlayers.map(p => (
            <div
              key={p.id}
              onClick={() => pickPlayer(p)}
              style={{background:"#0c210c",border:"1px solid #1a3a1a",borderRadius:10,padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"all .15s"}}
              onMouseOver={e => { e.currentTarget.style.borderColor="#00c853"; e.currentTarget.style.background="#122612"; }}
              onMouseOut={e => { e.currentTarget.style.borderColor="#1a3a1a"; e.currentTarget.style.background="#0c210c"; }}
            >
              <span style={{fontSize:22}}>{FLAG_MAP[p.nation]||"🏳"}</span>
              <div style={{flex:1}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:15}}>{p.name}</div>
                <div style={{fontSize:12,color:"#7a9a7a"}}>{p.nation}</div>
              </div>
              <div style={{fontSize:13,color:"#7a9a7a",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:600}}>
                {type==="goals"?`⚽ ${p.goals||0}`:`🟨 ${p.cards||0}`}
              </div>
            </div>
          ))}
          {eligiblePlayers.length === 0 && (
            <div style={{textAlign:"center",padding:"32px 0",color:"#3a5a3a",fontSize:14}}>No players found</div>
          )}
        </div>
      </div>
    );

    return (
      <div className="page">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setStep("formation"); setSlots({}); }}>← Formation</button>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1,color:"#ffd700"}}>{formation} · {type==="goals"?"⚽ Goals":"🟨 Cards"}</div>
          <button className="btn btn-primary btn-sm" disabled={!allFilled} onClick={() => setStep("bonus")}>Bonuses →</button>
        </div>

        {loadingSquads && (
          <div style={{background:"rgba(255,215,0,.05)",border:"1px solid rgba(255,215,0,.2)",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#ffd700",display:"flex",gap:8,alignItems:"center"}}>
            <Spinner /><span>Loading World Cup squads...</span>
          </div>
        )}

        {/* ── DESKTOP LAYOUT — side by side ── */}
        <div className="xi-desktop-only" style={{display:"grid",gridTemplateColumns:"1fr 270px",gap:20,alignItems:"start"}}>
          <PitchView />
          <div style={{position:"sticky",top:78}}>
            <div className="card">
              {activeSlot ? (
                <>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:12,letterSpacing:1.5,color:"#ffd700",marginBottom:12}}>
                    PICK: {activeSlotDef?.label} · {groupLabel}
                  </div>
                  <PlayerList maxHeight={400} />
                </>
              ) : (
                <div style={{textAlign:"center",padding:"40px 16px",color:"#3a5a3a"}}>
                  <div style={{fontSize:32,marginBottom:8}}>👆</div>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:14,letterSpacing:1}}>
                    {allFilled ? "All slots filled! Hit Bonuses →" : "Tap a slot on the pitch"}
                  </div>
                  {!allFilled && <div style={{marginTop:8,fontSize:12}}>{formationSlots.filter(s=>!slots[s.id]).length} slots remaining</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── MOBILE LAYOUT — full width pitch + bottom drawer ── */}
        <div className="xi-mobile-only">
          <PitchView />

          {!allFilled && !activeSlot && (
            <div style={{textAlign:"center",padding:"16px 0 8px",color:"#3a5a3a",fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,letterSpacing:1}}>
              TAP A SLOT TO PICK A PLAYER · {formationSlots.filter(s=>!slots[s.id]).length} REMAINING
            </div>
          )}
          {allFilled && !activeSlot && (
            <div style={{textAlign:"center",padding:"16px 0 8px",color:"#00c853",fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,letterSpacing:1}}>
              ✓ ALL 11 PICKED · HIT BONUSES →
            </div>
          )}

          {/* Bottom drawer overlay */}
          {activeSlot && (
            <>
              {/* Backdrop */}
              <div
                onClick={() => { setActiveSlot(null); setSearch(""); setNationFilter("ALL"); }}
                style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:200,backdropFilter:"blur(2px)"}}
              />
              {/* Drawer */}
              <div style={{
                position:"fixed",bottom:0,left:0,right:0,zIndex:201,
                background:"#0c210c",
                borderTop:"2px solid #2a5a2a",
                borderRadius:"20px 20px 0 0",
                padding:"0 0 24px",
                maxHeight:"75vh",
                display:"flex",flexDirection:"column",
                animation:"slideDrawer .25s ease",
              }}>
                {/* Drag handle */}
                <div style={{display:"flex",justifyContent:"center",padding:"12px 0 4px"}}>
                  <div style={{width:40,height:4,borderRadius:2,background:"#2a5a2a"}} />
                </div>
                {/* Drawer header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 20px 14px"}}>
                  <div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:1,color:"#ffd700"}}>{activeSlotDef?.label}</div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,color:"#7a9a7a",letterSpacing:1}}>{groupLabel}</div>
                  </div>
                  <button
                    onClick={() => { setActiveSlot(null); setSearch(""); setNationFilter("ALL"); }}
                    style={{background:"#122612",border:"1px solid #1a3a1a",borderRadius:"50%",width:32,height:32,color:"#7a9a7a",fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}
                  >✕</button>
                </div>
                {/* Player list — scrollable */}
                <div style={{flex:1,overflowY:"auto",padding:"0 16px"}}>
                  <input
                    className="form-input"
                    style={{marginBottom:8,padding:"12px 14px",fontSize:15}}
                    placeholder="Search by name..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  <select className="form-select" style={{marginBottom:12,padding:"10px 12px",fontSize:14}} value={nationFilter} onChange={e => setNationFilter(e.target.value)}>
                    {nations.map(n => <option key={n} value={n}>{n==="ALL"?"Nationality":n}</option>)}
                  </select>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {eligiblePlayers.map(p => (
                      <div
                        key={p.id}
                        onClick={() => pickPlayer(p)}
                        style={{background:"#122612",border:"1px solid #1a3a1a",borderRadius:12,padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:12,transition:"all .15s"}}
                      >
                        <span style={{fontSize:24}}>{FLAG_MAP[p.nation]||"🏳"}</span>
                        <div style={{flex:1}}>
                          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:16}}>{p.name}</div>
                          <div style={{fontSize:12,color:"#7a9a7a"}}>{p.nation}</div>
                        </div>
                        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:"#ffd700"}}>
                          {type==="goals"?p.goals||0:p.cards||0}
                        </div>
                      </div>
                    ))}
                    {eligiblePlayers.length === 0 && (
                      <div style={{textAlign:"center",padding:"32px 0",color:"#3a5a3a",fontSize:14}}>No players found</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── STEP 3: BONUS PREDICTIONS ──
  if (step === "bonus") return (
    <div className="page-narrow">
      <button className="btn btn-ghost btn-sm" style={{marginBottom:24}} onClick={() => setStep("pick")}>← Back to XI</button>
      <div className="sh">
        <div className="sh-eyebrow">{type==="goals"?"Goals XI":"Cards XI"} · {group.name}</div>
        <h1 className="sh-title">Bonus Predictions</h1>
        <p className="sh-sub">Up to +4 bonus points · Max score 15 per competition</p>
      </div>
      {bonusQs.map(q => {
        const searchVal = bonusSearch[q.id] || "";
        const isNation = q.type === "nation";
        const suggestions = !isNation && searchVal.length >= 2
          ? allPlayers.filter(p => normalize(p.name).includes(normalize(searchVal))).slice(0, 8)
          : [];
        return (
          <div className="card" style={{marginBottom:12}} key={q.id}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:15,flex:1,marginRight:8}}>{q.label}</div>
              <div style={{background:"rgba(255,215,0,.1)",border:"1px solid rgba(255,215,0,.25)",borderRadius:4,padding:"2px 9px",fontSize:12,color:"#ffd700",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,flexShrink:0}}>+{q.points} pts</div>
            </div>
            {isNation ? (
              // Nation type — show dropdown
              <select
                className="form-select"
                value={bonusAnswers[q.id]||""}
                onChange={e => setBonusAnswers(prev => ({...prev,[q.id]:e.target.value}))}
              >
                <option value="">Select a nation...</option>
                {NATIONS_LIST.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            ) : (
              // Player type — searchable autocomplete
              <div style={{position:"relative"}}>
                <input
                  className="form-input"
                  placeholder="Type player name to search..."
                  value={bonusAnswers[q.id] && !searchVal ? bonusAnswers[q.id] : searchVal}
                  onChange={e => {
                    setBonusSearch(prev => ({...prev,[q.id]:e.target.value}));
                    if (!e.target.value) setBonusAnswers(prev => ({...prev,[q.id]:""}));
                  }}
                  autoComplete="off"
                />
                {suggestions.length > 0 && (
                  <div style={{
                    position:"absolute",top:"100%",left:0,right:0,zIndex:50,
                    background:"#0c210c",border:"1px solid #2a5a2a",borderRadius:6,
                    overflow:"hidden",boxShadow:"0 4px 16px rgba(0,0,0,.5)",
                  }}>
                    {suggestions.map(p => (
                      <div
                        key={p.id}
                        onClick={() => {
                          // Set answer and clear search — closes dropdown
                          setBonusAnswers(prev => ({...prev,[q.id]:p.name}));
                          setBonusSearch(prev => ({...prev,[q.id]:""}));
                        }}
                        style={{
                          padding:"10px 14px",cursor:"pointer",display:"flex",
                          alignItems:"center",gap:10,borderBottom:"1px solid #1a3a1a",
                          transition:"background .15s",
                        }}
                        onMouseOver={e => { e.currentTarget.style.background="#122612"; }}
                        onMouseOut={e => { e.currentTarget.style.background="transparent"; }}
                      >
                        <span>{FLAG_MAP[p.nation]||"🏳"}</span>
                        <div>
                          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:14}}>{p.name}</div>
                          <div style={{fontSize:11,color:"#7a9a7a"}}>{p.nation}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {bonusAnswers[q.id] && !searchVal && (
                  <div style={{marginTop:6,fontSize:12,color:"#00c853",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span>✓ {bonusAnswers[q.id]}</span>
                    <button
                      style={{background:"none",border:"none",color:"#3a5a3a",cursor:"pointer",fontSize:12,fontFamily:"'Barlow Condensed',sans-serif"}}
                      onClick={() => { setBonusAnswers(prev => ({...prev,[q.id]:""})); setBonusSearch(prev => ({...prev,[q.id]:""})); }}
                    >✕ Clear</button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div style={{display:"flex",gap:10,marginTop:22}}>
        <button className="btn btn-primary" style={{flex:1}} onClick={() => setStep("review")}>Review Entry →</button>
        <button className="btn btn-ghost" onClick={() => setStep("review")}>Skip</button>
      </div>
    </div>
  );

  // ── STEP 4: REVIEW & LOCK ──
  return (
    <div className="page-narrow">
      <button className="btn btn-ghost btn-sm" style={{marginBottom:24}} onClick={() => setStep("bonus")}>← Back</button>
      <div className="sh">
        <div className="sh-eyebrow">{group.name} · {formation}</div>
        <h1 className="sh-title">Review & Lock</h1>
        <p className="sh-sub">{type==="goals"?"⚽ Goals XI":"🟨 Cards XI"} · Threshold: <strong style={{color:"#ffd700"}}>11</strong></p>
      </div>
      <div className="card" style={{marginBottom:14}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:11,letterSpacing:2,color:"#3a5a3a",marginBottom:12}}>YOUR {formation} XI</div>
        {/* Show by formation rows */}
        {[...new Set(formationSlots.map(s=>s.row))].map(row => (
          <div key={row} style={{marginBottom:8}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {formationSlots.filter(s=>s.row===row).map(slot => {
                const p = slots[slot.id];
                if (!p) return null;
                return (
                  <div key={slot.id} style={{display:"flex",alignItems:"center",gap:8,background:"#122612",borderRadius:6,padding:"6px 10px",flex:1,minWidth:140}}>
                    <span style={{fontSize:16}}>{FLAG_MAP[p.nation]||"🏳"}</span>
                    <div style={{flex:1}}>
                      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:13}}>{p.name}</div>
                      <div style={{fontSize:10,color:"#7a9a7a"}}>{slot.label} · {p.nation}</div>
                    </div>
                    <div style={{fontSize:11,color:"#7a9a7a"}}>{type==="goals"?`⚽${p.goals||0}`:`🟨${p.cards||0}`}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <hr />
        <ProgressBar current={total} />
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
          <span style={{fontSize:12,color:"#7a9a7a"}}>Score if tournament ended now:</span>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:bust?"#ff3d3d":score>=9.5?"#ffd700":"#00c853"}}>
            {bust?"💥 BUST":`${score} pts`}
          </div>
        </div>
      </div>
      {Object.keys(bonusAnswers).filter(k=>bonusAnswers[k]).length > 0 && (
        <div className="card" style={{marginBottom:14}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:11,letterSpacing:2,color:"#3a5a3a",marginBottom:12}}>BONUS PREDICTIONS</div>
          {bonusQs.filter(q=>bonusAnswers[q.id]).map(q => (
            <div key={q.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #1a3a1a"}}>
              <span style={{fontSize:12,color:"#7a9a7a"}}>{q.label}</span>
              <span style={{fontSize:12,color:"#ffd700",fontWeight:600}}>{bonusAnswers[q.id]}</span>
            </div>
          ))}
        </div>
      )}
      <button className="btn btn-gold" style={{width:"100%",padding:16,fontSize:15,gap:10}} onClick={save} disabled={saving||!allFilled}>
        {saving&&<Spinner/>}🔒 Lock In My XI
      </button>
      <p style={{textAlign:"center",fontSize:11,color:"#3a5a3a",marginTop:8}}>You can update before June 11, 2026 kickoff</p>
    </div>
  );
};

// ============================================================
// GLOBAL LEADERBOARD
// ============================================================
const Leaderboard = ({ auth }) => {
  const [compTab, setCompTab] = useState("goals");
  const [ranked, setRanked] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [ents, stats] = await Promise.all([
          sb.select("entries", `?type=eq.${compTab}&select=*,users(*)`),
          getLiveStats(),
        ]);
        const rows = (ents||[]).map(entry => {
          const {goals,cards} = getEntryTotals(entry, stats);
          const total = compTab==="goals" ? goals : cards;
          const {score,bust} = calcScore(total);
          return {entry,user:entry.users,total,score,bust};
        }).sort((a,b) => {
          if (a.bust&&!b.bust) return 1;
          if (!a.bust&&b.bust) return -1;
          return b.score-a.score;
        });
        setRanked(rows);
      } catch {}
      setLoading(false);
    };
    load();
  }, [compTab]);

  return (
    <div className="page">
      <div className="sh">
        <div className="sh-eyebrow">All groups · All players</div>
        <h1 className="sh-title">Global Leaderboard</h1>
        <p className="sh-sub">Ranked across all groups · Threshold: <strong style={{color:"#ffd700"}}>XI (11)</strong></p>
      </div>
      <div className="stat-row">
        <div className="stat-card"><div className="stat-label">Total Players</div><div className="stat-val c-gold">{ranked.length}</div></div>
        <div className="stat-card"><div className="stat-label">Alive</div><div className="stat-val c-green">{ranked.filter(r=>!r.bust).length}</div></div>
        <div className="stat-card"><div className="stat-label">Busted</div><div className="stat-val c-red">{ranked.filter(r=>r.bust).length}</div></div>
        <div className="stat-card"><div className="stat-label">Top Score</div><div className="stat-val c-gold">{ranked.filter(r=>!r.bust).length ? Math.max(...ranked.filter(r=>!r.bust).map(r=>r.score)) : "—"}</div></div>
      </div>
      <div className="tabs">
        <button className={`tab-btn ${compTab==="goals"?"active":""}`} onClick={() => setCompTab("goals")}>⚽ Goals XI</button>
        <button className={`tab-btn ${compTab==="cards"?"active":""}`} onClick={() => setCompTab("cards")}>🟨 Cards XI</button>
      </div>
      {loading ? <Spinner full /> : ranked.length===0 ? (
        <div className="empty-state"><div className="empty-icon">🏆</div><div className="empty-text">No entries yet — be the first!</div></div>
      ) : ranked.map((r,i) => {
        const isMe = r.user?.id===auth.user.id;
        const rankClass = i===0?"r1":i===1?"r2":i===2?"r3":"";
        return (
          <div key={r.entry.id} className={`lb-row ${isMe?"me":""} ${r.bust?"bust":""}`}>
            <div className={`lb-rank ${rankClass}`}>{r.bust?"💥":i+1}</div>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span className="lb-name">{r.user?.username||"Unknown"}</span>
                {isMe&&<span style={{fontSize:10,color:"#ffd700",fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:1}}>YOU</span>}
              </div>
              <div className="lb-meta">{r.total} / {THRESHOLD}</div>
            </div>
            <div style={{textAlign:"right"}}>
              {r.bust
                ? <span className="bust-badge">BUST</span>
                : <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,color:r.score>=9.5?"#ffd700":r.score>=7?"#00c853":"#7a9a7a"}}>{r.score}<span style={{fontSize:13,color:"#3a5a3a"}}> pts</span></div>
              }
            </div>
          </div>
        );
      })}
      <Footer />
    </div>
  );
};

// ============================================================
// LIVE FEED — powered by football-data.org
// ============================================================
// ============================================================
// ADMIN PANEL — only visible to Muntasir
// ============================================================
const ADMIN_USER_ID = "25de76c6-37a9-4877-896e-1287e8584b90";

const AdminPanel = ({ auth, onToast }) => {
  // Cards entry
  const [cardPlayer, setCardPlayer] = useState("");
  const [cardType, setCardType] = useState("yellow");
  const [cardSearch, setCardSearch] = useState("");
  const [allPlayers, setAllPlayers] = useState([]);
  const [cardLog, setCardLog] = useState([]);
  const [savingCard, setSavingCard] = useState(false);

  // Tournament results
  const [results, setResults] = useState({});
  const [savingResults, setSavingResults] = useState(false);
  const [existingResults, setExistingResults] = useState(null);

  // Picks lock
  const [picksLocked, setPicksLocked] = useState(false);
  const [savingLock, setSavingLock] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [players, cards, res, settings] = await Promise.all([
          getSquads(),
          sb.select("card_events", "?order=created_at.desc"),
          sb.select("tournament_results", ""),
          sb.select("settings", "?key=eq.picks_locked"),
        ]);
        setAllPlayers(players);
        setCardLog(cards || []);
        if (res?.[0]) { setExistingResults(res[0]); setResults(res[0]); }
        if (settings?.[0]) setPicksLocked(settings[0].value === "true");
      } catch (e) { console.error(e); }
    };
    load();
  }, []);

  const playerSuggestions = cardSearch.length >= 2
    ? allPlayers.filter(p => normalize(p.name).includes(normalize(cardSearch))).slice(0, 6)
    : [];

  const addCard = async () => {
    if (!cardPlayer) return;
    setSavingCard(true);
    try {
      await sb.insert("card_events", {
        player_name: cardPlayer,
        card_type: cardType,
        points: cardType === "red" ? 2 : 1,
      }, auth.token);
      setCardLog(prev => [{ player_name: cardPlayer, card_type: cardType, points: cardType==="red"?2:1, created_at: new Date().toISOString() }, ...prev]);
      setCardPlayer("");
      setCardSearch("");
      onToast(`${cardType === "red" ? "🟥" : "🟨"} ${cardPlayer} card added!`);
    } catch { onToast("Failed to add card", true); }
    setSavingCard(false);
  };

  const removeCard = async (id) => {
    try {
      await sb.delete("card_events", `?id=eq.${id}`, auth.token);
      setCardLog(prev => prev.filter(c => c.id !== id));
      onToast("Card removed");
    } catch { onToast("Failed to remove", true); }
  };

  const saveResults = async () => {
    setSavingResults(true);
    try {
      const payload = { ...results, updated_at: new Date().toISOString() };
      if (existingResults) {
        await sb.update("tournament_results", payload, `?id=eq.${existingResults.id}`, auth.token);
      } else {
        await sb.insert("tournament_results", payload, auth.token);
      }
      onToast("✅ Results saved!");
      setExistingResults(payload);
    } catch { onToast("Failed to save results", true); }
    setSavingResults(false);
  };

  const toggleLock = async () => {
    setSavingLock(true);
    try {
      const newVal = !picksLocked;
      await sb.update("settings", { value: String(newVal), updated_at: new Date().toISOString() }, "?key=eq.picks_locked", auth.token);
      setPicksLocked(newVal);
      onToast(newVal ? "🔒 Picks locked!" : "🔓 Picks unlocked!");
    } catch { onToast("Failed to toggle lock", true); }
    setSavingLock(false);
  };

  const RESULT_FIELDS = [
    {id:"winners",icon:"🏆",label:"Winners",type:"nation"},
    {id:"runners_up",icon:"🥈",label:"Runners-up",type:"nation"},
    {id:"top_scorer",icon:"⚽",label:"Top Scorer",type:"player"},
    {id:"most_assists",icon:"🎯",label:"Most Assists",type:"player"},
    {id:"golden_ball",icon:"🌟",label:"Golden Ball",type:"player"},
    {id:"best_young_player",icon:"👶",label:"Best Young Player",type:"player"},
    {id:"golden_glove",icon:"🧤",label:"Golden Glove",type:"player"},
  ];

  return (
    <div className="page-narrow">
      <div className="sh">
        <div className="sh-eyebrow">Admin Only</div>
        <h1 className="sh-title">⚙️ Admin Panel</h1>
        <p className="sh-sub">Cards · Results · Pick Lock</p>
      </div>

      {/* ── PICKS LOCK ── */}
      <div className="card" style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:16,marginBottom:4}}>
              {picksLocked ? "🔒 Picks are LOCKED" : "🔓 Picks are OPEN"}
            </div>
            <div style={{fontSize:12,color:"#7a9a7a"}}>
              {picksLocked ? "Users cannot edit their XI or predictions" : "Users can still edit their XI and predictions"}
            </div>
          </div>
          <button
            className={picksLocked ? "btn btn-ghost" : "btn btn-gold"}
            onClick={toggleLock}
            disabled={savingLock}
            style={{flexShrink:0}}
          >
            {savingLock ? <Spinner /> : picksLocked ? "Unlock Picks" : "Lock Picks"}
          </button>
        </div>
      </div>

      {/* ── CARD ENTRY ── */}
      <div className="card" style={{marginBottom:20}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:16,letterSpacing:1,marginBottom:16}}>
          🟨 Add Card Event
        </div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <button
            className={`btn ${cardType==="yellow"?"btn-gold":"btn-ghost"}`}
            style={{flex:1,fontSize:13}}
            onClick={() => setCardType("yellow")}
          >🟨 Yellow (+1)</button>
          <button
            className={`btn ${cardType==="red"?"btn-primary":"btn-ghost"}`}
            style={{flex:1,fontSize:13,background:cardType==="red"?"#ff3d3d":undefined,color:cardType==="red"?"#fff":undefined}}
            onClick={() => setCardType("red")}
          >🟥 Red (+2)</button>
        </div>

        <div style={{position:"relative",marginBottom:10}}>
          <input
            className="form-input"
            placeholder="Search player name..."
            value={cardPlayer || cardSearch}
            onChange={e => {
              setCardSearch(e.target.value);
              setCardPlayer("");
            }}
            autoComplete="off"
          />
          {playerSuggestions.length > 0 && !cardPlayer && (
            <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,background:"#0c210c",border:"1px solid #2a5a2a",borderRadius:6,overflow:"hidden",boxShadow:"0 4px 16px rgba(0,0,0,.5)"}}>
              {playerSuggestions.map(p => (
                <div
                  key={p.id}
                  onClick={() => { setCardPlayer(p.name); setCardSearch(""); }}
                  style={{padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #1a3a1a"}}
                  onMouseOver={e => { e.currentTarget.style.background="#122612"; }}
                  onMouseOut={e => { e.currentTarget.style.background="transparent"; }}
                >
                  <span>{FLAG_MAP[p.nation]||"🏳"}</span>
                  <div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:14}}>{p.name}</div>
                    <div style={{fontSize:11,color:"#7a9a7a"}}>{p.nation}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {cardPlayer && <div style={{marginTop:5,fontSize:12,color:"#00c853"}}>✓ {cardPlayer}</div>}
        </div>

        <button className="btn btn-primary" style={{width:"100%"}} onClick={addCard} disabled={savingCard||!cardPlayer}>
          {savingCard ? <Spinner /> : `Add ${cardType === "red" ? "🟥 Red" : "🟨 Yellow"} Card`}
        </button>

        {/* Card log */}
        {cardLog.length > 0 && (
          <div style={{marginTop:16}}>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:11,letterSpacing:2,color:"#3a5a3a",marginBottom:8}}>CARD LOG</div>
            <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:240,overflowY:"auto"}}>
              {cardLog.map((c,i) => (
                <div key={c.id||i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#122612",borderRadius:6,padding:"8px 12px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span>{c.card_type==="red"?"🟥":"🟨"}</span>
                    <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:14}}>{c.player_name}</span>
                    <span style={{fontSize:11,color:"#ffd700"}}>+{c.points}pt</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:11,color:"#3a5a3a"}}>{new Date(c.created_at).toLocaleDateString()}</span>
                    {c.id && <button onClick={() => removeCard(c.id)} style={{background:"none",border:"none",color:"#ff3d3d",cursor:"pointer",fontSize:14}}>×</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── TOURNAMENT RESULTS ── */}
      <div className="card" style={{marginBottom:20}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:16,letterSpacing:1,marginBottom:16}}>
          🏆 Official Tournament Results
        </div>
        <p style={{fontSize:12,color:"#7a9a7a",marginBottom:16}}>Enter these after each award is officially announced — triggers predictions scoring automatically.</p>
        {RESULT_FIELDS.map(f => (
          <div key={f.id} style={{marginBottom:10}}>
            <div style={{fontSize:12,color:"#7a9a7a",marginBottom:4,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:600}}>{f.icon} {f.label}</div>
            <input
              className="form-input"
              placeholder={f.type==="nation"?"Nation name...":"Player name..."}
              value={results[f.id]||""}
              onChange={e => setResults(prev => ({...prev,[f.id]:e.target.value}))}
            />
          </div>
        ))}
        <button className="btn btn-gold" style={{width:"100%",marginTop:8}} onClick={saveResults} disabled={savingResults}>
          {savingResults ? <Spinner /> : "💾 Save Results"}
        </button>
      </div>
      <Footer />
    </div>
  );
};
  <div className="page">
    <div className="sh">
      <div className="sh-eyebrow">Real-time updates</div>
      <h1 className="sh-title">Live Feed</h1>
      <p className="sh-sub">Goals, cards & match events affecting your XI</p>
    </div>

    {/* Pre-tournament holding state */}
    <div style={{
      background:"#0c210c",border:"1px solid #1a3a1a",borderRadius:16,
      padding:"60px 40px",textAlign:"center",marginBottom:20,
      position:"relative",overflow:"hidden",
    }}>
      {/* Subtle background pitch */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none",opacity:.4,
        background:"repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,.015) 39px,rgba(255,255,255,.015) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,.015) 39px,rgba(255,255,255,.015) 40px)"
      }} />
      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:120,height:120,borderRadius:"50%",border:"1px solid rgba(255,255,255,.04)",pointerEvents:"none"}} />

      <div style={{fontSize:56,marginBottom:16}}>📡</div>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,letterSpacing:2,marginBottom:8}}>
        Live Feed Starts June 11
      </div>
      <p style={{color:"#7a9a7a",fontSize:15,lineHeight:1.7,maxWidth:440,margin:"0 auto 24px"}}>
        Once the tournament kicks off, this page will show real-time goals, cards, and match events — updating every 60 seconds and highlighting which affect your XI.
      </p>

      {/* Countdown-style info */}
      <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
        {[
          {icon:"⚽",label:"Goals scored"},
          {icon:"🟨",label:"Cards issued"},
          {icon:"💥",label:"Bust alerts"},
          {icon:"🏆",label:"Score updates"},
        ].map(item => (
          <div key={item.label} style={{
            background:"#122612",border:"1px solid #1a3a1a",borderRadius:8,
            padding:"10px 16px",display:"flex",alignItems:"center",gap:8,
          }}>
            <span style={{fontSize:18}}>{item.icon}</span>
            <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:13,fontWeight:700,color:"#7a9a7a",letterSpacing:.5}}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>

    {/* API Status box */}
    <div className="info-box">
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:11,letterSpacing:2,color:"#1e90ff",marginBottom:6}}>📡 API STATUS</div>
      <p style={{fontSize:13,color:"#7a9a7a",lineHeight:1.6}}>
        Connected to <strong style={{color:"#e8f5e9"}}>football-data.org</strong>. World Cup data activates from June 11, 2026. Live scores will refresh every 60 seconds automatically during active matches.
      </p>
    </div>
    <Footer />
  </div>
);

// ============================================================
// XI BUILDER LOADER — works with or without a group
// ============================================================
const XIBuilderLoader = ({ auth, groupId, type, onBack, onSave, onToast }) => {
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(!!groupId);

  useEffect(() => {
    if (!groupId) { setLoading(false); return; }
    sb.select("groups", `?id=eq.${groupId}`)
      .then(rows => setGroup(rows?.[0] || null))
      .catch(() => onToast("Failed to load group", true))
      .finally(() => setLoading(false));
  }, [groupId]);

  if (loading) return <Spinner full />;

  // No group needed — pass a dummy group object
  const effectiveGroup = group || { id: null, name: "Global Entry" };
  return <XIBuilder auth={auth} group={effectiveGroup} type={type} onBack={onBack} onSave={onSave} onToast={onToast} />;
};

// ============================================================
// PREDICTIONS PAGE
// ============================================================
const NATIONS_LIST = [
  "Argentina","Australia","Belgium","Bolivia","Brazil","Canada","Cameroon",
  "Chile","Colombia","Costa Rica","Croatia","Curaçao","Denmark","Ecuador",
  "Egypt","England","France","Germany","Ghana","Greece","Honduras","Iran",
  "Iraq","Jamaica","Japan","Jordan","Kenya","Mexico","Morocco","Netherlands",
  "New Zealand","Nigeria","Norway","Panama","Paraguay","Peru","Poland",
  "Portugal","Saudi Arabia","Senegal","Serbia","Slovakia","Slovenia",
  "South Korea","Spain","Switzerland","Turkey","Ukraine","Uruguay","USA","Uzbekistan",
];

const PRED_FIELDS = [
  {id:"winners",icon:"🏆",label:"Winners",type:"nation",points:10},
  {id:"runners_up",icon:"🥈",label:"Runners-up",type:"nation",points:6},
  {id:"top_scorer",icon:"⚽",label:"Top Scorer",type:"player",points:8},
  {id:"most_assists",icon:"🎯",label:"Most Assists",type:"player",points:6},
  {id:"golden_ball",icon:"🌟",label:"Golden Ball",type:"player",points:6},
  {id:"best_young_player",icon:"👶",label:"Best Young Player",type:"player",points:5},
  {id:"golden_glove",icon:"🧤",label:"Golden Glove (GK)",type:"player",points:5},
  {id:"flop",icon:"📉",label:"Flop of Tournament",type:"player",points:4},
  {id:"disappointing_nation",icon:"😮",label:"Most Disappointing Nation",type:"nation",points:4},
  {id:"dark_horse",icon:"🔥",label:"Dark Horse",type:"nation",points:6},
];

const PredictionsPage = ({ auth, onToast }) => {
  const [form, setForm] = useState({});
  const [searches, setSearches] = useState({});
  const [allPlayers, setAllPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [preds, players] = await Promise.all([
          sb.select("predictions", `?user_id=eq.${auth.user.id}`),
          getSquads(),
        ]);
        if (preds?.[0]) { setExisting(preds[0]); setForm(preds[0]); }
        setAllPlayers(players);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const getPlayerSuggestions = (search, field) => {
    if (!search || search.length < 2) return [];
    // For golden glove only show GKs
    const filtered = field.id === "golden_glove"
      ? allPlayers.filter(p => p.posGroup === "GK")
      : allPlayers;
    return filtered.filter(p => normalize(p.name).includes(normalize(search))).slice(0, 6);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = { user_id: auth.user.id, ...form, updated_at: new Date().toISOString() };
      if (existing) {
        await sb.update("predictions", payload, `?user_id=eq.${auth.user.id}`, auth.token);
      } else {
        await sb.insert("predictions", payload, auth.token);
      }
      onToast("Predictions saved!");
      setExisting(payload);
    } catch { onToast("Failed to save — try again", true); }
    setSaving(false);
  };

  const answered = PRED_FIELDS.filter(f => form[f.id]).length;
  const maxPts = PRED_FIELDS.reduce((s,f) => s+f.points, 0);

  if (loading) return <Spinner full />;

  return (
    <div className="page-narrow">
      <div className="sh">
        <div className="sh-eyebrow">World Cup 2026</div>
        <h1 className="sh-title">My Predictions</h1>
        <p className="sh-sub">{answered} / 10 answered · Up to <strong style={{color:"#ffd700"}}>{maxPts} pts</strong> · Locks June 11</p>
      </div>

      <div className="warn-box" style={{marginBottom:20}}>
        <div style={{fontSize:13,color:"#ffd700",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,letterSpacing:1,marginBottom:4}}>🗳️ COMMUNITY VOTE AWARDS</div>
        <p style={{fontSize:12,color:"#7a9a7a",lineHeight:1.6}}>
          Flop, Disappointing Nation and Dark Horse are decided by community vote from the semi-finals onwards.
          Your prediction scores points if it matches the community vote winner.
        </p>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {PRED_FIELDS.map(field => {
          const val = form[field.id] || "";
          const search = searches[field.id] || "";
          const suggestions = field.type === "player"
            ? getPlayerSuggestions(search || val, field)
            : [];
          const isCommunity = ["flop","disappointing_nation","dark_horse"].includes(field.id);

          return (
            <div className="card" key={field.id}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:20}}>{field.icon}</span>
                  <div>
                    <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:15}}>{field.label}</div>
                    {isCommunity && <div style={{fontSize:10,color:"#7a9a7a",fontFamily:"'Barlow Condensed',sans-serif",letterSpacing:1}}>COMMUNITY VOTE</div>}
                  </div>
                </div>
                <div style={{background:"rgba(255,215,0,.1)",border:"1px solid rgba(255,215,0,.25)",borderRadius:4,padding:"2px 9px",fontSize:12,color:"#ffd700",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700}}>
                  +{field.points} pts
                </div>
              </div>

              {field.type === "nation" ? (
                <select
                  className="form-select"
                  value={val}
                  onChange={e => setForm({...form,[field.id]:e.target.value})}
                >
                  <option value="">Select a nation...</option>
                  {NATIONS_LIST.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              ) : (
                <div style={{position:"relative"}}>
                  <input
                    className="form-input"
                    placeholder="Type player name..."
                    value={val}
                    onChange={e => {
                      setForm({...form,[field.id]:e.target.value});
                      setSearches({...searches,[field.id]:e.target.value});
                    }}
                    autoComplete="off"
                  />
                  {suggestions.length > 0 && search.length >= 2 && (
                    <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,background:"#0c210c",border:"1px solid #2a5a2a",borderRadius:6,overflow:"hidden",boxShadow:"0 4px 16px rgba(0,0,0,.5)"}}>
                      {suggestions.map(p => (
                        <div
                          key={p.id}
                          onClick={() => {
                            setForm({...form,[field.id]:p.name});
                            setSearches({...searches,[field.id]:""});
                          }}
                          style={{padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,borderBottom:"1px solid #1a3a1a",transition:"background .15s"}}
                          onMouseOver={e => { e.currentTarget.style.background="#122612"; }}
                          onMouseOut={e => { e.currentTarget.style.background="transparent"; }}
                        >
                          <span>{FLAG_MAP[p.nation]||"🏳️"}</span>
                          <div>
                            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:14}}>{p.name}</div>
                            <div style={{fontSize:11,color:"#7a9a7a"}}>{p.nation}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {val && <div style={{marginTop:5,fontSize:12,color:"#00c853"}}>✓ {val}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        className="btn btn-gold"
        style={{width:"100%",padding:16,fontSize:15,gap:10,marginTop:20}}
        onClick={save}
        disabled={saving}
      >
        {saving && <Spinner />}
        💾 Save Predictions
      </button>
      <p style={{textAlign:"center",fontSize:11,color:"#3a5a3a",marginTop:8}}>You can update until June 11, 2026 kickoff</p>
      <Footer />
    </div>
  );
};

// ============================================================
// APP SHELL
// ============================================================
export default function App() {
  const [auth, setAuth] = useState(null);
  const [page, setPage] = useState("landing");
  const [pageParams, setPageParams] = useState({});
  const [toast, setToast] = useState(null);
  const [booting, setBooting] = useState(true);

  // Restore session on load + handle confirmation email token in URL
  useEffect(() => {
    const boot = async () => {
      // Check for Supabase auth token in URL hash (from confirmation email click)
      const hash = window.location.hash;
      if (hash && hash.includes("access_token")) {
        const params = new URLSearchParams(hash.replace("#", ""));
        const accessToken = params.get("access_token");
        if (accessToken) {
          try {
            const u = await sb.auth.getUser(accessToken);
            if (u?.id) {
              const rows = await sb.select("users", `?id=eq.${u.id}`);
              if (rows?.[0]) {
                session.set({ token: accessToken });
                setAuth({ token: accessToken, user: rows[0] });
                setPage("dashboard");
                // Clean the URL
                window.history.replaceState(null, "", window.location.pathname);
                setBooting(false);
                return;
              }
            }
          } catch {}
        }
      }

      // Otherwise restore existing session
      const stored = session.get();
      if (stored?.token) {
        sb.auth.getUser(stored.token).then(u => {
          if (u?.id) {
            sb.select("users", `?id=eq.${u.id}`).then(rows => {
              if (rows?.[0]) {
                setAuth({ token: stored.token, user: rows[0] });
                setPage("dashboard");
              }
            });
          }
        }).finally(() => setBooting(false));
      } else {
        setBooting(false);
      }
    };
    boot();
  }, []);

  const nav = useCallback((p, params={}) => { setPage(p); setPageParams(params); }, []);
  const onToast = useCallback((msg, isError=false) => setToast({msg,isError}), []);

  const handleAuth = (authData) => {
    setAuth(authData);
    session.set({ token: authData.token });
    nav("dashboard");
  };

  const handleSignOut = async () => {
    if (auth?.token) await sb.auth.signOut(auth.token).catch(()=>{});
    session.clear();
    setAuth(null);
    nav("landing");
  };

  const navItems = [
    {id:"dashboard",label:"Dashboard"},
    {id:"predictions",label:"Predictions"},
    {id:"groups",label:"Groups"},
    {id:"leaderboard",label:"Leaderboard"},
    {id:"feed",label:"Live Feed"},
    ...(auth?.user?.id === ADMIN_USER_ID ? [{id:"admin",label:"⚙️ Admin"}] : []),
  ];

  const renderPage = () => {
    if (!auth && !["landing","auth"].includes(page)) return <AuthPage onAuth={handleAuth} />;
    switch (page) {
      case "landing": return <LandingPage onNav={nav} />;
      case "auth": return <AuthPage onAuth={handleAuth} initialMode={pageParams.mode||"login"} />;
      case "dashboard": return <Dashboard auth={auth} onNav={nav} onToast={onToast} />;
      case "predictions": return <PredictionsPage auth={auth} onToast={onToast} />;
      case "groups": return <GroupsPage auth={auth} initialModal={pageParams.modal} onToast={onToast} onNav={nav} />;
      case "group-detail": return <GroupDetail auth={auth} groupId={pageParams.groupId} onNav={nav} onToast={onToast} />;
      case "xi-builder":
        return <XIBuilderLoader
          auth={auth}
          groupId={pageParams.groupId||null}
          type={pageParams.type||"goals"}
          onBack={() => pageParams.groupId ? nav("group-detail",{groupId:pageParams.groupId}) : nav("dashboard")}
          onSave={() => pageParams.groupId ? nav("group-detail",{groupId:pageParams.groupId}) : nav("dashboard")}
          onToast={onToast}
        />;
      case "leaderboard": return <Leaderboard auth={auth} />;
      case "feed": return <LiveFeed />;
      case "admin": return auth?.user?.id === ADMIN_USER_ID ? <AdminPanel auth={auth} onToast={onToast} /> : <Dashboard auth={auth} onNav={nav} onToast={onToast} />;
      default: return <Dashboard auth={auth} onNav={nav} onToast={onToast} />;
    }
  };

  if (booting) return (
    <>
      <style>{css}</style>
      <div className="loading-full" style={{minHeight:"100vh"}}><div className="spinner" style={{width:40,height:40,borderWidth:3}} /><span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:3,color:"#00c853"}}>PREDIXION</span></div>
    </>
  );

  return (
    <>
      <style>{css}</style>
      <div>
        <nav className="nav">
          <div className="nav-logo" onClick={() => nav(auth?"dashboard":"landing")}><Logo size={28} /></div>
          {auth && <div className="nav-links">{navItems.map(l => <button key={l.id} className={`nav-btn ${page===l.id?"active":""}`} onClick={() => nav(l.id)}>{l.label}</button>)}</div>}
          {auth ? (
            <div className="nav-user">
              <div className="avatar">{auth.user.username?.[0]?.toUpperCase()||"?"}</div>
              <button className="sign-out-btn" onClick={handleSignOut}>Out</button>
            </div>
          ) : (
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-ghost btn-sm" onClick={() => nav("auth",{mode:"login"})}>Sign In</button>
              <button className="btn btn-primary btn-sm" onClick={() => nav("auth",{mode:"register"})}>Register</button>
            </div>
          )}
        </nav>
        {renderPage()}
        {toast && <Toast msg={toast.msg} isError={toast.isError} onClose={() => setToast(null)} />}
      </div>
    </>
  );
}
