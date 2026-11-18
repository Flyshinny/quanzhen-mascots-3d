// 吉祥物動作庫：靜態姿勢（POSES）與循環動畫（ACTIONS），五位角色共用
// 用法：
//   import { buildMascot3D } from './mascots3d.js';
//   import { setPose, playAction, setExpression } from './poses.js';
//   const m = buildMascot3D('ruirui'); const rig = m.userData.rig;
//   setPose(rig, 'cheer'); setExpression(rig, 'laugh');
//   每一格：playAction(rig, 'wave', t)   // t＝秒數，動作會自動循環
// 角度單位：弧度。手臂 [a, f]：a＝往外張（0 垂下、1.57 水平、3.14 朝天，負值往內），f＝往前抬
// 腿 [out, fwd]：out＝往外張、fwd＝往前踢（負值往後）
// upper / head [x, y, z]：x＝往前彎／點頭、y＝轉向（正值轉向角色左手邊）、z＝側彎（正值往角色右手邊倒）
import { poseArm, poseLeg, resetPose, EXPRESSIONS } from './mascots3d.js';

export { EXPRESSIONS };

const D = { armL: [0.22, 0.05], armR: [0.22, 0.05], legL: [0.02, 0], legR: [0.02, 0], upper: [0, 0, 0], head: [0, 0, 0], lift: 0, spin: 0 };

// ---------- 靜態姿勢 ----------
export const POSES = {
  signature: { label: '招牌姿勢' },
  stand:   { label: '站好',     expr: 'smile' },
  wave:    { label: '揮手',     armR: [2.15, 0.45], head: [0, 0, -0.08], expr: 'happy' },
  cheer:   { label: '歡呼',     armL: [2.2, 0.35], armR: [2.2, 0.35], head: [-0.08, 0, 0], expr: 'laugh' },
  welcome: { label: '歡迎',     armL: [1.15, 0.45], armR: [1.15, 0.45], head: [-0.05, 0, 0.06], expr: 'happy' },
  pray:    { label: '合十',     armL: [-0.58, 1.5], armR: [-0.58, 1.5], head: [0.08, 0, 0], expr: 'calm' },
  bow:     { label: '鞠躬',     armL: [-0.58, 1.5], armR: [-0.58, 1.5], upper: [0.38, 0, 0], head: [0.15, 0, 0], expr: 'calm' },
  point:   { label: '指向前方', armR: [0.95, 1.2], armL: [0.15, 0.1], upper: [0, 0.18, 0], head: [0, 0.22, 0.05], expr: 'smile' },
  think:   { label: '思考',     armR: [-0.7, 1.75], armL: [-0.45, 0.9], head: [0.05, 0.1, 0.18], expr: 'think' },
  shy:     { label: '害羞',     armL: [-0.55, 0.75], armR: [-0.55, 0.75], legL: [0, 0.12], legR: [-0.06, 0.04], head: [0.16, 0, -0.18], expr: 'shy' },
  surprised: { label: '嚇一跳', armL: [2.0, 0.9], armR: [2.0, 0.9], upper: [-0.1, 0, 0], head: [-0.1, 0, 0], lift: 0.08, expr: 'surprised' },
  sad:     { label: '失落',     armL: [0.08, 0.15], armR: [0.08, 0.15], upper: [0.14, 0, 0], head: [0.25, 0, 0.06], expr: 'sad' },
  angry:   { label: '生氣跺腳', armL: [0.55, -0.35], armR: [0.55, -0.35], head: [0.06, 0, 0], legR: [0.02, 0.25], expr: 'angry' },
  sleepy:  { label: '想睡覺',   armL: [0.1, 0.2], armR: [0.1, 0.2], head: [0.12, 0, 0.28], upper: [0.05, 0, 0.06], expr: 'sleepy' },
  love:    { label: '比愛心',   armL: [-0.42, 1.35], armR: [-0.42, 1.35], head: [-0.05, 0, 0.12], lift: 0.04, expr: 'love' },
  run:     { label: '奔跑',     armL: [0.35, 1.0], armR: [0.35, -0.7], legL: [0.02, 0.75], legR: [0.02, -0.7], upper: [0.15, 0, 0], lift: 0.12, expr: 'laugh' },
  jump:    { label: '跳起來',   armL: [2.2, 0.4], armR: [2.2, 0.4], legL: [0.25, 0.3], legR: [0.25, 0.3], lift: 0.55, expr: 'laugh' },
};

