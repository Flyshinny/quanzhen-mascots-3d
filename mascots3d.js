// 五位吉祥物的 3D 模型（以基本幾何組成，卡通著色＋描邊）
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const Y = V3(0, 1, 0);
const Z = V3(0, 0, 1);

// ---------- 材質 ----------
const gradientMap = (() => {
  const t = new THREE.DataTexture(new Uint8Array([165, 215, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap, ...extra });
const flat = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, ...extra });

const outlineMat = new THREE.ShaderMaterial({
  uniforms: { thickness: { value: 0.022 }, color: { value: new THREE.Color('#4a2a1c') } },
  vertexShader: /* glsl */`
    uniform float thickness;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vec3 n = normalize(normalMatrix * normal);
      mv.xyz += n * thickness;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 color;
    void main() {
      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
    }`,
  side: THREE.BackSide,
});

const smoothCache = new WeakMap();
function smooth(geo) {
  if (smoothCache.has(geo)) return smoothCache.get(geo);
  let g = geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-3);
  g.computeVertexNormals();
  smoothCache.set(geo, g);
  return g;
}

// ---------- 幾何小工具 ----------
const S = (r = 1) => new THREE.SphereGeometry(r, 40, 28);
const cyl = (rt, rb, h) => new THREE.CylinderGeometry(rt, rb, h, 40);
const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 20);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const lathe = (pts, seg = 56) => new THREE.LatheGeometry(pts.map(([x, y]) => V2(x, y)), seg);

function part(geo, color, { parent, pos, rot, scale, outline = true, mat } = {}) {
  const m = new THREE.Mesh(geo, mat || toon(color));
  m.castShadow = true;
  if (outline) m.add(new THREE.Mesh(smooth(geo), outlineMat));
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale !== undefined) typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(...scale);
  if (parent) parent.add(m);
  return m;
}

function limb(parent, a, b, r, color) {
  const A = V3(...a), B = V3(...b);
  const dir = B.clone().sub(A);
  const m = part(cap(r, Math.max(0.001, dir.length())), color, { parent });
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(Y, dir.normalize());
  return m;
}

// 橢球表面上的點（yaw 左右、pitch 上下，弧度）
function ellipsoidSurf(c, r) {
  return (yaw, pitch, off = 0.008) => {
    const d = V3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const p = V3(d.x * r[0], d.y * r[1], d.z * r[2]);
    const n = V3(p.x / r[0] ** 2, p.y / r[1] ** 2, p.z / r[2] ** 2).normalize();
    return { p: p.add(V3(...c)).addScaledVector(n, off), n };
  };
}
// 旋轉體表面上的點（dy 為相對高度）
function latheSurf(pts, baseY, cy) {
  const R = (y) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [r0, y0] = pts[i], [r1, y1] = pts[i + 1];
      if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1) && y1 !== y0) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
    }
    return pts[pts.length - 1][0];
  };
  return (yaw, dy, off = 0.008) => {
    const y = cy + dy - baseY;
    const r = R(y);
    const slope = (R(y + 0.01) - R(y - 0.01)) / 0.02;
    const n = V3(Math.sin(yaw), -slope, Math.cos(yaw)).normalize();
    return { p: V3(Math.sin(yaw) * r, y + baseY, Math.cos(yaw) * r).addScaledVector(n, off), n };
  };
}
function stick(obj, parent, s) {
  obj.position.copy(s.p);
  obj.quaternion.setFromUnitVectors(Z, s.n);
  parent.add(obj);
  return obj;
}

