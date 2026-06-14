export const G = {
  state:'menu',
  mode:'match', diffKey:'medium',
  player:{x:0.8, z:12.6, vx:0, vz:0, anim:null, cool:0, swingCd:0, recover:0, pending:null, charge:null},
  npc:{x:-0.8, z:-12.3, anim:null, cool:0, reactT:0, plan:null, tgt:{x:0,z:-11.6}, netMode:false},
  ball:{x:1, y:1.2, z:12.3, vx:0, vy:0, vz:0, spin:0, active:false, held:true,
        lastHitter:0, bounces:0, isServe:false, netHit:false, trail:[],
        squashT:0, hitFlash:null},
  particles: [],
  bounceMarks: [],
  score:null, server:0, serveNum:1,
  rally:0, bestRally:0, stats:[0,0],
  pointT:0, next:null, serveT:Infinity, toss:null,
  srvAim:{x:-2.05, z:-4.6},
  npcMem:{serve:{deuce:[],ad:[]}, lastServeRec:null, rallyX:0},
  strike:null, fb:null,
  mute:false, paused:false, started:false,
  cam:{x:0, y:8.6, z:19.9},

  // Doubles mode
  matchType:'singles',         // 'singles' | 'doubles'
  playerColor:'teal',
  partnerColor:'cobalt',
  npcColors:['coral','amber'],
  partner:null,                // AI partner entity (human team), null in singles
  npc2:null,                   // second CPU entity, null in singles
  lastHitterEntity:0,          // 0=player,1=partner,2=npc,3=npc2 — for AI decisions
  cpuHitter:null,              // entity object (npc or npc2) designated to hit this ball
  serveOrder:[],               // [0,2,1,3] or [2,0,3,1] — entity ids
  serveOrderIdx:0,
  receiveHuman:0,              // which human-team member receives (0=player,1=partner)
  receiveCpu:0,                // which cpu-team member receives (0=npc,1=npc2)
  receiverEntity:0,            // entity id designated to return THIS serve (set at serve setup)
};
window.G = G;

export const keys = {};
