import { G } from './state.js';
import { DW, SW, HL, SVC } from './constants.js';

// The world is in real metres & seconds (HL=11.885 m, GRAV=9.81), so a serve's
// velocity vector is already m/s. Honest conversion is ×3.6. BROADCAST_GAIN is a
// cosmetic dial: 1.0 = physically true (~120-145 km/h here), ~1.35 makes flat
// serves read pro-like (~185-195). See STATS_PLAN.md Section 11.
export const MS_TO_KMH = 3.6;
// Calibrated: a perfect flat serve is ~36.4 m/s (≈131 km/h honest); 1.45 scales it
// to a broadcast-like ~190 km/h. Display-only — does not affect physics.
export const BROADCAST_GAIN = 1.45;
export const kmh = ms => Math.round(ms * MS_TO_KMH * BROADCAST_GAIN);

const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '–';

const blankPlayer = () => ({
  aces: 0, doubleFaults: 0, firstIn: 0, firstTotal: 0,
  winners: 0, unforced: 0, fastServe: 0, sumServe: 0, nServe: 0,
  landings: [], timing: { perfect: 0, good: 0, ok: 0, weak: 0 },
});

// Team-level [team0=human, team1=cpu] for singles + team totals;
// players[0..3] for the doubles per-entity breakdown (unused in singles).
export function newStats() {
  return {
    pointsWon: [0, 0], aces: [0, 0], doubleFaults: [0, 0],
    firstIn: [0, 0], firstTotal: [0, 0], firstWon: [0, 0],
    secondTotal: [0, 0], secondWon: [0, 0],
    winners: [0, 0], unforced: [0, 0],
    fastServe: [0, 0], sumServe: [0, 0], nServe: [0, 0],
    longestRally: 0, sumRally: 0, nPoints: 0, streak: [0, 0],
    timing: { perfect: 0, good: 0, ok: 0, weak: 0 },   // human shots only
    landings: [[], []],                                // team-level {x, z, in, serve}
    players: [blankPlayer(), blankPlayer(), blankPlayer(), blankPlayer()],
  };
}

const ERR_REASONS = ['Out!', 'Net!', 'CPU nets it', 'CPU hits it out'];
const WIN_REASONS = ['Winner!', 'CPU wins the point'];