// ---------- 臉 ----------
const INK = '#3b2419';
function face(parent, surf, { eyes = 'open', spread = 0.34, eyeY = 0.1, mouthY = -0.18, size = 1, blushOut = 0.17, blushY = -0.12 } = {}) {
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    if (eyes === 'open') {
      const e = new THREE.Mesh(S(0.075 * size), flat(INK));
      e.scale.set(1, 1.22, 0.35);
      const hl = new THREE.Mesh(S(0.026 * size), flat('#ffffff'));
      hl.position.set(0.024 * size, 0.04 * size, 0.03);
      g.add(e, hl);
    } else {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.085 * size, 0.021 * size, 8, 28, Math.PI), flat(INK));
      arc.position.y = -0.03 * size;
      g.add(arc);
    }
    stick(g, parent, surf(s * spread, eyeY));

    const b = new THREE.Mesh(new THREE.CircleGeometry(0.075 * size, 28), flat('#f39c9c', { transparent: true, opacity: 0.8 }));
    b.scale.set(1.35, 1, 1);
    stick(b, parent, surf(s * (spread + blushOut), eyeY + blushY, 0.006));
  }
  const m = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.CircleGeometry(0.12 * size, 32, Math.PI, Math.PI), flat(INK));
  rim.position.y = 0.016 * size;
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.1 * size, 32, Math.PI, Math.PI), flat('#9a3328'));
  mouth.position.z = 0.002;
  const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.055 * size, 24, Math.PI, Math.PI), flat('#f2807a'));
  tongue.position.set(0, -0.038 * size, 0.004);
  tongue.scale.set(1.15, 0.75, 1);
  m.add(rim, mouth, tongue);
  stick(m, parent, surf(0, mouthY, 0.01));
}

// ---------- A 全全：道院小屋 ----------
function quanquan() {
  const g = new THREE.Group();
  const RED = '#cf532e', HOOD = '#bd4a2b', ROOF = '#e27b3d', GOLD = '#f3b634', FACE = '#fde8d2',
    WHITE = '#fbf4e8', TEAL = '#2b9186', SHOE = '#7b4a2f';

  for (const s of [-1, 1]) {
    limb(g, [s * 0.21, 0.22, 0], [s * 0.22, 0.52, 0], 0.16, RED);
    part(S(0.2), SHOE, { parent: g, pos: [s * 0.23, 0.12, 0.08], scale: [1, 0.6, 1.35] });
  }
  part(cyl(0.46, 0.6, 0.85), RED, { parent: g, pos: [0, 0.95, 0] });
  part(cyl(0.535, 0.555, 0.17), WHITE, { parent: g, pos: [0, 0.98, 0] });
  for (const k of [-2, -1, 1, 2]) {
    const a = k * 0.3;
    const b = part(box(0.1, 0.1, 0.03), TEAL, { parent: g, outline: false });
    b.position.set(Math.sin(a) * 0.553, 0.98, Math.cos(a) * 0.553);
    b.rotation.y = a;
  }
  part(cyl(0.1, 0.1, 0.05), GOLD, { parent: g, pos: [0, 0.98, 0.565], rot: [Math.PI / 2, 0, 0] });
  for (const s of [-1, 1]) {
    const c = part(box(0.08, 0.34, 0.04), WHITE, { parent: g });
    c.position.set(s * 0.09, 1.23, 0.48);
    c.rotation.set(-0.3, 0, s * 0.5);
  }
  // 手：一手揮手、一手自然垂下
  limb(g, [-0.42, 1.25, 0], [-0.74, 1.66, 0.1], 0.12, RED);
  part(S(0.14), FACE, { parent: g, pos: [-0.8, 1.78, 0.12] });
  limb(g, [0.42, 1.25, 0], [0.62, 0.86, 0.08], 0.12, RED);
  part(S(0.13), FACE, { parent: g, pos: [0.65, 0.78, 0.1] });

  // 頭：紅磚小屋（圓角方塊），白色簷帶，正面是臉
  part(new RoundedBoxGeometry(1.2, 1.0, 0.98, 6, 0.24), HOOD, { parent: g, pos: [0, 1.88, 0] });
  part(new RoundedBoxGeometry(1.26, 0.13, 1.04, 4, 0.06), WHITE, { parent: g, pos: [0, 2.31, 0] });
  const seam = flat('#9e3d22');
  for (const s of [-1, 1]) {
    for (const [y, z, w] of [[1.66, 0, 0.6], [1.86, 0.1, 0.5], [2.06, -0.05, 0.6]]) {
      const b = new THREE.Mesh(box(0.01, 0.025, w), seam);
      b.position.set(s * 0.603, y, z);
      g.add(b);
    }
    for (const [y, z] of [[1.76, 0.2], [1.76, -0.2], [1.96, -0.12], [1.96, 0.3]]) {
      const b = new THREE.Mesh(box(0.01, 0.2, 0.025), seam);
      b.position.set(s * 0.603, y, z);
      g.add(b);
    }
  }
  part(new RoundedBoxGeometry(0.88, 0.7, 0.3, 6, 0.14), FACE, { parent: g, pos: [0, 1.84, 0.36] });
  const panel = (yaw, pitch, off = 0.008) => ({ p: V3(yaw * 0.62, 1.84 + pitch * 0.6, 0.51 + off), n: Z.clone() });
  face(g, panel, { eyes: 'open', spread: 0.36, eyeY: 0.14, mouthY: -0.2, blushOut: 0.2, blushY: -0.15 });

  // 琉璃屋頂
  const roofPts = [[0, 0], [1.12, 0], [1.14, 0.05], [0.85, 0.17], [0.55, 0.33], [0.4, 0.46], [0, 0.48]];
  part(lathe(roofPts), ROOF, { parent: g, pos: [0, 2.38, 0] });
  const ridgeMat = flat('#b8532a');
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    const pts = [[1.12, 0.06], [0.85, 0.185], [0.55, 0.345], [0.41, 0.47]]
      .map(([r, y]) => V3(Math.sin(a) * r * 1.012, 2.38 + y + 0.004, Math.cos(a) * r * 1.012));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.011, 6), ridgeMat);
    g.add(tube);
  }
  part(new THREE.TorusGeometry(1.13, 0.045, 10, 72), '#c85f2c', { parent: g, pos: [0, 2.41, 0], rot: [Math.PI / 2, 0, 0] });
  part(cyl(0.42, 0.44, 0.1), '#d06a33', { parent: g, pos: [0, 2.89, 0] });
  part(cyl(0.035, 0.035, 0.24), GOLD, { parent: g, pos: [0, 3.04, 0] });
  part(S(0.13), GOLD, { parent: g, pos: [0, 3.2, 0] });
  for (const s of [-1, 1]) {
    part(cyl(0.03, 0.03, 0.12), GOLD, { parent: g, pos: [s * 0.36, 2.98, 0] });
    part(S(0.09), GOLD, { parent: g, pos: [s * 0.36, 3.07, 0] });
  }
  return g;
}

