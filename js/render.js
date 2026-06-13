import { W, H, CX, CY, FOC, NETX, PRESS_LEAD, TOSS_APEX, HL, SW, DW, SVC, CHARGE_FULL, COLORS } from './constants.js';
import { G } from './state.js';
import { clamp, lerp, netHeight } from './utils.js';
import { proj } from './camera.js';
import { servingPlayer } from './scoring.js';
import { predictLanding } from './physics.js';

const cv  = document.getElementById('cv');
const ctx = cv.getContext('2d');
let RES = 1;

export function resizeCanvas() {
  const rect = cv.getBoundingClientRect();
  if (!rect.width) return;
  RES = clamp((rect.width * (window.devicePixelRatio || 1)) / W, 1, 3);
  const bw = Math.round(W * RES), bh = Math.round(H * RES);
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function quadWorld(x1, z1, x2, z2, color) {
  const a = proj(x1,0,z1), b = proj(x2,0,z1), c = proj(x2,0,z2), d = proj(x1,0,z2);
  if (!a||!b||!c||!d) return;
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.lineTo(c.x,c.y); ctx.lineTo(d.x,d.y);
  ctx.closePath(); ctx.fill();
}

function lineRect(x1, z1, x2, z2) {
  quadWorld(Math.min(x1,x2)-0.05, Math.min(z1,z2)-0.05, Math.max(x1,x2)+0.05, Math.max(z1,z2)+0.05, 'rgba(240,246,250,0.92)');
}

function drawCourt() {
  const sky = ctx.createLinearGradient(0,0,0,H*0.36);
  sky.addColorStop(0,'#0d1a2e'); sky.addColorStop(1,'#1d3a55');
  ctx.fillStyle = sky; ctx.fillRect(0,0,W,H*0.36);
  const wb = proj(0,0,-16);
  const wallBase = wb ? wb.y : 170;
  ctx.fillStyle = '#15243c'; ctx.fillRect(0, wallBase-72, W, 72);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 1; i < 5; i++) ctx.fillRect(0, wallBase-72+i*14, W, 2);
  ctx.fillStyle = '#0e3a2e'; ctx.fillRect(0, wallBase-14, W, 14);
  ctx.fillStyle = '#1c4a35'; ctx.fillRect(0, wallBase, W, H-wallBase);
  quadWorld(-13,-15.9,13,17.4,'#256648');
  quadWorld(-7.2,-14.2,7.2,16.8,'#2e7a55');
  quadWorld(-DW,-HL,DW,HL,'#2f6fb3');
  lineRect(-DW,HL,DW,HL); lineRect(-DW,-HL,DW,-HL);
  lineRect(-DW,-HL,-DW,HL); lineRect(DW,-HL,DW,HL);
  lineRect(-SW,-HL,-SW,HL); lineRect(SW,-HL,SW,HL);
  lineRect(-SW,SVC,SW,SVC); lineRect(-SW,-SVC,SW,-SVC);
  lineRect(0,-SVC,0,SVC);
  lineRect(0,HL-0.3,0,HL); lineRect(0,-HL,0,-HL+0.3);
}

