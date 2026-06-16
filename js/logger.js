import { G } from './state.js';

const MAX_FRAMES_PER_POINT = 7200; // ~2 min at 60 Hz
const MAX_POINTS = 300;

const LOG = {
  enabled: true,
  t: 0,
  matches: [],
  point: null,
  droppedPoints: 0,
};
window.LOGGER = LOG;

const r3 = v => Math.round(v * 1000) / 1000;

function curMatch() { return LOG.matches[LOG.matches.length - 1] || null; }

function snapshot() {
  const b = G.ball, p = G.player, n = G.npc;
  return {
    ball: {
      x: r3(b.x), y: r3(b.y), z: r3(b.z),
      vx: r3(b.vx), vy: r3(b.vy), vz: r3(b.vz),
      spin: r3(b.spin), bounces: b.bounces,
      netHit: b.netHit, isServe: b.isServe, lastHitter: b.lastHitter,
      lastHitterEntity: G.lastHitterEntity,
    },
    player: { x: r3(p.x), z: r3(p.z) },
    npc: { x: r3(n.x), z: r3(n.z) },
  };
}

export function logTick(dt) {
  if (LOG.enabled) LOG.t += dt;
}

export function logMatchStart() {
  if (!LOG.enabled) return;
  LOG.point = null;
  LOG.matches.push({
    mode: G.mode, diffKey: G.diffKey,
    wallTime: new Date().toISOString(), t0: r3(LOG.t), points: [],
  });
}

// No-op if a point is already open (fault re-serves stay in same record)
export function logPointStart(ctx) {
  if (!LOG.enabled || LOG.point || !curMatch()) return;
  LOG.point = {
    t0: r3(LOG.t),
    server: ctx.server, serveSide: ctx.serveSide,
    scoreBefore: G.score ? JSON.parse(JSON.stringify(G.score)) : null,
    npcReceiveX: ctx.npcReceiveX ?? null,
    npcMem: JSON.parse(JSON.stringify(G.npcMem)),
    events: [], frames: [],
  };
}

export function logEvent(type, data) {
  if (!LOG.enabled || !LOG.point) return;
  // `type` after the spread so a stray `type` key in data can't clobber the category label.
  LOG.point.events.push({ t: r3(LOG.t), ...data, type, snap: snapshot() });
}

let frameN = 0;
export function logFrame() {
  const pt = LOG.point;
  if (!LOG.enabled || !pt || pt.frames.length >= MAX_FRAMES_PER_POINT) return;
  if ((frameN = (frameN + 1) % 3) !== 0) return; // sample ~20 Hz: cuts allocation/retained heap ~3x
  const b = G.ball;
  pt.frames.push([
    r3(LOG.t), r3(b.x), r3(b.y), r3(b.z),
    r3(b.vx), r3(b.vy), r3(b.vz), r3(b.spin),
    r3(G.player.x), r3(G.player.z), r3(G.npc.x), r3(G.npc.z),
    G.strike ? r3(G.strike.t) : -1,
  ]);
}

export function logPointEnd(data) {
  if (!LOG.enabled || !LOG.point) return null;
  Object.assign(LOG.point, data, { t1: r3(LOG.t) });
  const rec = LOG.point;
  const m = curMatch();
  if (m) m.points.push(rec);
  LOG.point = null;
  // enforce global point cap
  let total = LOG.matches.reduce((s, mm) => s + mm.points.length, 0);
  for (const mm of LOG.matches) {
    while (total > MAX_POINTS && mm.points.length) {
      mm.points.shift(); LOG.droppedPoints++; total--;
    }
  }
  return rec;
}

export function downloadLog() {
  if (!LOG.enabled) return;
  const out = {
    version: 1, exportedAt: new Date().toISOString(),
    droppedPoints: LOG.droppedPoints, matches: LOG.matches,
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `courtking-log-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