// ---------- B 真真：常青小柏樹 ----------
function zhenzhen() {
  const g = new THREE.Group();
  const G = '#3f9b5d', GD = '#2b7446', GL = '#93d27c', HAND = '#5fb36f', FACE = '#fde8d2', STAR = '#f7c53d';

  for (const s of [-1, 1]) {
    limb(g, [s * 0.22, 0.2, 0], [s * 0.22, 0.42, 0], 0.15, G);
    part(S(0.2), GD, { parent: g, pos: [s * 0.24, 0.12, 0.06], scale: [1, 0.65, 1.3] });
  }
  part(cyl(0.45, 0.74, 0.8), G, { parent: g, pos: [0, 0.78, 0] });
  part(S(1), GL, { parent: g, pos: [0, 0.72, 0.62], scale: [0.14, 0.2, 0.04], rot: [-0.35, 0, 0] });
  // 雙手歡呼
  for (const s of [-1, 1]) {
    limb(g, [s * 0.45, 1.08, 0], [s * 0.84, 1.52, 0.1], 0.12, G);
    part(S(0.15), HAND, { parent: g, pos: [s * 0.9, 1.62, 0.12] });
  }

  // 水滴形樹冠頭罩
  const H = 2.0, BASE = 0.95, RMAX = 0.8;
  const hoodR = (t) => RMAX * Math.pow(Math.sin(Math.PI * Math.pow(Math.min(Math.max(t, 0), 1), 0.62)), 0.85);
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push([hoodR(i / 40), (i / 40) * H]);
  part(lathe(pts), G, { parent: g, pos: [0, BASE, 0] });

  const fc = [0, 1.62, 0.52], fr = [0.46, 0.4, 0.36];
  part(S(1), FACE, { parent: g, pos: fc, scale: fr });
  face(g, ellipsoidSurf(fc, fr), { eyes: 'happy', spread: 0.36, eyeY: 0.12, mouthY: -0.24, blushY: -0.16 });

  // 樹冠波紋
  const waveMat = flat(GD);
  for (const y of [2.05, 2.3, 2.55]) {
    const r = hoodR((y - BASE) / H) + 0.012;
    const span = 0.95;
    const wpts = [];
    for (let i = 0; i <= 60; i++) {
      const a = -span + (i / 60) * span * 2;
      wpts.push(V3(Math.sin(a) * r, y + 0.03 * Math.sin(a * 14), Math.cos(a) * r));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wpts), 120, 0.016, 6), waveMat));
  }
  // 星星
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.08 : 0.18, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const sg = new THREE.ExtrudeGeometry(star, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
  sg.center();
  const a = 0.78, sy = 2.15, sr = hoodR((sy - BASE) / H) + 0.04;
  part(sg, STAR, { parent: g, pos: [Math.sin(a) * sr, sy, Math.cos(a) * sr], rot: [0, a, 0.2] });
  return g;
}

