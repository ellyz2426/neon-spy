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
  PlaneGeometry,
  ConeGeometry,
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

interface EnemyCar { mesh: Group; x: number; z: number; speed: number; type: 'sedan'|'motorcycle'|'helicopter'|'armored'; hp: number; fireTimer: number; dead: boolean; }
interface CivilianCar { mesh: Group; x: number; z: number; speed: number; dead: boolean; }
interface Bullet { mesh: Mesh; x: number; z: number; fromPlayer: boolean; speed: number; dead: boolean; }
interface PowerUpObj { mesh: Group; x: number; z: number; type: 'missile'|'oilslick'|'shield'|'speed'|'rapid'; dead: boolean; rotY: number; }
interface OilSlick { mesh: Mesh; x: number; z: number; timer: number; dead: boolean; }
interface Particle { mesh: Mesh; vel: Vector3; life: number; maxLife: number; }
interface RoadSeg { mesh: Group; z: number; }
interface Achievement { id: string; name: string; desc: string; unlocked: boolean; }

const ROAD_WIDTH = 12; const LANE_COUNT = 5; const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;
const ROAD_SEG_LEN = 40; const ROAD_VIS = 8; const PLAYER_Z = -8;
const SCROLL_SPD = 18; const PLAYER_SPD = 6; const BULLET_SPD = 40;
const ENEMY_FIRE_RATE = 2.5; const SPAWN_INT = 1.2; const PU_INT = 8; const CIV_INT = 4; const COMBO_DECAY = 3;

// Audio
let actx: AudioContext | null = null;
function ensureAudio() { if (!actx) actx = new AudioContext(); if (actx.state === 'suspended') actx.resume(); return actx; }
function tone(f: number, d: number, t: OscillatorType = 'square', v = 0.12) {
  try { const c = ensureAudio(); const o = c.createOscillator(); const g = c.createGain(); o.type = t; o.frequency.value = f; g.gain.setValueAtTime(v, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + d); } catch {}
}
function sfxShoot() { tone(880, 0.08, 'square', 0.08); }
function sfxEnemyShoot() { tone(440, 0.1, 'sawtooth', 0.06); }
function sfxHit() { tone(220, 0.15, 'sawtooth', 0.1); tone(110, 0.2, 'square', 0.08); }
function sfxExplosion() { tone(80, 0.3, 'sawtooth', 0.15); tone(60, 0.4, 'square', 0.1); }
function sfxPowerUp() { tone(660, 0.1, 'sine', 0.1); setTimeout(() => tone(880, 0.1, 'sine', 0.1), 80); setTimeout(() => tone(1100, 0.15, 'sine', 0.1), 160); }
function sfxOilDrop() { tone(200, 0.2, 'triangle', 0.08); }
function sfxCivHit() { tone(300, 0.2, 'sine', 0.1); tone(200, 0.3, 'sine', 0.08); }
function sfxShield() { tone(500, 0.15, 'sine', 0.08); }
function sfxWave() { tone(440, 0.1, 'sine', 0.08); setTimeout(() => tone(660, 0.15, 'sine', 0.1), 100); }
function sfxDeath() { tone(200, 0.2, 'sawtooth', 0.12); tone(100, 0.4, 'sawtooth', 0.1); }
function sfxBoss() { tone(150, 0.3, 'square', 0.12); tone(100, 0.5, 'sawtooth', 0.1); }
function sfxAch() { tone(880, 0.1, 'sine', 0.1); setTimeout(() => tone(1100, 0.1, 'sine', 0.1), 100); setTimeout(() => tone(1320, 0.15, 'sine', 0.12), 200); }
function sfxGO() { tone(440, 0.2, 'sine', 0.1); setTimeout(() => tone(330, 0.2, 'sine', 0.1), 200); setTimeout(() => tone(220, 0.3, 'sine', 0.1), 400); }
function sfxCombo() { tone(660, 0.08, 'sine', 0.08); }

