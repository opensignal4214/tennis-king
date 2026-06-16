// In-page rally controller for scripting deterministic 1v1 scenarios.
//
// The game's AI/physics make wing (forehand/backhand) and shot kind (ground vs
// volley) emergent from *position*:
//   - human wing:  fore when ball is to the player's right  => (b.x - p.x) >= 0
//   - npc   wing:  fore when ball is to the npc's left      => (b.x - n.x) <= 0   (npc faces us)
//   - volley:      hitter is forward of the bounce          => human z≈2.5 / npc z>-6.5
//
// So instead of fighting the engine we just hold each player where their next
// contact yields the wing/kind we want. A high-frequency interval (faster than
// the 60Hz game loop) pins the *receiving* side every tick; the engine's own
// hit-detection then fires naturally. No engine code is modified — this only
// writes to window.G state that a human player could also produce.
//
// Config lives on window.__RC and is updated from the test via page.evaluate.

export async function installController(page) {
  await page.addInitScript(() => {
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    window.__RC = {
      active: false,
      // Applied to whichever side is about to receive/hit.
      human: { wing: 'fore', net: false, offset: 0.6, baseZ: 12.6, netZ: 3.8 },
      npc:   { wing: 'fore', net: false, offset: 0.7, baseZ: -11.0, netZ: -4.5 },
    };
    const tick = () => {
      const G = window.G, rc = window.__RC;
      if (G && rc.active && G.state === 'live') {
        const b = G.ball;
        if (b.lastHitter === 1) {
          // Ball travelling toward the human — hold the human for the chosen wing/kind.
          // Use the engine's own predicted contact x (G.strike, computed at p.z-0.35)
          // so the ball lands within canPlayerHit's 1.6m reach.
          const p = G.player, c = rc.human;
          const off = c.wing === 'fore' ? -c.offset : c.offset; // fore => p.x < contact
          const cx = (G.strike && Number.isFinite(G.strike.x)) ? G.strike.x : b.x;
          p.x = clamp(cx + off, -5, 5); p.vx = 0;
          p.z = c.net ? c.netZ : c.baseZ; p.vz = 0;
        } else if (b.lastHitter === 0) {
          // Ball travelling toward the npc — hold the npc and let it auto-hit.
          const n = G.npc, c = rc.npc;
          const off = c.wing === 'fore' ? c.offset : -c.offset; // fore => n.x > b.x
          n.x = clamp(b.x + off, -4.6, 4.6); n.vx = 0; n.reactT = 0;
          n.z = c.net ? c.netZ : c.baseZ; n.vz = 0;
          n.netMode = !!c.net; n.tgt = { x: n.x, z: n.z };
        }
      }
      window.requestAnimationFrame(tick);
    };
    // Run as fast as the frame loop, plus a short-interval backstop so a pin lands
    // even if rAF is throttled while backgrounded.
    window.requestAnimationFrame(tick);
    setInterval(tick, 4);
  });
}

/** Enable/disable pinning. */
export function setController(page, active) {
  return page.evaluate((a) => { window.__RC.active = a; }, active);
}

/** Set the per-side config (wing: 'fore'|'back', net: bool, offset?, baseZ?, netZ?). */
export function configureSides(page, human, npc) {
  return page.evaluate(({ human, npc }) => {
    if (human) Object.assign(window.__RC.human, human);
    if (npc) Object.assign(window.__RC.npc, npc);
  }, { human, npc });
}
