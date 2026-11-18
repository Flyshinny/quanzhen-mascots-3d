// 動作表情庫預覽頁。?export=<save server>&what=poses|expr 可逐張輸出透明背景 PNG
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MASCOTS } from './data.js';
import { buildMascot3D } from './mascots3d.js';
import { POSES, ACTIONS, EXPRESSIONS, setPose, playAction, setExpression, resetPose } from './poses.js';

const params = new URLSearchParams(location.search);
const EXPORT = params.get('export');

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(EXPORT ? 1 : Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 3;
controls.maxDistance = 20;
controls.maxPolarAngle = Math.PI * 0.55;

scene.add(new THREE.HemisphereLight('#fffaf0', '#e8cdb0', 1.5));
const sun = new THREE.DirectionalLight('#fff3e0', 2.4);
sun.position.set(3, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 5, bottom: -2, near: 1, far: 25 });
sun.shadow.radius = 5;
scene.add(sun);
const rim = new THREE.DirectionalLight('#ffe2c0', 1.2);
rim.position.set(-4, 4, -5);
scene.add(rim);
const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.ShadowMaterial({ opacity: 0.16 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const models = MASCOTS.map((m) => {
  const g = buildMascot3D(m.id);
  g.visible = false;
  scene.add(g);
  return g;
});

const HERO = { pos: [3.2, 2.6, 9.4], target: [0, 1.5, 0] };
camera.position.set(...HERO.pos);
controls.target.set(...HERO.target);

let cur = 0, mode = 'action', item = 'idle', expr = null, t0 = performance.now();
const rig = () => models[cur].userData.rig;

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
function chips(el, list, kind) {
  for (const [key, v] of Object.entries(list)) {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = v.label; b.dataset.k = key; b.dataset.kind = kind;
    b.onclick = () => {
      if (kind === 'expr') { expr = key; setExpression(rig(), key); }
      else { mode = kind; item = key; expr = null; t0 = performance.now(); apply(); }
      refresh();
    };
    el.appendChild(b);
  }
}
chips($('actions'), ACTIONS, 'action');
chips($('poses'), POSES, 'pose');
chips($('exprs'), EXPRESSIONS, 'expr');
MASCOTS.forEach((m, i) => {
  const b = document.createElement('button');
  b.className = 'thumb'; b.style.setProperty('--c', m.color);
  b.innerHTML = `<img src="assets/${m.id}.png" alt=""><span>${m.name}</span>`;
  b.onclick = () => select(i);
  $('dock').appendChild(b);
});

function apply() {
  const r = rig();
  resetPose(r);
  if (mode === 'pose') setPose(r, item);
  if (expr) setExpression(r, expr);
}
function refresh() {
  const m = MASCOTS[cur];
  document.documentElement.style.setProperty('--accent', m.color);
  $('title').textContent = `${m.name}・${(mode === 'pose' ? POSES : ACTIONS)[item].label}`;
  document.querySelectorAll('.chip').forEach((b) => {
    const on = b.dataset.kind === 'expr' ? b.dataset.k === (expr || rig().face.name) : b.dataset.kind === mode && b.dataset.k === item;
    b.classList.toggle('on', on);
  });
  [...$('dock').children].forEach((b, i) => b.classList.toggle('on', i === cur));
  const call = mode === 'pose' ? `setPose(rig, '${item}')` : `playAction(rig, '${item}', t)`;
  $('code').innerHTML = `const rig = buildMascot3D('${m.id}').userData.rig;<br>${call};` + (expr ? `<br>setExpression(rig, '${expr}');` : '');
}
function select(i) {
  models[cur].visible = false;
  cur = i;
  models[cur].visible = true;
  apply();
  refresh();
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // 寬螢幕時角色往右邊放，讓出左邊面板
  if (w > 900) camera.setViewOffset(w, h, -w * 0.1, 0, w, h); else camera.setViewOffset(w, h, 0, h * 0.16, w, h);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ---------- 執行 ----------
await document.fonts.ready;
if (EXPORT) {
  await runExport();
} else {
  resize();
  select(0);
  $('loader').classList.add('done');
  renderer.setAnimationLoop(() => {
    const t = (performance.now() - t0) / 1000;
    if (mode === 'action') {
      playAction(rig(), item, t, { expr: !expr });
      if (expr && rig().face.name !== expr) setExpression(rig(), expr);
    }
    controls.update();
    renderer.render(scene, camera);
  });
}

// 逐張輸出：姿勢（全身 900×1100）、表情（臉部特寫 640×640）
async function runExport() {
  const what = params.get('what') || 'poses';
  const send = async (name) => {
    const blob = await new Promise((r) => renderer.domElement.toBlob(r, 'image/png'));
    await fetch(`${EXPORT}/save?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
  };
  const box = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < models.length; i++) {
    models.forEach((m, k) => (m.visible = k === i));
    const r = models[i].userData.rig, name = MASCOTS[i].name;
    if (what === 'poses') {
      renderer.setSize(900, 1100, false);
      camera.aspect = 900 / 1100; camera.clearViewOffset();
      camera.fov = 30; camera.updateProjectionMatrix();
      camera.position.set(2.2, 2.3, 8.4); camera.lookAt(0, 1.85, 0);
      for (const key of Object.keys(POSES)) {
        resetPose(r); setPose(r, key);
        renderer.render(scene, camera);
        await send(`${name}_${String(++n).padStart(2, '0')}_${POSES[key].label}.png`);
      }
      n = 0;
    } else {
      renderer.setSize(640, 640, false);
      camera.aspect = 1; camera.clearViewOffset(); camera.fov = 25; camera.updateProjectionMatrix();
      resetPose(r);
      r.head.updateWorldMatrix(true, true);
      box.setFromObject(r.head); box.getCenter(c); box.getSize(sz);
      const target = r.id === 'zhongzhong' ? new THREE.Vector3(0, 1.75, 0) : r.id === 'zhenzhen' ? new THREE.Vector3(0, 1.75, 0) : c;
      const dist = r.id === 'zhenzhen' || r.id === 'zhongzhong' ? 7.4 : 7.8;
      camera.position.set(target.x + 0.9, target.y + 0.35, dist); camera.lookAt(target);
      for (const key of Object.keys(EXPRESSIONS)) {
        resetPose(r); setExpression(r, key);
        renderer.render(scene, camera);
        await send(`${name}_表情${String(++n).padStart(2, '0')}_${EXPRESSIONS[key].label}.png`);
      }
      n = 0;
    }
  }
  window.__exportDone = true;
  document.title = 'done';
}