// rec = completed point record from logPointEnd(); may be null if logging is off.
export function ingestPoint(rec, w, reason, rallyLen) {
  const S = G.matchStats; if (!S) return;
  const o = 1 - w;
  S.pointsWon[w]++; S.nPoints++;
  S.streak[w]++; S.streak[o] = 0;
  S.sumRally += rallyLen;
  S.longestRally = Math.max(S.longestRally, rallyLen);

  if (WIN_REASONS.includes(reason)) S.winners[w]++;
  else if (ERR_REASONS.includes(reason) || reason === 'Double Fault') S.unforced[o]++;

  if (!rec || !rec.events) return;               // coarse path if logging disabled
  const dbl = G.matchType === 'doubles';
  const svEnt = rec.server;                       // entity 0..3 who served
  const svTeam = svEnt < 2 ? 0 : 1;
  const sp = dbl ? (i => S.players[i]) : null;    // per-entity accessor
  const serves = rec.events.filter(e => e.type === 'serve');
  const faults = rec.events.filter(e => e.type === 'fault');

  const first = serves.find(e => e.serveNum === 1);
  if (first) {
    S.firstTotal[svTeam]++; if (dbl) sp(svEnt).firstTotal++;
    if (!faults.some(f => f.serveNum === 1)) { S.firstIn[svTeam]++; if (dbl) sp(svEnt).firstIn++; }
  }
  const inPlay = serves[serves.length - 1];      // serve that actually started the rally
  if (inPlay) {
    const v = inPlay.vmag || inPlay.speed || 0;  // m/s; vmag = true launch velocity
    S.fastServe[svTeam] = Math.max(S.fastServe[svTeam], v);
    S.sumServe[svTeam] += v; S.nServe[svTeam]++;
    if (dbl) { const e = sp(svEnt); e.fastServe = Math.max(e.fastServe, v); e.sumServe += v; e.nServe++; }
    const won = (w === svTeam);
    if (inPlay.serveNum === 1) { if (won) S.firstWon[svTeam]++; }
    else { S.secondTotal[svTeam]++; if (won) S.secondWon[svTeam]++; }
  }
  if (reason === 'Double Fault') { S.doubleFaults[svTeam]++; if (dbl) sp(svEnt).doubleFaults++; }
  if (rallyLen === 1 && w === svTeam && reason !== 'Double Fault') {
    S.aces[svTeam]++; if (dbl) sp(svEnt).aces++;
  }

  // Winner / unforced error → attribute to the entity who hit the point-ending shot.
  const bounces = rec.events.filter(e => e.type === 'bounce');
  const decider = bounces.length ? bounces[bounces.length - 1].snap.ball.lastHitterEntity : null;
  if (dbl && decider != null) {
    if (WIN_REASONS.includes(reason)) sp(decider).winners++;
    else if (ERR_REASONS.includes(reason)) sp(decider).unforced++;
    else if (reason === 'Double Fault') sp(svEnt).unforced++;
  }

  // Walk shots in order, tracking the struck-from lateral position (for cross vs
  // down-the-line) and the shot type/volley flag (for per-type colouring & filters).
  // serve/hit snapshots are captured at contact, so their ball.x is the origin.
  let fromX = 0, shotType = null, pendingVolley = false, curVolley = false, curFore = null;
  for (const e of rec.events) {
    if (e.type === 'serve') { fromX = e.snap?.ball?.x ?? fromX; shotType = 'serve'; curVolley = false; pendingVolley = false; curFore = null; }
    if (e.type === 'playerShot') {
      pendingVolley = e.animType === 'volley' || e.animType === 'smash';  // consumed by the next hit
      if (S.timing[e.q] !== undefined) { S.timing[e.q]++; if (dbl) sp(0).timing[e.q]++; }
    }
    // fore is logged on every hit (player + CPU), so both teams get wing colours.
    if (e.type === 'hit') { fromX = e.snap?.ball?.x ?? fromX; shotType = e.shotType; curVolley = pendingVolley; pendingVolley = false; curFore = e.fore == null ? null : !!e.fore; }
    if (e.type === 'bounce' && e.bounceN === 0) {
      const kind = e.isServe ? 'serve' : shotType === 'lob' ? 'lob' : curVolley ? 'volley' : 'ground';
      const team = e.snap.ball.lastHitter;             // team index
      const ent = e.snap.ball.lastHitterEntity;        // entity index
      const shot = { x: e.snap.ball.x, z: e.snap.ball.z, in: e.inCourt, serve: e.isServe, fromX, kind, fore: e.isServe ? null : curFore };
      const tArr = S.landings[team]; if (tArr) { tArr.push(shot); if (tArr.length > 80) tArr.shift(); }
      if (dbl && ent != null) { const eArr = sp(ent).landings; eArr.push(shot); if (eArr.length > 60) eArr.shift(); }
    }
  }
}

// ---- table renderers (shared by end screen + pause panel) ----

export function statsTable(S) {
  if (!S || !S.nPoints) return `<div class="st">No stats yet.</div>`;
  return G.matchType === 'doubles' ? doublesTable(S) : singlesTable(S);
}

function singlesTable(S) {
  const avgRally = (S.sumRally / S.nPoints).toFixed(1);
  const row = (a, label, b, human) => {
    const an = parseFloat(a), bn = parseFloat(b);
    const aCls = human ? 'win' : (an > bn ? 'win' : an < bn ? 'lose' : '');
    const bCls = human ? 'dim' : (bn > an ? 'win' : bn < an ? 'lose' : '');
    return `<tr><td class="${aCls}">${a}</td><td class="lbl">${label}</td>`
         + `<td class="${bCls}">${human ? '—' : b}</td></tr>`;
  };
  const clean = S.timing.perfect + S.timing.good;
  const totT  = clean + S.timing.ok + S.timing.weak;
  return `<table class="statgrid">
    <tr class="hdr"><td>You</td><td></td><td>CPU</td></tr>
    ${row(S.aces[0], 'Aces', S.aces[1])}
    ${row(S.doubleFaults[0], 'Double faults', S.doubleFaults[1])}
    ${row(pct(S.firstIn[0], S.firstTotal[0]), '1st serve in', pct(S.firstIn[1], S.firstTotal[1]))}
    ${row(pct(S.firstWon[0], S.firstIn[0]), '1st serve pts won', pct(S.firstWon[1], S.firstIn[1]))}
    ${row(kmh(S.fastServe[0]), 'Fastest serve', kmh(S.fastServe[1]))}
    ${row(S.winners[0], 'Winners', S.winners[1])}
    ${row(S.unforced[0], 'Unforced errors', S.unforced[1])}
    ${row(S.longestRally, 'Longest rally', S.longestRally)}
    ${row(avgRally, 'Avg rally', avgRally)}
    ${row(pct(clean, totT), 'Clean-strike', '', true)}
  </table>`;
}