// 個別角色的微調（手臂長度、頭的大小不同）
const TWEAK = {
  ruirui: {
    wave: { armR: [1.89, 0.75] }, cheer: { armL: [1.85, 0.7], armR: [1.85, 0.7] }, jump: { armL: [1.85, 0.6], armR: [1.85, 0.6] },
    surprised: { armL: [1.8, 0.95], armR: [1.8, 0.95] }, think: { armR: [-0.35, 2.1] },
  },
  shushu: {
    think: { armR: [-0.75, 2.2] }, pray: { armL: [-0.6, 1.63], armR: [-0.6, 1.63] }, bow: { armL: [-0.6, 1.63], armR: [-0.6, 1.63] },
    love: { armL: [-0.5, 1.5], armR: [-0.5, 1.5] },
  },
  zhenzhen: { think: { armR: [-0.6, 1.95] } },
  zhongzhong: { think: { armR: [-0.65, 2.05] }, wave: { armR: [1.95, 0.5] }, cheer: { armL: [1.95, 0.45], armR: [1.95, 0.45] }, jump: { armL: [1.95, 0.45], armR: [1.95, 0.45] } },
  quanquan: { cheer: { armL: [2.45, 0.25], armR: [2.45, 0.25] }, wave: { armR: [2.4, 0.2] } },
};

function resolve(rig, name) {
  const p = POSES[name];
  if (!p) throw new Error(`沒有這個姿勢：${name}`);
  if (name === 'signature') {
    const r = rig.rest;
    return { ...D, armL: r.armL, armR: r.armR, legL: r.legL, legR: r.legR, expr: r.expr };
  }
  return { ...D, ...p, ...(TWEAK[rig.id]?.[name] || {}) };
}

// 把姿勢參數套到關節上
export function applyParams(rig, p) {
  poseArm(rig.armL, -1, ...p.armL);
  poseArm(rig.armR, 1, ...p.armR);
  poseLeg(rig.legL, -1, ...p.legL);
  poseLeg(rig.legR, 1, ...p.legR);
  rig.upper.rotation.set(...p.upper);
  rig.head.rotation.set(...p.head);
  rig.body.position.y = p.lift || 0;
  rig.body.rotation.y = p.spin || 0;
  const sq = p.squash || 1;
  rig.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
}

export function poseParams(rig, name) { return resolve(rig, name); }

export function setPose(rig, name, { expr = true } = {}) {
  const p = resolve(rig, name);
  applyParams(rig, p);
  if (expr && p.expr) rig.face.set(p.expr);
  return p;
}

export function setExpression(rig, name) { rig.face.set(name); }
export { resetPose };

// 兩個姿勢之間平滑過渡（k：0～1）
const lerp = (a, b, k) => a + (b - a) * k;
const lerpArr = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
export function blendParams(a, b, k) {
  const o = {};
  for (const key of Object.keys(D)) o[key] = Array.isArray(a[key]) ? lerpArr(a[key], b[key], k) : lerp(a[key] || 0, b[key] || 0, k);
  o.squash = lerp(a.squash || 1, b.squash || 1, k);
  return o;
}
export const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// ---------- 循環動畫 ----------
// 每個動作：dur＝一輪秒數；f(rig, u, t)＝回傳姿勢參數（u＝0～1 的循環進度，t＝總秒數）
const sin = Math.sin, PI = Math.PI, TAU = PI * 2;
const base = (rig, name) => resolve(rig, name);
const blinkAt = (t) => { const c = t % 3.4; return c < 0.08 ? c / 0.08 : c < 0.16 ? 1 - (c - 0.08) / 0.08 : 0; };

