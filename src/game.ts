import {
  createSystem,
  World,
  PanelUI,
  PanelDocument,
  UIKitDocument,
  UIKit,
  eq,
  Entity,
} from '@iwsdk/core';
import {
  Scene,
  Mesh,
  MeshBasicMaterial,
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  TorusGeometry,
  Group,
  Vector3,
  Color,
  FogExp2,
  Object3D,
  PerspectiveCamera,
} from '@iwsdk/core';

interface ColorScheme { name: string; primary: string; accent: string; bg: string; enemy: string; civilian: string; powerup: string; }
const SCHEMES: ColorScheme[] = [
  { name: 'Cyan',    primary: '#00ffff', accent: '#ff00ff', bg: '#001122', enemy: '#ff3333', civilian: '#33ff33', powerup: '#ffff00' },
  { name: 'Green',   primary: '#00ff88', accent: '#ff8800', bg: '#001108', enemy: '#ff4444', civilian: '#44aaff', powerup: '#ffcc00' },
  { name: 'Magenta', primary: '#ff00ff', accent: '#00ffff', bg: '#110022', enemy: '#ff6633', civilian: '#33ffaa', powerup: '#ffff33' },
  { name: 'Gold',    primary: '#ffcc00', accent: '#00ccff', bg: '#111100', enemy: '#ff3366', civilian: '#66ff66', powerup: '#ff9900' },
];

interface EnemyCar { mesh: Group; x: number; z: number; speed: number; type: 'sedan'|'motorcycle'|'helicopter'|'armored'|'van'|'interceptor'; hp: number; fireTimer: number; dead: boolean; targetLane: number; laneChangeT: number; deathSpin: number; dying: boolean; mineCD: number; }
interface CivilianCar { mesh: Group; x: number; z: number; speed: number; dead: boolean; }
interface Bullet { mesh: Mesh; x: number; z: number; fromPlayer: boolean; speed: number; dead: boolean; dx: number; }
interface PowerUpObj { mesh: Group; x: number; z: number; type: 'missile'|'oilslick'|'shield'|'speed'|'rapid'|'weapon'; dead: boolean; rotY: number; }
interface OilSlick { mesh: Mesh; x: number; z: number; timer: number; dead: boolean; }
interface SmokeCloud { mesh: Group; x: number; z: number; timer: number; dead: boolean; opacity: number; }
interface Particle { mesh: Mesh; vel: Vector3; life: number; maxLife: number; }
interface ScorePopup { mesh: Mesh; y: number; life: number; }
interface RoadHazard { mesh: Group; x: number; z: number; type: 'pothole'|'barrier'|'cone'; dead: boolean; }
interface Mine { mesh: Mesh; x: number; z: number; timer: number; dead: boolean; }
interface RoadSeg { mesh: Group; z: number; isBridge: boolean; isTunnel: boolean; }
interface Achievement { id: string; name: string; desc: string; unlocked: boolean; }
interface TrailPart { mesh: Mesh; life: number; }
interface RoadsideObj { mesh: Group; z: number; side: number; }
interface Mission { type: 'kill_count'|'distance_nodmg'|'kill_oil'|'kill_timed'|'combo_target'; desc: string; target: number; progress: number; timer: number; active: boolean; }
interface Decoy { mesh: Group; x: number; z: number; life: number; dead: boolean; }
interface EMPWave { mesh: Mesh; radius: number; life: number; dead: boolean; }
interface WeaponsTruck { mesh: Group; x: number; z: number; active: boolean; docked: boolean; dockTimer: number; }
interface RainDrop { mesh: Mesh; vel: number; }
interface JumpRamp { mesh: Group; x: number; z: number; dead: boolean; }

const ROAD_WIDTH = 12; const LANE_COUNT = 5; const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;
const ROAD_SEG_LEN = 40; const ROAD_VIS = 8; const PLAYER_Z = -8;
const SCROLL_SPD = 18; const PLAYER_SPD = 6; const BULLET_SPD = 40;
const ENEMY_FIRE_RATE = 2.5; const SPAWN_INT = 1.2; const PU_INT = 8; const CIV_INT = 4; const COMBO_DECAY = 3;
const HAZARD_INT = 6; const SMOKE_DUR = 4; const BRIDGE_CHANCE = 0.12; const TUNNEL_CHANCE = 0.08;

// Audio
let actx: AudioContext | null = null;
function ensureAudio() { if (!actx) actx = new AudioContext(); if (actx.state === 'suspended') actx.resume(); return actx; }
function tone(f: number, d: number, t: OscillatorType = 'square', v = 0.12) {
  try { const c = ensureAudio(); const o = c.createOscillator(); const g = c.createGain(); o.type = t; o.frequency.value = f; g.gain.setValueAtTime(v, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + d); } catch {}
}
function sfxShoot() { tone(880, 0.08, 'square', 0.08); }
function sfxSpread() { tone(1000, 0.06, 'square', 0.06); tone(900, 0.06, 'square', 0.05); }
function sfxLaser() { tone(1200, 0.12, 'sine', 0.07); }
function sfxEnemyShoot() { tone(440, 0.1, 'sawtooth', 0.06); }
function sfxHit() { tone(220, 0.15, 'sawtooth', 0.1); tone(110, 0.2, 'square', 0.08); }
function sfxExplosion() { tone(80, 0.3, 'sawtooth', 0.15); tone(60, 0.4, 'square', 0.1); }
function sfxPowerUp() { tone(660, 0.1, 'sine', 0.1); setTimeout(() => tone(880, 0.1, 'sine', 0.1), 80); setTimeout(() => tone(1100, 0.15, 'sine', 0.1), 160); }
function sfxWeaponUp() { tone(550, 0.08, 'sine', 0.08); setTimeout(() => tone(770, 0.08, 'sine', 0.1), 60); setTimeout(() => tone(990, 0.08, 'sine', 0.1), 120); setTimeout(() => tone(1210, 0.12, 'sine', 0.12), 180); }
function sfxOilDrop() { tone(200, 0.2, 'triangle', 0.08); }
function sfxSmoke() { tone(150, 0.3, 'triangle', 0.06); tone(100, 0.4, 'triangle', 0.04); }
function sfxCivHit() { tone(300, 0.2, 'sine', 0.1); tone(200, 0.3, 'sine', 0.08); }
function sfxShield() { tone(500, 0.15, 'sine', 0.08); }
function sfxWave() { tone(440, 0.1, 'sine', 0.08); setTimeout(() => tone(660, 0.15, 'sine', 0.1), 100); }
function sfxDeath() { tone(200, 0.2, 'sawtooth', 0.12); tone(100, 0.4, 'sawtooth', 0.1); }
function sfxBoss() { tone(150, 0.3, 'square', 0.12); tone(100, 0.5, 'sawtooth', 0.1); }
function sfxAch() { tone(880, 0.1, 'sine', 0.1); setTimeout(() => tone(1100, 0.1, 'sine', 0.1), 100); setTimeout(() => tone(1320, 0.15, 'sine', 0.12), 200); }
function sfxGO() { tone(440, 0.2, 'sine', 0.1); setTimeout(() => tone(330, 0.2, 'sine', 0.1), 200); setTimeout(() => tone(220, 0.3, 'sine', 0.1), 400); }
function sfxCombo() { tone(660, 0.08, 'sine', 0.08); }
function sfxHazard() { tone(180, 0.15, 'sawtooth', 0.08); tone(120, 0.2, 'square', 0.06); }
function sfxMine() { tone(300, 0.1, 'sawtooth', 0.06); tone(250, 0.15, 'square', 0.05); }
function sfxMissionComplete() { tone(660, 0.1, 'sine', 0.12); setTimeout(() => tone(880, 0.1, 'sine', 0.12), 80); setTimeout(() => tone(1100, 0.1, 'sine', 0.12), 160); setTimeout(() => tone(1320, 0.15, 'sine', 0.14), 240); setTimeout(() => tone(1540, 0.2, 'sine', 0.12), 320); }
function sfxEMP() { tone(100, 0.4, 'sine', 0.15); tone(200, 0.3, 'triangle', 0.1); setTimeout(() => tone(50, 0.5, 'sine', 0.12), 100); }
function sfxDecoy() { tone(500, 0.12, 'sine', 0.08); setTimeout(() => tone(700, 0.1, 'triangle', 0.06), 60); setTimeout(() => tone(500, 0.15, 'sine', 0.06), 120); }
function sfxFormation() { tone(400, 0.15, 'square', 0.08); setTimeout(() => tone(500, 0.1, 'square', 0.06), 100); }
function sfxHeatUp() { tone(330, 0.15, 'sawtooth', 0.08); setTimeout(() => tone(440, 0.1, 'sawtooth', 0.08), 80); setTimeout(() => tone(550, 0.15, 'sawtooth', 0.1), 160); }
function sfxTruckHorn() { tone(180, 0.4, 'square', 0.1); tone(220, 0.35, 'square', 0.08); }
function sfxDock() { tone(440, 0.1, 'sine', 0.12); setTimeout(() => tone(550, 0.1, 'sine', 0.12), 60); setTimeout(() => tone(660, 0.1, 'sine', 0.12), 120); setTimeout(() => tone(880, 0.15, 'sine', 0.14), 180); setTimeout(() => tone(1100, 0.2, 'sine', 0.12), 250); }
function sfxJump() { tone(300, 0.08, 'sine', 0.1); setTimeout(() => tone(400, 0.1, 'sine', 0.1), 50); setTimeout(() => tone(550, 0.12, 'sine', 0.1), 100); setTimeout(() => tone(700, 0.15, 'sine', 0.08), 150); }
function sfxLand() { tone(150, 0.2, 'sawtooth', 0.1); tone(80, 0.3, 'square', 0.06); }
function sfxRainStart() { tone(100, 0.5, 'triangle', 0.04); tone(150, 0.4, 'triangle', 0.03); }

let mosc1: OscillatorNode|null = null, mosc2: OscillatorNode|null = null, mosc3: OscillatorNode|null = null;
let mgain: GainNode|null = null, mgain2: GainNode|null = null, mgain3: GainNode|null = null;
function startMusic() {
  try {
    const c = ensureAudio();
    mgain = c.createGain(); mgain.gain.value = 0.03; mgain.connect(c.destination);
    mosc1 = c.createOscillator(); mosc1.type = 'sine'; mosc1.frequency.value = 55; mosc1.connect(mgain); mosc1.start();
    mgain2 = c.createGain(); mgain2.gain.value = 0.02; mgain2.connect(c.destination);
    mosc2 = c.createOscillator(); mosc2.type = 'triangle'; mosc2.frequency.value = 82.5; mosc2.connect(mgain2); mosc2.start();
    mgain3 = c.createGain(); mgain3.gain.value = 0.0; mgain3.connect(c.destination);
    mosc3 = c.createOscillator(); mosc3.type = 'sawtooth'; mosc3.frequency.value = 40; mosc3.connect(mgain3); mosc3.start();
  } catch {}
}
function updateMusic(w: number, intensity: number, isBoss: boolean) {
  if (mosc1) mosc1.frequency.value = 55 + (w % 8) * 5 + intensity * 10;
  if (mosc2) mosc2.frequency.value = 82.5 + (w % 8) * 3 + intensity * 5;
  if (mgain) mgain.gain.value = 0.03 + intensity * 0.015;
  if (mgain2) mgain2.gain.value = 0.02 + intensity * 0.01;
  // Bass oscillator for bosses / high intensity
  if (mosc3) mosc3.frequency.value = isBoss ? 35 : 40 + w * 2;
  if (mgain3) mgain3.gain.value = isBoss ? 0.04 : intensity * 0.02;
}

// Helpers
function laneX(l: number) { return (l - 2) * LANE_WIDTH; }
function ri(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function rf(a: number, b: number) { return Math.random() * (b - a) + a; }
function clp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function sbox(w: number, h: number, d: number, c: string, op = 1) { return new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial({ color: c, transparent: op < 1, opacity: op })); }