let mosc1: OscillatorNode|null = null, mosc2: OscillatorNode|null = null, mgain: GainNode|null = null;
function startMusic() { try { const c = ensureAudio(); mgain = c.createGain(); mgain.gain.value = 0.03; mgain.connect(c.destination); mosc1 = c.createOscillator(); mosc1.type = 'sine'; mosc1.frequency.value = 55; mosc1.connect(mgain); mosc1.start(); mosc2 = c.createOscillator(); mosc2.type = 'triangle'; mosc2.frequency.value = 82.5; mosc2.connect(mgain); mosc2.start(); } catch {} }
function updateMusic(w: number) { if (mosc1) mosc1.frequency.value = 55 + (w % 8) * 5; if (mosc2) mosc2.frequency.value = 82.5 + (w % 8) * 3; }

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
  private enemies: EnemyCar[] = []; private civs: CivilianCar[] = []; private bullets: Bullet[] = [];
  private pups: PowerUpObj[] = []; private oils: OilSlick[] = []; private parts: Particle[] = [];
  private roadSegs: RoadSeg[] = []; private orbs: Mesh[] = [];
  private spawnT = 0; private puT = 0; private civT = 0; private waveT = 0; private bossOut = false;
  private envG!: Group; private roadG!: Group; private entG!: Group;
  private keys = new Set<string>(); private gpad = { axes: { x: 0, y: 0 }, trigger: false, grip: false, a: false, b: false };
  private prevGrip = false; private prevB = false;
  private panels = new Map<string, Entity>();
  private menuDoc: UIKitDocument|null = null; private hudDoc: UIKitDocument|null = null;
  private pauseDoc: UIKitDocument|null = null; private resDoc: UIKitDocument|null = null;
  private setDoc: UIKitDocument|null = null; private achDoc: UIKitDocument|null = null;
  private statDoc: UIKitDocument|null = null; private tutDoc: UIKitDocument|null = null;
  private achs: Achievement[] = []; private achPg = 0;
  private career = { gamesPlayed: 0, totalScore: 0, highScore: 0, totalKills: 0, totalDist: 0, totalPU: 0, totalOil: 0, totalBoss: 0, bestWave: 1, bestCombo: 1 };
  private sKills = 0; private sOils = 0; private sCivHits = 0; private puTypes = new Set<string>(); private oilCD = 0;

  private st(doc: UIKitDocument|null, id: string, text: string) { if (!doc) return; (doc.getElementById(id) as UIKit.Text|undefined)?.setProperties({ text }); }
  private sv(e: Entity, v: boolean) { try { const o = (e as any).object3D; if (o) { const s = v ? 3 : 0; o.scale.set(s, s, s); } } catch {} }

  init() {
    this._scene = this.world.scene;
    this.loadData(); this.initAchs(); this.buildEnv(); this.buildPlayer(); this.createRoad(); this.setupInput(); this.setupPanels(); this.showP('menu');
  }

  private loadData() { try { const s = localStorage.getItem('neon-spy-career'); if (s) this.career = JSON.parse(s); const a = localStorage.getItem('neon-spy-achs'); if (a) { (JSON.parse(a) as string[]).forEach(id => { const x = this.achs.find(v => v.id === id); if (x) x.unlocked = true; }); } const c = localStorage.getItem('neon-spy-color'); if (c) this.cIdx = parseInt(c) || 0; } catch {} }
  private saveData() { try { localStorage.setItem('neon-spy-career', JSON.stringify(this.career)); localStorage.setItem('neon-spy-achs', JSON.stringify(this.achs.filter(a => a.unlocked).map(a => a.id))); localStorage.setItem('neon-spy-color', String(this.cIdx)); } catch {} }

  private initAchs() {
    this.achs = [
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
    ];
    try { const a = localStorage.getItem('neon-spy-achs'); if (a) { (JSON.parse(a) as string[]).forEach(id => { const x = this.achs.find(v => v.id === id); if (x) x.unlocked = true; }); } } catch {}
  }

  private unlock(id: string) { const a = this.achs.find(v => v.id === id); if (a && !a.unlocked) { a.unlocked = true; sfxAch(); this.saveData(); } }

  private buildEnv() {
    const sc = SCHEMES[this.cIdx];
    this._scene.background = new Color(sc.bg);
    this._scene.fog = new FogExp2(sc.bg, 0.012);
    this.envG = new Group(); this._scene.add(this.envG);
    const gf = new Mesh(new PlaneGeometry(200, 200), new MeshBasicMaterial({ color: sc.primary, wireframe: true, transparent: true, opacity: 0.06 }));
    gf.rotation.x = -Math.PI / 2; gf.position.y = -0.01; this.envG.add(gf);
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

  private createRoad() { for (let i = 0; i < ROAD_VIS; i++) this.addRoadSeg(i * ROAD_SEG_LEN); }

  private addRoadSeg(z: number) {
    const sc = SCHEMES[this.cIdx]; const seg = new Group();
    const rd = new Mesh(new PlaneGeometry(ROAD_WIDTH, ROAD_SEG_LEN), new MeshBasicMaterial({ color: sc.primary, transparent: true, opacity: 0.04 }));
    rd.rotation.x = -Math.PI / 2; rd.position.set(0, 0.01, z); seg.add(rd);
    for (let l = 1; l < LANE_COUNT; l++) { const lx = (l - 2) * LANE_WIDTH - LANE_WIDTH / 2; for (let d = 0; d < 8; d++) { const dash = sbox(0.06, 0.02, 1.5, sc.primary, 0.2); dash.position.set(lx, 0.02, z - ROAD_SEG_LEN / 2 + d * 5 + 2.5); seg.add(dash); } }
    const eL = sbox(0.15, 0.1, ROAD_SEG_LEN, sc.accent, 0.5); eL.position.set(-ROAD_WIDTH / 2 - 0.1, 0.05, z); seg.add(eL);
    const eR = sbox(0.15, 0.1, ROAD_SEG_LEN, sc.accent, 0.5); eR.position.set(ROAD_WIDTH / 2 + 0.1, 0.05, z); seg.add(eR);
    for (let s = 0; s < 2; s++) {
      const sign = s === 0 ? -1 : 1; const lamp = new Group();
      const pole = new Mesh(new CylinderGeometry(0.05, 0.05, 4, 4), new MeshBasicMaterial({ color: sc.primary, wireframe: true, transparent: true, opacity: 0.3 }));
      pole.position.y = 2; lamp.add(pole);
      const lt = new Mesh(new SphereGeometry(0.15, 6, 6), new MeshBasicMaterial({ color: sc.accent, transparent: true, opacity: 0.5 }));
      lt.position.y = 4.1; lamp.add(lt);
      lamp.position.set(sign * (ROAD_WIDTH / 2 + 1.5), 0, z); seg.add(lamp);
    }
    this.roadG.add(seg); this.roadSegs.push({ mesh: seg, z });
  }

  private buildPlayer() {
    const sc = SCHEMES[this.cIdx]; this.pGroup = new Group();
    const body = sbox(1.2, 0.35, 2.4, sc.primary, 0.7); body.position.y = 0.35; this.pGroup.add(body);
    const can = sbox(0.8, 0.25, 1.2, sc.primary, 0.4); can.position.set(0, 0.65, -0.2); this.pGroup.add(can);
    const sp = sbox(1.4, 0.08, 0.3, sc.accent, 0.6); sp.position.set(0, 0.2, 1.2); this.pGroup.add(sp);
    const rs = sbox(1.0, 0.15, 0.15, sc.accent, 0.5); rs.position.set(0, 0.6, -1.2); this.pGroup.add(rs);
    for (const sx of [-0.4, 0.4]) { const g = sbox(0.08, 0.08, 0.5, sc.accent, 0.8); g.position.set(sx, 0.3, 1.4); this.pGroup.add(g); }
    for (const [wx, wz] of [[-0.65, 0.7], [0.65, 0.7], [-0.65, -0.7], [0.65, -0.7]]) { const w = new Mesh(new TorusGeometry(0.18, 0.06, 6, 8), new MeshBasicMaterial({ color: sc.accent, wireframe: true })); w.rotation.y = Math.PI / 2; w.position.set(wx, 0.18, wz); this.pGroup.add(w); }
    const gl = new Mesh(new SphereGeometry(0.2, 6, 6), new MeshBasicMaterial({ color: sc.accent, transparent: true, opacity: 0.4 })); gl.position.set(0, 0.3, -1.3); this.pGroup.add(gl);
    this.shieldM = new Mesh(new SphereGeometry(1.5, 12, 12), new MeshBasicMaterial({ color: sc.powerup, wireframe: true, transparent: true, opacity: 0 })); this.shieldM.position.y = 0.5; this.pGroup.add(this.shieldM);
    this.pGroup.position.set(0, 0, PLAYER_Z); this.entG.add(this.pGroup);
  }

  private mkEnemy(type: EnemyCar['type'], lane: number, z: number): EnemyCar {
    const sc = SCHEMES[this.cIdx]; const g = new Group(); let hp = 1;
    if (type === 'sedan') { const b = sbox(1.0, 0.3, 2.0, sc.enemy, 0.6); b.position.y = 0.3; g.add(b); const r = sbox(0.7, 0.2, 1.0, sc.enemy, 0.4); r.position.set(0, 0.55, 0); g.add(r); }
    else if (type === 'motorcycle') { const b = sbox(0.4, 0.3, 1.6, sc.enemy, 0.6); b.position.y = 0.3; g.add(b); const r = sbox(0.3, 0.4, 0.5, sc.enemy, 0.5); r.position.set(0, 0.6, -0.2); g.add(r); }
    else if (type === 'helicopter') { const b = sbox(0.8, 0.5, 2.0, sc.enemy, 0.6); b.position.y = 3; g.add(b); const rot = new Mesh(new CylinderGeometry(1.2, 1.2, 0.05, 3), new MeshBasicMaterial({ color: sc.enemy, wireframe: true, transparent: true, opacity: 0.4 })); rot.position.y = 3.4; g.add(rot); const t = sbox(0.2, 0.2, 1.5, sc.enemy, 0.5); t.position.set(0, 3, -1.5); g.add(t); hp = 2; }
    else { const b = sbox(1.6, 0.5, 3.2, sc.enemy, 0.7); b.position.y = 0.4; g.add(b); const tu = sbox(0.8, 0.3, 0.8, sc.enemy, 0.6); tu.position.set(0, 0.75, 0.3); g.add(tu); const ba = sbox(0.1, 0.1, 1.0, sc.enemy, 0.8); ba.position.set(0, 0.8, 1.2); g.add(ba); for (const sx of [-0.9, 0.9]) { const pl = sbox(0.1, 0.4, 2.8, sc.enemy, 0.4); pl.position.set(sx, 0.4, 0); g.add(pl); } hp = this.wave >= 10 ? 8 : 5; }
    g.position.set(laneX(lane), 0, z); this.entG.add(g);
    const spd = type === 'motorcycle' ? SCROLL_SPD * 0.7 : type === 'helicopter' ? SCROLL_SPD * 0.5 : type === 'armored' ? SCROLL_SPD * 0.3 : SCROLL_SPD * 0.6;
    return { mesh: g, x: laneX(lane), z, speed: spd, type, hp, fireTimer: rf(0.5, 2), dead: false };
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
    if (type === 'missile') { icon = new Mesh(new ConeGeometry(0.2, 0.6, 6), new MeshBasicMaterial({ color: '#ff4400', transparent: true, opacity: 0.7 })); icon.rotation.x = -Math.PI / 2; }
    else if (type === 'oilslick') { icon = new Mesh(new CylinderGeometry(0.3, 0.3, 0.1, 8), new MeshBasicMaterial({ color: '#333333', transparent: true, opacity: 0.7 })); }
    else if (type === 'shield') { icon = new Mesh(new SphereGeometry(0.25, 8, 8), new MeshBasicMaterial({ color: '#00aaff', wireframe: true, transparent: true, opacity: 0.7 })); }
    else if (type === 'speed') { icon = new Mesh(new ConeGeometry(0.15, 0.5, 4), new MeshBasicMaterial({ color: '#ffaa00', transparent: true, opacity: 0.7 })); icon.rotation.x = -Math.PI / 2; }
    else { icon = new Mesh(new BoxGeometry(0.3, 0.1, 0.4), new MeshBasicMaterial({ color: '#ff0000', transparent: true, opacity: 0.7 })); }
    icon.position.y = 1.1; g.add(icon);
    g.position.set(laneX(lane), 0, z); this.entG.add(g);
    return { mesh: g, x: laneX(lane), z, type, dead: false, rotY: 0 };
  }

  private fireBullet(x: number, z: number, fp: boolean) {
    const sc = SCHEMES[this.cIdx]; const m = sbox(0.08, 0.08, 0.4, fp ? sc.primary : sc.enemy, 0.9);
    m.position.set(x, 0.4, z); this.entG.add(m);
    this.bullets.push({ mesh: m, x, z, fromPlayer: fp, speed: fp ? BULLET_SPD : -BULLET_SPD * 0.6, dead: false });
  }

  private dropOil() {
    const m = new Mesh(new CylinderGeometry(0.8, 0.8, 0.05, 8), new MeshBasicMaterial({ color: '#333333', transparent: true, opacity: 0.5 }));
    m.position.set(this.pX, 0.03, PLAYER_Z - 2); this.entG.add(m);
    this.oils.push({ mesh: m, x: this.pX, z: PLAYER_Z - 2, timer: 8, dead: false });
    sfxOilDrop(); this.career.totalOil++;
  }

  private spawnParts(x: number, y: number, z: number, c: string, n = 12) {
    for (let i = 0; i < n; i++) { const m = new Mesh(new BoxGeometry(0.08, 0.08, 0.08), new MeshBasicMaterial({ color: c, transparent: true, opacity: 1 })); m.position.set(x, y, z); this._scene.add(m); this.parts.push({ mesh: m, vel: new Vector3(rf(-3, 3), rf(1, 5), rf(-3, 3)), life: rf(0.3, 0.8), maxLife: 0.8 }); }
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
    ];
    for (const pc of pcs) {
      const obj = new Group();
      obj.position.set(0, 2.5, -3); obj.scale.set(3, 3, 3);
      if (pc.n === 'hud') { obj.position.set(0, 3.5, -4); obj.scale.set(2.5, 2.5, 2.5); }
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
  }

  private showP(name: string) { for (const [pn, ent] of this.panels) { this.sv(ent, pn === name || (name === 'playing' && pn === 'hud')); } }

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
  }

  private startG() {
    this.gState = 'playing'; this.score = 0; this.lives = this.diff === 'normal' ? 3 : this.diff === 'hard' ? 2 : 1;
    this.wave = 1; this.dist = 0; this.combo = 1; this.comboT = 0; this.maxCombo = 1; this.gTime = 0; this.moves = 0;
    this.scrollSpd = SCROLL_SPD; this.pX = 0; this.pShield = false; this.shieldT = 0; this.rapidF = false; this.rapidT = 0;
    this.spdBoost = false; this.spdT = 0; this.fireT = 0; this.fireCD = 0.18; this.invT = 1; this.bossOut = false;
    this.spawnT = 1; this.puT = PU_INT / 2; this.civT = CIV_INT / 2; this.waveT = 0;
    this.sKills = 0; this.sOils = 0; this.sCivHits = 0; this.puTypes.clear();
    this.clearEnts(); this.pGroup.position.set(0, 0, PLAYER_Z); this.pGroup.visible = true;
    (this.shieldM.material as MeshBasicMaterial).opacity = 0;
    this.career.gamesPlayed++; if (this.career.gamesPlayed >= 10) this.unlock('games-10'); if (this.career.gamesPlayed >= 50) this.unlock('games-50');
    startMusic(); this.showP('playing');
  }

  private clearEnts() {
    for (const e of this.enemies) this.entG.remove(e.mesh); for (const c of this.civs) this.entG.remove(c.mesh);
    for (const b of this.bullets) this.entG.remove(b.mesh); for (const p of this.pups) this.entG.remove(p.mesh);
    for (const o of this.oils) this.entG.remove(o.mesh); for (const p of this.parts) this._scene.remove(p.mesh);
    this.enemies = []; this.civs = []; this.bullets = []; this.pups = []; this.oils = []; this.parts = [];
  }

  private pauseG() { this.gState = 'paused'; this.showP('pause'); }
  private resumeG() { this.gState = 'playing'; this.showP('playing'); }
  private quitMenu() { this.gState = 'menu'; this.clearEnts(); this.pGroup.visible = false; this.showP('menu'); this.st(this.menuDoc, 'high-score', `Best: ${this.career.highScore}`); }

  private gameOver() {
    this.gState = 'gameover'; sfxGO();
    this.career.totalScore += this.score; if (this.score > this.career.highScore) this.career.highScore = this.score;
    if (this.wave > this.career.bestWave) this.career.bestWave = this.wave; if (this.maxCombo > this.career.bestCombo) this.career.bestCombo = this.maxCombo;
    this.career.totalDist += this.dist; this.saveData();
    if (this.score >= 5000) this.unlock('score-5k'); if (this.score >= 10000) this.unlock('score-10k'); if (this.score >= 25000) this.unlock('score-25k');
    if (this.score >= 50000) this.unlock('score-50k'); if (this.score >= 100000) this.unlock('score-100k');
    if (this.wave >= 5) this.unlock('wave-5'); if (this.wave >= 10) this.unlock('wave-10'); if (this.wave >= 15) this.unlock('wave-15'); if (this.wave >= 20) this.unlock('wave-20');
    if (this.dist >= 1000) this.unlock('dist-1k'); if (this.dist >= 5000) this.unlock('dist-5k');
    if (this.wave >= 5 && this.sCivHits === 0) this.unlock('clean-op');
    this.st(this.resDoc, 'result-score', `Score: ${this.score}`); this.st(this.resDoc, 'result-wave', `Wave: ${this.wave}`);
    this.st(this.resDoc, 'result-distance', `Distance: ${Math.floor(this.dist)}m`); this.st(this.resDoc, 'result-combo', `Max Combo: ${this.maxCombo}x`);
    this.st(this.resDoc, 'result-kills', `Kills: ${this.sKills}`);
    this.st(this.resDoc, 'result-best', this.score >= this.career.highScore ? 'NEW HIGH SCORE!' : `Best: ${this.career.highScore}`);
    this.showP('results');
  }

  update(delta: number, time: number) {
    for (let i = 0; i < this.orbs.length; i++) { const o = this.orbs[i]; o.position.y += Math.sin(time * 0.5 + i) * 0.002; (o.material as MeshBasicMaterial).opacity = 0.2 + Math.sin(time + i * 0.7) * 0.1; }
    this.pollGP();
    if (this.gState !== 'playing') return;
    const dt = Math.min(delta, 0.05); this.gTime += dt;
    if (this.mode === 'speed' && this.gTime >= 120) { this.gameOver(); return; }
    this.handleInput(dt);
    const spd = this.spdBoost ? this.scrollSpd * 1.5 : this.scrollSpd; this.dist += spd * dt;
    for (const s of this.roadSegs) { s.z -= spd * dt; s.mesh.position.z = s.z; }
    while (this.roadSegs.length > 0 && this.roadSegs[0].z < PLAYER_Z - ROAD_SEG_LEN * 2) { const old = this.roadSegs.shift()!; this.roadG.remove(old.mesh); this.addRoadSeg(this.roadSegs[this.roadSegs.length - 1].z + ROAD_SEG_LEN); }
    this.spawnT -= dt; if (this.spawnT <= 0) { this.spawnE(); this.spawnT = Math.max(0.3, SPAWN_INT - this.wave * 0.04) * (this.diff === 'insane' ? 0.6 : this.diff === 'hard' ? 0.8 : 1); }
    this.civT -= dt; if (this.civT <= 0) { this.civs.push(this.mkCiv(ri(0, LANE_COUNT - 1), PLAYER_Z + 80)); this.civT = CIV_INT * (this.diff === 'insane' ? 0.7 : 1); }
    this.puT -= dt; if (this.puT <= 0) { const ts: PowerUpObj['type'][] = ['missile', 'oilslick', 'shield', 'speed', 'rapid']; this.pups.push(this.mkPU(ts[ri(0, ts.length - 1)], ri(0, LANE_COUNT - 1), PLAYER_Z + 70)); this.puT = PU_INT; }
    this.waveT += dt; if (this.waveT >= 20) { this.waveT = 0; this.wave++; this.scrollSpd = SCROLL_SPD + this.wave * 0.8; sfxWave(); updateMusic(this.wave); if (this.wave % 5 === 0 && !this.bossOut) { this.bossOut = true; this.enemies.push(this.mkEnemy('armored', ri(1, 3), PLAYER_Z + 80)); sfxBoss(); } else { this.bossOut = false; } }
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 1; }
    if (this.pShield) { this.shieldT -= dt; if (this.shieldT <= 0) { this.pShield = false; (this.shieldM.material as MeshBasicMaterial).opacity = 0; } else { (this.shieldM.material as MeshBasicMaterial).opacity = 0.2 + Math.sin(time * 8) * 0.1; } }
    if (this.rapidF) { this.rapidT -= dt; if (this.rapidT <= 0) { this.rapidF = false; this.fireCD = 0.18; } }
    if (this.spdBoost) { this.spdT -= dt; if (this.spdT <= 0) this.spdBoost = false; }
    if (this.invT > 0) this.invT -= dt;
    this.fireT -= dt; const wantShoot = this.keys.has('f') || this.keys.has(' ') || this.keys.has('j') || this.keys.has('k') || this.gpad.trigger;
    if (this.fireT <= 0 && wantShoot) { this.fireBullet(this.pX - 0.4, PLAYER_Z + 1.5, true); this.fireBullet(this.pX + 0.4, PLAYER_Z + 1.5, true); sfxShoot(); this.fireT = this.fireCD; }
    if ((this.keys.has('e') || this.keys.has('q')) && this.oilCD <= 0) { this.dropOil(); this.oilCD = 1; this.sOils++; if (this.sOils >= 5) this.unlock('oil-5'); if (this.sOils >= 15) this.unlock('oil-15'); }
    if (this.oilCD > 0) this.oilCD -= dt;
    if (this.gpad.grip && !this.prevGrip && this.oilCD <= 0) { this.dropOil(); this.oilCD = 1; this.sOils++; }
    this.prevGrip = this.gpad.grip;
    if (this.gpad.b && !this.prevB) { if (this.gState === 'playing') this.pauseG(); else if (this.gState === 'paused') this.resumeG(); }
    this.prevB = this.gpad.b;
    this.updEnemies(dt, spd); this.updCivs(dt, spd); this.updBullets(dt); this.updPUs(dt, spd); this.updOils(dt, spd); this.updParts(dt); this.checkColl();
    this.updHUD();
    this.pGroup.position.x = this.pX;
    if (this.invT > 0) this.pGroup.visible = Math.floor(time * 10) % 2 === 0; else this.pGroup.visible = true;
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

  private updEnemies(dt: number, ss: number) {
    for (const e of this.enemies) { if (e.dead) continue; e.z -= (ss - e.speed) * dt; e.mesh.position.z = e.z; if (e.type === 'helicopter' && e.mesh.children[1]) e.mesh.children[1].rotation.y += dt * 10; if (e.type !== 'motorcycle') { e.fireTimer -= dt; if (e.fireTimer <= 0 && e.z > PLAYER_Z && e.z < PLAYER_Z + 50) { this.fireBullet(e.x, e.z - 1.5, false); sfxEnemyShoot(); e.fireTimer = ENEMY_FIRE_RATE / (1 + this.wave * 0.1); } } if (e.z < PLAYER_Z - 20) e.dead = true; }
    this.enemies = this.enemies.filter(e => { if (e.dead) { this.entG.remove(e.mesh); return false; } return true; });
  }
  private updCivs(dt: number, ss: number) { for (const c of this.civs) { if (c.dead) continue; c.z -= (ss - c.speed) * dt; c.mesh.position.z = c.z; if (c.z < PLAYER_Z - 20) c.dead = true; } this.civs = this.civs.filter(c => { if (c.dead) { this.entG.remove(c.mesh); return false; } return true; }); }
  private updBullets(dt: number) { for (const b of this.bullets) { if (b.dead) continue; b.z += b.speed * dt; b.mesh.position.z = b.z; if (b.z > PLAYER_Z + 100 || b.z < PLAYER_Z - 30) b.dead = true; } this.bullets = this.bullets.filter(b => { if (b.dead) { this.entG.remove(b.mesh); return false; } return true; }); }
  private updPUs(dt: number, ss: number) { for (const p of this.pups) { if (p.dead) continue; p.z -= ss * 0.3 * dt; p.rotY += dt * 2; p.mesh.position.z = p.z; p.mesh.rotation.y = p.rotY; if (p.z < PLAYER_Z - 20) p.dead = true; } this.pups = this.pups.filter(p => { if (p.dead) { this.entG.remove(p.mesh); return false; } return true; }); }
  private updOils(dt: number, ss: number) { for (const o of this.oils) { if (o.dead) continue; o.z -= ss * dt; o.mesh.position.z = o.z; o.timer -= dt; if (o.timer <= 0 || o.z < PLAYER_Z - 30) o.dead = true; } this.oils = this.oils.filter(o => { if (o.dead) { this.entG.remove(o.mesh); return false; } return true; }); }
  private updParts(dt: number) { for (const p of this.parts) { p.vel.y -= 9.8 * dt; p.mesh.position.add(p.vel.clone().multiplyScalar(dt)); p.life -= dt; (p.mesh.material as MeshBasicMaterial).opacity = Math.max(0, p.life / p.maxLife); } this.parts = this.parts.filter(p => { if (p.life <= 0) { this._scene.remove(p.mesh); return false; } return true; }); }

  private checkColl() {
    const px = this.pX, pz = PLAYER_Z;
    for (const b of this.bullets) { if (b.dead || !b.fromPlayer) continue; for (const e of this.enemies) { if (e.dead) continue; const hw = e.type === 'armored' ? 1.8 : e.type === 'helicopter' ? 1.0 : 0.7; const hd = e.type === 'armored' ? 3.5 : 2.2; if (Math.abs(b.x - e.x) < hw && Math.abs(b.z - e.z) < hd) { b.dead = true; e.hp--; sfxHit(); if (e.hp <= 0) { e.dead = true; const pts = e.type === 'armored' ? 1000 : e.type === 'helicopter' ? 300 : e.type === 'motorcycle' ? 150 : 100; this.score += pts * this.combo; this.spawnParts(e.x, 0.5, e.z, SCHEMES[this.cIdx].enemy, e.type === 'armored' ? 25 : 15); sfxExplosion(); this.sKills++; this.career.totalKills++; this.combo = Math.min(8, this.combo + 1); this.comboT = COMBO_DECAY; if (this.combo > this.maxCombo) this.maxCombo = this.combo; if (this.combo >= 3) { this.unlock('combo-3'); sfxCombo(); } if (this.combo >= 5) this.unlock('combo-5'); if (this.combo >= 8) this.unlock('combo-8'); this.unlock('first-kill'); if (this.sKills >= 10) this.unlock('kills-10'); if (this.sKills >= 25) this.unlock('kills-25'); if (this.sKills >= 50) this.unlock('kills-50'); if (this.sKills >= 100) this.unlock('kills-100'); if (e.type === 'armored') { this.career.totalBoss++; this.unlock('boss-kill'); if (this.career.totalBoss >= 5) this.unlock('boss-5'); } } else { this.spawnParts(b.x, 0.5, b.z, '#ffffff', 4); } break; } } }
    if (this.invT <= 0) { for (const b of this.bullets) { if (b.dead || b.fromPlayer) continue; if (Math.abs(b.x - px) < 0.8 && Math.abs(b.z - pz) < 1.5) { b.dead = true; if (this.pShield) { this.pShield = false; (this.shieldM.material as MeshBasicMaterial).opacity = 0; sfxShield(); this.spawnParts(px, 0.5, pz, SCHEMES[this.cIdx].powerup, 10); } else { this.pHit(); } } } }
    if (this.invT <= 0) { for (const e of this.enemies) { if (e.dead) continue; const hw = e.type === 'armored' ? 1.6 : 0.9; if (Math.abs(px - e.x) < hw && Math.abs(pz - e.z) < 2.0) { if (this.pShield) { e.dead = true; this.pShield = false; (this.shieldM.material as MeshBasicMaterial).opacity = 0; this.spawnParts(e.x, 0.5, e.z, SCHEMES[this.cIdx].enemy, 15); sfxExplosion(); } else { this.pHit(); } } } }
    if (this.invT <= 0) { for (const c of this.civs) { if (c.dead) continue; if (Math.abs(px - c.x) < 0.9 && Math.abs(pz - c.z) < 2.0) { c.dead = true; this.sCivHits++; sfxCivHit(); this.spawnParts(c.x, 0.5, c.z, SCHEMES[this.cIdx].civilian, 8); this.score = Math.max(0, this.score - 200); this.combo = 1; } } }
    for (const pu of this.pups) { if (pu.dead) continue; if (Math.abs(px - pu.x) < 1.2 && Math.abs(pz - pu.z) < 2.2) { pu.dead = true; sfxPowerUp(); this.career.totalPU++; this.puTypes.add(pu.type); switch (pu.type) { case 'missile': for (let i = -1; i <= 1; i++) this.fireBullet(px + i * 0.8, pz + 2, true); break; case 'oilslick': this.dropOil(); this.dropOil(); break; case 'shield': this.pShield = true; this.shieldT = 10; this.unlock('shield-use'); break; case 'speed': this.spdBoost = true; this.spdT = 8; this.unlock('speed-use'); break; case 'rapid': this.rapidF = true; this.rapidT = 8; this.fireCD = 0.06; this.unlock('rapid-use'); break; } if (this.puTypes.size >= 5) this.unlock('all-pu'); this.spawnParts(pu.x, 0.5, pu.z, SCHEMES[this.cIdx].powerup, 10); } }
    for (const o of this.oils) { if (o.dead) continue; for (const e of this.enemies) { if (e.dead) continue; if (Math.abs(o.x - e.x) < 1.0 && Math.abs(o.z - e.z) < 1.5) { e.dead = true; o.dead = true; this.score += 200 * this.combo; this.spawnParts(e.x, 0.5, e.z, '#333333', 12); sfxHit(); this.sKills++; this.career.totalKills++; } } }
  }

  private pHit() { if (this.mode === 'zen') return; this.lives--; sfxDeath(); this.spawnParts(this.pX, 0.5, PLAYER_Z, SCHEMES[this.cIdx].primary, 20); this.invT = 2; this.combo = 1; if (this.lives <= 0) this.gameOver(); }

  private spawnE() { const l = ri(0, LANE_COUNT - 1); const z = PLAYER_Z + 70 + rf(0, 20); let t: EnemyCar['type'] = 'sedan'; const r = Math.random(); if (this.wave >= 3 && r < 0.2) t = 'motorcycle'; if (this.wave >= 5 && r < 0.15) t = 'helicopter'; this.enemies.push(this.mkEnemy(t, l, z)); }

  private updHUD() {
    if (!this.hudDoc) return;
    this.st(this.hudDoc, 'score', `Score: ${this.score}`); this.st(this.hudDoc, 'lives', `Lives: ${'o'.repeat(Math.max(0, this.lives))}`);
    this.st(this.hudDoc, 'wave', `Wave ${this.wave}`); this.st(this.hudDoc, 'combo', this.combo > 1 ? `${this.combo}x Combo` : '');
    this.st(this.hudDoc, 'distance', `${Math.floor(this.dist)}m`);
    const st = this.pShield ? `Shield: ${Math.ceil(this.shieldT)}s` : ''; const rt = this.rapidF ? `Rapid: ${Math.ceil(this.rapidT)}s` : ''; const spt = this.spdBoost ? `Speed: ${Math.ceil(this.spdT)}s` : '';
    this.st(this.hudDoc, 'powerup-status', [st, rt, spt].filter(Boolean).join(' | '));
    if (this.mode === 'speed') this.st(this.hudDoc, 'mode-info', `Time: ${Math.ceil(120 - this.gTime)}s`);
    else if (this.mode === 'challenge') this.st(this.hudDoc, 'mode-info', `Moves: ${500 - this.moves}`);
    else this.st(this.hudDoc, 'mode-info', '');
  }
}
