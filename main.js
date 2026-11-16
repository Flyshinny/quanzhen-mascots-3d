import * as THREE from 'three';

import { MASCOTS } from './data.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 基本場景 ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const BG = new THREE.Color('#fdf3e7');
scene.background = BG;
scene.fog = new THREE.Fog(BG, 15, 28);

const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
const CAM_BASE = new THREE.Vector3(0, 3.4, 14);
camera.position.copy(CAM_BASE);
const LOOK = new THREE.Vector3(0, 1.3, 0);

scene.add(new THREE.HemisphereLight('#fff6e8', '#e8c7a8', 1.6));
const sun = new THREE.DirectionalLight('#fff1dc', 2.2);
sun.position.set(4, 9, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
sun.shadow.bias = -0.0005;
sun.shadow.radius = 6;
scene.add(sun);

// ---------- 舞台：紅磚圓台＋綠欄杆＋琉璃瓦邊 ----------
const stage = new THREE.Group();
scene.add(stage);

function brickTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#d9c3a8'; g.fillRect(0, 0, 512, 512);
  const bw = 64, bh = 32;
  for (let y = 0; y < 512 / bh; y++) {
    for (let x = -1; x < 512 / bw + 1; x++) {
      const ox = (y % 2) * bw / 2;
      const l = 40 + Math.random() * 8;
      g.fillStyle = `hsl(${12 + Math.random() * 6}, ${52 + Math.random() * 10}%, ${l}%)`;
      g.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.anisotropy = 8;
  return t;
}

const floor = new THREE.Mesh(
  new THREE.CylinderGeometry(5.6, 5.8, 0.5, 96),
  [
    new THREE.MeshStandardMaterial({ color: '#a8432c', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: '#8f3a26' }),
  ],
);
floor.position.y = -0.25;
floor.receiveShadow = true;
stage.add(floor);

const tileRing = new THREE.Mesh(
  new THREE.TorusGeometry(5.7, 0.12, 12, 128),
  new THREE.MeshStandardMaterial({ color: '#e07a3c', roughness: 0.4, metalness: 0.1 }),
);
tileRing.rotation.x = Math.PI / 2;
tileRing.position.y = 0.02;
stage.add(tileRing);

// 綠欄杆（只放後半圈，避免擋住前面的角色）
const railMat = new THREE.MeshStandardMaterial({ color: '#2f7a5a', roughness: 0.6 });
const postGeo = new THREE.BoxGeometry(0.12, 0.7, 0.12);
for (let i = 0; i <= 28; i++) {
  const a = Math.PI * 0.62 + (i / 28) * Math.PI * 0.76;
  const p = new THREE.Mesh(postGeo, railMat);
  p.position.set(Math.sin(a) * 5.35, 0.35, Math.cos(a) * 5.35);
  p.castShadow = true;
  stage.add(p);
}
const railPts = [];
for (let i = 0; i <= 40; i++) {
  const a = Math.PI * 0.62 + (i / 40) * Math.PI * 0.76;
  railPts.push(new THREE.Vector3(Math.sin(a) * 5.35, 0.72, Math.cos(a) * 5.35));
}
const railTop = new THREE.Mesh(
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 80, 0.06, 8),
  railMat,
);
railTop.castShadow = true;
stage.add(railTop);

// ---------- 漂浮光點 ----------
function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,230,170,.9)');
  grd.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const N = 160;
const pPos = new Float32Array(N * 3);
const pSeed = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const r = 2 + Math.random() * 7, a = Math.random() * Math.PI * 2;
  pPos.set([Math.sin(a) * r, Math.random() * 6, Math.cos(a) * r - 2], i * 3);
  pSeed[i] = Math.random() * 10;
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
  size: 0.16, map: dotTexture(), transparent: true, depthWrite: false,
  color: '#ffd38a', blending: THREE.AdditiveBlending,
}));
scene.add(particles);

// ---------- 角色：立牌式 3D 厚度 ----------
const carousel = new THREE.Group();
scene.add(carousel);
const RADIUS = 3.7;
const STEP = (Math.PI * 2) / MASCOTS.length;
const HEIGHT = 2.6;
const DEPTH = 0.14;
const LAYERS = 12;
const loader = new THREE.TextureLoader();
const pickables = [];