// ---------- C 忠忠：暖暖心燈 ----------
function zhongzhong() {
  const g = new THREE.Group();
  const Yc = '#f2b33c', YD = '#de9a2e', YL = '#f8d57a';

  for (const s of [-1, 1]) {
    limb(g, [s * 0.18, 0.2, 0], [s * 0.18, 0.46, 0], 0.14, Yc);
    part(S(0.18), YD, { parent: g, pos: [s * 0.2, 0.11, 0.06], scale: [1, 0.6, 1.3] });
  }
  part(cyl(0.36, 0.48, 0.72), Yc, { parent: g, pos: [0, 0.82, 0] });
  // 合十
  for (const s of [-1, 1]) limb(g, [s * 0.36, 1.08, 0], [s * 0.1, 0.98, 0.4], 0.1, Yc);
  for (const s of [-1, 1]) part(S(0.12), Yc, { parent: g, pos: [s * 0.055, 1.06, 0.46], scale: [0.75, 1.25, 0.8] });

  // 燈碗頭
  const bowl = [[0, 0], [0.3, 0], [0.32, 0.06], [0.5, 0.18], [0.68, 0.38], [0.8, 0.62], [0.86, 0.85], [0.88, 0.92], [0, 0.92]];
  const BASE = 1.2;
  part(lathe(bowl), Yc, { parent: g, pos: [0, BASE, 0] });
  part(new THREE.TorusGeometry(0.31, 0.045, 10, 48), YD, { parent: g, pos: [0, BASE + 0.02, 0], rot: [Math.PI / 2, 0, 0] });
  part(new THREE.TorusGeometry(0.87, 0.055, 12, 72), YL, { parent: g, pos: [0, BASE + 0.92, 0], rot: [Math.PI / 2, 0, 0] });
  const oil = new THREE.Mesh(new THREE.CircleGeometry(0.85, 56), toon('#e2902c'));
  oil.rotation.x = -Math.PI / 2;
  oil.position.y = BASE + 0.925;
  g.add(oil);
  face(g, latheSurf(bowl, BASE, 1.72), { eyes: 'open', spread: 0.34, eyeY: 0.1, mouthY: -0.14, blushOut: 0.2, blushY: -0.1 });

  // 火焰
  const flame = (r, h) => {
    const p = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      p.push([r * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.5)), 0.9), t * h]);
    }
    return lathe(p, 40);
  };
  const glow = (c, e) => toon(c, { emissive: e, emissiveIntensity: 0.45 });
  part(flame(0.42, 1.0), null, { parent: g, pos: [0, BASE + 0.82, 0], mat: glow('#f07a2a', '#ff6a10') });
  part(flame(0.26, 0.66), null, { parent: g, pos: [0, BASE + 0.86, 0.28], scale: [1, 1, 0.45], mat: glow('#ffc94a', '#ffb020'), outline: false });
  part(flame(0.13, 0.34), null, { parent: g, pos: [0, BASE + 0.9, 0.37], scale: [1, 1, 0.4], mat: glow('#fff1b0', '#fff0a0'), outline: false });
  const light = new THREE.PointLight('#ffb35a', 2.2, 4, 1.6);
  light.position.set(0, BASE + 1.3, 0.4);
  g.add(light);
  return g;
}

