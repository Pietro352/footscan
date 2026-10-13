// Scarica le partite da ESPN (API pubblica, senza chiave) e le salva in data/matches.json.
// Il sito legge i dati live direttamente dal browser: questo file è solo il "piano B"
// che si usa se ESPN non fosse raggiungibile dal browser.
import { writeFile, readFile } from 'node:fs/promises';

const LEAGUES = [
  { slug: 'fifa.world', code: 'WC', name: 'Mondiali' },
  { slug: 'uefa.euro', code: 'EC', name: 'Europei' },
  { slug: 'uefa.champions', code: 'CL', name: 'Champions League' },
  { slug: 'uefa.europa', code: 'EL', name: 'Europa League' },
  { slug: 'uefa.europa.conf', code: 'ECL', name: 'Conference League' },
  { slug: 'ita.1', code: 'SA', name: 'Serie A' },
  { slug: 'eng.1', code: 'PL', name: 'Premier League' },
  { slug: 'esp.1', code: 'PD', name: 'La Liga' },
  { slug: 'ger.1', code: 'BL1', name: 'Bundesliga' },
  { slug: 'fra.1', code: 'FL1', name: 'Ligue 1' },
  { slug: 'eng.2', code: 'ELC', name: 'Championship' },
  { slug: 'ned.1', code: 'DED', name: 'Eredivisie' },
  { slug: 'por.1', code: 'PPL', name: 'Primeira Liga' },
  { slug: 'bra.1', code: 'BSA', name: 'Brasile Serie A' }
];

const DAYS_BACK = 3;
const DAYS_AHEAD = 6;

const ymd = days => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};
const from = ymd(-DAYS_BACK);
const to = ymd(DAYS_AHEAD);

const num = v => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};

function mapStatus(type = {}) {
  const name = String(type.name || '').toUpperCase();
  if (name.includes('POSTPONED')) return 'POSTPONED';
  if (name.includes('CANCEL')) return 'CANCELLED';
  if (name.includes('SUSPENDED') || name.includes('ABANDONED')) return 'SUSPENDED';
  if (name.includes('HALFTIME')) return 'PAUSED';
  if (type.state === 'in') return 'IN_PLAY';
  if (type.state === 'post') return 'FINISHED';
  return 'SCHEDULED';
}

function team(c) {
  const t = c.team || {};
  const id = String(t.id ?? '');
  return {
    id,
    name: t.displayName || t.shortDisplayName || t.name || 'Squadra',
    logo: t.logo || (id ? `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png` : '')
  };
}

function normalize(ev, league) {
  const comp = ev.competitions?.[0];
  const home = comp?.competitors?.find(c => c.homeAway === 'home');
  const away = comp?.competitors?.find(c => c.homeAway === 'away');
  if (!home || !away || !ev.date) return null;
  const st = ev.status || comp.status || {};
  const status = mapStatus(st.type);
  const started = status !== 'SCHEDULED' && status !== 'POSTPONED' && status !== 'CANCELLED';
  return {
    id: String(ev.id),
    utcDate: new Date(ev.date).toISOString(),
    status,
    clock: st.type?.state === 'in' ? (st.displayClock || '') : '',
    competition: { code: league.code, name: league.name },
    homeTeam: team(home),
    awayTeam: team(away),
    score: { fullTime: { home: started ? num(home.score) : null, away: started ? num(away.score) : null } }
  };
}

const previous = JSON.parse(await readFile('data/matches.json', 'utf8').catch(() => 'null') || 'null');
const oldMatches = Array.isArray(previous?.matches) ? previous.matches : [];

const byId = new Map();
let failed = 0;

for (const league of LEAGUES) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.slug}/scoreboard?dates=${from}-${to}&limit=400`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    for (const ev of payload.events || []) {
      const m = normalize(ev, league);
      if (m) byId.set(m.id, m);
    }
  } catch (err) {
    failed++;
    console.error(`${league.name}: ${err.message} (tengo i dati precedenti)`);
    oldMatches.filter(m => m.competition?.code === league.code).forEach(m => byId.set(m.id, m));
  }
}

if (failed === LEAGUES.length) {
  console.error('ESPN non raggiungibile: lascio il file com\'è.');
  process.exit(1);
}

const matches = [...byId.values()].sort((a, b) => a.utcDate.localeCompare(b.utcDate) || a.id.localeCompare(b.id));
const iso = s => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
const output = JSON.stringify({ from: iso(from), to: iso(to), matches }) + '\n';

const prevText = await readFile('data/matches.json', 'utf8').catch(() => '');
if (prevText !== output) await writeFile('data/matches.json', output);

console.log(`${matches.length} partite dal ${iso(from)} al ${iso(to)} (${failed} competizioni non riuscite).`);
