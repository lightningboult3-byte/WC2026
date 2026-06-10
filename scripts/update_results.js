// Auto-updates results.json from openfootball (free, no API key).
// Maps each played match's score onto OUR match_number via (local-date + city).
const fs = require('fs');
const DATA = JSON.parse(fs.readFileSync(process.env.WC_DATA || 'worldcup2026.json', 'utf8'));
const normGround = g => String(g || '').replace(/\s*\(.*\)/, '').trim();
const keyOf = (date, city) => `${date}|${city}`;
const byKey = {};
DATA.matches.forEach(m => { byKey[keyOf(m.kickoff_local.slice(0, 10), m.city)] = m; });
function getScore(m) {
  if (typeof m.score1 === 'number' && typeof m.score2 === 'number') return [m.score1, m.score2];
  if (m.score && Array.isArray(m.score.ft)) return m.score.ft;
  if (typeof m.score === 'string') { const x = m.score.match(/(\d+)\s*[-–:]\s*(\d+)/); if (x) return [+x[1], +x[2]]; }
  if (typeof m.ft === 'string')    { const x = m.ft.match(/(\d+)\s*[-–:]\s*(\d+)/);    if (x) return [+x[1], +x[2]]; }
  return null;
}
async function getSource() {
  if (process.env.WC_LOCAL) return JSON.parse(fs.readFileSync(process.env.WC_LOCAL, 'utf8'));
  const res = await fetch('https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json');
  if (!res.ok) throw new Error('source fetch failed: ' + res.status);
  return res.json();
}
(async () => {
  const src = await getSource();
  const out = {};
  for (const m of (src.matches || [])) {
    const sc = getScore(m); if (!sc) continue;
    const our = byKey[keyOf(m.date, normGround(m.ground))];
    if (!our) { console.warn('unmapped:', m.date, m.ground); continue; }
    out[our.match_number] = { h: sc[0], a: sc[1], status: 'FT', hn: m.team1, an: m.team2 };
  }
  fs.writeFileSync('results.json', JSON.stringify({ updated: new Date().toISOString(), results: out }, null, 2));
  console.log('wrote results.json with', Object.keys(out).length, 'result(s)');
})().catch(e => { console.error(e); process.exit(1); });
