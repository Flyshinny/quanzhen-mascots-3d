import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MASCOTS } from './data.js';
import { buildMascot3D } from './mascots3d.js';

const params = new URLSearchParams(location.search);
const EXPORT = params.has('export');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 22;
controls.maxPolarAngle = Math.PI * 0.52;
controls.autoRotateSpeed = 1.2;

scene.add(new THREE.HemisphereLight('#fffaf0', '#e8cdb0', 1.5));
const sun = new THREE.DirectionalLight('#fff3e0', 2.4);
sun.position.set(3, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -2, near: 1, far: 25 });
sun.shadow.radius = 5;
scene.add(sun);
const rim = new THREE.DirectionalLight('#ffe2c0', 1.2);
rim.position.set(-4, 4, -5);
scene.add(rim);

const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 64), new THREE.ShadowMaterial({ opacity: 0.16 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// 模型
const models = MASCOTS.map((m) => {
  const g = buildMascot3D(m.id);
  g.visible = false;
  scene.add(g);
  return g;
});

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
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
let view = 'hero';

const VIEWS = {
  hero: { pos: [3.8, 2.8, 9.6], target: [0, 1.55, 0] },
  front: { pos: [0, 1.6, 10.5], target: [0, 1.6, 0] },
  side: { pos: [-10.5, 1.6, 0], target: [0, 1.6, 0] },
  top: { pos: [0, 11, 0.01], target: [0, 1.4, 0] },
  all: { pos: [0, 3.2, 15], target: [0, 1.9, 0] },
};
let tween = null;
function goView(v, instant = false) {
  view = v;
  [...$('views').children].forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  let { pos, target } = VIEWS[v];
  if (v === 'all') {
    // 依畫面寬度拉遠，五位都放得下
    const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    pos = [0, 3.4, Math.max(12.5, 6.4 / Math.tan(hfov / 2))];
  }
  const to = { p: new THREE.Vector3(...pos), t: new THREE.Vector3(...target) };
  if (instant || reduceMotion) { camera.position.copy(to.p); controls.target.copy(to.t); tween = null; }
  else {
    // 繞著角色轉過去（球面插值），避免鏡頭穿過模型
    const fo = camera.position.clone().sub(controls.target);
    const too = to.p.clone().sub(to.t);
    tween = {
      k: 0, ft: controls.target.clone(), tt: to.t,
      fr: fo.length(), tr: too.length(), dir: fo.normalize(),
      q: new THREE.Quaternion().setFromUnitVectors(fo, too.clone().normalize()),
    };
  }
  controls.maxPolarAngle = v === 'top' ? Math.PI : Math.PI * 0.52;
  layout();
  if (!EXPORT) resize();
}

function layout() {
  const all = view === 'all';
  models.forEach((g, i) => {
    g.visible = all || i === current;
    g.position.set(all ? (i - 2) * 2.25 : 0, 0, all ? -Math.abs(i - 2) * 0.6 : 0);
    g.rotation.y = all ? (i - 2) * -0.12 : 0;
  });
  $('card').style.display = all ? 'none' : '';
  [...thumbs.children].forEach((b, k) => b.classList.toggle('on', !all && k === current));
}

function select(i) {
  const n = MASCOTS.length;
  current = ((i % n) + n) % n;
  const m = MASCOTS[current];
  document.documentElement.style.setProperty('--accent', m.color);
  $('badge').textContent = m.badge;
  $('name').textContent = m.name;
  $('desc').textContent = m.desc;
  $('quote').textContent = m.quote;
  if (view === 'all') goView('hero');
  else layout();
  idleSince = performance.now();
}
$('prev').onclick = () => select(current - 1);
$('next').onclick = () => select(current + 1);
$('views').addEventListener('click', (e) => { if (e.target.dataset.v) goView(e.target.dataset.v); });
addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') select(current - 1);
  if (e.key === 'ArrowRight') select(current + 1);
});
let idleSince = performance.now();
controls.addEventListener('start', () => { idleSince = Infinity; tween = null; });
controls.addEventListener('end', () => { idleSince = performance.now(); });

$('dl').onclick = () => {
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.download = view === 'all' ? '全真吉祥物_3D合照.png' : `${MASCOTS[current].name}_3D人物圖.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
};

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 44 : 30;
  if (view === 'all') camera.clearViewOffset();
  else if (w > 900) camera.setViewOffset(w, h, -w * 0.1, 0, w, h);
  else camera.setViewOffset(w, h, 0, h * 0.06, w, h);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (tween) {
    tween.k = Math.min(1, tween.k + dt / 0.8);
    const e = 1 - Math.pow(1 - tween.k, 3);
    controls.target.lerpVectors(tween.ft, tween.tt, e);
    const q = new THREE.Quaternion().slerp(tween.q, e);
    camera.position.copy(controls.target).addScaledVector(
      tween.dir.clone().applyQuaternion(q), THREE.MathUtils.lerp(tween.fr, tween.tr, e));
    if (tween.k === 1) tween = null;
  }
  controls.autoRotate = !reduceMotion && view === 'hero' && !tween && performance.now() - idleSince > 3000;
  if (!reduceMotion) models.forEach((g, i) => { if (g.visible) g.position.y = Math.max(0, Math.sin(t * 2 + i)) * 0.05; });
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// ---------- 匯出（本機 ?export=1） ----------
async function exportAll() {
  const shots = [
    ...MASCOTS.map((m, i) => ({ i, v: 'hero', w: 1200, h: 1500, name: `${m.name}_3D人物圖.png` })),
    ...MASCOTS.map((m, i) => ({ i, v: 'front', w: 1200, h: 1500, name: `${m.name}_3D正面.png` })),
    { i: 0, v: 'all', w: 2400, h: 1350, name: '全真吉祥物_3D合照.png' },
  ];
  renderer.setPixelRatio(1);
  for (const s of shots) {
    current = s.i;
    renderer.setSize(s.w, s.h, false);
    camera.aspect = s.w / s.h;
    camera.fov = 30;
    camera.clearViewOffset();
    camera.updateProjectionMatrix();
    goView(s.v, true);
    if (s.v !== 'all') {
      // 依模型大小對焦
      const box = new THREE.Box3().setFromObject(models[s.i]);
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const dist = (size.y * 1.18) / (2 * Math.tan(THREE.MathUtils.degToRad(15)));
      const dir = new THREE.Vector3(...VIEWS[s.v].pos).sub(new THREE.Vector3(...VIEWS[s.v].target)).normalize();
      controls.target.copy(c);
      camera.position.copy(c).addScaledVector(dir, dist);
    }
    controls.update();
    renderer.render(scene, camera);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const saveTo = params.get('export') || '';
    await fetch(`${saveTo}/save?name=${encodeURIComponent(s.name)}`, { method: 'POST', body: blob });
  }
  window.__exportDone = true;
}

select(0);
goView('hero', true);
resize();
$('loader').classList.add('done');
if (EXPORT) exportAll(); else tick();