function drawNet() {
  const steps = 26, top = [], bot = [];
  for (let i = 0; i <= steps; i++) {
    const x = -NETX + i * (2*NETX/steps);
    top.push(proj(x, netHeight(x), 0)); bot.push(proj(x, 0, 0));
  }
  if (top.some(p => !p) || bot.some(p => !p)) return;
  ctx.beginPath();
  ctx.moveTo(top[0].x, top[0].y);
  top.forEach(p => ctx.lineTo(p.x, p.y));
  for (let i = steps; i >= 0; i--) ctx.lineTo(bot[i].x, bot[i].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(14,22,32,0.52)'; ctx.fill();
  ctx.strokeStyle = 'rgba(225,233,240,0.16)'; ctx.lineWidth = 1;
  for (let i = 0; i <= steps; i += 2) {
    ctx.beginPath(); ctx.moveTo(top[i].x,top[i].y); ctx.lineTo(bot[i].x,bot[i].y); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(top[0].x, top[0].y);
  top.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = '#eef3f7'; ctx.lineWidth = Math.max(2, top[Math.floor(steps/2)].s*0.085); ctx.stroke();
  [-NETX, NETX].forEach(x => {
    const t = proj(x, netHeight(x)+0.05, 0), g = proj(x, 0, 0);
    if (!t||!g) return;
    ctx.strokeStyle = '#11202e'; ctx.lineWidth = Math.max(2.5, g.s*0.07);
    ctx.beginPath(); ctx.moveTo(g.x,g.y); ctx.lineTo(t.x,t.y); ctx.stroke();
  });
}

function drawShadow(x, z, r, alpha) {
  const p = proj(x, 0, z); if (!p) return;
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath(); ctx.ellipse(p.x,p.y,r*p.s,r*p.s*0.32,0,0,7); ctx.fill();
}

function drawBall() {
  const b = G.ball;
  if (!b.active && !b.held) return;
  for (let i = 0; i < b.trail.length; i++) {
    const t = b.trail[i], p = proj(t.x,t.y,t.z); if (!p) continue;
    const a = (i / b.trail.length) * 0.3;
    ctx.fillStyle = `rgba(220,255,120,${a})`;
    ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(1,p.s*0.05),0,7); ctx.fill();
  }
  drawShadow(b.x, b.z, 0.16, clamp(0.45-b.y*0.05, 0.08, 0.45));
  if (b.active && !b.held && b.vz > 0.5) {
    const L = predictLanding();
    if (L) {
      const inBounds = Math.abs(L.x) <= DW && L.z > 0 && L.z < HL + 0.15;
      const lp = proj(L.x, 0, L.z);
      if (lp) {
        ctx.strokeStyle = inBounds ? 'rgba(61,240,168,0.55)' : 'rgba(224,90,90,0.55)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.ellipse(lp.x, lp.y, lp.s*0.28, lp.s*0.10, 0, 0, 7); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
  const p = proj(b.x,b.y,b.z); if (!p) return;
  const r = Math.max(2.4, p.s*0.085);
  const gr = ctx.createRadialGradient(p.x-r*0.3,p.y-r*0.3,r*0.2,p.x,p.y,r);
  gr.addColorStop(0,'#f4ff9e'); gr.addColorStop(1,'#b8d018');
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(p.x,p.y,r,0,7); ctx.fill();
}

function drawChargeIndicator() {
  const p = G.player, ch = p.charge;
  if (!ch) return;
  const fp = proj(p.x, 0.05, p.z); if (!fp) return;
  const frac = clamp(ch.t / CHARGE_FULL, 0, 1);
  const st = G.strike;
  const inReach = st ? Math.abs(st.x - p.x) <= 1.6 : true;
  const err = st ? st.t - PRESS_LEAD : 1;     // time until the ideal release moment
  const inWin = st && inReach && Math.abs(err) <= 0.06;
  const R = Math.max(10, fp.s * 0.55), ry = R * 0.34;

  // base track
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = Math.max(3, fp.s * 0.05);
  ctx.beginPath(); ctx.ellipse(fp.x, fp.y, R, ry, 0, 0, 7); ctx.stroke();

  // charge-quality ring: amber building → lime → green at full power
  const chCol = frac >= 0.999 ? 'rgba(61,240,168,0.96)'
              : frac > 0.6    ? 'rgba(205,227,90,0.95)'
              :                 'rgba(232,180,80,0.92)';
  ctx.strokeStyle = chCol; ctx.lineWidth = Math.max(3, fp.s * 0.08);
  ctx.beginPath(); ctx.ellipse(fp.x, fp.y, R, ry, 0, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();

  // timing ring: contracts toward the player as the ball nears the contact point
  if (st) {
    const Rt = R + 5 + Math.max(0, err) * fp.s * 2.2, rty = Rt * 0.34;
    if (!inReach) {
      ctx.strokeStyle = 'rgba(224,90,90,0.9)'; ctx.lineWidth = 2.4; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.ellipse(fp.x, fp.y, Rt, rty, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    } else {
      const tcol = inWin ? 'rgba(61,240,168,0.98)' : err > 0 ? 'rgba(232,232,232,0.82)' : 'rgba(224,160,90,0.92)';
      ctx.strokeStyle = tcol; ctx.lineWidth = inWin ? Math.max(3, fp.s * 0.07) : 2.4;
      ctx.beginPath(); ctx.ellipse(fp.x, fp.y, Rt, rty, 0, 0, 7); ctx.stroke();
    }
  }

  // labels: charge % on top, action cue below
  ctx.textAlign = 'center';
  ctx.fillStyle = chCol;
  ctx.font = `700 ${Math.max(10, fp.s * 0.17)}px "Avenir Next",sans-serif`;
  ctx.fillText(`${Math.round(frac * 100)}%`, fp.x, fp.y - ry - 6);
  const cueY = fp.y + ry + Math.max(13, fp.s * 0.2);
  if (st && !inReach) {
    ctx.fillStyle = 'rgba(224,90,90,0.96)'; ctx.fillText('REACH!', fp.x, cueY);
  } else if (inWin) {
    ctx.fillStyle = 'rgba(61,240,168,0.98)'; ctx.fillText('RELEASE', fp.x, cueY);
  }
}

function drawServeRing() {
  if (G.state !== 'toss' || !G.toss || G.toss.by !== 0 || G.toss.hit) return;
  const b = G.ball, p = proj(b.x,b.y,b.z); if (!p) return;
  const r = Math.max(2.4, p.s*0.085);
  const dtA = TOSS_APEX - G.toss.t;
  const inWin = Math.abs(G.toss.t - TOSS_APEX) <= 0.045;
  const col = inWin ? 'rgba(61,240,168,0.95)' : dtA > 0 ? 'rgba(232,232,232,0.8)' : 'rgba(224,160,90,0.9)';
  const R = r + 2 + Math.max(0, dtA) * 3.6 * p.s;
  ctx.strokeStyle = col; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(p.x,p.y,R,0,7); ctx.stroke();
}

function drawFb() {
  if (!G.fb) return;
  const p = proj(G.player.x, 2.15, G.player.z); if (!p) return;
  const a = 1 - G.fb.age / 0.85;
  ctx.globalAlpha = Math.max(0, a);
  ctx.font = `700 ${Math.max(11, p.s*0.3)}px "Avenir Next",sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = G.fb.col;
  ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6;
  ctx.fillText(G.fb.txt, p.x, p.y - G.fb.age*34);
  ctx.shadowBlur = 0; ctx.globalAlpha = 1;
}

// Returns the visual entity index (0-3) for the server, accounting for singles (0/1) vs doubles (0-3)
function getServingEntityIdx() {
  const sv = servingPlayer();
  if (G.matchType === 'doubles') return sv;
  return sv === 0 ? 0 : 2; // singles: 0=player(entityIdx 0), 1=NPC(entityIdx 2)
}
function getTossingEntityIdx() {
  if (!G.toss) return -1;
  const by = G.toss.by;
  if (G.matchType === 'doubles') return by;
  return by === 0 ? 0 : 2; // singles: 0=player, 1=NPC→entityIdx 2
}

// entityIdx: 0=player, 1=partner, 2=npc, 3=npc2
function drawChar(e, colorKey, entityIdx) {
  const pf = proj(e.x,0,e.z), ph = proj(e.x,1.82,e.z);
  if (!pf||!ph) return;
  const s = pf.s, yAt = h => pf.y + (ph.y - pf.y) * (h / 1.82);
  const c = COLORS[colorKey] || COLORS.teal;
  const skin = '#e9b98c', shirt = c.shirt, shorts = c.shorts;
  drawShadow(e.x, e.z, 0.42, 0.35);
  ctx.lineCap = 'round';
  const isHuman = entityIdx < 2;
  const fwd = isHuman ? -1 : 1;
  const dom = isHuman ? 1 : -1;
  const b = G.ball;
  const spd = e.spd || 0, stride = e.stride || 0;
  const amp = Math.min(0.3, 0.03 + spd*0.055);
  const stepLen = Math.min(0.45, 0.08 + spd*0.075);
  let dirx = 0, dirz = 0;
  if (spd > 0.25) { dirx = (e.vx||0)/spd; dirz = (e.vz||0)/spd; }
  const sw1 = Math.sin(stride), cw1 = Math.cos(stride);
  let px1 = -dirz, pz1 = dirx;
  // Foot A wires to the left hip; keep its stance offset pointing screen-left so the legs don't
  // cross when moving toward the net (where the raw perpendicular would flip to screen-right).
  if (px1 > 0) { px1 = -px1; pz1 = -pz1; }
  let fa, fb2;
  if (spd > 0.25) {
    fa  = { x: e.x + dirx*sw1*stepLen + px1*0.13, z: e.z + dirz*sw1*stepLen + pz1*0.13, l: Math.max(0, cw1)*amp*0.9 };
    fb2 = { x: e.x - dirx*sw1*stepLen - px1*0.13, z: e.z - dirz*sw1*stepLen - pz1*0.13, l: Math.max(0,-cw1)*amp*0.9 };
  } else { fa = { x: e.x-0.16, z: e.z, l:0 }; fb2 = { x: e.x+0.16, z: e.z, l:0 }; }
  const fpA = proj(fa.x, fa.l, fa.z), fpB = proj(fb2.x, fb2.l, fb2.z);
  const lean = clamp(((e.lvx !== undefined ? e.lvx : 0) || e.vx || 0) * 0.05, -0.18, 0.18) * s;
  ctx.strokeStyle = '#1d2b38'; ctx.lineWidth = Math.max(2, s*0.085);
  if (fpA) { ctx.beginPath(); ctx.moveTo(pf.x-s*0.1, yAt(0.8)); ctx.lineTo(fpA.x, fpA.y); ctx.stroke(); }
  if (fpB) { ctx.beginPath(); ctx.moveTo(pf.x+s*0.1, yAt(0.8)); ctx.lineTo(fpB.x, fpB.y); ctx.stroke(); }

  const drawBody = () => {
    ctx.strokeStyle = shorts; ctx.lineWidth = Math.max(3, s*0.24);
    ctx.beginPath(); ctx.moveTo(pf.x, yAt(0.74)); ctx.lineTo(pf.x+lean*0.4, yAt(0.97)); ctx.stroke();
    ctx.strokeStyle = shirt; ctx.lineWidth = Math.max(3, s*0.26);
    ctx.beginPath(); ctx.moveTo(pf.x+lean*0.4, yAt(0.97)); ctx.lineTo(pf.x+lean, yAt(1.45)); ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(pf.x+lean, yAt(1.62), Math.max(2.5, s*0.13), 0, 7); ctx.fill();
    ctx.fillStyle = isHuman ? '#222a30' : '#3a2417';
    ctx.beginPath(); ctx.arc(pf.x+lean, yAt(1.67), Math.max(2.5, s*0.125), Math.PI, Math.PI*2); ctx.fill();
  };

  const KF = (A, B, u) => [lerp(A[0],B[0],u), lerp(A[1],B[1],u), lerp(A[2],B[2],u)];
  const a = e.anim;
  const tossing  = (G.state === 'toss'  && G.toss && getTossingEntityIdx() === entityIdx);
  const preServe = (G.state === 'serve' && getServingEntityIdx() === entityIdx);
  let H2, T, off = null, two = false, E = null, shoulderTurn = 0;
  if (tossing) {
    const u = clamp(G.toss.t / 0.45, 0, 1);
    H2 = [dom*0.32, 1.42, -fwd*0.3]; T = [dom*0.42, 2.0, -fwd*0.5];
    off = [-dom*0.22, lerp(1.15, 1.95, Math.min(1, u*1.3)), fwd*0.12];
  } else if (preServe) {
    H2 = [dom*0.3, 1.05, fwd*0.2]; T = [dom*0.36, 1.55, fwd*0.32];
    off = [-dom*0.24, 1.26, fwd*0.08];
  } else if (a) {
    const sd = a.side, fh = !isHuman ? sd < 0 : sd > 0;
    two = !fh && a.type === 'ground';
    const c = a.contact;
    if (a.type === 'smash' || a.type === 'serve') {
      const t = a.t;
      const He = c ? [c[0]*0.5, Math.max(1.6, c[1]-0.6), c[2]*0.5] : [dom*0.1, 2.05, fwd*0.2];
      const Te = c ? c : [dom*0.04, 2.7, fwd*0.45];
      if (t < 0.09) { const u = t/0.09;
        H2 = KF([dom*0.3,1.4,-fwd*0.3],[dom*0.3,1.55,-fwd*0.35],u);
        T  = KF([dom*0.4,1.95,-fwd*0.5],[dom*0.42,2.05,-fwd*0.55],u); }
      else if (t < 0.18) { const u = (t-0.09)/0.09, uu = u*u;
        H2 = KF([dom*0.3,1.55,-fwd*0.35],He,uu);
        T  = KF([dom*0.42,2.05,-fwd*0.55],Te,uu); }
      else { const u = Math.min(1,(t-0.18)/0.45);
        H2 = KF(He,[-dom*0.12,1.35,fwd*0.55],u);
        T  = KF(Te,[-dom*0.25,1.0,fwd*0.75],u); }
      off = [-dom*0.18, a.t<0.18?1.75:1.2, fwd*0.1];
    } else if (a.type === 'volley') {
      const u = Math.min(1, a.t/0.06);
      const He = c ? [c[0]*0.6, Math.max(0.9,c[1]-0.15), c[2]*0.6] : [sd*0.55,1.18,fwd*0.5];
      const Te = c ? c : [sd*0.78,1.32,fwd*0.72];
      H2 = KF([sd*0.42,1.32,fwd*0.08],He,u);
      T  = KF([sd*0.62,1.55,fwd*0.18],Te,u);
      off = [-sd*0.35,1.22,fwd*0.1];
    } else {
      const t = a.t;
      const rch = two ? 0.66 : 1.0;
      if (fh) {
        // Forehand: unit turn on take-back, racket drops below hand (eastern grip),
        // explosive swing through contact, full wrap-around follow-through.
        const Kb  = [sd*0.58, 0.88, -fwd*0.52];
        const KbT = [sd*0.90, 0.68, -fwd*0.74];
        const KbE = [sd*0.60, 0.80, -fwd*0.16];
        const Kc  = c ? [c[0]*0.58, Math.max(0.85,c[1]-0.18), c[2]*0.55] : [sd*0.52, 1.05, fwd*0.16];
        const KcT = c ? c : [sd*0.80, 1.10, fwd*0.40];
        const KcE = [sd*0.50, 0.90, fwd*0.02];
        const Kf  = [-sd*0.40, 1.80, fwd*0.36];
        const KfT = [-sd*0.58, 1.90, fwd*0.50];
        const KfE = [-sd*0.08, 1.56, fwd*0.28];
        if (a.charging) {
          H2=Kb; T=KbT; E=KbE; shoulderTurn=-sd*0.30;
          off = [-sd*0.38, 1.32, -fwd*0.14];
        } else if (t<0.04) {
          H2=Kb; T=KbT; E=KbE; shoulderTurn=-sd*0.30;
          off = [-sd*0.38, 1.32, -fwd*0.14];
        } else if (t<0.10) {
          const u=(t-0.04)/0.06, uu=u*u;
          H2=KF(Kb,Kc,uu); T=KF(KbT,KcT,uu); E=KF(KbE,KcE,uu);
          shoulderTurn = lerp(-sd*0.30, 0, uu);
          off = KF([-sd*0.38,1.32,-fwd*0.14], [-sd*0.35,1.20,fwd*0.04], uu);
        } else {
          const u=Math.min(1,(t-0.10)/0.55), uo=1-(1-u)*(1-u);
          H2=KF(Kc,Kf,uo); T=KF(KcT,KfT,uo); E=KF(KcE,KfE,uo);
          shoulderTurn = lerp(0, sd*0.35, uo);
          // off arm opens outward for counter-rotation balance
          off = KF([-sd*0.35,1.20,fwd*0.04], [-sd*0.52,1.44,fwd*0.46], uo);
        }
      } else {
        // Backhand: shoulder coil toward ball side, higher finish than before.
        const Kb  = [sd*0.48*rch, 0.90, -fwd*0.48];
        const KbT = [sd*0.82*rch, 1.00, -fwd*0.70];
        const KbE = [sd*0.40*rch, 0.82, -fwd*0.22];
        const Kc  = c ? [c[0]*0.60*rch, Math.max(0.78,c[1]-0.18), c[2]*0.60*rch] : [sd*0.52*rch, 1.00, fwd*0.40];
        const KcT = c ? c : [sd*1.0, 1.05, fwd*0.62];
        const KcE = [sd*0.32*rch, 0.88, fwd*0.18];
        const Kf  = [-sd*0.28*rch, 1.65, fwd*0.44];
        const KfT = [-sd*0.52, 1.84, fwd*0.30];
        const KfE = [-sd*0.10*rch, 1.46, fwd*0.32];
        if (a.charging) {
          H2=Kb; T=KbT; E=KbE; shoulderTurn=sd*0.24;
        } else if (t<0.04) {
          H2=Kb; T=KbT; E=KbE; shoulderTurn=sd*0.24;
        } else if (t<0.10) {
          const u=(t-0.04)/0.06, uu=u*u;
          H2=KF(Kb,Kc,uu); T=KF(KbT,KcT,uu); E=KF(KbE,KcE,uu);
          shoulderTurn = lerp(sd*0.24, 0, uu);
        } else {
          const u=Math.min(1,(t-0.10)/0.55), uo=1-(1-u)*(1-u);
          H2=KF(Kc,Kf,uo); T=KF(KcT,KfT,uo); E=KF(KcE,KfE,uo);
          shoulderTurn = lerp(0, -sd*0.30, uo);
        }
        if (!two) off = [-sd*0.45, 1.25, fwd*0.25];
      }
    }
  } else {
    let antSide = 0;
    if (G.state === 'live' && !b.held) {
      if (isHuman && b.lastHitter===1 && G.strike && G.strike.t<0.7) antSide = e.antSide||0;
      if (!isHuman && b.lastHitter===0 && b.z<2 && Math.hypot(b.x-e.x,b.z-e.z)<7) antSide = e.antSide||0;
    }
    if (antSide) {
      const fh = !isHuman ? antSide < 0 : antSide > 0;
      two = !fh;
      H2 = [antSide*0.42,0.98,-fwd*0.32]; T = [antSide*0.7,1.08,-fwd*0.58];
      if (!two) off = [-antSide*0.4,1.2,fwd*0.2];
    } else {
      H2 = [dom*0.14,1.02,fwd*0.32]; T = [dom*0.12,1.4,fwd*0.52]; two = true;
    }
  }
  const hp = proj(e.x+H2[0],H2[1],e.z+H2[2]), tp = proj(e.x+T[0],T[1],e.z+T[2]);
  if (!hp||!tp) { drawBody(); return; }
  hp.x += lean;
  const ep = E ? proj(e.x+E[0], E[1], e.z+E[2]) : null;
  if (ep) ep.x += lean;

  const drawArms = () => {
    if (a && a.t < 0.5) { (e._tt||(e._tt=[])).push({x:tp.x,y:tp.y}); if(e._tt.length>7)e._tt.shift(); }
    else if (e._tt && e._tt.length) e._tt.length = 0;
    if (e._tt && e._tt.length > 2) {
      ctx.strokeStyle = 'rgba(230,240,255,0.2)'; ctx.lineWidth = Math.max(2, s*0.1);
      ctx.beginPath(); ctx.moveTo(e._tt[0].x,e._tt[0].y);
      e._tt.forEach(q => ctx.lineTo(q.x,q.y)); ctx.stroke();
    }
    // shoulderTurn > 0 = right shoulder forward (toward net); shifts shoulder screen-y
    const yTurn = shoulderTurn * s * 0.10;
    const shL = { x: pf.x-s*0.18+lean, y: yAt(1.42) + yTurn };
    const shR = { x: pf.x+s*0.18+lean, y: yAt(1.42) - yTurn };
    ctx.strokeStyle = skin; ctx.lineWidth = Math.max(2, s*0.075);
    if (two) {
      ctx.beginPath(); ctx.moveTo(shL.x,shL.y);
      if (ep) ctx.lineTo(ep.x,ep.y);
      ctx.lineTo(hp.x,hp.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(shR.x,shR.y);
      if (ep) ctx.lineTo(ep.x,ep.y);
      ctx.lineTo(hp.x,hp.y); ctx.stroke();
    } else {
      const domSh = (H2[0] >= 0) ? shR : shL;
      ctx.beginPath(); ctx.moveTo(domSh.x,domSh.y);
      if (ep) ctx.lineTo(ep.x,ep.y);
      ctx.lineTo(hp.x,hp.y); ctx.stroke();
      if (off) { const op = proj(e.x+off[0],off[1],e.z+off[2]);
        if (op) { op.x += lean; const oSh = (off[0] >= 0) ? shR : shL;
          ctx.beginPath(); ctx.moveTo(oSh.x,oSh.y); ctx.lineTo(op.x,op.y); ctx.stroke(); } }
    }
    const ang = Math.atan2(tp.y-hp.y, tp.x-hp.x);
    ctx.strokeStyle = '#caa36a'; ctx.lineWidth = Math.max(1.5, tp.s*0.05);
    ctx.beginPath(); ctx.moveTo(hp.x,hp.y); ctx.lineTo(tp.x,tp.y); ctx.stroke();
    const hx = tp.x + Math.cos(ang)*tp.s*0.12, hy = tp.y + Math.sin(ang)*tp.s*0.12;
    ctx.fillStyle = 'rgba(215,228,240,0.3)';
    ctx.strokeStyle = '#dfe8ef'; ctx.lineWidth = Math.max(1.5, tp.s*0.045);
    ctx.beginPath(); ctx.ellipse(hx,hy,Math.max(3,tp.s*0.16),Math.max(2.2,tp.s*0.11),ang,0,7);
    ctx.fill(); ctx.stroke();
  };

  if ((H2[2] + T[2]) / 2 < -0.06) { drawArms(); drawBody(); }
  else { drawBody(); drawArms(); }
}

function drawAimMarker() {
  if ((G.state !== 'serve' && G.state !== 'toss') || servingPlayer() !== 0) return;
  const p = proj(G.srvAim.x, 0, G.srvAim.z); if (!p) return;
  const pulse = 1 + 0.18 * Math.sin(performance.now() / 160);
  ctx.strokeStyle = 'rgba(90,231,208,0.85)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(p.x,p.y,p.s*0.35*pulse,p.s*0.13*pulse,0,0,7); ctx.stroke();
  ctx.fillStyle = 'rgba(90,231,208,0.35)';
  ctx.beginPath(); ctx.ellipse(p.x,p.y,p.s*0.1,p.s*0.045,0,0,7); ctx.fill();
}

export function render() {
  ctx.setTransform(RES,0,0,RES,0,0);
  ctx.clearRect(0,0,W,H);
  drawCourt();
  drawAimMarker();

  // Build entity list — doubles adds partner (idx 1) and npc2 (idx 3)
  const allEntities = [
    { e: G.npc, ck: G.npcColors[0], idx: 2 },
    ...(G.matchType === 'doubles' && G.npc2 ? [{ e: G.npc2, ck: G.npcColors[1], idx: 3 }] : []),
    ...(G.matchType === 'doubles' && G.partner ? [{ e: G.partner, ck: G.partnerColor, idx: 1 }] : []),
    { e: G.player, ck: G.playerColor, idx: 0 },
  ].sort((a, b) => a.e.z - b.e.z); // ascending z = furthest from camera first (painter's algo)

  const behindNet = allEntities.filter(({ e }) => e.z < 0);
  const inFront   = allEntities.filter(({ e }) => e.z >= 0);

  behindNet.forEach(({ e, ck, idx }) => drawChar(e, ck, idx));
  if (G.ball.z < 0) drawBall();
  drawNet();
  if (G.ball.z >= 0) { drawBall(); drawServeRing(); }
  inFront.forEach(({ e, ck, idx }) => drawChar(e, ck, idx));

  if (G.state === 'live') drawChargeIndicator();
  drawFb();
  const v = ctx.createRadialGradient(CX,H*0.55,H*0.45,CX,H*0.55,H*0.95);
  v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,0.28)');
  ctx.fillStyle = v; ctx.fillRect(0,0,W,H);
}