function makeShadowBlob() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(80,30,15,.45)');
  grd.addColorStop(1, 'rgba(80,30,15,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const blobTex = makeShadowBlob();

async function buildMascot(m, i) {
  const tex = await loader.loadAsync(`assets/${m.id}.png`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const aspect = tex.image.width / tex.image.height;
  const w = HEIGHT * aspect;
  const geo = new THREE.PlaneGeometry(w, HEIGHT);
  geo.translate(0, HEIGHT / 2, 0);

  const root = new THREE.Group();     // 在圓盤上的位置
  const body = new THREE.Group();     // 跳躍、旋轉動畫
  root.add(body);

  // 正面
  const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.5, roughness: 0.75, side: THREE.FrontSide,
  }));
  front.position.z = DEPTH / 2;
  front.castShadow = true;
  front.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5,
  });
  body.add(front);

  // 厚度：疊層側邊（加深色）
  const edgeMat = new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.5, color: '#6b4636', roughness: 0.9, side: THREE.DoubleSide,
  });
  for (let k = 1; k < LAYERS; k++) {
    const l = new THREE.Mesh(geo, edgeMat);
    l.position.z = DEPTH / 2 - (k / LAYERS) * DEPTH;
    body.add(l);
  }
  // 背面（淡色剪影＋角色色）
  const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.5, color: new THREE.Color(m.color).lerp(new THREE.Color('#ffffff'), 0.55),
    roughness: 0.8,
  }));
  back.rotation.y = Math.PI;
  back.position.z = -DEPTH / 2;
  body.add(back);

  // 底座
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.85, 0.18, 48),
    new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.5 }),
  );
  base.position.y = 0.09;
  base.castShadow = base.receiveShadow = true;
  root.add(base);
  const baseTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 0.02, 48),
    new THREE.MeshStandardMaterial({ color: '#fff7ec', roughness: 0.6 }),
  );
  baseTop.position.y = 0.19;
  root.add(baseTop);
  body.position.y = 0.2;

  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.8),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.01;
  root.add(blob);

  const a = i * STEP;
  root.position.set(Math.sin(a) * RADIUS, 0, Math.cos(a) * RADIUS);
  root.rotation.y = a;
  carousel.add(root);

  [front, back, ...body.children].forEach((o) => { o.userData.index = i; pickables.push(o); });
  return { root, body, spin: 0, spinT: 1, hop: 0, phase: Math.random() * 6 };
}

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const card = $('card');
const thumbs = $('thumbs');
MASCOTS.forEach((m, i) => {
  const b = document.createElement('button');
  b.className = 'thumb';
  b.style.setProperty('--c', m.color);
  b.setAttribute('aria-label', m.name);
  b.innerHTML = `<img src="assets/${m.id}.png" alt=""><span>${m.name}</span>`;
  b.onclick = () => select(i);
  thumbs.appendChild(b);
});

let current = 0;
let target = 0;          // carousel 目標角度
let angle = 0;           // 目前角度
let actors = [];
let lastInteract = performance.now();

function renderCard(i) {
  const m = MASCOTS[i];
  document.documentElement.style.setProperty('--accent', m.color);
  $('badge').textContent = m.badge;
  $('name').textContent = m.name;
  $('desc').textContent = m.desc;
  $('quote').textContent = m.quote;
  $('traits').innerHTML = m.traits.map(([k, v]) => `<li><b>${k}</b>${v}</li>`).join('');
  [...thumbs.children].forEach((b, k) => b.classList.toggle('on', k === i));
}

function select(i, { fromUser = true } = {}) {
  const n = MASCOTS.length;
  i = ((i % n) + n) % n;
  // 走最短路徑
  let want = -i * STEP;
  while (want - target > Math.PI) want -= Math.PI * 2;
  while (want - target < -Math.PI) want += Math.PI * 2;
  target = want;
  if (fromUser) lastInteract = performance.now();
  if (i === current && actors[i]) { actors[i].spinT = 0; return; }
  current = i;
  card.classList.add('swap');
  setTimeout(() => { renderCard(i); card.classList.remove('swap'); }, 220);
  if (actors[i]) actors[i].spinT = 0;
}