export const ACTIONS = {
  idle: { label: '待機呼吸', dur: 3.4, expr: null, f: (rig, u, t) => {
    const p = base(rig, 'signature');
    p.upper = [0, sin(t * 0.9) * 0.05, sin(t * 1.4) * 0.03];
    p.head = [sin(t * 1.4 + 1) * 0.03, sin(t * 0.7) * 0.06, sin(t * 1.1) * 0.04];
    p.squash = 1 + sin(u * TAU) * 0.015;
    return p;
  } },
  wave: { label: '揮手', dur: 1.2, expr: 'happy', f: (rig, u) => {
    const p = base(rig, 'wave');
    const s = sin(u * TAU * 2);
    p.armR = [p.armR[0] + s * 0.32, p.armR[1]];
    p.head = [0, 0, -0.08 - s * 0.05];
    p.upper = [0, 0, -s * 0.03];
    return p;
  } },
  cheer: { label: '歡呼跳躍', dur: 0.8, expr: 'laugh', f: (rig, u) => {
    const p = base(rig, 'cheer');
    const hop = Math.max(0, sin(u * TAU));
    p.lift = hop * 0.3;
    p.squash = 1 - Math.max(0, -sin(u * TAU)) * 0.08;
    const pump = sin(u * TAU) * 0.22;
    p.armL = [p.armL[0] + pump, p.armL[1]];
    p.armR = [p.armR[0] + pump, p.armR[1]];
    return p;
  } },
  clap: { label: '拍手', dur: 0.5, expr: 'happy', f: (rig, u) => {
    const p = base(rig, 'stand');
    const k = (1 - Math.cos(u * TAU)) / 2; // 0＝合起、1＝打開
    const a = lerp(-0.62, 0.15, k);
    const fwd = rig.id === 'shushu' ? 1.63 : 1.45;
    p.armL = [a, fwd]; p.armR = [a, fwd];
    p.head = [-0.05 + k * 0.05, 0, 0];
    p.squash = 1 + (1 - k) * 0.02;
    return p;
  } },
  walk: { label: '走路', dur: 1.0, expr: 'smile', f: (rig, u) => {
    const p = base(rig, 'stand');
    const s = sin(u * TAU);
    p.legL = [0.02, s * 0.45]; p.legR = [0.02, -s * 0.45];
    p.armL = [0.25, -s * 0.5]; p.armR = [0.25, s * 0.5];
    p.lift = Math.abs(Math.cos(u * TAU)) * 0.06;
    p.upper = [0.04, s * 0.08, 0];
    p.head = [0, -s * 0.04, s * 0.04];
    return p;
  } },
  run: { label: '奔跑', dur: 0.5, expr: 'laugh', f: (rig, u) => {
    const p = base(rig, 'run');
    const s = sin(u * TAU);
    p.legL = [0.02, s * 0.8]; p.legR = [0.02, -s * 0.8];
    p.armL = [0.35, -s * 1.0]; p.armR = [0.35, s * 1.0];
    p.lift = 0.05 + Math.abs(Math.cos(u * TAU)) * 0.14;
    return p;
  } },
  jump: { label: '原地跳', dur: 1.0, expr: 'laugh', f: (rig, u) => {
    // 0～0.25 蹲、0.25～0.75 空中、0.75～1 落地
    const st = base(rig, 'stand'), up = base(rig, 'jump');
    let p;
    if (u < 0.25) { p = blendParams(st, st, 0); p.squash = 1 - sin(u / 0.25 * PI) * 0.12; p.armL = [0.5, -0.4]; p.armR = [0.5, -0.4]; }
    else if (u < 0.75) { const k = (u - 0.25) / 0.5; p = blendParams(st, up, sin(k * PI) > 0.2 ? 1 : sin(k * PI) / 0.2); p.lift = sin(k * PI) * 0.8; }
    else { p = blendParams(st, st, 0); p.squash = 1 - sin((u - 0.75) / 0.25 * PI) * 0.1; }
    return p;
  } },
  nod: { label: '點頭', dur: 0.8, expr: 'smile', f: (rig, u) => {
    const p = base(rig, 'stand');
    p.head = [Math.max(0, sin(u * TAU)) * 0.28, 0, 0];
    p.upper = [Math.max(0, sin(u * TAU)) * 0.05, 0, 0];
    return p;
  } },
  shake: { label: '搖頭', dur: 0.8, expr: 'think', f: (rig, u) => {
    const p = base(rig, 'stand');
    p.head = [0, sin(u * TAU) * 0.4, 0];
    p.armL = [0.6, 0.2]; p.armR = [0.6, 0.2];
    return p;
  } },
  bow: { label: '鞠躬', dur: 2.4, expr: 'calm', f: (rig, u) => {
    const p = base(rig, 'pray');
    const k = u < 0.3 ? ease(u / 0.3) : u < 0.6 ? 1 : 1 - ease((u - 0.6) / 0.3);
    p.upper = [k * 0.42, 0, 0];
    p.head = [0.08 + k * 0.15, 0, 0];
    return p;
  } },
  dance: { label: '跳舞', dur: 1.0, expr: 'laugh', f: (rig, u) => {
    const p = base(rig, 'stand');
    const s = sin(u * TAU);
    p.upper = [0, 0, s * 0.16];
    p.head = [0, 0, -s * 0.12];
    p.armL = [1.6 + s * 0.9, 0.3]; p.armR = [1.6 - s * 0.9, 0.3];
    p.legL = [0.08 + Math.max(0, s) * 0.25, 0]; p.legR = [0.08 + Math.max(0, -s) * 0.25, 0];
    p.lift = Math.abs(sin(u * TAU)) * 0.08;
    return p;
  } },
  spin: { label: '轉圈', dur: 1.2, expr: 'laugh', f: (rig, u) => {
    const p = base(rig, 'welcome');
    p.spin = ease(u) * TAU;
    p.lift = sin(u * PI) * 0.35;
    return p;
  } },
  pray: { label: '合十祈福', dur: 3.0, expr: 'calm', f: (rig, u, t) => {
    const p = base(rig, 'pray');
    p.head = [0.08 + sin(u * TAU) * 0.04, 0, sin(t * 0.8) * 0.03];
    p.squash = 1 + sin(u * TAU) * 0.012;
    return p;
  } },
  think: { label: '思考', dur: 2.0, expr: 'think', f: (rig, u) => {
    const p = base(rig, 'think');
    p.head = [p.head[0], p.head[1] + sin(u * TAU) * 0.08, p.head[2] + sin(u * TAU) * 0.05];
    return p;
  } },
  talk: { label: '說話', dur: 2.0, expr: 'smile', talk: true, f: (rig, u, t) => {
    const p = base(rig, 'stand');
    p.armR = [0.55 + sin(t * 2.3) * 0.15, 0.7 + sin(t * 1.7) * 0.2];
    p.head = [sin(t * 3.1) * 0.04, sin(t * 1.3) * 0.08, sin(t * 2.1) * 0.05];
    p.upper = [0, sin(t * 0.9) * 0.05, 0];
    return p;
  } },
  sleepy: { label: '打瞌睡', dur: 3.0, expr: 'sleepy', f: (rig, u) => {
    const p = base(rig, 'sleepy');
    const k = u < 0.7 ? ease(u / 0.7) : 1 - ease((u - 0.7) / 0.3) ;
    p.head = [0.1 + k * 0.25, 0, 0.2 + k * 0.12];
    p.upper = [0.04 + k * 0.06, 0, 0.05];
    return p;
  } },
};

// 播放動作：t 為秒數（會自動循環）。opts.blink＝自動眨眼（預設開）
export function playAction(rig, name, t, { blink = true, expr = true } = {}) {
  const a = ACTIONS[name];
  if (!a) throw new Error(`沒有這個動作：${name}`);
  const u = (t % a.dur) / a.dur;
  const p = a.f(rig, u, t);
  applyParams(rig, p);
  if (expr && a.expr && rig.face.name !== a.expr) rig.face.set(a.expr);
  if (a.talk) rig.face.talk(0.5 + 0.5 * Math.abs(sin(t * 11)) * Math.abs(sin(t * 4.3)));
  else rig.face.talk(0);
  const canBlink = ['open', 'big'].includes((EXPRESSIONS[rig.face.name]?.eyes || [])[0]);
  rig.face.blink(blink && canBlink ? blinkAt(t + rig.id.length * 0.37) : 0);
  // 忠忠的火焰輕輕搖曳
  if (rig.flame) { rig.flame.rotation.z = sin(t * 5.3) * 0.05; rig.flame.scale.set(1, 1 + sin(t * 7.1) * 0.04, 1); }
  return p;
}