function doublesTable(S) {
  const P = S.players;
  const cell = (v, lead) => `<td class="${lead ? 'win' : 'dim'}">${v}</td>`;
  const row = (label, vals, fmt = x => x, better = 'hi') => {
    const nums = vals.map(v => parseFloat(v));
    const best = better === 'hi' ? Math.max(...nums) : Math.min(...nums);
    const cells = vals.map((v, i) => cell(fmt(v), nums[i] === best && best > 0));
    return `<tr>${cells[0]}${cells[1]}<td class="lbl">${label}</td>${cells[2]}${cells[3]}</tr>`;
  };
  const pin = i => pct(P[i].firstIn, P[i].firstTotal);
  return `<table class="statgrid dbl">
    <tr class="hdr"><td colspan="2">Your team</td><td></td><td colspan="2">CPU team</td></tr>
    <tr class="hdr2"><td>You</td><td>Partner</td><td></td><td>CPU 1</td><td>CPU 2</td></tr>
    ${row('Aces',          [P[0].aces, P[1].aces, P[2].aces, P[3].aces])}
    ${row('Double faults', [P[0].doubleFaults, P[1].doubleFaults, P[2].doubleFaults, P[3].doubleFaults], x=>x, 'lo')}
    ${row('1st serve in',  [pin(0), pin(1), pin(2), pin(3)])}
    ${row('Winners',       [P[0].winners, P[1].winners, P[2].winners, P[3].winners])}
    ${row('Unforced err',  [P[0].unforced, P[1].unforced, P[2].unforced, P[3].unforced], x=>x, 'lo')}
    ${row('Fastest (km/h)',[P[0].fastServe, P[1].fastServe, P[2].fastServe, P[3].fastServe].map(kmh))}
  </table>`;
}

// ---- landing-zone map (top-down shot-placement chart) ----

// Optional broadcast-style "thirds" overlay: tints the court into left/middle/right
// columns and labels the % of shots landing in each. Toggled from the UI.
let zonesOn = false;
export const setZones = on => { zonesOn = on; };

// Shot-type filter — which kinds are plotted on the map.
const SHOT_KINDS = [['serve', 'Serves'], ['ground', 'Ground'], ['volley', 'Volleys'], ['lob', 'Lobs']];
const activeKinds = new Set(SHOT_KINDS.map(([k]) => k));
export const toggleKind = k => { activeKinds.has(k) ? activeKinds.delete(k) : activeKinds.add(k); };

// Dot colours: forehand vs backhand are the primary two; serves/unknown are neutral.
const C_FORE = '#e8743b', C_BACK = '#3aa0e0', C_NEUTRAL = '#aeb9c6';
const dotColor = L => (L.serve || L.fore == null) ? C_NEUTRAL : (L.fore ? C_FORE : C_BACK);

// Toggle buttons differ by mode (2 in singles, 4 in doubles).
export function landingMapBlock() {
  const btns = G.matchType === 'doubles'
    ? [[0, 'You'], [1, 'Partner'], [2, 'CPU 1'], [3, 'CPU 2']]
    : [[0, 'You'], [1, 'CPU']];
  const row = btns.map(([k, l], i) =>
    `<button class="pill ${i === 0 ? 'sel' : ''}" data-lm="${k}">${l}</button>`).join('');
  const chips = SHOT_KINDS.map(([k, l]) =>
    `<button class="pill lm-kind ${activeKinds.has(k) ? 'sel' : ''}" data-lmkind="${k}">${l}</button>`).join('');
  // Size is set by drawLandingMap (device-pixel-ratio aware) so the chart is crisp.
  return `<div class="lm-toggle">${row}</div>`
       + `<div class="lm-toggle"><button class="pill ${zonesOn ? 'sel' : ''}" data-lmzones>Zones %</button></div>`
       + `<canvas id="landmap"></canvas>`
       + `<div class="lm-toggle lm-kinds">${chips}</div>`;
}

// Combined two-column layout (table + map) shared by the pause screen and end screen.
export function statsLayout(S) {
  return `<div class="stats-layout">`
       + `<div class="stats-col">${statsTable(S)}</div>`
       + `<div class="stats-col">${landingMapBlock()}</div>`
       + `</div>`;
}

// Resolve a toggle key to the right landing array: team index (singles)
// or entity index (doubles).
function landingsFor(key) {
  const S = G.matchStats; if (!S) return [];
  return G.matchType === 'doubles'
    ? (S.players[key]?.landings || [])
    : (S.landings[key] || []);
}