$('prev').onclick = () => select(current - 1);
$('next').onclick = () => select(current + 1);
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') select(current - 1);
  if (e.key === 'ArrowRight') select(current + 1);
});

// 拖曳旋轉＋點選
const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, start: angle, moved: 0 };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  mouse.x = ptr.x; mouse.y = ptr.y;
  if (!drag) return;
  const dx = e.clientX - drag.x;
  drag.moved = Math.max(drag.moved, Math.abs(dx));
  target = drag.start + dx * 0.008;
  lastInteract = performance.now();
});
canvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  if (drag.moved < 6) {
    ray.setFromCamera(ptr, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit) select(hit.object.userData.index);
  } else {
    const idx = Math.round(-target / STEP);
    select(idx);
  }
  drag = null;
});
const mouse = { x: 0, y: 0 };

// ---------- 版面 ----------
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const wide = w > 900;
  camera.fov = w / h < 0.8 ? 52 : 36;
  // 桌機：舞台往右挪，讓出左邊資訊卡
  if (wide) camera.setViewOffset(w, h, -w * 0.13, 0, w, h);
  else camera.setViewOffset(w, h, 0, h * 0.08, w, h);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------- 動畫 ----------
const clock = new THREE.Clock();
const ease = (t) => 1 - Math.pow(1 - t, 3);

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (!reduceMotion && !drag && performance.now() - lastInteract > 7000) {
    select(current + 1, { fromUser: false });
    lastInteract = performance.now();
  }

  angle += (target - angle) * (1 - Math.pow(0.002, dt));
  carousel.rotation.y = angle;

  actors.forEach((a, i) => {
    const isOn = i === current;
    // 大致面向鏡頭，保留一點側轉讓厚度看得見
    const world = THREE.MathUtils.euclideanModulo(i * STEP + angle + Math.PI, Math.PI * 2) - Math.PI;
    a.root.rotation.y = -angle + world * 0.3;
    const s = THREE.MathUtils.lerp(a.root.scale.x, isOn ? 1.18 : 0.9, 1 - Math.pow(0.001, dt));
    a.root.scale.setScalar(s);
    const bob = reduceMotion ? 0 : Math.sin(t * 2 + a.phase) * (isOn ? 0.07 : 0.04);
    if (a.spinT < 1) {
      a.spinT = Math.min(1, a.spinT + dt / 1.1);
      const k = ease(a.spinT);
      a.body.rotation.y = k * Math.PI * 2;
      a.body.position.y = 0.2 + Math.sin(a.spinT * Math.PI) * 0.6;
    } else {
      a.body.rotation.y = reduceMotion ? 0 : Math.sin(t * 0.9 + a.phase) * 0.12;
      a.body.position.y = 0.2 + bob;
    }
    a.body.rotation.z = reduceMotion ? 0 : Math.sin(t * 1.4 + a.phase) * 0.025;
  });

  if (!reduceMotion) {
    const p = pGeo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      p[i * 3 + 1] += dt * (0.15 + (pSeed[i] % 1) * 0.2);
      p[i * 3] += Math.sin(t + pSeed[i]) * dt * 0.08;
      if (p[i * 3 + 1] > 6.5) p[i * 3 + 1] = 0;
    }
    pGeo.attributes.position.needsUpdate = true;
  }

  // 滑鼠視差
  camera.position.x += (CAM_BASE.x + mouse.x * 0.8 - camera.position.x) * 0.04;
  camera.position.y += (CAM_BASE.y + mouse.y * 0.4 - camera.position.y) * 0.04;
  camera.lookAt(LOOK);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

Promise.all(MASCOTS.map(buildMascot)).then((list) => {
  actors = list;
  renderCard(0);
  actors[0].spinT = 0;
  $('loader').classList.add('done');
  tick();
}).catch((err) => {
  $('loader').textContent = '角色載入失敗，請重新整理頁面';
  console.error(err);
});
