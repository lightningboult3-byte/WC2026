// Updates results.json from football-data.org (free tier).
// Token comes from the FOOTBALL_DATA_TOKEN repo secret.
// Maps finished WC matches onto OUR match_number — group stage by team pair,
// knockout by kickoff instant. Merges with existing results (manual entries survive)
// and ONLY writes when something actually changed (keeps Pages builds + git history quiet).
//
// Local test (no token, no network):
//   WC_DATA=worldcup2026.json FD_LOCAL=mock.json node scripts/update_results.js

const fs = require('fs');
const DATA = JSON.parse(fs.readFileSync(process.env.WC_DATA || 'worldcup2026.json', 'utf8'));

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const CODE = {};
DATA.teams.forEach(t => { CODE[norm(t.name)] = t.fifa_code; CODE[norm(t.fifa_code)] = t.fifa_code; });
// football-data.org name aliases -> our FIFA code
Object.entries({
  korearepublic: 'KOR', southkorea: 'KOR', unitedstates: 'USA', usa: 'USA', iran: 'IRN', iriran: 'IRN',
  ivorycoast: 'CIV', cotedivoire: 'CIV', capeverde: 'CPV', caboverde: 'CPV', turkey: 'TUR', turkiye: 'TUR',
  drcongo: 'COD', congodr: 'COD', czechrepublic: 'CZE', czechia: 'CZE', bosniaandherzegovina: 'BIH'
}).forEach(([k, v]) => { CODE[k] = v; });
const code = name => CODE[norm(name)] || null;

const codeById = {}; DATA.teams.forEach(t => { codeById[t.id] = t.fifa_code; });
const pairKey = (a, b) => [a, b].sort().join('-');
const groupPair = {};   // "AAA-BBB" -> match_number (group stage only)
const instantMap = {};  // "YYYY-MM-DDTHH:MM" -> [match_number]
DATA.matches.forEach(m => {
  const inst = m.kickoff_utc.slice(0, 16);
  (instantMap[inst] = instantMap[inst] || []).push(m.match_number);
  if (m.stage === 'Group Stage' && m.home_team_id != null && m.away_team_id != null)
    groupPair[pairKey(codeById[m.home_team_id], codeById[m.away_team_id])] = m.match_number;
});

function getSource() {
  if (process.env.FD_LOCAL) return Promise.resolve(JSON.parse(fs.readFileSync(process.env.FD_LOCAL, 'utf8')));
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) throw new Error('FOOTBALL_DATA_TOKEN not set');
  return fetch('https://api.football-data.org/v4/competitions/WC/matches?status=FINISHED',
    { headers: { 'X-Auth-Token': token } }).then(r => { if (!r.ok) throw new Error('football-data ' + r.status); return r.json(); });
}

(async () => {
  const src = await getSource();
  let prior = {};
  try { prior = JSON.parse(fs.readFileSync('results.json', 'utf8')).results || {}; } catch (e) {}
  const out = { ...prior };

  for (const m of (src.matches || [])) {
    if (m.status !== 'FINISHED') continue;
    const ft = m.score && m.score.fullTime;
    if (!ft || typeof ft.home !== 'number' || typeof ft.away !== 'number') continue;
    let num = null;
    const hc = m.homeTeam && code(m.homeTeam.name), ac = m.awayTeam && code(m.awayTeam.name);
    if (m.stage === 'GROUP_STAGE' && hc && ac) num = groupPair[pairKey(hc, ac)];
    if (num == null) { const c = instantMap[(m.utcDate || '').slice(0, 16)]; if (c && c.length === 1) num = c[0]; }
    if (num == null) { console.warn('unmapped:', m.utcDate, m.homeTeam && m.homeTeam.name, m.awayTeam && m.awayTeam.name); continue; }
    out[num] = { h: ft.home, a: ft.away, status: 'FT', hn: m.homeTeam && m.homeTeam.name, an: m.awayTeam && m.awayTeam.name };
  }

  // Only write when the result set actually changed (ignores the timestamp),
  // so GitHub Pages doesn't rebuild on every poll.
  const stable = o => JSON.stringify(Object.keys(o).sort().reduce((x, k) => (x[k] = o[k], x), {}));
  if (stable(out) === stable(prior)) { console.log('no change'); return; }
  fs.writeFileSync('results.json', JSON.stringify({ updated: new Date().toISOString(), results: out }, null, 2));
  console.log('updated results.json:', Object.keys(out).length, 'result(s)');
})().catch(e => { console.error(e); process.exit(1); });
