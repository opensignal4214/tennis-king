export const G = {
  state:'menu',
  mode:'match', diffKey:'medium',
  player:{x:0.8, z:12.6, vx:0, vz:0, anim:null, cool:0, swingCd:0, recover:0, pending:null, charge:null},
  npc:{x:-0.8, z:-12.3, anim:null, cool:0, reactT:0, plan:null, tgt:{x:0,z:-11.6}, netMode:false},
  ball:{x:1, y:1.2, z:12.3, vx:0, vy:0, vz:0, spin:0, active:false, held:true,
        lastHitter:0, bounces:0, isServe:false, netHit:false, trail:[]},
  score:null, server:0, serveNum:1,
  rally:0, bestRally:0, stats:[0,0],
  pointT:0, next:null, serveT:Infinity, toss:null,
  srvAim:{x:-2.05, z:-4.6},
  npcMem:{serve:{deuce:[],ad:[]}, lastServeRec:null, rallyX:0},
  strike:null, fb:null,
  mute:false, paused:false, started:false,
  cam:{x:0, y:8.6, z:19.9},
};
window.G = G;

export const keys = {};