// ---------- D 瑞瑞：吉祥瑞雲 ----------
function ruirui() {
  const g = new THREE.Group();
  const W = '#fbfaf6', ROBE = '#f3eadb', LEG = '#fffaf2', SCARF = '#2a8f86', SW = '#7cc8dc', SHOE = '#6d5547';

  limb(g, [-0.16, 0.25, 0], [-0.16, 0.56, 0], 0.15, LEG);
  part(S(0.17), SHOE, { parent: g, pos: [-0.17, 0.12, 0.06], scale: [1, 0.6, 1.3] });
  limb(g, [0.16, 0.56, 0], [0.3, 0.36, -0.3], 0.15, LEG);
  part(S(0.17), SHOE, { parent: g, pos: [0.34, 0.3, -0.43], scale: [1, 0.6, 1.3], rot: [0.6, 0, 0] });

  part(cyl(0.36, 0.5, 0.76), ROBE, { parent: g, pos: [0, 0.9, 0] });
  part(box(0.03, 0.6, 0.02), SW, { parent: g, pos: [0.05, 0.86, 0.45], rot: [-0.18, 0, 0], outline: false });

  limb(g, [0.38, 1.15, 0], [0.72, 1.55, 0.1], 0.12, ROBE);
  part(S(0.14), W, { parent: g, pos: [0.77, 1.67, 0.12] });
  limb(g, [-0.38, 1.15, 0], [-0.6, 0.8, 0.1], 0.12, ROBE);
  part(S(0.13), W, { parent: g, pos: [-0.63, 0.72, 0.12] });

  // 圍巾
  part(new THREE.TorusGeometry(0.36, 0.11, 14, 48), SCARF, { parent: g, pos: [0, 1.3, 0], rot: [Math.PI / 2, 0, 0] });
  part(box(0.2, 0.62, 0.07), SCARF, { parent: g, pos: [0.2, 0.98, 0.46], rot: [-0.2, 0, 0.18] });

  // 雲朵頭
  const fc = [0, 2.0, 0], fr = [0.8, 0.66, 0.6];
  part(S(1), W, { parent: g, pos: fc, scale: fr });
  for (const [x, y, z, r] of [
    [-0.72, 1.82, -0.05, 0.42], [0.72, 1.82, -0.05, 0.42], [-0.62, 2.35, -0.08, 0.42],
    [-0.1, 2.6, -0.1, 0.48], [0.5, 2.48, -0.1, 0.44], [0.88, 2.15, -0.12, 0.33],
    [-0.9, 2.12, -0.12, 0.33], [-0.36, 1.52, 0, 0.32], [0.36, 1.52, 0, 0.32],
  ]) part(S(r), W, { parent: g, pos: [x, y, z] });
  const surf = ellipsoidSurf(fc, fr);
  face(g, surf, { eyes: 'happy', spread: 0.34, eyeY: 0.1, mouthY: -0.2, blushOut: 0.16, blushY: -0.14 });
  // 祥雲漩渦
  const swirl = [];
  for (let i = 0; i <= 50; i++) {
    const t = i / 50, a = t * Math.PI * 3.2, rr = 0.02 + 0.085 * t;
    swirl.push(V3(Math.cos(a) * rr, Math.sin(a) * rr, 0));
  }
  swirl.push(V3(-0.2, -0.02, 0));
  const sGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(swirl), 80, 0.018, 6);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(sGeo, flat(SW));
    m.scale.x = -s;
    stick(m, g, surf(s * 0.74, -0.02, 0.02));
  }
  return g;
}