export function drawLandingMap(canvas, key) {
  const S = G.matchStats; if (!S || !canvas) return;
  const pts = landingsFor(key).filter(L => activeKinds.has(L.kind || 'ground'));
  // Render at devicePixelRatio for a crisp chart; draw in logical (CSS) pixels.
  const cw = 384, ch = 548, dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = 16, legendH = 30, cb = ch - legendH;   // court occupies the area above the legend
  const sx = x => pad + (x + DW) / (2 * DW) * (cw - 2 * pad);
  const sy = z => pad + (z + HL) / (2 * HL) * (cb - 2 * pad);   // opponent (z<0) top, you (z>0) bottom

  ctx.clearRect(0, 0, cw, ch);
  // grass surround + court surface
  ctx.fillStyle = '#23402c'; ctx.fillRect(0, 0, cw, cb);
  ctx.fillStyle = '#3a6ea5';
  ctx.fillRect(sx(-DW), sy(-HL), sx(DW) - sx(-DW), sy(HL) - sy(-HL));
  ctx.strokeStyle = 'rgba(255,255,255,.62)'; ctx.lineWidth = 1.3;
  const box = (x1, z1, x2, z2) => ctx.strokeRect(sx(x1), sy(z1), sx(x2) - sx(x1), sy(z2) - sy(z1));
  box(-DW, -HL, DW, HL);            // doubles
  box(-SW, -HL, SW, HL);            // singles sidelines
  box(-SW, -SVC, SW, SVC);          // service boxes (both halves)
  ctx.beginPath(); ctx.moveTo(sx(0), sy(-SVC)); ctx.lineTo(sx(0), sy(SVC)); ctx.stroke(); // centre service line
  ctx.beginPath(); ctx.moveTo(sx(-DW), sy(0)); ctx.lineTo(sx(DW), sy(0));                  // net
  ctx.strokeStyle = '#eef3f7'; ctx.lineWidth = 2.6; ctx.stroke();

  const drawDot = (L) => {
    const px = sx(L.x), py = sy(L.z), r = 4.8;   // uniform size; serves stay neutral grey
    ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fillStyle = dotColor(L); ctx.fill();
    if (!L.in) { ctx.lineWidth = 1.7; ctx.strokeStyle = '#ff4040'; ctx.stroke(); }   // out = red ring
    ctx.beginPath(); ctx.arc(px - r * 0.3, py - r * 0.3, r * 0.34, 0, 7);            // gloss highlight
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
  };

  if (zonesOn) {
    // broadcast "thirds": tint left/middle/right columns + label landing %
    const edges = [[-DW, -DW / 3], [-DW / 3, DW / 3], [DW / 3, DW]];
    const tints = ['rgba(70,130,200,.28)', 'rgba(150,90,180,.32)', 'rgba(70,170,150,.28)'];
    const counts = [0, 0, 0]; let tot = 0;
    for (const L of pts) {
      if (!L.in) continue;
      const z = L.x < -DW / 3 ? 0 : L.x > DW / 3 ? 2 : 1;
      counts[z]++; tot++;
    }
    const top = sy(-HL), bot = sy(HL);
    edges.forEach(([x1, x2], i) => { ctx.fillStyle = tints[i]; ctx.fillRect(sx(x1), top, sx(x2) - sx(x1), bot - top); });
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    [-DW / 3, DW / 3].forEach(x => { ctx.beginPath(); ctx.moveTo(sx(x), top); ctx.lineTo(sx(x), bot); ctx.stroke(); });
    for (const L of pts) drawDot(L);
    // big percentage labels in the upper (landing) third
    ctx.font = '700 23px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 5;
    const ly = pad + (cb - 2 * pad) * 0.16;
    edges.forEach(([x1, x2], i) => { const p = tot ? Math.round(100 * counts[i] / tot) : 0; ctx.fillText(`${p}%`, sx((x1 + x2) / 2), ly); });
    ctx.shadowBlur = 0;
  } else {
    for (const L of pts) drawDot(L);
  }

  // legend: forehand vs backhand split (rally shots with a known wing)
  let nF = 0, nB = 0;
  for (const L of pts) { if (L.serve || L.fore == null) continue; L.fore ? nF++ : nB++; }
  const tw = nF + nB, fp = tw ? Math.round(100 * nF / tw) : 0, bp = tw ? 100 - fp : 0;
  const ly = ch - legendH / 2;
  ctx.font = '600 12px system-ui,sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = C_FORE; ctx.beginPath(); ctx.arc(pad + 4, ly, 4.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#cdd9e4'; ctx.fillText(`Forehand ${fp}%`, pad + 14, ly);
  ctx.fillStyle = C_BACK; ctx.beginPath(); ctx.arc(cw / 2 + 14, ly, 4.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#cdd9e4'; ctx.fillText(`Backhand ${bp}%`, cw / 2 + 24, ly);
}

export { pct };