export class GameSystem extends createSystem({
  menuP:    { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/menu.json')] },
  hudP:     { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/hud.json')] },
  pauseP:   { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/pause.json')] },
  resultsP: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/results.json')] },
  settingsP:{ required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/settings.json')] },
  achP:     { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/achievements.json')] },
  statsP:   { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/stats.json')] },
  tutP:     { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/tutorial.json')] },
  radarP:   { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/radar.json')] },
}) {
  private _scene!: Scene;
  private gState: 'menu'|'playing'|'paused'|'gameover' = 'menu';
  private score = 0; private lives = 3; private wave = 1; private dist = 0;
  private combo = 1; private comboT = 0; private maxCombo = 1; private gTime = 0; private moves = 0;
  private scrollSpd = SCROLL_SPD; private mode: 'arcade'|'speed'|'zen'|'challenge' = 'arcade';
  private diff: 'normal'|'hard'|'insane' = 'normal'; private cIdx = 0;
  private pGroup!: Group; private pX = 0; private pShield = false; private shieldT = 0; private shieldM!: Mesh;
  private rapidF = false; private rapidT = 0; private spdBoost = false; private spdT = 0;
  private fireT = 0; private fireCD = 0.18; private invT = 0;
  private weaponLvl = 0;
  private headlightL!: Mesh; private headlightR!: Mesh;
  private enemies: EnemyCar[] = []; private civs: CivilianCar[] = []; private bullets: Bullet[] = [];
  private pups: PowerUpObj[] = []; private oils: OilSlick[] = []; private smokes: SmokeCloud[] = [];
  private parts: Particle[] = []; private popups: ScorePopup[] = []; private trails: TrailPart[] = [];
  private hazards: RoadHazard[] = []; private mines: Mine[] = [];
  private roadSegs: RoadSeg[] = []; private orbs: Mesh[] = [];
  private roadObjs: RoadsideObj[] = [];
  private spawnT = 0; private puT = 0; private civT = 0; private waveT = 0; private hazT = 0; private bossOut = false;
  private envG!: Group; private roadG!: Group; private entG!: Group;
  private keys = new Set<string>(); private gpad = { axes: { x: 0, y: 0 }, trigger: false, grip: false, a: false, b: false };
  private prevGrip = false; private prevB = false; private prevA = false;
  private panels = new Map<string, Entity>();
  private menuDoc: UIKitDocument|null = null; private hudDoc: UIKitDocument|null = null;
  private pauseDoc: UIKitDocument|null = null; private resDoc: UIKitDocument|null = null;
  private setDoc: UIKitDocument|null = null; private achDoc: UIKitDocument|null = null;
  private statDoc: UIKitDocument|null = null; private tutDoc: UIKitDocument|null = null;
  private radarDoc: UIKitDocument|null = null;
  private achs: Achievement[] = []; private achPg = 0;
  private career = { gamesPlayed: 0, totalScore: 0, highScore: 0, totalKills: 0, totalDist: 0, totalPU: 0, totalOil: 0, totalBoss: 0, bestWave: 1, bestCombo: 1, totalSmokes: 0, totalHazards: 0, maxWeapon: 0, bridgesCrossed: 0, perfectWaves: 0, totalMissions: 0, totalVanKills: 0, totalInterceptorKills: 0, totalEMPs: 0, totalDecoys: 0, totalDocks: 0, totalJumps: 0, totalRainDist: 0 };
  private sKills = 0; private sOils = 0; private sCivHits = 0; private sSmokes = 0; private sHazardsDodged = 0;
  private puTypes = new Set<string>(); private oilCD = 0; private smokeCD = 0;
  private waveNoDmg = true; private sPerfectWaves = 0; private sBridges = 0;
  private shakeT = 0; private shakeStr = 0;
  private camBase = new Vector3();
  // New R3 state
  private sVanKills = 0; private sInterceptorKills = 0; private sMinesDodged = 0;
  private mission: Mission|null = null; private missionCD = 0; private sMissionsCompleted = 0;
  private missionKillsAtStart = 0; private missionDistAtStart = 0; private missionNoDmg = true;
  private musicIntensity = 0; private roadObjT = 0;
  private killTypesThisGame = new Set<string>();
  private comboMaxT = 0; private consecutivePerfect = 0;
  private sLaserKills = 0;
  private tunnelsPassed = 0;
  // Round 5 state
  private decoys: Decoy[] = [];
  private empWaves: EMPWave[] = [];
  private empCD = 0; private decoyCD = 0;
  private empCharges = 2; private decoyCharges = 3;
  private sEMPsUsed = 0; private sDecoysUsed = 0; private sEMPKills = 0;
  private heatLevel = 0; private heatTimer = 0; private maxHeatLevel = 0;
  private nightPhase = 0; private dayNightTimer = 0; private isNight = false;
  private formationCD = 0; private sFormationsCleared = 0;
  // Round 6: Weapons Truck, Jump Ramp, Rain
  private weaponsTruck: WeaponsTruck | null = null; private truckCD = 0; private sDocks = 0;
  private jumpRamps: JumpRamp[] = []; private rampCD = 0; private isAirborne = false; private airT = 0; private airY = 0; private sJumps = 0;
  private rainDrops: RainDrop[] = []; private isRaining = false; private rainTimer = 0; private rainCD = 0; private sRainDist = 0;

  private st(doc: UIKitDocument|null, id: string, text: string) { if (!doc) return; (doc.getElementById(id) as UIKit.Text|undefined)?.setProperties({ text }); }
  private sv(e: Entity, v: boolean) { try { const o = (e as any).object3D; if (o) { const s = v ? 3 : 0; o.scale.set(s, s, s); } } catch {} }

  init() {
    this._scene = this.world.scene;
    this.camBase.copy(this.world.camera.position);
    this.loadData(); this.initAchs(); this.buildEnv(); this.buildPlayer(); this.createRoad(); this.setupInput(); this.setupPanels(); this.showP('menu');
  }

  private loadData() { try { const s = localStorage.getItem('neon-spy-career'); if (s) this.career = { ...this.career, ...JSON.parse(s) }; const a = localStorage.getItem('neon-spy-achs'); if (a) { (JSON.parse(a) as string[]).forEach(id => { const x = this.achs.find(v => v.id === id); if (x) x.unlocked = true; }); } const c = localStorage.getItem('neon-spy-color'); if (c) this.cIdx = parseInt(c) || 0; } catch {} }
  private saveData() { try { localStorage.setItem('neon-spy-career', JSON.stringify(this.career)); localStorage.setItem('neon-spy-achs', JSON.stringify(this.achs.filter(a => a.unlocked).map(a => a.id))); localStorage.setItem('neon-spy-color', String(this.cIdx)); } catch {} }


  private initAchs() {
    this.achs = [
      // Original 30
      { id: 'first-kill', name: 'First Blood', desc: 'Destroy your first enemy', unlocked: false },
      { id: 'kills-10', name: 'Agent 10', desc: 'Destroy 10 enemies in one game', unlocked: false },
      { id: 'kills-25', name: 'Double Agent', desc: 'Destroy 25 enemies in one game', unlocked: false },
      { id: 'kills-50', name: 'Triple Agent', desc: 'Destroy 50 enemies in one game', unlocked: false },
      { id: 'kills-100', name: 'Century Spy', desc: 'Destroy 100 enemies in one game', unlocked: false },
      { id: 'score-5k', name: 'Rookie Agent', desc: 'Score 5,000 points', unlocked: false },
      { id: 'score-10k', name: 'Field Agent', desc: 'Score 10,000 points', unlocked: false },
      { id: 'score-25k', name: 'Special Agent', desc: 'Score 25,000 points', unlocked: false },
      { id: 'score-50k', name: 'Senior Agent', desc: 'Score 50,000 points', unlocked: false },
      { id: 'score-100k', name: 'Director', desc: 'Score 100,000 points', unlocked: false },
      { id: 'wave-5', name: 'Survivor', desc: 'Reach wave 5', unlocked: false },
      { id: 'wave-10', name: 'Veteran', desc: 'Reach wave 10', unlocked: false },
      { id: 'wave-15', name: 'Elite', desc: 'Reach wave 15', unlocked: false },
      { id: 'wave-20', name: 'Legendary', desc: 'Reach wave 20', unlocked: false },
      { id: 'combo-3', name: 'Triple Threat', desc: 'Get a 3x combo', unlocked: false },
      { id: 'combo-5', name: 'Combo Master', desc: 'Get a 5x combo', unlocked: false },
      { id: 'combo-8', name: 'Combo King', desc: 'Get an 8x combo', unlocked: false },
      { id: 'oil-5', name: 'Slippery', desc: 'Deploy 5 oil slicks in one game', unlocked: false },
      { id: 'oil-15', name: 'Oil Baron', desc: 'Deploy 15 oil slicks in one game', unlocked: false },
      { id: 'shield-use', name: 'Protected', desc: 'Use a shield power-up', unlocked: false },
      { id: 'rapid-use', name: 'Rapid Response', desc: 'Use rapid fire power-up', unlocked: false },
      { id: 'speed-use', name: 'Speed Demon', desc: 'Use speed boost power-up', unlocked: false },
      { id: 'all-pu', name: 'Arsenal', desc: 'Collect all power-up types', unlocked: false },
      { id: 'boss-kill', name: 'Boss Hunter', desc: 'Destroy a boss vehicle', unlocked: false },
      { id: 'boss-5', name: 'Boss Slayer', desc: 'Destroy 5 bosses total', unlocked: false },
      { id: 'clean-op', name: 'Clean Op', desc: 'Reach wave 5 without civilian hits', unlocked: false },
      { id: 'dist-1k', name: 'Road Runner', desc: 'Travel 1,000 meters', unlocked: false },
      { id: 'dist-5k', name: 'Long Haul', desc: 'Travel 5,000 meters', unlocked: false },
      { id: 'games-10', name: 'Regular', desc: 'Play 10 games', unlocked: false },
      { id: 'games-50', name: 'Dedicated', desc: 'Play 50 games', unlocked: false },
      // Round 2 achievements (20)
      { id: 'weapon-spread', name: 'Spread Eagle', desc: 'Upgrade to spread shot', unlocked: false },
      { id: 'weapon-laser', name: 'Laser Focus', desc: 'Upgrade to laser beam', unlocked: false },
      { id: 'weapon-max-3', name: 'Fully Armed', desc: 'Reach max weapon level 3 times', unlocked: false },
      { id: 'smoke-1', name: 'Smoke Signal', desc: 'Deploy your first smoke screen', unlocked: false },
      { id: 'smoke-10', name: 'Fog of War', desc: 'Deploy 10 smoke screens in one game', unlocked: false },
      { id: 'smoke-kill', name: 'Blind Justice', desc: 'Kill an enemy inside your smoke', unlocked: false },
      { id: 'hazard-dodge-10', name: 'Road Warrior', desc: 'Pass 10 road hazards in one game', unlocked: false },
      { id: 'hazard-dodge-30', name: 'Highway Star', desc: 'Pass 30 road hazards in one game', unlocked: false },
      { id: 'bridge-3', name: 'Bridge Builder', desc: 'Cross 3 bridges in one game', unlocked: false },
      { id: 'bridge-10', name: 'Bridge Master', desc: 'Cross 10 bridges total', unlocked: false },
      { id: 'perfect-wave', name: 'Untouchable', desc: 'Complete a wave without taking damage', unlocked: false },
      { id: 'perfect-3', name: 'Ghost Agent', desc: 'Complete 3 perfect waves in one game', unlocked: false },
      { id: 'speed-kill', name: 'Fast and Furious', desc: 'Kill an enemy during speed boost', unlocked: false },
      { id: 'multi-kill-3', name: 'Multi Kill', desc: 'Destroy 3 enemies within 1 second', unlocked: false },
      { id: 'score-200k', name: 'Spymaster', desc: 'Score 200,000 points', unlocked: false },
      { id: 'kills-200', name: 'Mass Destruction', desc: 'Destroy 200 enemies in one game', unlocked: false },
      { id: 'dist-10k', name: 'Marathon', desc: 'Travel 10,000 meters in one game', unlocked: false },
      { id: 'oil-boss', name: 'Slick Move', desc: 'Destroy a boss with an oil slick', unlocked: false },
      { id: 'wave-30', name: 'Immortal', desc: 'Reach wave 30', unlocked: false },
      { id: 'all-modes', name: 'Versatile', desc: 'Play all 4 game modes', unlocked: false },
      // Round 3 achievements (22 new — total 72)
      { id: 'van-kill', name: 'Van Hunter', desc: 'Destroy a van', unlocked: false },
      { id: 'van-kill-5', name: 'Van Exterminator', desc: 'Destroy 5 vans in one game', unlocked: false },
      { id: 'interceptor-kill', name: 'Intercepted', desc: 'Destroy an interceptor', unlocked: false },
      { id: 'interceptor-5', name: 'Counter Intel', desc: 'Destroy 5 interceptors in one game', unlocked: false },
      { id: 'mine-dodge-5', name: 'Minesweeper', desc: 'Dodge 5 mines in one game', unlocked: false },
      { id: 'mine-dodge-15', name: 'Mine Expert', desc: 'Dodge 15 mines in one game', unlocked: false },
      { id: 'mission-1', name: 'Mission Possible', desc: 'Complete your first mission', unlocked: false },
      { id: 'mission-3', name: 'Field Operative', desc: 'Complete 3 missions in one game', unlocked: false },
      { id: 'mission-5', name: 'Mission Specialist', desc: 'Complete 5 missions in one game', unlocked: false },
      { id: 'mission-total-10', name: 'Mission Master', desc: 'Complete 10 missions total', unlocked: false },
      { id: 'wave-40', name: 'Unstoppable', desc: 'Reach wave 40', unlocked: false },
      { id: 'wave-50', name: 'Infinite Agent', desc: 'Reach wave 50', unlocked: false },
      { id: 'kills-300', name: 'Obliterator', desc: 'Destroy 300 enemies in one game', unlocked: false },
      { id: 'bridge-5-game', name: 'Bridge Runner', desc: 'Cross 5 bridges in one game', unlocked: false },
      { id: 'all-enemy-types', name: 'Diverse Kills', desc: 'Kill all 6 enemy types in one game', unlocked: false },
      { id: 'laser-kills-20', name: 'Laser Master', desc: 'Kill 20 enemies with laser in one game', unlocked: false },
      { id: 'no-weapon-wave5', name: 'Barehanded', desc: 'Reach wave 5 with base weapon only', unlocked: false },
      { id: 'score-500k', name: 'Legend', desc: 'Score 500,000 points', unlocked: false },
      { id: 'combo-streak', name: 'Combo Streak', desc: 'Maintain 8x combo for 8 seconds', unlocked: false },
      { id: 'consecutive-perfect-5', name: 'Flawless Streak', desc: 'Get 5 consecutive perfect waves', unlocked: false },
      { id: 'tunnel-3', name: 'Tunnel Rat', desc: 'Pass through 3 tunnels', unlocked: false },
      { id: 'total-dist-50k', name: 'World Tour', desc: 'Travel 50,000 meters total', unlocked: false },
      // Round 5 achievements (20 new — total 92)
      { id: 'emp-1', name: 'EMP Strike', desc: 'Use your first EMP blast', unlocked: false },
      { id: 'emp-3', name: 'Electromagnetic', desc: 'Use 3 EMPs in one game', unlocked: false },
      { id: 'emp-kill-5', name: 'Shock Trooper', desc: 'Stun-kill 5 enemies with EMP', unlocked: false },
      { id: 'decoy-1', name: 'Body Double', desc: 'Deploy your first decoy', unlocked: false },
      { id: 'decoy-5', name: 'Illusionist', desc: 'Deploy 5 decoys in one game', unlocked: false },
      { id: 'decoy-absorb', name: 'Bullet Sponge', desc: 'Decoy absorbs 10 enemy shots', unlocked: false },
      { id: 'formation-1', name: 'Formation Breaker', desc: 'Survive an enemy formation', unlocked: false },
      { id: 'formation-5', name: 'Tactician', desc: 'Clear 5 enemy formations', unlocked: false },
      { id: 'formation-10', name: 'Strategist', desc: 'Clear 10 formations total', unlocked: false },
      { id: 'heat-3', name: 'Wanted', desc: 'Reach heat level 3', unlocked: false },
      { id: 'heat-5', name: 'Most Wanted', desc: 'Reach heat level 5', unlocked: false },
      { id: 'heat-max', name: 'Public Enemy', desc: 'Reach maximum heat level 7', unlocked: false },
      { id: 'night-survive', name: 'Night Owl', desc: 'Survive a full night cycle', unlocked: false },
      { id: 'night-kills-10', name: 'Night Hunter', desc: 'Kill 10 enemies during night', unlocked: false },
      { id: 'night-boss', name: 'Shadow Ops', desc: 'Kill a boss during night', unlocked: false },
      { id: 'gadget-master', name: 'Gadget Master', desc: 'Use EMP, decoy, oil, and smoke in one game', unlocked: false },
      { id: 'wave-60', name: 'Eternal Agent', desc: 'Reach wave 60', unlocked: false },
      { id: 'score-1m', name: 'Millionaire', desc: 'Score 1,000,000 points', unlocked: false },
      { id: 'perfect-10', name: 'Perfect Ten', desc: 'Complete 10 perfect waves total', unlocked: false },
      { id: 'total-kills-1k', name: 'Thousand Kills', desc: 'Destroy 1,000 enemies total', unlocked: false },
      // Round 6 achievements (18 new — total 110)
      { id: 'truck-dock', name: 'Pit Stop', desc: 'Dock with the weapons truck', unlocked: false },
      { id: 'truck-dock-3', name: 'Supply Chain', desc: 'Dock with truck 3 times in one game', unlocked: false },
      { id: 'truck-dock-5', name: 'Logistics Expert', desc: 'Dock 5 times in one game', unlocked: false },
      { id: 'total-docks-20', name: 'Regular Customer', desc: 'Dock 20 times total', unlocked: false },
      { id: 'jump-1', name: 'Airborne', desc: 'Launch off your first ramp', unlocked: false },
      { id: 'jump-5', name: 'Stunt Driver', desc: 'Hit 5 ramps in one game', unlocked: false },
      { id: 'jump-10', name: 'Daredevil', desc: 'Hit 10 ramps in one game', unlocked: false },
      { id: 'jump-kill', name: 'Air Strike', desc: 'Kill an enemy while airborne', unlocked: false },
      { id: 'total-jumps-50', name: 'Sky Pilot', desc: 'Hit 50 ramps total', unlocked: false },
      { id: 'rain-drive', name: 'Storm Chaser', desc: 'Drive through rain for the first time', unlocked: false },
      { id: 'rain-500m', name: 'Rain Runner', desc: 'Drive 500m in rain in one game', unlocked: false },
      { id: 'rain-kill-10', name: 'Monsoon Warrior', desc: 'Kill 10 enemies during rain', unlocked: false },
      { id: 'rain-boss', name: 'Thunderbolt', desc: 'Kill a boss during rain', unlocked: false },
      { id: 'all-weather', name: 'All Weather', desc: 'Fight in day, night, and rain', unlocked: false },
      { id: 'total-rain-5k', name: 'Wet Road Veteran', desc: 'Drive 5,000m in rain total', unlocked: false },
      { id: 'jump-dodge-mine', name: 'Mine Hopper', desc: 'Jump over a mine', unlocked: false },
      { id: 'dock-full-weapon', name: 'Maximum Firepower', desc: 'Dock at max weapon level for bonus', unlocked: false },
      { id: 'wave-75', name: 'Endurance', desc: 'Reach wave 75', unlocked: false },
    ];
    try { const a = localStorage.getItem('neon-spy-achs'); if (a) { (JSON.parse(a) as string[]).forEach(id => { const x = this.achs.find(v => v.id === id); if (x) x.unlocked = true; }); } } catch {}
  }

  private unlock(id: string) { const a = this.achs.find(v => v.id === id); if (a && !a.unlocked) { a.unlocked = true; sfxAch(); this.saveData(); } }

  private triggerShake(str: number, dur: number) { this.shakeStr = str; this.shakeT = dur; }

  private addPopup(x: number, z: number, pts: number) {
    const sc = SCHEMES[this.cIdx];
    const m = sbox(0.8, 0.3, 0.1, pts > 0 ? sc.powerup : sc.enemy, 0.9);
    m.position.set(x, 2, z); this._scene.add(m);
    this.popups.push({ mesh: m, y: 2, life: 1.0 });
  }


  private buildEnv() {
    const sc = SCHEMES[this.cIdx];
    this._scene.background = new Color(sc.bg);
    this._scene.fog = new FogExp2(sc.bg, 0.012);
    this.envG = new Group(); this._scene.add(this.envG);
    const gf = new Mesh(new BoxGeometry(200, 0.01, 200), new MeshBasicMaterial({ color: sc.primary, wireframe: true, transparent: true, opacity: 0.06 }));
    gf.position.y = -0.01; this.envG.add(gf);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = 50;
      const p = new Mesh(new CylinderGeometry(0.3, 0.3, 15, 6), new MeshBasicMaterial({ color: sc.primary, wireframe: true, transparent: true, opacity: 0.15 }));
      p.position.set(Math.cos(a) * r, 7.5, Math.sin(a) * r); this.envG.add(p);
      const c = new Mesh(new SphereGeometry(0.6, 6, 6), new MeshBasicMaterial({ color: sc.accent, wireframe: true, transparent: true, opacity: 0.2 }));
      c.position.set(Math.cos(a) * r, 15, Math.sin(a) * r); this.envG.add(c);
    }
    for (let i = 0; i < 4; i++) { const b = new Mesh(new BoxGeometry(100, 0.2, 0.2), new MeshBasicMaterial({ color: sc.accent, wireframe: true, transparent: true, opacity: 0.1 })); b.position.set(0, 16, -20 + i * 15); this.envG.add(b); }
    for (let i = 0; i < 25; i++) { const o = new Mesh(new SphereGeometry(0.15, 8, 8), new MeshBasicMaterial({ color: sc.accent, transparent: true, opacity: 0.3 })); o.position.set(rf(-40, 40), rf(2, 14), rf(-60, 60)); this._scene.add(o); this.orbs.push(o); }
    for (let i = 0; i < 60; i++) { const s = new Mesh(new SphereGeometry(0.05, 4, 4), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: rf(0.2, 0.6) })); s.position.set(rf(-80, 80), rf(10, 25), rf(-80, 80)); this._scene.add(s); }
    this.roadG = new Group(); this._scene.add(this.roadG);
    this.entG = new Group(); this._scene.add(this.entG);
  }

  private createRoad() { for (let i = 0; i < ROAD_VIS; i++) this.addRoadSeg(i * ROAD_SEG_LEN, false, false); }

  private addRoadSeg(z: number, bridge: boolean, tunnel: boolean) {
    const sc = SCHEMES[this.cIdx]; const seg = new Group();
    const rdColor = bridge ? sc.accent : tunnel ? '#ff4400' : sc.primary;
    const rdOp = bridge ? 0.08 : tunnel ? 0.06 : 0.04;
    const rd = new Mesh(new BoxGeometry(ROAD_WIDTH, 0.02, ROAD_SEG_LEN), new MeshBasicMaterial({ color: rdColor, transparent: true, opacity: rdOp }));
    rd.position.set(0, bridge ? 1.5 : 0.01, z); seg.add(rd);
    for (let l = 1; l < LANE_COUNT; l++) { const lx = (l - 2) * LANE_WIDTH - LANE_WIDTH / 2; for (let d = 0; d < 8; d++) { const dash = sbox(0.06, 0.02, 1.5, rdColor, 0.2); dash.position.set(lx, bridge ? 1.52 : 0.02, z - ROAD_SEG_LEN / 2 + d * 5 + 2.5); seg.add(dash); } }
    const eL = sbox(0.15, bridge ? 1.0 : 0.1, ROAD_SEG_LEN, sc.accent, 0.5); eL.position.set(-ROAD_WIDTH / 2 - 0.1, bridge ? 1.0 : 0.05, z); seg.add(eL);
    const eR = sbox(0.15, bridge ? 1.0 : 0.1, ROAD_SEG_LEN, sc.accent, 0.5); eR.position.set(ROAD_WIDTH / 2 + 0.1, bridge ? 1.0 : 0.05, z); seg.add(eR);
    if (bridge) {
      for (let i = 0; i < 4; i++) { const support = new Mesh(new CylinderGeometry(0.15, 0.15, 1.5, 4), new MeshBasicMaterial({ color: sc.accent, wireframe: true, transparent: true, opacity: 0.3 })); support.position.set(i % 2 === 0 ? -ROAD_WIDTH / 2 : ROAD_WIDTH / 2, 0.75, z - ROAD_SEG_LEN / 4 + (i < 2 ? 0 : ROAD_SEG_LEN / 2)); seg.add(support); }
      const rail = sbox(0.08, 0.08, ROAD_SEG_LEN, sc.primary, 0.3); rail.position.set(-ROAD_WIDTH / 2 - 0.2, 2.2, z); seg.add(rail);
      const rail2 = sbox(0.08, 0.08, ROAD_SEG_LEN, sc.primary, 0.3); rail2.position.set(ROAD_WIDTH / 2 + 0.2, 2.2, z); seg.add(rail2);
    }
    if (tunnel) {
      // Tunnel ceiling and walls
      const ceil = sbox(ROAD_WIDTH + 2, 0.15, ROAD_SEG_LEN, sc.accent, 0.12); ceil.position.set(0, 6, z); seg.add(ceil);
      const wL = sbox(0.2, 6, ROAD_SEG_LEN, sc.accent, 0.08); wL.position.set(-ROAD_WIDTH / 2 - 1, 3, z); seg.add(wL);
      const wR = sbox(0.2, 6, ROAD_SEG_LEN, sc.accent, 0.08); wR.position.set(ROAD_WIDTH / 2 + 1, 3, z); seg.add(wR);
      // Tunnel lights
      for (let i = 0; i < 5; i++) { const tl = new Mesh(new SphereGeometry(0.2, 6, 6), new MeshBasicMaterial({ color: '#ff6600', transparent: true, opacity: 0.6 })); tl.position.set(0, 5.8, z - ROAD_SEG_LEN / 2 + i * 8 + 4); seg.add(tl); }
    }
    for (let s = 0; s < 2; s++) {
      const sign = s === 0 ? -1 : 1; const lamp = new Group();
      const pole = new Mesh(new CylinderGeometry(0.05, 0.05, 4, 4), new MeshBasicMaterial({ color: sc.primary, wireframe: true, transparent: true, opacity: 0.3 }));
      pole.position.y = 2; lamp.add(pole);
      const lt = new Mesh(new SphereGeometry(0.15, 6, 6), new MeshBasicMaterial({ color: sc.accent, transparent: true, opacity: 0.5 }));
      lt.position.y = 4.1; lamp.add(lt);
      lamp.position.set(sign * (ROAD_WIDTH / 2 + 1.5), 0, z); seg.add(lamp);
    }
    this.roadG.add(seg); this.roadSegs.push({ mesh: seg, z, isBridge: bridge, isTunnel: tunnel });
  }

  private mkRoadsideObj(z: number, side: number): RoadsideObj {
    const sc = SCHEMES[this.cIdx]; const g = new Group();
    const bType = ri(0, 3);
    const x = side * (ROAD_WIDTH / 2 + rf(4, 8));
    if (bType <= 1) {
      // Tall building
      const h = rf(6, 14); const w = rf(1.5, 3);
      const bld = sbox(w, h, w, sc.primary, 0.06); bld.position.y = h / 2; g.add(bld);
      // Neon sign
      const signH = rf(0.4, 0.8); const signW = rf(1.0, w);
      const signM = sbox(signW, signH, 0.05, sc.accent, rf(0.3, 0.6));
      signM.position.set(side > 0 ? -w / 2 - 0.03 : w / 2 + 0.03, h * rf(0.4, 0.8), 0); g.add(signM);
    } else if (bType === 2) {
      // Short structure with antenna
      const h = rf(3, 5); const w = rf(2, 4);
      const bld = sbox(w, h, w * 0.8, sc.accent, 0.04); bld.position.y = h / 2; g.add(bld);
      const ant = new Mesh(new CylinderGeometry(0.03, 0.03, 3, 4), new MeshBasicMaterial({ color: sc.primary, wireframe: true, transparent: true, opacity: 0.25 }));
      ant.position.y = h + 1.5; g.add(ant);
      const tip = new Mesh(new SphereGeometry(0.1, 4, 4), new MeshBasicMaterial({ color: sc.accent, transparent: true, opacity: 0.5 }));
      tip.position.y = h + 3; g.add(tip);
    } else {
      // Pillar with neon ring
      const h = rf(5, 10);
      const pil = new Mesh(new CylinderGeometry(0.3, 0.3, h, 6), new MeshBasicMaterial({ color: sc.primary, wireframe: true, transparent: true, opacity: 0.1 }));
      pil.position.y = h / 2; g.add(pil);
      const ring = new Mesh(new TorusGeometry(0.6, 0.08, 4, 8), new MeshBasicMaterial({ color: sc.accent, transparent: true, opacity: 0.35 }));
      ring.position.y = h; ring.rotation.x = Math.PI / 2; g.add(ring);
    }
    g.position.set(x, 0, z); this._scene.add(g);
    return { mesh: g, z, side };
  }

  private buildPlayer() {
    const sc = SCHEMES[this.cIdx]; this.pGroup = new Group();
    const body = sbox(1.2, 0.35, 2.4, sc.primary, 0.7); body.position.y = 0.35; this.pGroup.add(body);
    const can = sbox(0.8, 0.25, 1.2, sc.primary, 0.4); can.position.set(0, 0.65, -0.2); this.pGroup.add(can);
    const sp = sbox(1.4, 0.08, 0.3, sc.accent, 0.6); sp.position.set(0, 0.2, 1.2); this.pGroup.add(sp);
    const rs = sbox(1.0, 0.15, 0.15, sc.accent, 0.5); rs.position.set(0, 0.6, -1.2); this.pGroup.add(rs);
    for (const sx of [-0.4, 0.4]) { const gn = sbox(0.08, 0.08, 0.5, sc.accent, 0.8); gn.position.set(sx, 0.3, 1.4); this.pGroup.add(gn); }
    for (const [wx, wz] of [[-0.65, 0.7], [0.65, 0.7], [-0.65, -0.7], [0.65, -0.7]]) { const w = new Mesh(new TorusGeometry(0.18, 0.06, 6, 8), new MeshBasicMaterial({ color: sc.accent, wireframe: true })); w.rotation.y = Math.PI / 2; w.position.set(wx, 0.18, wz); this.pGroup.add(w); }
    const gl = new Mesh(new SphereGeometry(0.2, 6, 6), new MeshBasicMaterial({ color: sc.accent, transparent: true, opacity: 0.4 })); gl.position.set(0, 0.3, -1.3); this.pGroup.add(gl);
    this.headlightL = new Mesh(new BoxGeometry(0.3, 0.05, 8), new MeshBasicMaterial({ color: sc.primary, transparent: true, opacity: 0.08 }));
    this.headlightL.position.set(-0.35, 0.35, 5.5); this.pGroup.add(this.headlightL);
    this.headlightR = new Mesh(new BoxGeometry(0.3, 0.05, 8), new MeshBasicMaterial({ color: sc.primary, transparent: true, opacity: 0.08 }));
    this.headlightR.position.set(0.35, 0.35, 5.5); this.pGroup.add(this.headlightR);
    this.shieldM = new Mesh(new SphereGeometry(1.5, 12, 12), new MeshBasicMaterial({ color: sc.powerup, wireframe: true, transparent: true, opacity: 0 })); this.shieldM.position.y = 0.5; this.pGroup.add(this.shieldM);
    this.pGroup.position.set(0, 0, PLAYER_Z); this.entG.add(this.pGroup);
  }


  private mkEnemy(type: EnemyCar['type'], lane: number, z: number): EnemyCar {
    const sc = SCHEMES[this.cIdx]; const g = new Group(); let hp = 1;
    if (type === 'sedan') { const b = sbox(1.0, 0.3, 2.0, sc.enemy, 0.6); b.position.y = 0.3; g.add(b); const r = sbox(0.7, 0.2, 1.0, sc.enemy, 0.4); r.position.set(0, 0.55, 0); g.add(r); }
    else if (type === 'motorcycle') { const b = sbox(0.4, 0.3, 1.6, sc.enemy, 0.6); b.position.y = 0.3; g.add(b); const r = sbox(0.3, 0.4, 0.5, sc.enemy, 0.5); r.position.set(0, 0.6, -0.2); g.add(r); }
    else if (type === 'helicopter') { const b = sbox(0.8, 0.5, 2.0, sc.enemy, 0.6); b.position.y = 3; g.add(b); const rot = new Mesh(new CylinderGeometry(1.2, 1.2, 0.05, 3), new MeshBasicMaterial({ color: sc.enemy, wireframe: true, transparent: true, opacity: 0.4 })); rot.position.y = 3.4; g.add(rot); const t = sbox(0.2, 0.2, 1.5, sc.enemy, 0.5); t.position.set(0, 3, -1.5); g.add(t); hp = 2; }
    else if (type === 'van') {
      // Van: boxy, medium-size, orange-red accents
      const b = sbox(1.3, 0.5, 2.6, '#ff6600', 0.6); b.position.y = 0.4; g.add(b);
      const roof = sbox(1.1, 0.2, 2.0, '#ff6600', 0.4); roof.position.set(0, 0.75, 0); g.add(roof);
      const cargo = sbox(1.0, 0.3, 1.2, sc.enemy, 0.3); cargo.position.set(0, 0.35, -1.0); g.add(cargo);
      hp = 3 + Math.floor(this.wave / 5);
    }
    else if (type === 'interceptor') {
      // Interceptor: sleek, low-profile, magenta tint
      const b = sbox(0.8, 0.25, 2.2, '#ff0088', 0.7); b.position.y = 0.25; g.add(b);
      const w1 = sbox(0.4, 0.08, 0.8, '#ff0088', 0.5); w1.position.set(-0.6, 0.2, 0.3); g.add(w1);
      const w2 = sbox(0.4, 0.08, 0.8, '#ff0088', 0.5); w2.position.set(0.6, 0.2, 0.3); g.add(w2);
      hp = 2;
    }
    else { // armored
      const b = sbox(1.6, 0.5, 3.2, sc.enemy, 0.7); b.position.y = 0.4; g.add(b);
      const tu = sbox(0.8, 0.3, 0.8, sc.enemy, 0.6); tu.position.set(0, 0.75, 0.3); g.add(tu);
      const ba = sbox(0.1, 0.1, 1.0, sc.enemy, 0.8); ba.position.set(0, 0.8, 1.2); g.add(ba);
      for (const sx of [-0.9, 0.9]) { const pl = sbox(0.1, 0.4, 2.8, sc.enemy, 0.4); pl.position.set(sx, 0.4, 0); g.add(pl); }
      hp = this.wave >= 10 ? 8 : 5;
    }
    // Scale HP by wave for later waves
    if (type !== 'armored' && this.wave >= 15) hp += Math.floor((this.wave - 15) / 5);
    g.position.set(laneX(lane), 0, z); this.entG.add(g);
    let spd: number;
    if (type === 'motorcycle') spd = SCROLL_SPD * 0.7;
    else if (type === 'helicopter') spd = SCROLL_SPD * 0.5;
    else if (type === 'armored') spd = SCROLL_SPD * 0.3;
    else if (type === 'van') spd = SCROLL_SPD * 0.55;
    else if (type === 'interceptor') spd = SCROLL_SPD * 0.85;
    else spd = SCROLL_SPD * 0.6;
    return { mesh: g, x: laneX(lane), z, speed: spd, type, hp, fireTimer: rf(0.5, 2), dead: false, targetLane: lane, laneChangeT: rf(2, 5), deathSpin: 0, dying: false, mineCD: type === 'van' ? rf(2, 4) : 999 };
  }

  private mkCiv(lane: number, z: number): CivilianCar {
    const sc = SCHEMES[this.cIdx]; const g = new Group();
    const b = sbox(0.9, 0.3, 1.8, sc.civilian, 0.5); b.position.y = 0.3; g.add(b);
    const r = sbox(0.6, 0.2, 0.9, sc.civilian, 0.3); r.position.set(0, 0.55, 0); g.add(r);
    g.position.set(laneX(lane), 0, z); this.entG.add(g);
    return { mesh: g, x: laneX(lane), z, speed: SCROLL_SPD * 0.5, dead: false };
  }

  private mkPU(type: PowerUpObj['type'], lane: number, z: number): PowerUpObj {
    const sc = SCHEMES[this.cIdx]; const g = new Group();
    const base = sbox(1.0, 0.6, 1.8, sc.powerup, 0.5); base.position.y = 0.5; g.add(base);
    let icon: Mesh;
    if (type === 'missile') { icon = new Mesh(new CylinderGeometry(0, 0.2, 0.6, 6), new MeshBasicMaterial({ color: '#ff4400', transparent: true, opacity: 0.7 })); icon.rotation.x = -Math.PI / 2; }
    else if (type === 'oilslick') { icon = new Mesh(new CylinderGeometry(0.3, 0.3, 0.1, 8), new MeshBasicMaterial({ color: '#333333', transparent: true, opacity: 0.7 })); }
    else if (type === 'shield') { icon = new Mesh(new SphereGeometry(0.25, 8, 8), new MeshBasicMaterial({ color: '#00aaff', wireframe: true, transparent: true, opacity: 0.7 })); }
    else if (type === 'speed') { icon = new Mesh(new CylinderGeometry(0, 0.15, 0.5, 4), new MeshBasicMaterial({ color: '#ffaa00', transparent: true, opacity: 0.7 })); icon.rotation.x = -Math.PI / 2; }
    else if (type === 'weapon') { icon = new Mesh(new BoxGeometry(0.4, 0.15, 0.3), new MeshBasicMaterial({ color: '#ff00ff', transparent: true, opacity: 0.8 })); }
    else { icon = new Mesh(new BoxGeometry(0.3, 0.1, 0.4), new MeshBasicMaterial({ color: '#ff0000', transparent: true, opacity: 0.7 })); }
    icon.position.y = 1.1; g.add(icon);
    g.position.set(laneX(lane), 0, z); this.entG.add(g);
    return { mesh: g, x: laneX(lane), z, type, dead: false, rotY: 0 };
  }

  private mkHazard(type: RoadHazard['type'], lane: number, z: number): RoadHazard {
    const sc = SCHEMES[this.cIdx]; const g = new Group();
    if (type === 'pothole') { const h = new Mesh(new CylinderGeometry(0.6, 0.6, 0.04, 8), new MeshBasicMaterial({ color: '#222222', transparent: true, opacity: 0.7 })); h.rotation.x = -Math.PI / 2; h.position.y = 0.01; g.add(h); const rim = new Mesh(new TorusGeometry(0.6, 0.05, 4, 8), new MeshBasicMaterial({ color: sc.enemy, transparent: true, opacity: 0.4 })); rim.rotation.x = -Math.PI / 2; rim.position.y = 0.02; g.add(rim); }
    else if (type === 'barrier') { const b = sbox(2.0, 0.8, 0.3, sc.enemy, 0.6); b.position.y = 0.4; g.add(b); const str = sbox(0.1, 0.8, 0.1, sc.accent, 0.4); str.position.set(-0.9, 0.4, 0); g.add(str); const str2 = sbox(0.1, 0.8, 0.1, sc.accent, 0.4); str2.position.set(0.9, 0.4, 0); g.add(str2); }
    else { const c1 = new Mesh(new CylinderGeometry(0.05, 0.25, 0.6, 6), new MeshBasicMaterial({ color: '#ff6600', transparent: true, opacity: 0.7 })); c1.position.y = 0.3; g.add(c1); }
    g.position.set(laneX(lane), 0, z); this.entG.add(g);
    return { mesh: g, x: laneX(lane), z, type, dead: false };
  }

  private mkMine(x: number, z: number): Mine {
    const m = new Mesh(new CylinderGeometry(0.4, 0.4, 0.12, 8), new MeshBasicMaterial({ color: '#ff2200', transparent: true, opacity: 0.6 }));
    m.position.set(x, 0.06, z); m.rotation.x = -Math.PI / 2; this.entG.add(m);
    return { mesh: m, x, z, timer: 12, dead: false };
  }

  private fireBullet(x: number, z: number, fp: boolean, dx = 0) {
    const sc = SCHEMES[this.cIdx]; const color = fp ? (this.weaponLvl >= 2 ? '#ff00ff' : sc.primary) : sc.enemy;
    const w = this.weaponLvl >= 2 && fp ? 0.12 : 0.08; const h = this.weaponLvl >= 2 && fp ? 0.04 : 0.08;
    const d = this.weaponLvl >= 2 && fp ? 0.8 : 0.4;
    const m = sbox(w, h, d, color, 0.9);
    m.position.set(x, 0.4, z); this.entG.add(m);
    this.bullets.push({ mesh: m, x, z, fromPlayer: fp, speed: fp ? BULLET_SPD : -BULLET_SPD * 0.6, dead: false, dx });
  }

  private dropOil() {
    const m = new Mesh(new CylinderGeometry(0.8, 0.8, 0.05, 8), new MeshBasicMaterial({ color: '#333333', transparent: true, opacity: 0.5 }));
    m.position.set(this.pX, 0.03, PLAYER_Z - 2); this.entG.add(m);
    this.oils.push({ mesh: m, x: this.pX, z: PLAYER_Z - 2, timer: 8, dead: false });
    sfxOilDrop(); this.career.totalOil++;
  }

  private dropSmoke() {
    const g = new Group();
    for (let i = 0; i < 6; i++) {
      const s = new Mesh(new SphereGeometry(rf(0.4, 0.8), 6, 6), new MeshBasicMaterial({ color: '#888888', transparent: true, opacity: 0.35 }));
      s.position.set(rf(-1, 1), rf(0.3, 1.5), rf(-1, 1)); g.add(s);
    }
    g.position.set(this.pX, 0, PLAYER_Z - 3); this.entG.add(g);
    this.smokes.push({ mesh: g, x: this.pX, z: PLAYER_Z - 3, timer: SMOKE_DUR, dead: false, opacity: 0.35 });
    sfxSmoke(); this.career.totalSmokes++; this.sSmokes++;
    if (this.sSmokes >= 1) this.unlock('smoke-1');
    if (this.sSmokes >= 10) this.unlock('smoke-10');
  }

  private fireEMP() {
    if (this.empCharges <= 0 || this.empCD > 0) return;
    const sc = SCHEMES[this.cIdx];
    const ring = new Mesh(
      new TorusGeometry(1, 0.15, 6, 24),
      new MeshBasicMaterial({ color: '#00ccff', transparent: true, opacity: 0.8 })
    );
    ring.position.set(this.pX, 0.5, PLAYER_Z);
    ring.rotation.x = -Math.PI / 2;
    this._scene.add(ring);
    this.empWaves.push({ mesh: ring, radius: 1, life: 1.5, dead: false });
    sfxEMP();
    this.empCharges--;
    this.empCD = 5;
    this.sEMPsUsed++;
    this.career.totalEMPs++;
    this.unlock('emp-1');
    if (this.sEMPsUsed >= 3) this.unlock('emp-3');
    this.triggerShake(0.08, 0.2);
    // Stun all enemies in range
    for (const e of this.enemies) {
      if (e.dead || e.dying) continue;
      const dx = e.x - this.pX, dz = e.z - PLAYER_Z;
      if (Math.sqrt(dx * dx + dz * dz) < 25) {
        e.fireTimer += 4; // Suppress fire for 4 seconds
        e.laneChangeT += 3; // Freeze movement
        e.hp -= 1; // Damage
        this.spawnParts(e.x, 0.5, e.z, '#00ccff', 6);
        if (e.hp <= 0) {
          e.dying = true; e.deathSpin = 0;
          const gained = 150 * this.combo;
          this.score += gained;
          this.addPopup(e.x, e.z, gained);
          sfxExplosion();
          this.sKills++; this.career.totalKills++;
          this.sEMPKills++;
          this.onEnemyKill(e.type, false);
          if (this.sEMPKills >= 5) this.unlock('emp-kill-5');
        }
      }
    }
    // Check gadget master
    this.checkGadgetMaster();
  }

  private deployDecoy() {
    if (this.decoyCharges <= 0 || this.decoyCD > 0) return;
    const sc = SCHEMES[this.cIdx];
    const g = new Group();
    // Ghost car body
    const body = sbox(1.2, 0.35, 2.4, sc.primary, 0.3); body.position.y = 0.35; g.add(body);
    const can = sbox(0.8, 0.25, 1.2, sc.primary, 0.2); can.position.set(0, 0.65, -0.2); g.add(can);
    // Holographic flicker effect
    const halo = new Mesh(new SphereGeometry(1.5, 8, 8), new MeshBasicMaterial({ color: sc.accent, wireframe: true, transparent: true, opacity: 0.15 }));
    halo.position.y = 0.5; g.add(halo);
    g.position.set(this.pX, 0, PLAYER_Z - 3);
    this.entG.add(g);
    this.decoys.push({ mesh: g, x: this.pX, z: PLAYER_Z - 3, life: 8, dead: false });
    sfxDecoy();
    this.decoyCharges--;
    this.decoyCD = 3;
    this.sDecoysUsed++;
    this.career.totalDecoys++;
    this.unlock('decoy-1');
    if (this.sDecoysUsed >= 5) this.unlock('decoy-5');
    this.checkGadgetMaster();
  }

  private decoyHitsAbsorbed = 0;
  private gadgetsUsed = new Set<string>();
  private nightKills = 0; private nightCycles = 0;
  private rainKills = 0; private seenDay = false; private seenNight = false; private seenRain = false;

  private checkGadgetMaster() {
    this.gadgetsUsed.add('emp'); // Called from EMP or Decoy
    if (this.sEMPsUsed > 0) this.gadgetsUsed.add('emp');
    if (this.sDecoysUsed > 0) this.gadgetsUsed.add('decoy');
    if (this.sOils > 0) this.gadgetsUsed.add('oil');
    if (this.sSmokes > 0) this.gadgetsUsed.add('smoke');
    if (this.gadgetsUsed.size >= 4) this.unlock('gadget-master');
  }

  private spawnParts(x: number, y: number, z: number, c: string, n = 12) {
    for (let i = 0; i < n; i++) { const m = new Mesh(new BoxGeometry(0.08, 0.08, 0.08), new MeshBasicMaterial({ color: c, transparent: true, opacity: 1 })); m.position.set(x, y, z); this._scene.add(m); this.parts.push({ mesh: m, vel: new Vector3(rf(-3, 3), rf(1, 5), rf(-3, 3)), life: rf(0.3, 0.8), maxLife: 0.8 }); }
  }

  private spawnWeaponsTruck() {
    if (this.weaponsTruck) return;
    const sc = SCHEMES[this.cIdx]; const g = new Group();
    // Large friendly truck body
    const body = sbox(2.0, 0.8, 4.5, '#0088ff', 0.5); body.position.y = 0.6; g.add(body);
    const cab = sbox(1.8, 0.6, 1.5, '#0066cc', 0.5); cab.position.set(0, 1.2, 1.5); g.add(cab);
    const trailer = sbox(1.8, 0.9, 2.5, '#0088ff', 0.4); trailer.position.set(0, 0.7, -0.5); g.add(trailer);
    // Neon stripe
    const stripe = sbox(2.1, 0.08, 4.5, sc.powerup, 0.7); stripe.position.set(0, 0.3, 0); g.add(stripe);
    // Star emblem on top
    const emblem = new Mesh(new SphereGeometry(0.3, 6, 6), new MeshBasicMaterial({ color: sc.powerup, transparent: true, opacity: 0.6 }));
    emblem.position.set(0, 1.6, 0); g.add(emblem);
    // Wheels
    for (const [wx, wz] of [[-1.1, 1.5], [1.1, 1.5], [-1.1, -1.2], [1.1, -1.2]]) {
      const w = new Mesh(new TorusGeometry(0.22, 0.08, 6, 8), new MeshBasicMaterial({ color: '#0066cc', wireframe: true }));
      w.rotation.y = Math.PI / 2; w.position.set(wx, 0.22, wz); g.add(w);
    }
    // Start from behind player
    const startZ = PLAYER_Z - 40;
    g.position.set(laneX(2), 0, startZ); this.entG.add(g);
    this.weaponsTruck = { mesh: g, x: laneX(2), z: startZ, active: true, docked: false, dockTimer: 0 };
    sfxTruckHorn();
  }

  private mkJumpRamp(lane: number, z: number): JumpRamp {
    const sc = SCHEMES[this.cIdx]; const g = new Group();
    // Ramp surface
    const ramp = sbox(LANE_WIDTH * 0.8, 0.08, 2.0, sc.powerup, 0.5);
    ramp.position.set(0, 0.2, 0); ramp.rotation.x = -0.25; g.add(ramp);
    // Chevron arrows
    for (let i = 0; i < 3; i++) {
      const chev = sbox(0.5, 0.04, 0.08, sc.accent, 0.7);
      chev.position.set(0, 0.28, -0.5 + i * 0.5); g.add(chev);
    }
    // Side rails
    const rL = sbox(0.08, 0.3, 2.0, sc.accent, 0.4); rL.position.set(-LANE_WIDTH * 0.4, 0.15, 0); g.add(rL);
    const rR = sbox(0.08, 0.3, 2.0, sc.accent, 0.4); rR.position.set(LANE_WIDTH * 0.4, 0.15, 0); g.add(rR);
    g.position.set(laneX(lane), 0, z); this.entG.add(g);
    return { mesh: g, x: laneX(lane), z, dead: false };
  }

  private startRain() {
    if (this.isRaining) return;
    this.isRaining = true;
    sfxRainStart();
    this.seenRain = true;
    this.unlock('rain-drive');
    // Create rain particles
    const sc = SCHEMES[this.cIdx];
    for (let i = 0; i < 80; i++) {
      const drop = new Mesh(new BoxGeometry(0.02, 0.5, 0.02), new MeshBasicMaterial({ color: '#4488ff', transparent: true, opacity: rf(0.2, 0.5) }));
      drop.position.set(rf(-20, 20), rf(2, 15), rf(PLAYER_Z - 15, PLAYER_Z + 60));
      this._scene.add(drop);
      this.rainDrops.push({ mesh: drop, vel: rf(12, 20) });
    }
  }

  private stopRain() {
    this.isRaining = false;
    for (const r of this.rainDrops) this._scene.remove(r.mesh);
    this.rainDrops = [];
  }

  private addTrail() {
    if (!this.spdBoost) return;
    const sc = SCHEMES[this.cIdx];
    const m = new Mesh(new BoxGeometry(0.6, 0.1, 0.3), new MeshBasicMaterial({ color: sc.accent, transparent: true, opacity: 0.5 }));
    m.position.set(this.pX, 0.15, PLAYER_Z - 1.5); this._scene.add(m);
    this.trails.push({ mesh: m, life: 0.6 });
  }


  // Mission system
  private generateMission() {
    const types: Mission['type'][] = ['kill_count', 'distance_nodmg', 'kill_timed', 'combo_target'];
    if (this.wave >= 5) types.push('kill_oil');
    const t = types[ri(0, types.length - 1)];
    let m: Mission;
    switch (t) {
      case 'kill_count':
        { const n = ri(5, 8 + Math.floor(this.wave / 3)); m = { type: t, desc: `Destroy ${n} enemies`, target: n, progress: 0, timer: 30 + this.wave, active: true }; }
        break;
      case 'distance_nodmg':
        { const d = ri(300, 500 + this.wave * 20); m = { type: t, desc: `Travel ${d}m undamaged`, target: d, progress: 0, timer: 60, active: true }; this.missionNoDmg = true; this.missionDistAtStart = this.dist; }
        break;
      case 'kill_oil':
        { m = { type: t, desc: 'Kill enemy with oil slick', target: 1, progress: 0, timer: 40, active: true }; }
        break;
      case 'kill_timed':
        { const n = ri(3, 5); m = { type: t, desc: `Kill ${n} in 15 seconds`, target: n, progress: 0, timer: 15, active: true }; this.missionKillsAtStart = this.sKills; }
        break;
      case 'combo_target':
        { const c = Math.min(8, ri(4, 6)); m = { type: t, desc: `Reach ${c}x combo`, target: c, progress: 0, timer: 30, active: true }; }
        break;
      default:
        m = { type: 'kill_count', desc: 'Destroy 5 enemies', target: 5, progress: 0, timer: 30, active: true };
    }
    this.mission = m;
  }

  private updateMission(dt: number) {
    if (!this.mission || !this.mission.active) return;
    this.mission.timer -= dt;
    // Check progress
    switch (this.mission.type) {
      case 'kill_count':
        // progress tracked on kill
        break;
      case 'distance_nodmg':
        if (this.missionNoDmg) {
          this.mission.progress = this.dist - this.missionDistAtStart;
        }
        break;
      case 'kill_timed':
        this.mission.progress = this.sKills - this.missionKillsAtStart;
        break;
      case 'combo_target':
        this.mission.progress = this.combo;
        break;
      case 'kill_oil':
        // progress tracked on oil kill
        break;
    }
    // Check completion
    if (this.mission.progress >= this.mission.target) {
      this.completeMission();
      return;
    }
    // Check timeout
    if (this.mission.timer <= 0) {
      this.mission.active = false;
      this.mission = null;
      this.missionCD = 20;
    }
  }

  private completeMission() {
    if (!this.mission) return;
    const bonus = 1000 + this.wave * 200;
    this.score += bonus;
    this.addPopup(this.pX, PLAYER_Z + 2, bonus);
    sfxMissionComplete();
    this.sMissionsCompleted++;
    this.career.totalMissions++;
    this.unlock('mission-1');
    if (this.sMissionsCompleted >= 3) this.unlock('mission-3');
    if (this.sMissionsCompleted >= 5) this.unlock('mission-5');
    if (this.career.totalMissions >= 10) this.unlock('mission-total-10');
    this.mission.active = false;
    this.mission = null;
    this.missionCD = 25;
    this.saveData();
  }

  private onEnemyKill(type: EnemyCar['type'], byOil: boolean) {
    this.killTypesThisGame.add(type);
    if (type === 'van') { this.sVanKills++; this.career.totalVanKills++; this.unlock('van-kill'); if (this.sVanKills >= 5) this.unlock('van-kill-5'); }
    if (type === 'interceptor') { this.sInterceptorKills++; this.career.totalInterceptorKills++; this.unlock('interceptor-kill'); if (this.sInterceptorKills >= 5) this.unlock('interceptor-5'); }
    if (this.killTypesThisGame.size >= 6) this.unlock('all-enemy-types');
    if (this.weaponLvl >= 2) { this.sLaserKills++; if (this.sLaserKills >= 20) this.unlock('laser-kills-20'); }
    // Heat increase
    this.heatLevel = Math.min(7, this.heatLevel + (type === 'armored' ? 1.5 : type === 'van' ? 0.8 : 0.3));
    if (Math.floor(this.heatLevel) > Math.floor(this.heatLevel - 0.3) && this.heatLevel >= 2) sfxHeatUp();
    // Night kills tracking
    if (this.isNight) {
      this.nightKills++;
      if (this.nightKills >= 10) this.unlock('night-kills-10');
      if (type === 'armored') this.unlock('night-boss');
    }
    // Mission: kill_count progress
    if (this.mission && this.mission.active && this.mission.type === 'kill_count') { this.mission.progress++; }
    if (this.mission && this.mission.active && this.mission.type === 'kill_oil' && byOil) { this.mission.progress++; }
  }

  private setupInput() {
    window.addEventListener('keydown', (e) => { this.keys.add(e.key.toLowerCase()); if (e.key === 'Escape' || e.key === 'p') { if (this.gState === 'playing') this.pauseG(); else if (this.gState === 'paused') this.resumeG(); } });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.key.toLowerCase()); });
  }

  private setupPanels() {
    const pcs = [
      { n: 'menu', c: './ui/menu.json' }, { n: 'hud', c: './ui/hud.json' },
      { n: 'pause', c: './ui/pause.json' }, { n: 'results', c: './ui/results.json' },
      { n: 'settings', c: './ui/settings.json' }, { n: 'achievements', c: './ui/achievements.json' },
      { n: 'stats', c: './ui/stats.json' }, { n: 'tutorial', c: './ui/tutorial.json' },
      { n: 'radar', c: './ui/radar.json' },
    ];
    for (const pc of pcs) {
      const obj = new Group();
      obj.position.set(0, 2.5, -3); obj.scale.set(3, 3, 3);
      if (pc.n === 'hud') { obj.position.set(0, 3.5, -4); obj.scale.set(2.5, 2.5, 2.5); }
      if (pc.n === 'radar') { obj.position.set(2.8, 3.0, -3.5); obj.scale.set(2, 2, 2); }
      this._scene.add(obj);
      const ent = this.world.createTransformEntity(obj);
      ent.addComponent(PanelUI, { config: pc.c });
      this.panels.set(pc.n, ent);
    }
    this.queries.menuP.subscribe('qualify', (e) => { this.menuDoc = e.getValue(PanelDocument, 'document') as UIKitDocument; this.wireMenu(); });
    this.queries.hudP.subscribe('qualify', (e) => { this.hudDoc = e.getValue(PanelDocument, 'document') as UIKitDocument; });
    this.queries.pauseP.subscribe('qualify', (e) => { this.pauseDoc = e.getValue(PanelDocument, 'document') as UIKitDocument; this.wirePause(); });
    this.queries.resultsP.subscribe('qualify', (e) => { this.resDoc = e.getValue(PanelDocument, 'document') as UIKitDocument; this.wireRes(); });
    this.queries.settingsP.subscribe('qualify', (e) => { this.setDoc = e.getValue(PanelDocument, 'document') as UIKitDocument; this.wireSet(); });
    this.queries.achP.subscribe('qualify', (e) => { this.achDoc = e.getValue(PanelDocument, 'document') as UIKitDocument; this.wireAch(); });
    this.queries.statsP.subscribe('qualify', (e) => { this.statDoc = e.getValue(PanelDocument, 'document') as UIKitDocument; this.wireStat(); });
    this.queries.tutP.subscribe('qualify', (e) => { this.tutDoc = e.getValue(PanelDocument, 'document') as UIKitDocument; this.wireTut(); });
    this.queries.radarP.subscribe('qualify', (e) => { this.radarDoc = e.getValue(PanelDocument, 'document') as UIKitDocument; });
  }

  private showP(name: string) {
    for (const [pn, ent] of this.panels) {
      const show = pn === name || (name === 'playing' && (pn === 'hud' || pn === 'radar'));
      this.sv(ent, show);
    }
  }

  private wireMenu() {
    if (!this.menuDoc) return;
    const b = (id: string, fn: () => void) => (this.menuDoc!.getElementById(id) as UIKit.Text|undefined)?.addEventListener('click', fn);
    b('btn-start', () => this.startG()); b('btn-arcade', () => { this.mode = 'arcade'; this.updMode(); }); b('btn-speed', () => { this.mode = 'speed'; this.updMode(); }); b('btn-zen', () => { this.mode = 'zen'; this.updMode(); }); b('btn-challenge', () => { this.mode = 'challenge'; this.updMode(); });
    b('btn-normal', () => { this.diff = 'normal'; this.updDiff(); }); b('btn-hard', () => { this.diff = 'hard'; this.updDiff(); }); b('btn-insane', () => { this.diff = 'insane'; this.updDiff(); });
    b('btn-settings', () => this.showP('settings')); b('btn-achievements', () => { this.updAchDisp(); this.showP('achievements'); }); b('btn-stats', () => { this.updStats(); this.showP('stats'); }); b('btn-tutorial', () => this.showP('tutorial'));
    this.updMode(); this.updDiff(); this.st(this.menuDoc, 'high-score', `Best: ${this.career.highScore}`);
  }

  private updMode() { if (!this.menuDoc) return; for (const m of ['arcade', 'speed', 'zen', 'challenge']) (this.menuDoc.getElementById(`btn-${m}`) as UIKit.Text|undefined)?.setProperties({ backgroundColor: m === this.mode ? SCHEMES[this.cIdx].primary : '#333333' }); }
  private updDiff() { if (!this.menuDoc) return; for (const d of ['normal', 'hard', 'insane']) (this.menuDoc.getElementById(`btn-${d}`) as UIKit.Text|undefined)?.setProperties({ backgroundColor: d === this.diff ? SCHEMES[this.cIdx].accent : '#333333' }); }

  private wirePause() { if (!this.pauseDoc) return; (this.pauseDoc.getElementById('btn-resume') as UIKit.Text|undefined)?.addEventListener('click', () => this.resumeG()); (this.pauseDoc.getElementById('btn-quit') as UIKit.Text|undefined)?.addEventListener('click', () => this.quitMenu()); }
  private wireRes() { if (!this.resDoc) return; (this.resDoc.getElementById('btn-retry') as UIKit.Text|undefined)?.addEventListener('click', () => this.startG()); (this.resDoc.getElementById('btn-menu') as UIKit.Text|undefined)?.addEventListener('click', () => this.quitMenu()); }
  private wireSet() { if (!this.setDoc) return; (this.setDoc.getElementById('btn-color-next') as UIKit.Text|undefined)?.addEventListener('click', () => { this.cIdx = (this.cIdx + 1) % SCHEMES.length; this.applyCS(); }); (this.setDoc.getElementById('btn-color-prev') as UIKit.Text|undefined)?.addEventListener('click', () => { this.cIdx = (this.cIdx - 1 + SCHEMES.length) % SCHEMES.length; this.applyCS(); }); (this.setDoc.getElementById('btn-settings-back') as UIKit.Text|undefined)?.addEventListener('click', () => this.showP('menu')); this.applyCS(); }
  private wireAch() { if (!this.achDoc) return; (this.achDoc.getElementById('btn-ach-back') as UIKit.Text|undefined)?.addEventListener('click', () => this.showP('menu')); (this.achDoc.getElementById('btn-ach-next') as UIKit.Text|undefined)?.addEventListener('click', () => { this.achPg++; this.updAchDisp(); }); (this.achDoc.getElementById('btn-ach-prev') as UIKit.Text|undefined)?.addEventListener('click', () => { this.achPg = Math.max(0, this.achPg - 1); this.updAchDisp(); }); this.updAchDisp(); }
  private wireStat() { if (!this.statDoc) return; (this.statDoc.getElementById('btn-stats-back') as UIKit.Text|undefined)?.addEventListener('click', () => this.showP('menu')); this.updStats(); }
  private wireTut() { if (!this.tutDoc) return; (this.tutDoc.getElementById('btn-tutorial-back') as UIKit.Text|undefined)?.addEventListener('click', () => this.showP('menu')); }

  private applyCS() { const sc = SCHEMES[this.cIdx]; this._scene.background = new Color(sc.bg); const f = this._scene.fog as FogExp2; if (f) f.color = new Color(sc.bg); this.st(this.setDoc, 'color-name', sc.name); this.saveData(); }

  private updAchDisp() {
    if (!this.achDoc) return; const pp = 6; const mx = Math.floor((this.achs.length - 1) / pp); this.achPg = clp(this.achPg, 0, mx); const s = this.achPg * pp;
    this.st(this.achDoc, 'ach-count', `${this.achs.filter(a => a.unlocked).length}/${this.achs.length}`); this.st(this.achDoc, 'ach-page', `${this.achPg + 1}/${mx + 1}`);
    for (let i = 0; i < pp; i++) { const a = this.achs[s + i]; if (a) { this.st(this.achDoc, `ach-${i}-name`, `${a.unlocked ? '[*] ' : '[ ] '}${a.name}`); this.st(this.achDoc, `ach-${i}-desc`, a.desc); } else { this.st(this.achDoc, `ach-${i}-name`, ''); this.st(this.achDoc, `ach-${i}-desc`, ''); } }
  }

  private updStats() {
    if (!this.statDoc) return; const c = this.career;
    this.st(this.statDoc, 'stat-games', `Games: ${c.gamesPlayed}`); this.st(this.statDoc, 'stat-score', `Total Score: ${c.totalScore}`); this.st(this.statDoc, 'stat-best', `Best Score: ${c.highScore}`);
    this.st(this.statDoc, 'stat-kills', `Total Kills: ${c.totalKills}`); this.st(this.statDoc, 'stat-distance', `Distance: ${Math.floor(c.totalDist)}m`); this.st(this.statDoc, 'stat-powerups', `Power-Ups: ${c.totalPU}`);
    this.st(this.statDoc, 'stat-oils', `Oil Slicks: ${c.totalOil}`); this.st(this.statDoc, 'stat-bosses', `Boss Kills: ${c.totalBoss}`); this.st(this.statDoc, 'stat-wave', `Best Wave: ${c.bestWave}`); this.st(this.statDoc, 'stat-combo', `Best Combo: ${c.bestCombo}x`);
    this.st(this.statDoc, 'stat-smokes', `Smoke Screens: ${c.totalSmokes}`); this.st(this.statDoc, 'stat-bridges', `Bridges Crossed: ${c.bridgesCrossed}`);
    this.st(this.statDoc, 'stat-missions', `Missions Done: ${c.totalMissions}`);
    this.st(this.statDoc, 'stat-vans', `Van Kills: ${c.totalVanKills}`);
    this.st(this.statDoc, 'stat-interceptors', `Interceptor Kills: ${c.totalInterceptorKills}`);
    this.st(this.statDoc, 'stat-emps', `EMPs Used: ${c.totalEMPs || 0}`);
    this.st(this.statDoc, 'stat-decoys', `Decoys Deployed: ${c.totalDecoys || 0}`);
    this.st(this.statDoc, 'stat-docks', `Truck Docks: ${c.totalDocks || 0}`);
    this.st(this.statDoc, 'stat-jumps', `Ramp Jumps: ${c.totalJumps || 0}`);
    this.st(this.statDoc, 'stat-rain', `Rain Distance: ${Math.floor(c.totalRainDist || 0)}m`);
    try { const fc = localStorage.getItem('neon-spy-formations'); this.st(this.statDoc, 'stat-formations', `Formations Cleared: ${fc || '0'}`); } catch {}
  }

  private modesPlayed = new Set<string>();


  private startG() {
    this.gState = 'playing'; this.score = 0; this.lives = this.diff === 'normal' ? 3 : this.diff === 'hard' ? 2 : 1;
    this.wave = 1; this.dist = 0; this.combo = 1; this.comboT = 0; this.maxCombo = 1; this.gTime = 0; this.moves = 0;
    this.scrollSpd = SCROLL_SPD; this.pX = 0; this.pShield = false; this.shieldT = 0; this.rapidF = false; this.rapidT = 0;
    this.spdBoost = false; this.spdT = 0; this.fireT = 0; this.fireCD = 0.18; this.invT = 1; this.bossOut = false;
    this.weaponLvl = 0; this.waveNoDmg = true; this.sPerfectWaves = 0; this.sBridges = 0;
    this.spawnT = 1; this.puT = PU_INT / 2; this.civT = CIV_INT / 2; this.waveT = 0; this.hazT = HAZARD_INT / 2;
    this.sKills = 0; this.sOils = 0; this.sCivHits = 0; this.sSmokes = 0; this.sHazardsDodged = 0;
    this.puTypes.clear(); this.smokeCD = 0; this.oilCD = 0;
    // R3 resets
    this.sVanKills = 0; this.sInterceptorKills = 0; this.sMinesDodged = 0;
    this.mission = null; this.missionCD = 15; this.sMissionsCompleted = 0;
    this.missionKillsAtStart = 0; this.missionDistAtStart = 0; this.missionNoDmg = true;
    this.musicIntensity = 0; this.roadObjT = 0;
    this.killTypesThisGame.clear(); this.comboMaxT = 0; this.consecutivePerfect = 0;
    this.sLaserKills = 0; this.tunnelsPassed = 0;
    // R5 resets
    this.decoys = []; this.empWaves = [];
    this.empCD = 0; this.decoyCD = 0;
    this.empCharges = 2; this.decoyCharges = 3;
    this.sEMPsUsed = 0; this.sDecoysUsed = 0; this.sEMPKills = 0;
    this.heatLevel = 0; this.heatTimer = 0; this.maxHeatLevel = 0;
    this.nightPhase = 0; this.dayNightTimer = 0; this.isNight = false;
    this.formationCD = 30; this.sFormationsCleared = 0;
    this.decoyHitsAbsorbed = 0; this.gadgetsUsed.clear();
    this.nightKills = 0; this.nightCycles = 0;
    // R6 resets
    this.weaponsTruck = null; this.truckCD = 30; this.sDocks = 0;
    this.jumpRamps = []; this.rampCD = 12; this.isAirborne = false; this.airT = 0; this.airY = 0; this.sJumps = 0;
    this.stopRain(); this.rainTimer = 0; this.rainCD = 50; this.sRainDist = 0;
    this.rainKills = 0; this.seenDay = true; this.seenNight = false; this.seenRain = false;

    this.modesPlayed.add(this.mode);
    try { const mp = localStorage.getItem('neon-spy-modes'); if (mp) JSON.parse(mp).forEach((m: string) => this.modesPlayed.add(m)); } catch {}
    try { localStorage.setItem('neon-spy-modes', JSON.stringify([...this.modesPlayed])); } catch {}
    if (this.modesPlayed.size >= 4) this.unlock('all-modes');
    this.clearEnts(); this.pGroup.position.set(0, 0, PLAYER_Z); this.pGroup.visible = true;
    (this.shieldM.material as MeshBasicMaterial).opacity = 0;
    this.career.gamesPlayed++; if (this.career.gamesPlayed >= 10) this.unlock('games-10'); if (this.career.gamesPlayed >= 50) this.unlock('games-50');
    startMusic(); this.showP('playing');
  }

  private clearEnts() {
    for (const e of this.enemies) this.entG.remove(e.mesh); for (const c of this.civs) this.entG.remove(c.mesh);
    for (const b of this.bullets) this.entG.remove(b.mesh); for (const p of this.pups) this.entG.remove(p.mesh);
    for (const o of this.oils) this.entG.remove(o.mesh); for (const p of this.parts) this._scene.remove(p.mesh);
    for (const s of this.smokes) this.entG.remove(s.mesh); for (const h of this.hazards) this.entG.remove(h.mesh);
    for (const p of this.popups) this._scene.remove(p.mesh); for (const t of this.trails) this._scene.remove(t.mesh);
    for (const m of this.mines) this.entG.remove(m.mesh);
    for (const ro of this.roadObjs) this._scene.remove(ro.mesh);
    for (const d of this.decoys) this.entG.remove(d.mesh);
    for (const ew of this.empWaves) this._scene.remove(ew.mesh);
    if (this.weaponsTruck) { this.entG.remove(this.weaponsTruck.mesh); this.weaponsTruck = null; }
    for (const jr of this.jumpRamps) this.entG.remove(jr.mesh);
    for (const rd of this.rainDrops) this._scene.remove(rd.mesh);
    this.enemies = []; this.civs = []; this.bullets = []; this.pups = []; this.oils = []; this.parts = [];
    this.smokes = []; this.hazards = []; this.popups = []; this.trails = []; this.mines = []; this.roadObjs = [];
    this.decoys = []; this.empWaves = []; this.jumpRamps = []; this.rainDrops = []; this.isRaining = false;
  }

  private pauseG() { this.gState = 'paused'; this.showP('pause'); }
  private resumeG() { this.gState = 'playing'; this.showP('playing'); }
  private quitMenu() { this.gState = 'menu'; this.clearEnts(); this.pGroup.visible = false; this.showP('menu'); this.st(this.menuDoc, 'high-score', `Best: ${this.career.highScore}`); }

  private recentKillTimes: number[] = [];

  private gameOver() {
    this.gState = 'gameover'; sfxGO();
    this.career.totalScore += this.score; if (this.score > this.career.highScore) this.career.highScore = this.score;
    if (this.wave > this.career.bestWave) this.career.bestWave = this.wave; if (this.maxCombo > this.career.bestCombo) this.career.bestCombo = this.maxCombo;
    this.career.totalDist += this.dist; if (this.weaponLvl > this.career.maxWeapon) this.career.maxWeapon = this.weaponLvl;
    this.career.perfectWaves += this.sPerfectWaves; this.career.bridgesCrossed += this.sBridges;
    this.saveData();
    if (this.score >= 5000) this.unlock('score-5k'); if (this.score >= 10000) this.unlock('score-10k'); if (this.score >= 25000) this.unlock('score-25k');
    if (this.score >= 50000) this.unlock('score-50k'); if (this.score >= 100000) this.unlock('score-100k'); if (this.score >= 200000) this.unlock('score-200k');
    if (this.score >= 500000) this.unlock('score-500k');
    if (this.wave >= 5) this.unlock('wave-5'); if (this.wave >= 10) this.unlock('wave-10'); if (this.wave >= 15) this.unlock('wave-15'); if (this.wave >= 20) this.unlock('wave-20'); if (this.wave >= 30) this.unlock('wave-30');
    if (this.wave >= 40) this.unlock('wave-40'); if (this.wave >= 50) this.unlock('wave-50');
    if (this.wave >= 60) this.unlock('wave-60');
    if (this.dist >= 1000) this.unlock('dist-1k'); if (this.dist >= 5000) this.unlock('dist-5k'); if (this.dist >= 10000) this.unlock('dist-10k');
    if (this.career.totalDist >= 50000) this.unlock('total-dist-50k');
    if (this.sKills >= 200) this.unlock('kills-200'); if (this.sKills >= 300) this.unlock('kills-300');
    if (this.score >= 1000000) this.unlock('score-1m');
    if (this.career.totalKills >= 1000) this.unlock('total-kills-1k');
    if (this.career.perfectWaves >= 10) this.unlock('perfect-10');
    if (this.wave >= 5 && this.sCivHits === 0) this.unlock('clean-op');
    if (this.wave >= 5 && this.weaponLvl === 0) this.unlock('no-weapon-wave5');
    if (this.wave >= 75) this.unlock('wave-75');
    this.career.totalRainDist += this.sRainDist;
    if (this.career.totalRainDist >= 5000) this.unlock('total-rain-5k');
    this.st(this.resDoc, 'result-score', `Score: ${this.score}`); this.st(this.resDoc, 'result-wave', `Wave: ${this.wave}`);
    this.st(this.resDoc, 'result-distance', `Distance: ${Math.floor(this.dist)}m`); this.st(this.resDoc, 'result-combo', `Max Combo: ${this.maxCombo}x`);
    this.st(this.resDoc, 'result-kills', `Kills: ${this.sKills}`);
    this.st(this.resDoc, 'result-weapon', `Weapon: Lv${this.weaponLvl}`);
    this.st(this.resDoc, 'result-extra', `Docks:${this.sDocks} Jumps:${this.sJumps} Missions:${this.sMissionsCompleted}`);
    this.st(this.resDoc, 'result-best', this.score >= this.career.highScore ? 'NEW HIGH SCORE!' : `Best: ${this.career.highScore}`);
    this.showP('results');
  }


  update(delta: number, time: number) {
    for (let i = 0; i < this.orbs.length; i++) { const o = this.orbs[i]; o.position.y += Math.sin(time * 0.5 + i) * 0.002; (o.material as MeshBasicMaterial).opacity = 0.2 + Math.sin(time + i * 0.7) * 0.1; }
    // Screen shake
    if (this.shakeT > 0) { this.shakeT -= delta; const s = this.shakeStr * (this.shakeT / 0.3); this.world.camera.position.x = this.camBase.x + rf(-s, s); this.world.camera.position.y = this.camBase.y + rf(-s, s); } else { this.world.camera.position.x = this.camBase.x; this.world.camera.position.y = this.camBase.y; }
    this.pollGP();
    if (this.gState !== 'playing') return;
    const dt = Math.min(delta, 0.05); this.gTime += dt;
    if (this.mode === 'speed' && this.gTime >= 120) { this.gameOver(); return; }
    this.handleInput(dt);
    const spd = this.spdBoost ? this.scrollSpd * 1.5 : this.scrollSpd; this.dist += spd * dt;
    // Road scroll + bridge/tunnel tracking
    for (const s of this.roadSegs) { s.z -= spd * dt; s.mesh.position.z = s.z; }
    while (this.roadSegs.length > 0 && this.roadSegs[0].z < PLAYER_Z - ROAD_SEG_LEN * 2) {
      const old = this.roadSegs.shift()!;
      if (old.isBridge) { this.sBridges++; this.career.bridgesCrossed++; if (this.sBridges >= 3) this.unlock('bridge-3'); if (this.sBridges >= 5) this.unlock('bridge-5-game'); if (this.career.bridgesCrossed >= 10) this.unlock('bridge-10'); }
      if (old.isTunnel) { this.tunnelsPassed++; if (this.tunnelsPassed >= 3) this.unlock('tunnel-3'); }
      this.roadG.remove(old.mesh);
      const r = Math.random();
      const nb = r < BRIDGE_CHANCE;
      const nt = !nb && r < BRIDGE_CHANCE + TUNNEL_CHANCE;
      this.addRoadSeg(this.roadSegs[this.roadSegs.length - 1].z + ROAD_SEG_LEN, nb, nt);
    }
    // Spawn enemies
    this.spawnT -= dt; if (this.spawnT <= 0) { this.spawnE(); const heatMult = 1 - this.heatLevel * 0.05; this.spawnT = Math.max(0.2, SPAWN_INT - this.wave * 0.04) * (this.diff === 'insane' ? 0.6 : this.diff === 'hard' ? 0.8 : 1) * Math.max(0.4, heatMult); }
    this.civT -= dt; if (this.civT <= 0) { this.civs.push(this.mkCiv(ri(0, LANE_COUNT - 1), PLAYER_Z + 80)); this.civT = CIV_INT * (this.diff === 'insane' ? 0.7 : 1); }
    this.puT -= dt; if (this.puT <= 0) { const ts: PowerUpObj['type'][] = ['missile', 'oilslick', 'shield', 'speed', 'rapid', 'weapon']; this.pups.push(this.mkPU(ts[ri(0, ts.length - 1)], ri(0, LANE_COUNT - 1), PLAYER_Z + 70)); this.puT = PU_INT; }
    // Road hazards
    this.hazT -= dt; if (this.hazT <= 0) { const ht: RoadHazard['type'][] = ['pothole', 'barrier', 'cone']; this.hazards.push(this.mkHazard(ht[ri(0, 2)], ri(0, LANE_COUNT - 1), PLAYER_Z + 75)); this.hazT = Math.max(2, HAZARD_INT - this.wave * 0.15); }
    // Roadside buildings
    this.roadObjT -= dt;
    if (this.roadObjT <= 0) {
      const side = Math.random() < 0.5 ? -1 : 1;
      this.roadObjs.push(this.mkRoadsideObj(PLAYER_Z + 80 + rf(0, 20), side));
      this.roadObjT = rf(1.5, 3.5);
    }
    // Wave progression
    this.waveT += dt; if (this.waveT >= 20) {
      this.waveT = 0;
      if (this.waveNoDmg) { this.sPerfectWaves++; this.consecutivePerfect++; this.unlock('perfect-wave'); if (this.sPerfectWaves >= 3) this.unlock('perfect-3'); if (this.consecutivePerfect >= 5) this.unlock('consecutive-perfect-5'); } else { this.consecutivePerfect = 0; }
      this.waveNoDmg = true;
      this.wave++; this.scrollSpd = SCROLL_SPD + this.wave * 0.8; sfxWave();
      if (this.wave % 5 === 0 && !this.bossOut) { this.bossOut = true; this.enemies.push(this.mkEnemy('armored', ri(1, 3), PLAYER_Z + 80)); sfxBoss(); } else { this.bossOut = false; }
    }
    // Mission system
    if (this.missionCD > 0) this.missionCD -= dt;
    if (!this.mission && this.missionCD <= 0 && this.wave >= 3) { this.generateMission(); }
    this.updateMission(dt);
    // Combo timing
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 1; }
    if (this.combo >= 8) { this.comboMaxT += dt; if (this.comboMaxT >= 8) this.unlock('combo-streak'); } else { this.comboMaxT = 0; }
    if (this.pShield) { this.shieldT -= dt; if (this.shieldT <= 0) { this.pShield = false; (this.shieldM.material as MeshBasicMaterial).opacity = 0; } else { (this.shieldM.material as MeshBasicMaterial).opacity = 0.2 + Math.sin(time * 8) * 0.1; } }
    if (this.rapidF) { this.rapidT -= dt; if (this.rapidT <= 0) { this.rapidF = false; this.fireCD = this.weaponLvl >= 2 ? 0.12 : 0.18; } }
    if (this.spdBoost) { this.spdT -= dt; if (this.spdT <= 0) this.spdBoost = false; }
    if (this.invT > 0) this.invT -= dt;
    // Firing
    this.fireT -= dt;
    const wantShoot = this.keys.has('f') || this.keys.has(' ') || this.keys.has('j') || this.keys.has('k') || this.gpad.trigger;
    if (this.fireT <= 0 && wantShoot) {
      if (this.weaponLvl === 0) { this.fireBullet(this.pX - 0.4, PLAYER_Z + 1.5, true); this.fireBullet(this.pX + 0.4, PLAYER_Z + 1.5, true); sfxShoot(); }
      else if (this.weaponLvl === 1) { this.fireBullet(this.pX - 0.5, PLAYER_Z + 1.5, true, -4); this.fireBullet(this.pX, PLAYER_Z + 1.5, true); this.fireBullet(this.pX + 0.5, PLAYER_Z + 1.5, true, 4); sfxSpread(); }
      else { this.fireBullet(this.pX - 0.3, PLAYER_Z + 1.5, true); this.fireBullet(this.pX + 0.3, PLAYER_Z + 1.5, true); sfxLaser(); }
      this.fireT = this.fireCD;
    }
    // Oil slick
    if ((this.keys.has('e') || this.keys.has('q')) && this.oilCD <= 0) { this.dropOil(); this.oilCD = 1; this.sOils++; if (this.sOils >= 5) this.unlock('oil-5'); if (this.sOils >= 15) this.unlock('oil-15'); }
    if (this.oilCD > 0) this.oilCD -= dt;
    if (this.gpad.grip && !this.prevGrip && this.oilCD <= 0) { this.dropOil(); this.oilCD = 1; this.sOils++; }
    this.prevGrip = this.gpad.grip;
    // Smoke screen
    if (this.keys.has('r') && this.smokeCD <= 0) { this.dropSmoke(); this.smokeCD = 2; }
    if (this.gpad.a && !this.prevA && this.smokeCD <= 0) { this.dropSmoke(); this.smokeCD = 2; }
    this.prevA = this.gpad.a;
    if (this.smokeCD > 0) this.smokeCD -= dt;
    // EMP gadget (T key / Y button mapped to B since no Y — use number key 1)
    if (this.keys.has('1') && this.empCD <= 0 && this.empCharges > 0) { this.fireEMP(); }
    if (this.empCD > 0) this.empCD -= dt;
    // Decoy (2 key)
    if (this.keys.has('2') && this.decoyCD <= 0 && this.decoyCharges > 0) { this.deployDecoy(); }
    if (this.decoyCD > 0) this.decoyCD -= dt;
    // Pause
    if (this.gpad.b && !this.prevB) { if (this.gState === 'playing') this.pauseG(); else if (this.gState === 'paused') this.resumeG(); }
    this.prevB = this.gpad.b;
    // Speed boost trail
    this.addTrail();
    // Music intensity
    const targetIntensity = clp((this.enemies.filter(e => !e.dead && !e.dying && e.z > PLAYER_Z - 10 && e.z < PLAYER_Z + 30).length / 4) + (this.bossOut ? 0.5 : 0) + (this.combo >= 5 ? 0.2 : 0), 0, 1);
    this.musicIntensity += (targetIntensity - this.musicIntensity) * dt * 2;
    updateMusic(this.wave, this.musicIntensity, this.bossOut);
    // Day/Night cycle (60s day, 40s night)
    this.dayNightTimer += dt;
    const cycleDuration = this.isNight ? 40 : 60;
    if (this.dayNightTimer >= cycleDuration) {
      this.dayNightTimer = 0;
      this.isNight = !this.isNight;
      if (!this.isNight) { this.nightCycles++; if (this.nightCycles >= 1) this.unlock('night-survive'); }
    }
    const sc = SCHEMES[this.cIdx];
    if (this.isNight) {
      const nightProgress = Math.min(1, this.dayNightTimer / 5); // 5s transition
      const f = this._scene.fog as FogExp2;
      if (f) f.density = 0.012 + 0.015 * nightProgress;
      (this.headlightL.material as MeshBasicMaterial).opacity = 0.12 + Math.sin(time * 3) * 0.03;
      (this.headlightR.material as MeshBasicMaterial).opacity = 0.12 + Math.sin(time * 3) * 0.03;
    } else {
      const f = this._scene.fog as FogExp2;
      if (f) f.density = 0.012;
    }
    // Heat/Threat level (rises with kills, decays slowly)
    this.heatTimer += dt;
    if (this.heatTimer >= 15) {
      this.heatTimer = 0;
      if (this.heatLevel > 0) this.heatLevel = Math.max(0, this.heatLevel - 0.5);
    }
    if (this.heatLevel > this.maxHeatLevel) this.maxHeatLevel = this.heatLevel;
    if (this.heatLevel >= 3) this.unlock('heat-3');
    if (this.heatLevel >= 5) this.unlock('heat-5');
    if (this.heatLevel >= 7) this.unlock('heat-max');
    // Formation spawning
    this.formationCD -= dt;
    if (this.formationCD <= 0 && this.wave >= 5) {
      this.spawnFormation();
      this.formationCD = Math.max(20, 40 - this.wave * 0.5);
      // Track: formation cleared when all formation enemies die (simplified — track via wave)
      this.sFormationsCleared++;
      this.unlock('formation-1');
      if (this.sFormationsCleared >= 5) this.unlock('formation-5');
      try { let fc = parseInt(localStorage.getItem('neon-spy-formations') || '0'); fc += 1; localStorage.setItem('neon-spy-formations', String(fc)); if (fc >= 10) this.unlock('formation-10'); } catch {}
    }
    // Recharge gadgets periodically
    if (this.wave % 5 === 0 && this.waveT < dt * 2) { this.empCharges = Math.min(3, this.empCharges + 1); this.decoyCharges = Math.min(4, this.decoyCharges + 1); }
    // Weapons Truck system
    this.truckCD -= dt;
    if (this.truckCD <= 0 && !this.weaponsTruck && this.wave >= 2) {
      this.spawnWeaponsTruck();
      this.truckCD = 45 + ri(0, 15);
    }
    if (this.weaponsTruck && this.weaponsTruck.active) {
      const truck = this.weaponsTruck;
      // Truck drives forward to match player speed, then cruises alongside
      const targetZ = PLAYER_Z + 8;
      if (truck.z < targetZ) {
        truck.z += (spd + 8) * dt;
      } else {
        truck.z -= (spd * 0.01) * dt; // Slight drift forward
      }
      truck.mesh.position.z = truck.z;
      // Emblem pulse
      const emblem = truck.mesh.children[4];
      if (emblem) (emblem as Mesh).material = new MeshBasicMaterial({ color: SCHEMES[this.cIdx].powerup, transparent: true, opacity: 0.4 + Math.sin(time * 4) * 0.2 });
      // Check if player drives into truck
      if (!truck.docked && Math.abs(this.pX - truck.x) < 1.5 && Math.abs(PLAYER_Z - truck.z) < 3.5 && !this.isAirborne) {
        truck.docked = true; truck.dockTimer = 3;
        sfxDock();
        // Rewards: weapon upgrade, shield, gadget recharge
        if (this.weaponLvl >= 2) {
          // Already max — bonus score
          this.score += 500 * this.combo;
          this.addPopup(this.pX, PLAYER_Z + 2, 500 * this.combo);
          this.unlock('dock-full-weapon');
        } else {
          this.weaponLvl = Math.min(2, this.weaponLvl + 1);
          if (this.weaponLvl >= 1) this.unlock('weapon-spread');
          if (this.weaponLvl >= 2) this.unlock('weapon-laser');
        }
        this.pShield = true; this.shieldT = 8;
        (this.shieldM.material as MeshBasicMaterial).opacity = 0.2;
        this.empCharges = Math.min(3, this.empCharges + 1);
        this.decoyCharges = Math.min(4, this.decoyCharges + 1);
        this.spawnParts(truck.x, 1, truck.z, '#0088ff', 20);
        this.sDocks++; this.career.totalDocks++;
        this.unlock('truck-dock');
        if (this.sDocks >= 3) this.unlock('truck-dock-3');
        if (this.sDocks >= 5) this.unlock('truck-dock-5');
        if (this.career.totalDocks >= 20) this.unlock('total-docks-20');
        this.saveData();
      }
      // Docked: truck drives away after timer
      if (truck.docked) {
        truck.dockTimer -= dt;
        if (truck.dockTimer <= 0) { truck.active = false; }
      }
      // Truck leaves if too far behind or timed out
      if (truck.z < PLAYER_Z - 30 || (truck.z > PLAYER_Z + 80)) { truck.active = false; }
      if (!truck.active) { this.entG.remove(truck.mesh); this.weaponsTruck = null; }
    }
    // Jump Ramp system
    this.rampCD -= dt;
    if (this.rampCD <= 0 && this.wave >= 3) {
      this.jumpRamps.push(this.mkJumpRamp(ri(0, LANE_COUNT - 1), PLAYER_Z + 75));
      this.rampCD = rf(10, 18);
    }
    // Airborne state
    if (this.isAirborne) {
      this.airT -= dt;
      const airProg = 1 - (this.airT / 1.2);
      this.airY = Math.sin(airProg * Math.PI) * 3;
      this.pGroup.position.y = this.airY;
      if (this.airT <= 0) {
        this.isAirborne = false; this.airT = 0; this.airY = 0;
        this.pGroup.position.y = 0;
        sfxLand();
        this.triggerShake(0.06, 0.15);
        // Check if jumped over any mines
        for (const m of this.mines) {
          if (!m.dead && Math.abs(this.pX - m.x) < 1.0 && Math.abs(PLAYER_Z - m.z) < 2) {
            this.unlock('jump-dodge-mine');
            this.sMinesDodged++;
          }
        }
      }
    }
    // Rain weather system
    this.rainCD -= dt;
    if (!this.isRaining && this.rainCD <= 0 && this.wave >= 4) {
      this.startRain();
      this.rainTimer = rf(25, 40);
      this.rainCD = rf(60, 90);
    }
    if (this.isRaining) {
      this.rainTimer -= dt;
      this.sRainDist += spd * dt;
      if (this.sRainDist >= 500) this.unlock('rain-500m');
      if (this.rainTimer <= 0) this.stopRain();
      // Update rain drops
      for (const r of this.rainDrops) {
        r.mesh.position.y -= r.vel * dt;
        if (r.mesh.position.y < 0) {
          r.mesh.position.y = rf(10, 16);
          r.mesh.position.x = rf(-20, 20);
          r.mesh.position.z = rf(PLAYER_Z - 15, PLAYER_Z + 60);
        }
      }
      // Rain visibility reduction
      const f = this._scene.fog as FogExp2;
      if (f) f.density = Math.max(f.density, 0.018);
    }
    // All-weather achievement check
    if (!this.isNight && !this.isRaining) this.seenDay = true;
    if (this.isNight) this.seenNight = true;
    if (this.seenDay && this.seenNight && this.seenRain) this.unlock('all-weather');
    // Update all entities
    this.updEnemies(dt, spd, time); this.updCivs(dt, spd); this.updBullets(dt); this.updPUs(dt, spd); this.updOils(dt, spd); this.updSmokes(dt, spd); this.updParts(dt); this.updPopups(dt); this.updTrails(dt); this.updHazards(dt, spd); this.updMines(dt, spd); this.updRoadObjs(dt, spd); this.updDecoys(dt, spd, time); this.updEMPWaves(dt); this.updRamps(dt, spd); this.checkColl(time);
    this.updHUD(); this.updRadar();
    this.pGroup.position.x = this.pX;
    // Headlight flicker (handled in night mode section above for night, basic here for day)
    if (!this.isNight) {
      const hlOp = 0.06 + Math.sin(time * 3) * 0.02;
      (this.headlightL.material as MeshBasicMaterial).opacity = hlOp;
      (this.headlightR.material as MeshBasicMaterial).opacity = hlOp;
    }
    if (this.invT > 0) this.pGroup.visible = Math.floor(time * 10) % 2 === 0; else this.pGroup.visible = true;
    // Neon sign flicker on roadside objs
    for (const ro of this.roadObjs) {
      if (ro.mesh.children.length > 1) {
        const sign = ro.mesh.children[1];
        if (sign && (sign as Mesh).material) {
          (sign as Mesh).material = new MeshBasicMaterial({ color: SCHEMES[this.cIdx].accent, transparent: true, opacity: 0.3 + Math.sin(time * 4 + ro.z) * 0.2 });
        }
      }
    }
  }

  private pollGP() { try { const inp = this.world.input; if (inp) { const gps = (inp as any).xr?.gamepads; if (gps) { for (const gp of gps) { if (!gp) continue; this.gpad.axes = gp.getAxesValues?.('thumbstick') ?? { x: 0, y: 0 }; this.gpad.trigger = !!gp.getButtonValue?.('trigger'); this.gpad.grip = !!gp.getButtonValue?.('grip'); this.gpad.a = !!gp.getButtonValue?.('button1'); this.gpad.b = !!gp.getButtonValue?.('button2'); } } } } catch {} }

  private handleInput(dt: number) {
    const ms = PLAYER_SPD * dt; const hr = ROAD_WIDTH / 2 - 0.7;
    if (this.keys.has('arrowleft') || this.keys.has('a')) { this.pX -= ms; this.moves++; }
    if (this.keys.has('arrowright') || this.keys.has('d')) { this.pX += ms; this.moves++; }
    this.pX += (this.gpad.axes.x || 0) * PLAYER_SPD * dt;
    this.pX = clp(this.pX, -hr, hr);
    if (this.mode === 'challenge' && this.moves >= 500) this.gameOver();
  }


  private updEnemies(dt: number, ss: number, time: number) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.dying) { e.deathSpin += dt * 8; e.mesh.rotation.y = e.deathSpin; e.mesh.position.y += dt * 2; const mat = e.mesh.children[0] as Mesh; if (mat?.material) (mat.material as MeshBasicMaterial).opacity = Math.max(0, 0.6 - e.deathSpin / 5); if (e.deathSpin > 3) e.dead = true; continue; }
      e.z -= (ss - e.speed) * dt; e.mesh.position.z = e.z;
      // Lane-change AI
      e.laneChangeT -= dt;
      if (e.laneChangeT <= 0 && e.type !== 'armored') {
        if (e.type === 'interceptor') {
          // Interceptors actively target the player's lane
          const pLane = Math.round(this.pX / LANE_WIDTH + 2);
          e.targetLane = clp(pLane + ri(-1, 1), 0, LANE_COUNT - 1);
          e.laneChangeT = rf(1, 2);
        } else {
          e.targetLane = clp(e.targetLane + ri(-1, 1), 0, LANE_COUNT - 1);
          e.laneChangeT = rf(2, 4);
        }
      }
      const tlx = laneX(e.targetLane);
      const laneSpd = e.type === 'interceptor' ? PLAYER_SPD * 0.8 : PLAYER_SPD * 0.5;
      if (Math.abs(e.x - tlx) > 0.1) { e.x += (tlx > e.x ? 1 : -1) * laneSpd * dt; e.mesh.position.x = e.x; }
      // Helicopter rotor
      if (e.type === 'helicopter' && e.mesh.children[1]) e.mesh.children[1].rotation.y += dt * 10;
      // Van mine dropping
      if (e.type === 'van') {
        e.mineCD -= dt;
        if (e.mineCD <= 0 && e.z > PLAYER_Z - 5 && e.z < PLAYER_Z + 50) {
          this.mines.push(this.mkMine(e.x, e.z - 1.5));
          sfxMine();
          e.mineCD = rf(3, 5) - this.wave * 0.05;
        }
      }
      // Check if in smoke
      let inSmoke = false;
      for (const s of this.smokes) { if (!s.dead && Math.abs(e.x - s.x) < 2 && Math.abs(e.z - s.z) < 3) { inSmoke = true; break; } }
      // Enemy fire (suppressed in smoke, motorcycles don't fire)
      if (e.type !== 'motorcycle' && !inSmoke) {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && e.z > PLAYER_Z && e.z < PLAYER_Z + 50) {
          this.fireBullet(e.x, e.z - 1.5, false);
          sfxEnemyShoot();
          const rateScale = e.type === 'interceptor' ? 0.7 : 1;
          e.fireTimer = ENEMY_FIRE_RATE * rateScale / (1 + this.wave * 0.1);
        }
      }
      if (e.z < PLAYER_Z - 20) e.dead = true;
    }
    this.enemies = this.enemies.filter(e => { if (e.dead) { this.entG.remove(e.mesh); return false; } return true; });
  }

  private updCivs(dt: number, ss: number) { for (const c of this.civs) { if (c.dead) continue; c.z -= (ss - c.speed) * dt; c.mesh.position.z = c.z; if (c.z < PLAYER_Z - 20) c.dead = true; } this.civs = this.civs.filter(c => { if (c.dead) { this.entG.remove(c.mesh); return false; } return true; }); }
  private updBullets(dt: number) { for (const b of this.bullets) { if (b.dead) continue; b.z += b.speed * dt; b.x += b.dx * dt; b.mesh.position.z = b.z; b.mesh.position.x = b.x; if (b.z > PLAYER_Z + 100 || b.z < PLAYER_Z - 30 || Math.abs(b.x) > 15) b.dead = true; } this.bullets = this.bullets.filter(b => { if (b.dead) { this.entG.remove(b.mesh); return false; } return true; }); }
  private updPUs(dt: number, ss: number) { for (const p of this.pups) { if (p.dead) continue; p.z -= ss * 0.3 * dt; p.rotY += dt * 2; p.mesh.position.z = p.z; p.mesh.rotation.y = p.rotY; if (p.z < PLAYER_Z - 20) p.dead = true; } this.pups = this.pups.filter(p => { if (p.dead) { this.entG.remove(p.mesh); return false; } return true; }); }
  private updOils(dt: number, ss: number) { for (const o of this.oils) { if (o.dead) continue; o.z -= ss * dt; o.mesh.position.z = o.z; o.timer -= dt; if (o.timer <= 0 || o.z < PLAYER_Z - 30) o.dead = true; } this.oils = this.oils.filter(o => { if (o.dead) { this.entG.remove(o.mesh); return false; } return true; }); }
  private updSmokes(dt: number, ss: number) {
    for (const s of this.smokes) { if (s.dead) continue; s.z -= ss * dt; s.mesh.position.z = s.z; s.timer -= dt; s.opacity = 0.35 * (s.timer / SMOKE_DUR);
      s.mesh.children.forEach(c => { if ((c as Mesh).material) ((c as Mesh).material as MeshBasicMaterial).opacity = s.opacity; });
      if (s.timer <= 0) s.dead = true;
    }
    this.smokes = this.smokes.filter(s => { if (s.dead) { this.entG.remove(s.mesh); return false; } return true; });
  }
  private updHazards(dt: number, ss: number) {
    for (const h of this.hazards) { if (h.dead) continue; h.z -= ss * dt; h.mesh.position.z = h.z; if (h.z < PLAYER_Z - 10) { h.dead = true; this.sHazardsDodged++; if (this.sHazardsDodged >= 10) this.unlock('hazard-dodge-10'); if (this.sHazardsDodged >= 30) this.unlock('hazard-dodge-30'); } }
    this.hazards = this.hazards.filter(h => { if (h.dead) { this.entG.remove(h.mesh); return false; } return true; });
  }
  private updMines(dt: number, ss: number) {
    for (const m of this.mines) {
      if (m.dead) continue;
      m.z -= ss * dt; m.mesh.position.z = m.z; m.timer -= dt;
      // Pulsing glow
      (m.mesh.material as MeshBasicMaterial).opacity = 0.4 + Math.sin(m.timer * 6) * 0.2;
      if (m.timer <= 0 || m.z < PLAYER_Z - 15) {
        m.dead = true;
        if (m.z >= PLAYER_Z - 15) { this.sMinesDodged++; if (this.sMinesDodged >= 5) this.unlock('mine-dodge-5'); if (this.sMinesDodged >= 15) this.unlock('mine-dodge-15'); }
      }
    }
    this.mines = this.mines.filter(m => { if (m.dead) { this.entG.remove(m.mesh); return false; } return true; });
  }
  private updRoadObjs(dt: number, ss: number) {
    for (const ro of this.roadObjs) { ro.z -= ss * dt; ro.mesh.position.z = ro.z; }
    this.roadObjs = this.roadObjs.filter(ro => { if (ro.z < PLAYER_Z - 40) { this._scene.remove(ro.mesh); return false; } return true; });
  }
  private updDecoys(dt: number, ss: number, time: number) {
    for (const d of this.decoys) {
      if (d.dead) continue;
      d.z -= ss * dt; d.mesh.position.z = d.z; d.life -= dt;
      // Holographic flicker
      const flicker = 0.2 + Math.sin(time * 12) * 0.1;
      d.mesh.children.forEach(c => { if ((c as Mesh).material) ((c as Mesh).material as MeshBasicMaterial).opacity = flicker; });
      if (d.life <= 0) d.dead = true;
      // Decoy draws enemy fire — redirect nearby enemies
      for (const e of this.enemies) {
        if (e.dead || e.dying) continue;
        const dx = d.x - e.x, dz = d.z - e.z;
        if (Math.sqrt(dx * dx + dz * dz) < 15) {
          // Enemy targets decoy instead of player
          const dLane = Math.round(d.x / LANE_WIDTH + 2);
          e.targetLane = clp(dLane, 0, LANE_COUNT - 1);
        }
      }
      // Absorb enemy bullets
      for (const b of this.bullets) {
        if (b.dead || b.fromPlayer) continue;
        if (Math.abs(b.x - d.x) < 1.0 && Math.abs(b.z - d.z) < 1.5) {
          b.dead = true;
          this.decoyHitsAbsorbed++;
          this.spawnParts(d.x, 0.5, d.z, '#ffffff', 3);
          if (this.decoyHitsAbsorbed >= 10) this.unlock('decoy-absorb');
        }
      }
    }
    this.decoys = this.decoys.filter(d => { if (d.dead) { this.entG.remove(d.mesh); return false; } return true; });
  }
  private updEMPWaves(dt: number) {
    for (const e of this.empWaves) {
      if (e.dead) continue;
      e.radius += dt * 20;
      e.life -= dt;
      e.mesh.scale.set(e.radius, e.radius, e.radius);
      (e.mesh.material as MeshBasicMaterial).opacity = Math.max(0, e.life * 0.5);
      if (e.life <= 0) e.dead = true;
    }
    this.empWaves = this.empWaves.filter(e => { if (e.dead) { this._scene.remove(e.mesh); return false; } return true; });
  }
  private updRamps(dt: number, ss: number) {
    for (const r of this.jumpRamps) {
      if (r.dead) continue;
      r.z -= ss * dt; r.mesh.position.z = r.z;
      // Check player collision with ramp (only if not already airborne)
      if (!this.isAirborne && Math.abs(this.pX - r.x) < LANE_WIDTH * 0.5 && Math.abs(PLAYER_Z - r.z) < 1.5) {
        r.dead = true;
        this.isAirborne = true; this.airT = 1.2;
        sfxJump();
        this.sJumps++; this.career.totalJumps++;
        this.unlock('jump-1');
        if (this.sJumps >= 5) this.unlock('jump-5');
        if (this.sJumps >= 10) this.unlock('jump-10');
        if (this.career.totalJumps >= 50) this.unlock('total-jumps-50');
        this.spawnParts(this.pX, 0.3, PLAYER_Z, SCHEMES[this.cIdx].powerup, 8);
      }
      if (r.z < PLAYER_Z - 10) r.dead = true;
    }
    this.jumpRamps = this.jumpRamps.filter(r => { if (r.dead) { this.entG.remove(r.mesh); return false; } return true; });
  }
  private updParts(dt: number) { for (const p of this.parts) { p.vel.y -= 9.8 * dt; p.mesh.position.add(p.vel.clone().multiplyScalar(dt)); p.life -= dt; (p.mesh.material as MeshBasicMaterial).opacity = Math.max(0, p.life / p.maxLife); } this.parts = this.parts.filter(p => { if (p.life <= 0) { this._scene.remove(p.mesh); return false; } return true; }); }
  private updPopups(dt: number) { for (const p of this.popups) { p.y += dt * 2; p.mesh.position.y = p.y; p.life -= dt; (p.mesh.material as MeshBasicMaterial).opacity = Math.max(0, p.life); } this.popups = this.popups.filter(p => { if (p.life <= 0) { this._scene.remove(p.mesh); return false; } return true; }); }
  private updTrails(dt: number) { for (const t of this.trails) { t.life -= dt; (t.mesh.material as MeshBasicMaterial).opacity = Math.max(0, t.life * 0.8); } this.trails = this.trails.filter(t => { if (t.life <= 0) { this._scene.remove(t.mesh); return false; } return true; }); }


  private checkColl(time: number) {
    const px = this.pX, pz = PLAYER_Z;
    // Player bullets vs enemies
    for (const b of this.bullets) { if (b.dead || !b.fromPlayer) continue; for (const e of this.enemies) { if (e.dead || e.dying) continue; const hw = e.type === 'armored' ? 1.8 : e.type === 'van' ? 1.4 : e.type === 'helicopter' ? 1.0 : e.type === 'interceptor' ? 0.8 : 0.7; const hd = e.type === 'armored' ? 3.5 : e.type === 'van' ? 2.8 : 2.2; if (Math.abs(b.x - e.x) < hw && Math.abs(b.z - e.z) < hd) { b.dead = true; e.hp--; sfxHit(); if (e.hp <= 0) { e.dying = true; e.deathSpin = 0; let pts: number; if (e.type === 'armored') pts = 1000; else if (e.type === 'helicopter') pts = 300; else if (e.type === 'motorcycle') pts = 150; else if (e.type === 'van') pts = 250; else if (e.type === 'interceptor') pts = 350; else pts = 100; const gained = pts * this.combo; this.score += gained; this.addPopup(e.x, e.z, gained); this.spawnParts(e.x, 0.5, e.z, SCHEMES[this.cIdx].enemy, e.type === 'armored' ? 25 : 15); sfxExplosion(); if (e.type === 'armored') this.triggerShake(0.15, 0.3); this.sKills++; this.career.totalKills++; this.onEnemyKill(e.type, false); if (this.isAirborne) this.unlock('jump-kill'); this.recentKillTimes.push(time); this.recentKillTimes = this.recentKillTimes.filter(t => time - t < 1); if (this.recentKillTimes.length >= 3) this.unlock('multi-kill-3'); this.combo = Math.min(8, this.combo + 1); this.comboT = COMBO_DECAY; if (this.combo > this.maxCombo) this.maxCombo = this.combo; if (this.combo >= 3) { this.unlock('combo-3'); sfxCombo(); } if (this.combo >= 5) this.unlock('combo-5'); if (this.combo >= 8) this.unlock('combo-8'); this.unlock('first-kill'); if (this.sKills >= 10) this.unlock('kills-10'); if (this.sKills >= 25) this.unlock('kills-25'); if (this.sKills >= 50) this.unlock('kills-50'); if (this.sKills >= 100) this.unlock('kills-100'); if (this.sKills >= 200) this.unlock('kills-200'); if (this.sKills >= 300) this.unlock('kills-300'); if (e.type === 'armored') { this.career.totalBoss++; this.unlock('boss-kill'); if (this.career.totalBoss >= 5) this.unlock('boss-5'); if (this.isRaining) this.unlock('rain-boss'); } if (this.spdBoost) this.unlock('speed-kill'); if (this.isRaining) { this.rainKills++; if (this.rainKills >= 10) this.unlock('rain-kill-10'); } for (const sm of this.smokes) { if (!sm.dead && Math.abs(e.x - sm.x) < 2 && Math.abs(e.z - sm.z) < 3) { this.unlock('smoke-kill'); break; } } } else { this.spawnParts(b.x, 0.5, b.z, '#ffffff', 4); } break; } } }
    // Skip body collisions when airborne
    if (!this.isAirborne) {
    // Enemy bullets vs player
    if (this.invT <= 0) { for (const b of this.bullets) { if (b.dead || b.fromPlayer) continue; if (Math.abs(b.x - px) < 0.8 && Math.abs(b.z - pz) < 1.5) { b.dead = true; if (this.pShield) { this.pShield = false; (this.shieldM.material as MeshBasicMaterial).opacity = 0; sfxShield(); this.spawnParts(px, 0.5, pz, SCHEMES[this.cIdx].powerup, 10); } else { this.pHit(); } } } }
    // Enemy body vs player
    if (this.invT <= 0) { for (const e of this.enemies) { if (e.dead || e.dying) continue; const hw = e.type === 'armored' ? 1.6 : e.type === 'van' ? 1.3 : 0.9; if (Math.abs(px - e.x) < hw && Math.abs(pz - e.z) < 2.0) { if (this.pShield) { e.dying = true; e.deathSpin = 0; this.pShield = false; (this.shieldM.material as MeshBasicMaterial).opacity = 0; this.spawnParts(e.x, 0.5, e.z, SCHEMES[this.cIdx].enemy, 15); sfxExplosion(); } else { this.pHit(); } } } }
    // Civilian collision
    if (this.invT <= 0) { for (const c of this.civs) { if (c.dead) continue; if (Math.abs(px - c.x) < 0.9 && Math.abs(pz - c.z) < 2.0) { c.dead = true; this.sCivHits++; sfxCivHit(); this.spawnParts(c.x, 0.5, c.z, SCHEMES[this.cIdx].civilian, 8); this.score = Math.max(0, this.score - 200); this.addPopup(c.x, c.z, -200); this.combo = 1; } } }
    // Road hazard collision
    if (this.invT <= 0) { for (const h of this.hazards) { if (h.dead) continue; const hr = h.type === 'barrier' ? 1.2 : 0.7; if (Math.abs(px - h.x) < hr && Math.abs(pz - h.z) < 1.5) { h.dead = true; sfxHazard(); this.spawnParts(h.x, 0.3, h.z, '#ff6600', 8); if (this.pShield) { this.pShield = false; (this.shieldM.material as MeshBasicMaterial).opacity = 0; } else { this.pHit(); } } } }
    // Mine collision
    if (this.invT <= 0) { for (const m of this.mines) { if (m.dead) continue; if (Math.abs(px - m.x) < 0.7 && Math.abs(pz - m.z) < 0.7) { m.dead = true; sfxExplosion(); this.spawnParts(m.x, 0.3, m.z, '#ff2200', 15); this.triggerShake(0.1, 0.2); if (this.pShield) { this.pShield = false; (this.shieldM.material as MeshBasicMaterial).opacity = 0; } else { this.pHit(); } } } }
    } // end airborne skip
    // Power-up pickup
    for (const pu of this.pups) { if (pu.dead) continue; if (Math.abs(px - pu.x) < 1.2 && Math.abs(pz - pu.z) < 2.2) { pu.dead = true; sfxPowerUp(); this.career.totalPU++; this.puTypes.add(pu.type);
      switch (pu.type) {
        case 'missile': for (let i = -1; i <= 1; i++) this.fireBullet(px + i * 0.8, pz + 2, true); break;
        case 'oilslick': this.dropOil(); this.dropOil(); break;
        case 'shield': this.pShield = true; this.shieldT = 10; this.unlock('shield-use'); break;
        case 'speed': this.spdBoost = true; this.spdT = 8; this.unlock('speed-use'); break;
        case 'rapid': this.rapidF = true; this.rapidT = 8; this.fireCD = this.weaponLvl >= 2 ? 0.04 : 0.06; this.unlock('rapid-use'); break;
        case 'weapon': this.weaponLvl = Math.min(2, this.weaponLvl + 1); sfxWeaponUp(); if (this.weaponLvl >= 1) this.unlock('weapon-spread'); if (this.weaponLvl >= 2) { this.unlock('weapon-laser'); this.fireCD = this.rapidF ? 0.04 : 0.12; }
          let maxCount = 0; try { const mc = localStorage.getItem('neon-spy-maxwep'); maxCount = mc ? parseInt(mc) : 0; } catch {} if (this.weaponLvl >= 2) { maxCount++; try { localStorage.setItem('neon-spy-maxwep', String(maxCount)); } catch {} if (maxCount >= 3) this.unlock('weapon-max-3'); }
          break;
      }
      if (this.puTypes.size >= 5) this.unlock('all-pu');
      this.spawnParts(pu.x, 0.5, pu.z, SCHEMES[this.cIdx].powerup, 10);
    } }
    // Oil slick vs enemies
    for (const o of this.oils) { if (o.dead) continue; for (const e of this.enemies) { if (e.dead || e.dying) continue; if (Math.abs(o.x - e.x) < 1.0 && Math.abs(o.z - e.z) < 1.5) { e.dying = true; e.deathSpin = 0; o.dead = true; const gained = 200 * this.combo; this.score += gained; this.addPopup(e.x, e.z, gained); this.spawnParts(e.x, 0.5, e.z, '#333333', 12); sfxHit(); this.sKills++; this.career.totalKills++; this.onEnemyKill(e.type, true); if (e.type === 'armored') { this.career.totalBoss++; this.unlock('oil-boss'); } } } }
  }

  private pHit() {
    if (this.mode === 'zen') return; this.lives--; sfxDeath(); this.spawnParts(this.pX, 0.5, PLAYER_Z, SCHEMES[this.cIdx].primary, 20);
    this.invT = 2; this.combo = 1; this.weaponLvl = Math.max(0, this.weaponLvl - 1); this.waveNoDmg = false; this.consecutivePerfect = 0;
    this.missionNoDmg = false; this.triggerShake(0.12, 0.25); if (this.lives <= 0) this.gameOver();
  }

  private spawnE() {
    const l = ri(0, LANE_COUNT - 1); const z = PLAYER_Z + 70 + rf(0, 20);
    let t: EnemyCar['type'] = 'sedan'; const r = Math.random();
    if (this.wave >= 3 && r < 0.2) t = 'motorcycle';
    if (this.wave >= 5 && r < 0.15) t = 'helicopter';
    if (this.wave >= 4 && r >= 0.15 && r < 0.28) t = 'van';
    if (this.wave >= 6 && r >= 0.28 && r < 0.38) t = 'interceptor';
    this.enemies.push(this.mkEnemy(t, l, z));
  }

  private spawnFormation() {
    if (this.wave < 5) return;
    const fType = ri(0, 2);
    const z = PLAYER_Z + 80;
    sfxFormation();
    if (fType === 0) {
      // Convoy — single file line of 4 enemies
      const lane = ri(1, 3);
      for (let i = 0; i < 4; i++) {
        const t: EnemyCar['type'] = i === 3 ? 'van' : 'sedan';
        this.enemies.push(this.mkEnemy(t, lane, z + i * 6));
      }
    } else if (fType === 1) {
      // V-formation — 5 enemies in a V shape
      this.enemies.push(this.mkEnemy('interceptor', 2, z));
      this.enemies.push(this.mkEnemy('sedan', 1, z + 5));
      this.enemies.push(this.mkEnemy('sedan', 3, z + 5));
      this.enemies.push(this.mkEnemy('motorcycle', 0, z + 10));
      this.enemies.push(this.mkEnemy('motorcycle', 4, z + 10));
    } else {
      // Blockade — enemies across all lanes
      for (let lane = 0; lane < LANE_COUNT; lane++) {
        const t: EnemyCar['type'] = lane === 2 ? 'van' : 'sedan';
        this.enemies.push(this.mkEnemy(t, lane, z + (lane % 2) * 3));
      }
    }
  }

  private updHUD() {
    if (!this.hudDoc) return;
    this.st(this.hudDoc, 'score', `Score: ${this.score}`); this.st(this.hudDoc, 'lives', `Lives: ${'o'.repeat(Math.max(0, this.lives))}`);
    this.st(this.hudDoc, 'wave', `Wave ${this.wave}`); this.st(this.hudDoc, 'combo', this.combo > 1 ? `${this.combo}x Combo` : '');
    this.st(this.hudDoc, 'distance', `${Math.floor(this.dist)}m`);
    const wn = ['Dual', 'Spread', 'Laser'][this.weaponLvl];
    this.st(this.hudDoc, 'weapon', `Weapon: ${wn}`);
    const st = this.pShield ? `Shield: ${Math.ceil(this.shieldT)}s` : ''; const rt = this.rapidF ? `Rapid: ${Math.ceil(this.rapidT)}s` : ''; const spt = this.spdBoost ? `Speed: ${Math.ceil(this.spdT)}s` : '';
    this.st(this.hudDoc, 'powerup-status', [st, rt, spt].filter(Boolean).join(' | '));
    // Gadget and heat display
    const gadgetStr = `EMP:${this.empCharges} Decoy:${this.decoyCharges}`;
    const heatStr = this.heatLevel > 0 ? ` | Heat:${'!'.repeat(Math.min(7, Math.floor(this.heatLevel)))}` : '';
    const nightStr = this.isNight ? ' | NIGHT' : '';
    const rainStr = this.isRaining ? ' | RAIN' : '';
    const airStr = this.isAirborne ? ' | AIRBORNE' : '';
    this.st(this.hudDoc, 'gadget-status', gadgetStr + heatStr + nightStr + rainStr + airStr);
    if (this.mode === 'speed') this.st(this.hudDoc, 'mode-info', `Time: ${Math.ceil(120 - this.gTime)}s`);
    else if (this.mode === 'challenge') this.st(this.hudDoc, 'mode-info', `Moves: ${500 - this.moves}`);
    else this.st(this.hudDoc, 'mode-info', '');
    // Mission info
    if (this.mission && this.mission.active) {
      this.st(this.hudDoc, 'mission-text', `MISSION: ${this.mission.desc}`);
      this.st(this.hudDoc, 'mission-progress', `${Math.floor(this.mission.progress)}/${this.mission.target} | ${Math.ceil(this.mission.timer)}s`);
    } else {
      this.st(this.hudDoc, 'mission-text', '');
      this.st(this.hudDoc, 'mission-progress', '');
    }
  }

  private updRadar() {
    if (!this.radarDoc) return;
    // Show up to 6 nearest enemies
    const nearby = this.enemies.filter(e => !e.dead && !e.dying).sort((a, b) => Math.abs(a.z - PLAYER_Z) - Math.abs(b.z - PLAYER_Z)).slice(0, 6);
    for (let i = 0; i < 6; i++) {
      const e = nearby[i];
      if (e) {
        const dz = e.z - PLAYER_Z;
        const dx = e.x - this.pX;
        const dir = dz > 0 ? '^ ' : 'v ';
        const side = Math.abs(dx) > 1 ? (dx > 0 ? ' >' : ' <') : '';
        const dist = Math.abs(Math.floor(dz));
        this.st(this.radarDoc, `radar-${i}`, `${dir}${e.type} ${dist}m${side}`);
      } else {
        this.st(this.radarDoc, `radar-${i}`, '');
      }
    }
    this.st(this.radarDoc, 'radar-count', `${this.enemies.filter(e => !e.dead && !e.dying).length} threats`);
  }
}