// ---------- E 恕恕：如心小蓮花 ----------
function shushu() {
  const g = new THREE.Group();
  const F = '#fde8d2', P = '#f39cb3', PD = '#e57794', GOLD = '#f3b634', SK = '#55b36f', SKD = '#3f9259', FOOT = '#f4a7ab';

  limb(g, [-0.13, 0.2, 0], [-0.13, 0.5, 0], 0.12, F);
  part(S(0.15), FOOT, { parent: g, pos: [-0.14, 0.1, 0.05], scale: [1, 0.6, 1.3] });
  limb(g, [0.13, 0.5, 0], [0.24, 0.34, -0.26], 0.12, F);
  part(S(0.15), FOOT, { parent: g, pos: [0.27, 0.28, -0.36], scale: [1, 0.6, 1.3], rot: [0.6, 0, 0] });

  // 荷葉裙（波浪裙襬）
  const skirt = lathe([[0, 0.5], [0.72, 0.5], [0.72, 0.6], [0.5, 0.82], [0.32, 1.02], [0, 1.02]], 96);
  const pos = skirt.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y < 0.65) {
      const k = 1 + 0.07 * Math.sin(9 * Math.atan2(x, z));
      pos.setXYZ(i, x * k, y - 0.04 * Math.cos(9 * Math.atan2(x, z)), z * k);
    }
  }
  skirt.computeVertexNormals();
  part(skirt, SK, { parent: g });
  const veinMat = flat(SKD);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + Math.PI / 9;
    const vp = [[0.34, 1.0], [0.5, 0.83], [0.66, 0.66], [0.74, 0.55]].map(([r, y]) => V3(Math.sin(a) * (r + 0.012), y, Math.cos(a) * (r + 0.012)));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vp), 12, 0.012, 5), veinMat));
  }
  part(cyl(0.27, 0.32, 0.28), SK, { parent: g, pos: [0, 1.12, 0] });
  for (const s of [-1, 1]) limb(g, [s * 0.28, 1.15, 0], [s * 0.1, 1.1, 0.3], 0.08, F);
  for (const s of [-1, 1]) part(S(0.1), F, { parent: g, pos: [s * 0.05, 1.17, 0.34], scale: [0.8, 1.2, 0.8] });

  // 頭＋蓮花瓣
  const fc = [0, 1.85, 0], fr = [0.62, 0.58, 0.56];
  for (const [layer, color, d, z, sc] of [[0, PD, 0.8, -0.28, [0.25, 0.44, 0.1]], [1, P, 0.72, -0.14, [0.23, 0.4, 0.1]]]) {
    for (let k = 0; k < 12; k++) {
      const th = Math.PI / 2 + (k + layer * 0.5) * (Math.PI * 2 / 12);
      if (Math.sin(th) < -0.55) continue;
      part(S(1), color, {
        parent: g, pos: [Math.cos(th) * d, fc[1] + Math.sin(th) * d, z],
        scale: sc, rot: [0, 0, th - Math.PI / 2],
      });
    }
  }
  part(S(1), F, { parent: g, pos: fc, scale: fr });
  part(S(0.1), GOLD, { parent: g, pos: [0, 2.46, 0.06] });
  face(g, ellipsoidSurf(fc, fr), { eyes: 'happy', spread: 0.36, eyeY: 0.06, mouthY: -0.24, blushY: -0.16 });
  return g;
}

export const BUILDERS = { quanquan, zhenzhen, zhongzhong, ruirui, shushu };
export function buildMascot3D(id) {
  const g = BUILDERS[id]();
  g.name = id;
  return g;
}
