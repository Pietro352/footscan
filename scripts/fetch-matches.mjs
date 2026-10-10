// Scarica le partite da football-data.org e le salva in data/matches.json.
// Una sola richiesta per esecuzione (il piano gratuito ne permette 10 al minuto).
import { writeFile, readFile } from 'node:fs/promises';

const apiKey = process.env.FOOTBALL_DATA_API_KEY;
if (!apiKey) {
  console.error('Manca il secret FOOTBALL_DATA_API_KEY.');
  process.exit(1);
}

const DAYS_BACK = 3;
const DAYS_AHEAD = 6; // in totale 9 giorni: il piano gratuito accetta intervalli brevi (max 10)

const iso = date => date.toISOString().slice(0, 10);
const shift = days => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

const from = iso(shift(-DAYS_BACK));
const to = iso(shift(DAYS_AHEAD));

const url = new URL('https://api.football-data.org/v4/matches');
url.searchParams.set('dateFrom', from);
url.searchParams.set('dateTo', to);

const response = await fetch(url, { headers: { 'X-Auth-Token': apiKey } });
const payload = await response.json().catch(() => null);

if (!response.ok) {
  // Esce con errore e lascia il file precedente: il sito continua a mostrare gli ultimi dati.
  console.error(`football-data.org ha risposto ${response.status}: ${payload?.message || 'errore sconosciuto'}`);
  process.exit(1);
}

const matches = (payload.matches || [])
  .map(m => ({
    id: m.id,
    utcDate: m.utcDate,
    status: m.status,
    competition: { code: m.competition?.code, name: m.competition?.name },
    homeTeam: { name: m.homeTeam?.name || m.homeTeam?.shortName },
    awayTeam: { name: m.awayTeam?.name || m.awayTeam?.shortName },
    score: { fullTime: { home: m.score?.fullTime?.home ?? null, away: m.score?.fullTime?.away ?? null } },
  }))
  .sort((a, b) => a.utcDate.localeCompare(b.utcDate) || a.id - b.id);

const output = JSON.stringify({ from, to, matches }) + '\n';

// Non riscrive il file se nulla è cambiato (così non si creano commit inutili)
const previous = await readFile('data/matches.json', 'utf8').catch(() => '');
if (previous !== output) await writeFile('data/matches.json', output);

console.log(`${matches.length} partite dal ${from} al ${to}.`);
