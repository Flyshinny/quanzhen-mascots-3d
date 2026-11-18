// 五位吉祥物的 3D 模型（以基本幾何組成，卡通著色＋描邊）
// 每位都有相同的關節（rig）：body（整體位移）、upper（上半身）、head（頭）、armL/armR（肩）、legL/legR（髖）
// 以及表情控制 rig.face：set('happy')、talk(0~1)、blink(0~1)。動作與表情的清單見 poses.js。
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

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

// ---------- 關節 ----------
// 樞紐：外層 group 放在關節位置（拿來旋轉），內層抵銷回原座標，裡面的零件照原本座標擺
function pivot(parent, x, y, z = 0) {
  const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p);
  const inner = new THREE.Group(); inner.position.set(-x, -y, -z); p.add(inner);
  return [p, inner];
}
// 手臂：樞紐在肩膀，靜止時朝正下方。a＝往外張開（0 垂下、π/2 水平、π 朝天；負值往身體內側），f＝往前抬
export function poseArm(arm, side, a, f = 0) { arm.rotation.set(-f, 0, side * a); }
// 腿：樞紐在髖部。out＝往外張，fwd＝往前踢（負值往後）
export function poseLeg(leg, side, out, fwd = 0) { leg.rotation.set(-fwd, 0, side * out); }

function makeArm(parent, s, [x, y, z = 0], { len, r, color, hand, handR, handScale, cuff }) {
  const arm = new THREE.Group();
  arm.position.set(s * x, y, z);
  parent.add(arm);
  limb(arm, [0, 0, 0], [0, -len, 0.05], r, color);
  part(S(handR), hand, { parent: arm, pos: [0, -len - handR * 0.5, 0.07], scale: handScale });
  // 袖口（可選）：讓手和顏色相近的身體、頭部分得開
  if (cuff) part(new THREE.TorusGeometry(r * 0.95, 0.04, 10, 28), cuff, { parent: arm, pos: [0, -len + 0.02, 0.05], rot: [Math.PI / 2, 0, 0] });
  return arm;
}
function makeLeg(parent, s, [x, y], { len, r, color, shoe, shoeR }) {
  const leg = new THREE.Group();
  leg.position.set(s * x, y, 0);
  parent.add(leg);
  limb(leg, [0, -len, 0], [0, 0, 0], r, color);
  part(S(shoeR), shoe, { parent: leg, pos: [s * 0.015, -len - shoeR * 0.5, 0.07], scale: [1, 0.62, 1.3] });
  return leg;
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

// ---------- 臉與表情 ----------
const INK = '#3b2419';
// 各表情：眼睛（左右可不同）、嘴巴、眉毛、腮紅
export const EXPRESSIONS = {
  smile:     { label: '微笑', eyes: ['open', 'open'],       mouth: 'open' },
  happy:     { label: '開心', eyes: ['happy', 'happy'],     mouth: 'open' },
  laugh:     { label: '大笑', eyes: ['squint', 'squint'],   mouth: 'big', blush: 1.15 },
  wink:      { label: '眨眼', eyes: ['open', 'happy'],      mouth: 'open', mouthScale: 0.85 },
  surprised: { label: '驚訝', eyes: ['big', 'big'],         mouth: 'o', brows: 'up' },
  shy:       { label: '害羞', eyes: ['happy', 'happy'],     mouth: 'smile', blush: 1.6 },
  sad:       { label: '難過', eyes: ['open', 'open'],       mouth: 'frown', brows: 'sad', eyeScale: 0.85 },
  angry:     { label: '生氣', eyes: ['open', 'open'],       mouth: 'frown', brows: 'angry', blush: 0.6, mouthScale: 0.8 },
  sleepy:    { label: '想睡', eyes: ['line', 'line'],       mouth: 'o', mouthScale: 0.7 },
  love:      { label: '愛心眼', eyes: ['heart', 'heart'],   mouth: 'open', blush: 1.2 },
  think:     { label: '思考', eyes: ['open', 'open'],       mouth: 'side', brows: 'think' },
  calm:      { label: '安詳', eyes: ['closed', 'closed'],   mouth: 'smile' },
};

const heartGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.09);
  s.bezierCurveTo(-0.02, -0.06, -0.1, -0.01, -0.1, 0.035);
  s.bezierCurveTo(-0.1, 0.075, -0.06, 0.095, -0.035, 0.09);
  s.bezierCurveTo(-0.015, 0.087, 0, 0.07, 0, 0.055);
  s.bezierCurveTo(0, 0.07, 0.015, 0.087, 0.035, 0.09);
  s.bezierCurveTo(0.06, 0.095, 0.1, 0.075, 0.1, 0.035);
  s.bezierCurveTo(0.1, -0.01, 0.02, -0.06, 0, -0.09);
  return new THREE.ShapeGeometry(s, 16);
})();

function face(parent, surf, { eyes = 'open', spread = 0.34, eyeY = 0.1, mouthY = -0.18, size = 1, blushOut = 0.17, blushY = -0.12 } = {}) {
  const inkMat = flat(INK);
  const eyeSides = [];
  const blushes = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    const v = {};
    // 圓眼＋亮點
    v.open = new THREE.Group();
    {
      const e = new THREE.Mesh(S(0.075 * size), inkMat);
      e.scale.set(1, 1.22, 0.35);
      const hl = new THREE.Mesh(S(0.026 * size), flat('#ffffff'));
      hl.position.set(0.024 * size, 0.04 * size, 0.03);
      v.open.add(e, hl);
    }
    // 瞇眼笑 ∩
    v.happy = new THREE.Mesh(new THREE.TorusGeometry(0.085 * size, 0.021 * size, 8, 28, Math.PI), inkMat);
    v.happy.position.y = -0.03 * size;
    // 閉眼 ∪（安詳）
    v.closed = new THREE.Mesh(new THREE.TorusGeometry(0.075 * size, 0.019 * size, 8, 28, Math.PI), inkMat);
    v.closed.rotation.z = Math.PI;
    v.closed.position.y = 0.035 * size;
    // 一字眼（想睡）
    v.line = new THREE.Mesh(cap(0.017 * size, 0.12 * size), inkMat);
    v.line.rotation.z = Math.PI / 2;
    v.line.position.y = -0.015 * size;
    // 大眼（驚訝）
    v.big = new THREE.Group();
    {
      const e = new THREE.Mesh(S(0.095 * size), inkMat);
      e.scale.set(1, 1.18, 0.35);
      const h1 = new THREE.Mesh(S(0.032 * size), flat('#ffffff'));
      h1.position.set(0.03 * size, 0.05 * size, 0.035);
      const h2 = new THREE.Mesh(S(0.015 * size), flat('#ffffff'));
      h2.position.set(-0.03 * size, -0.04 * size, 0.035);
      v.big.add(e, h1, h2);
    }
    // >< 眼（大笑）：左眼「>」、右眼「<」
    v.squint = new THREE.Group();
    for (const k of [-1, 1]) {
      const st = new THREE.Mesh(cap(0.019 * size, 0.08 * size), inkMat);
      st.position.set(0, k * 0.028 * size, 0);
      st.rotation.z = -s * k * 0.62 + Math.PI / 2;
      v.squint.add(st);
    }
    // 愛心眼
    v.heart = new THREE.Mesh(heartGeo, flat('#e8475f'));
    v.heart.scale.setScalar(1.05 * size);
    for (const k in v) { v[k].visible = k === eyes; g.add(v[k]); }
    // 眉毛（預設隱藏）
    const brow = new THREE.Mesh(cap(0.016 * size, 0.08 * size), inkMat);
    brow.rotation.z = Math.PI / 2;
    brow.position.set(0, 0.17 * size, 0.004);
    brow.visible = false;
    g.add(brow);
    stick(g, parent, surf(s * spread, eyeY));
    eyeSides.push({ s, g, v, brow });

    const b = new THREE.Mesh(new THREE.CircleGeometry(0.075 * size, 28), flat('#f39c9c', { transparent: true, opacity: 0.8 }));
    b.scale.set(1.35, 1, 1);
    stick(b, parent, surf(s * (spread + blushOut), eyeY + blushY, 0.006));
    blushes.push(b);
  }

  // 嘴巴：第一個建立的「open」維持原本結構（talk.js 以顏色 #9a3328 找到它）
  const m = new THREE.Group();
  const mouths = {};
  mouths.open = new THREE.Group();
  {
    const rim = new THREE.Mesh(new THREE.CircleGeometry(0.12 * size, 32, Math.PI, Math.PI), inkMat);
    rim.position.y = 0.016 * size;
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.1 * size, 32, Math.PI, Math.PI), flat('#9a3328'));
    mouth.position.z = 0.002;
    const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.055 * size, 24, Math.PI, Math.PI), flat('#f2807a'));
    tongue.position.set(0, -0.038 * size, 0.004);
    tongue.scale.set(1.15, 0.75, 1);
    mouths.open.add(rim, mouth, tongue);
  }
  // 大笑：同樣的 D 形嘴放大
  mouths.big = mouths.open.clone();
  mouths.big.scale.set(1.3, 1.45, 1);
  // 微笑 ∪
  mouths.smile = new THREE.Mesh(new THREE.TorusGeometry(0.07 * size, 0.016 * size, 8, 28, Math.PI), inkMat);
  mouths.smile.rotation.z = Math.PI;
  mouths.smile.position.y = 0.035 * size;
  // 嘟嘴 O
  mouths.o = new THREE.Group();
  {
    const ring = new THREE.Mesh(new THREE.CircleGeometry(0.06 * size, 28), inkMat);
    ring.scale.set(0.85, 1.05, 1);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.044 * size, 28), flat('#a8392d'));
    inner.scale.set(0.85, 1.05, 1);
    inner.position.z = 0.002;
    mouths.o.add(ring, inner);
    mouths.o.position.y = -0.01 * size;
  }
  // 難過 ∩
  mouths.frown = new THREE.Mesh(new THREE.TorusGeometry(0.06 * size, 0.016 * size, 8, 28, Math.PI), inkMat);
  mouths.frown.position.y = -0.04 * size;
  // 歪嘴（思考）
  mouths.side = new THREE.Mesh(cap(0.015 * size, 0.07 * size), inkMat);
  mouths.side.rotation.z = Math.PI / 2 + 0.25;
  mouths.side.position.set(0.03 * size, -0.01 * size, 0);
  for (const k in mouths) { mouths[k].visible = k === 'open'; m.add(mouths[k]); }
  stick(m, parent, surf(0, mouthY, 0.01));

  // ---------- 控制器 ----------
  const ctl = {
    name: eyes === 'open' ? 'smile' : 'happy',
    _eyeScale: 1, _mouthScale: 1, _blink: 0, _talk: 0, _mouth: 'open',
    set(name) {
      const e = EXPRESSIONS[name];
      if (!e) return;
      this.name = name;
      eyeSides.forEach(({ v, brow, s }, i) => {
        const kind = e.eyes[i];
        for (const k in v) v[k].visible = k === kind;
        brow.visible = !!e.brows;
        brow.position.y = 0.17 * size;
        if (e.brows === 'up') { brow.rotation.z = Math.PI / 2; brow.position.y = 0.21 * size; }
        if (e.brows === 'sad') brow.rotation.z = Math.PI / 2 - s * 0.38;
        if (e.brows === 'angry') brow.rotation.z = Math.PI / 2 + s * 0.42;
        if (e.brows === 'think') { brow.rotation.z = Math.PI / 2 + (s > 0 ? -0.3 : 0.1); brow.position.y = (s > 0 ? 0.2 : 0.17) * size; }
      });
      this._eyeScale = e.eyeScale || 1;
      this._mouth = e.mouth;
      this._mouthScale = e.mouthScale || 1;
      for (const k in mouths) mouths[k].visible = k === e.mouth;
      const bl = e.blush ?? 1;
      blushes.forEach((b) => { b.scale.set(1.35 * Math.sqrt(bl), Math.sqrt(bl), 1); b.material.opacity = Math.min(1, 0.8 * (0.6 + 0.4 * bl)); });
      this._apply();
    },
    // 說話時的嘴型開合（0～1），用在 open / big 嘴
    talk(v) { this._talk = v; this._apply(); },
    // 眨眼（0 張開～1 閉上）
    blink(v) { this._blink = v; this._apply(); },
    _apply() {
      const sy = this._eyeScale * (1 - 0.9 * this._blink);
      eyeSides.forEach(({ g }) => g.scale.set(this._eyeScale, Math.max(0.08, sy), 1));
      const ms = this._mouthScale;
      for (const k of ['open', 'big']) {
        const base = k === 'big' ? [1.3, 1.45] : [1, 1];
        mouths[k].scale.set(base[0] * ms * (1 - this._talk * 0.12), base[1] * ms * (this._talk ? 0.45 + this._talk * 0.95 : 1), 1);
      }
      for (const k of ['o', 'smile', 'frown', 'side']) mouths[k].scale.setScalar(ms * (k === 'o' ? 1 + this._talk * 0.5 : 1));
    },
  };
  return ctl;
}

function finish(root, rig, rest) {
  rig.rest = rest;
  root.userData.rig = rig;
  return root;
}

// ---------- A 全全：道院小屋 ----------
function quanquan() {
  const g = new THREE.Group();
  const RED = '#cf532e', HOOD = '#bd4a2b', ROOF = '#e27b3d', GOLD = '#f3b634', FACE = '#fde8d2',
    WHITE = '#fbf4e8', TEAL = '#2b9186', SHOE = '#7b4a2f';

  const rig = {};
  // 短短圓圓的腿（樞紐在髖部）
  for (const s of [-1, 1]) {
    const [leg, li] = pivot(g, s * 0.22, 0.46);
    limb(li, [s * 0.22, 0.24, 0], [s * 0.22, 0.46, 0], 0.18, RED);
    part(S(0.21), SHOE, { parent: li, pos: [s * 0.24, 0.12, 0.08], scale: [1, 0.62, 1.3] });
    rig[s < 0 ? 'legL' : 'legR'] = leg;
  }
  // 上半身（樞紐在下擺高度，可左右彎、轉身）
  const [upper, ui] = pivot(g, 0, 0.46);
  rig.upper = upper;
  const root = g;
  {
  const g = ui;
  // 身體：下擺外張 → 腰身收窄 → 胸口圓圓 → 往上收進頭底下
  const bodyCurve = new THREE.SplineCurve([
    [0, 0.42], [0.62, 0.42], [0.72, 0.46], [0.62, 0.6], [0.5, 0.76], [0.43, 0.9],
    [0.46, 1.04], [0.47, 1.18], [0.36, 1.36], [0, 1.46],
  ].map(([x, y]) => V2(x, y)));
  const bodyPts = bodyCurve.getPoints(64);
  part(new THREE.LatheGeometry(bodyPts, 64), RED, { parent: g });
  // 下擺滾邊
  part(new THREE.TorusGeometry(0.7, 0.045, 12, 72), '#b54325', { parent: g, pos: [0, 0.46, 0], rot: [Math.PI / 2, 0, 0] });
  const bodyR = (y) => {
    for (let i = 0; i < bodyPts.length - 1; i++) {
      const a = bodyPts[i], b = bodyPts[i + 1];
      if (y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)) return a.x + (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1);
    }
    return 0.6;
  };
  // 腰帶（繫在腰身最細的地方）
  const BY = 0.9, br = bodyR(BY);
  part(cyl(br + 0.02, br + 0.025, 0.17), WHITE, { parent: g, pos: [0, BY, 0] });
  for (const k of [-2, -1, 1, 2]) {
    const a = k * 0.28;
    const b = part(box(0.1, 0.1, 0.03), TEAL, { parent: g, outline: false });
    b.position.set(Math.sin(a) * (br + 0.035), BY, Math.cos(a) * (br + 0.035));
    b.rotation.y = a;
  }
  part(cyl(0.11, 0.11, 0.05), GOLD, { parent: g, pos: [0, BY, br + 0.045], rot: [Math.PI / 2, 0, 0] });
  // 白色交領（順著胸口的弧度）
  for (const s of [-1, 1]) {
    const c = part(box(0.08, 0.3, 0.04), WHITE, { parent: g });
    c.position.set(s * 0.09, 1.14, bodyR(1.14) - 0.01);
    c.rotation.set(-0.3, 0, s * 0.5);
  }
  // 手：樞紐在肩膀，手臂在樞紐裡朝正下方
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.44, 1.15, 0);
    g.add(arm);
    limb(arm, [0, 0, 0], [0, -0.48, 0.08], 0.13, RED);
    part(S(0.145), FACE, { parent: arm, pos: [0, -0.6, 0.1] });
    rig[s < 0 ? 'armL' : 'armR'] = arm;
  }

  // 頭（樞紐在脖子）
  const [head, hi] = pivot(g, 0, 1.4);
  rig.head = head;
  {
  const g = hi;
  const HC = 1.8;
  part(S(1), HOOD, { parent: g, pos: [0, HC, 0], scale: [0.76, 0.62, 0.6] });
  for (const s of [-1, 1]) part(S(0.17), HOOD, { parent: g, pos: [s * 0.74, HC - 0.06, -0.06] });
  // 臉：貼著頭罩的弧度長出來（只比頭罩高 0.025），側面不會凸出；正面仍是橫向橢圓，外圈畫深色邊線
  const HR = [0.76, 0.62, 0.6], FD = 0.025, FY = HC - 0.02, FW = 0.57, FH = 0.45;
  const hoodZ = (x, y, d) => {
    const q = 1 - (x / (HR[0] + d)) ** 2 - ((y - HC) / (HR[1] + d)) ** 2;
    return (HR[2] + d) * Math.sqrt(Math.max(q, 0));
  };
  {
    const NR = 18, NA = 72, pos = [], idx = [];
    pos.push(0, FY, hoodZ(0, FY, FD));
    for (let k = 1; k <= NR; k++) {
      const s = k / NR;
      for (let j = 0; j < NA; j++) {
        const a = (j / NA) * Math.PI * 2, x = FW * s * Math.cos(a), y = FY + FH * s * Math.sin(a);
        pos.push(x, y, hoodZ(x, y, FD));
      }
    }
    const at = (k, j) => (k === 0 ? 0 : 1 + (k - 1) * NA + (j % NA));
    for (let j = 0; j < NA; j++) idx.push(0, at(1, j), at(1, j + 1));
    for (let k = 1; k < NR; k++) {
      for (let j = 0; j < NA; j++) idx.push(at(k, j), at(k + 1, j), at(k + 1, j + 1), at(k, j), at(k + 1, j + 1), at(k, j + 1));
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setIndex(idx);
    fg.computeVertexNormals();
    part(fg, FACE, { parent: g, outline: false });
    const rimPts = [];
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2, x = FW * Math.cos(a), y = FY + FH * Math.sin(a);
      rimPts.push(V3(x, y, hoodZ(x, y, FD + 0.004)));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 144, 0.016, 8, true), flat('#4a2a1c')));
  }
  // 五官位置與原本相同（正面看一樣），深度改貼在新的臉面上
  const faceSurf = (yaw, pitch, off = 0.008) => {
    const d = FD + off;
    const x = FW * Math.sin(yaw) * Math.cos(pitch), y = FY + FH * Math.sin(pitch), z = hoodZ(x, y, d);
    const n = V3(x / (HR[0] + d) ** 2, (y - HC) / (HR[1] + d) ** 2, z / (HR[2] + d) ** 2).normalize();
    return { p: V3(x, y, z), n };
  };
  rig.face = face(g, faceSurf, { eyes: 'open', size: 0.88, spread: 0.4, eyeY: 0.06, mouthY: -0.3, blushOut: 0.2, blushY: -0.16 });

  // 琉璃屋頂（整頂縮到 80%，底部貼在頭頂）
  const hat = new THREE.Group();
  hat.scale.setScalar(0.8);
  hat.position.y = (HC + 0.6) - 0.8 * 2.38;
  g.add(hat);
  const roofPts = [[0, 0], [1.12, 0], [1.14, 0.05], [0.85, 0.17], [0.55, 0.33], [0.4, 0.46], [0, 0.48]];
  part(lathe(roofPts), ROOF, { parent: hat, pos: [0, 2.38, 0] });
  const ridgeMat = flat('#b8532a');
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2;
    const pts = [[1.12, 0.06], [0.85, 0.185], [0.55, 0.345], [0.41, 0.47]]
      .map(([r, y]) => V3(Math.sin(a) * r * 1.012, 2.38 + y + 0.004, Math.cos(a) * r * 1.012));
    hat.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.011, 6), ridgeMat));
  }
  part(new THREE.TorusGeometry(1.13, 0.045, 10, 72), '#c85f2c', { parent: hat, pos: [0, 2.41, 0], rot: [Math.PI / 2, 0, 0] });
  part(cyl(0.42, 0.44, 0.1), '#d06a33', { parent: hat, pos: [0, 2.89, 0] });
  part(cyl(0.035, 0.035, 0.24), GOLD, { parent: hat, pos: [0, 3.04, 0] });
  part(S(0.13), GOLD, { parent: hat, pos: [0, 3.2, 0] });
  for (const s of [-1, 1]) {
    part(cyl(0.03, 0.03, 0.12), GOLD, { parent: hat, pos: [s * 0.36, 2.98, 0] });
    part(S(0.09), GOLD, { parent: hat, pos: [s * 0.36, 3.07, 0] });
  }
  } // 頭

  // 下擺開衩示意：前面中間一條短線
  const slit = [];
  for (let i = 0; i <= 10; i++) {
    const y = 0.53 + i * 0.018;
    slit.push(V3(0, y, bodyR(y) + 0.012));
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(slit), 20, 0.013, 6), flat(INK)));
  } // 上半身
  // 招牌姿勢：左手揮手、右手垂下（與原本 armL.z = -2.4、armR.z = 0.65 相同）
  return finish(root, rig, { armL: [2.4, 0], armR: [0.65, 0], legL: [0, 0], legR: [0, 0], expr: 'smile' });
}

// ---------- B 真真：常青小柏樹 ----------
function zhenzhen() {
  const root = new THREE.Group();
  const G = '#3f9b5d', GD = '#2b7446', GL = '#93d27c', HAND = '#5fb36f', FACE = '#fde8d2', STAR = '#f7c53d';
  const rig = {};
  for (const s of [-1, 1]) rig[s < 0 ? 'legL' : 'legR'] = makeLeg(root, s, [0.22, 0.42], { len: 0.22, r: 0.15, color: G, shoe: GD, shoeR: 0.2 });

  const [upper, g] = pivot(root, 0, 0.42);
  rig.upper = upper;
  part(cyl(0.45, 0.74, 0.8), G, { parent: g, pos: [0, 0.78, 0] });
  part(S(1), GL, { parent: g, pos: [0, 0.72, 0.62], scale: [0.14, 0.2, 0.04], rot: [-0.35, 0, 0] });
  for (const s of [-1, 1]) rig[s < 0 ? 'armL' : 'armR'] = makeArm(g, s, [0.45, 1.08], { len: 0.58, r: 0.12, color: G, hand: HAND, handR: 0.15 });

  // 水滴形樹冠頭罩（頭的樞紐在頭罩底部）
  const [head, h] = pivot(g, 0, 1.12);
  rig.head = head;
  const H = 2.0, BASE = 0.95, RMAX = 0.8;
  const hoodR = (t) => RMAX * Math.pow(Math.sin(Math.PI * Math.pow(Math.min(Math.max(t, 0), 1), 0.62)), 0.85);
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push([hoodR(i / 40), (i / 40) * H]);
  part(lathe(pts), G, { parent: h, pos: [0, BASE, 0] });

  const fc = [0, 1.62, 0.52], fr = [0.46, 0.4, 0.36];
  part(S(1), FACE, { parent: h, pos: fc, scale: fr });
  rig.face = face(h, ellipsoidSurf(fc, fr), { eyes: 'happy', spread: 0.36, eyeY: 0.12, mouthY: -0.24, blushY: -0.16 });

  const waveMat = flat(GD);
  for (const y of [2.05, 2.3, 2.55]) {
    const r = hoodR((y - BASE) / H) + 0.012;
    const span = 0.95;
    const wpts = [];
    for (let i = 0; i <= 60; i++) {
      const a = -span + (i / 60) * span * 2;
      wpts.push(V3(Math.sin(a) * r, y + 0.03 * Math.sin(a * 14), Math.cos(a) * r));
    }
    h.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wpts), 120, 0.016, 6), waveMat));
  }
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.08 : 0.18, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const sg = new THREE.ExtrudeGeometry(star, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
  sg.center();
  const a = 0.78, sy = 2.15, sr = hoodR((sy - BASE) / H) + 0.04;
  part(sg, STAR, { parent: h, pos: [Math.sin(a) * sr, sy, Math.cos(a) * sr], rot: [0, a, 0.2] });
  // 招牌姿勢：雙手歡呼
  return finish(root, rig, { armL: [2.43, 0.2], armR: [2.43, 0.2], legL: [0, 0], legR: [0, 0], expr: 'happy' });
}

// ---------- C 忠忠：暖暖心燈 ----------
function zhongzhong() {
  const root = new THREE.Group();
  const Yc = '#f2b33c', YD = '#de9a2e', YL = '#f8d57a';
  const rig = {};
  for (const s of [-1, 1]) rig[s < 0 ? 'legL' : 'legR'] = makeLeg(root, s, [0.18, 0.46], { len: 0.26, r: 0.14, color: Yc, shoe: YD, shoeR: 0.18 });

  const [upper, g] = pivot(root, 0, 0.46);
  rig.upper = upper;
  part(cyl(0.36, 0.48, 0.72), Yc, { parent: g, pos: [0, 0.82, 0] });
  for (const s of [-1, 1]) rig[s < 0 ? 'armL' : 'armR'] = makeArm(g, s, [0.36, 1.08], { len: 0.42, r: 0.1, color: Yc, hand: Yc, handR: 0.12, handScale: [0.75, 1.25, 0.8] });

  // 燈碗頭（樞紐在碗底）
  const [head, h] = pivot(g, 0, 1.2);
  rig.head = head;
  const bowl = [[0, 0], [0.3, 0], [0.32, 0.06], [0.5, 0.18], [0.68, 0.38], [0.8, 0.62], [0.86, 0.85], [0.88, 0.92], [0, 0.92]];
  const BASE = 1.2;
  part(lathe(bowl), Yc, { parent: h, pos: [0, BASE, 0] });
  part(new THREE.TorusGeometry(0.31, 0.045, 10, 48), YD, { parent: h, pos: [0, BASE + 0.02, 0], rot: [Math.PI / 2, 0, 0] });
  part(new THREE.TorusGeometry(0.87, 0.055, 12, 72), YL, { parent: h, pos: [0, BASE + 0.92, 0], rot: [Math.PI / 2, 0, 0] });
  const oil = new THREE.Mesh(new THREE.CircleGeometry(0.85, 56), toon('#e2902c'));
  oil.rotation.x = -Math.PI / 2;
  oil.position.y = BASE + 0.925;
  h.add(oil);
  rig.face = face(h, latheSurf(bowl, BASE, 1.72), { eyes: 'open', spread: 0.34, eyeY: 0.1, mouthY: -0.14, blushOut: 0.2, blushY: -0.1 });

  const flame = (r, hh) => {
    const p = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      p.push([r * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.5)), 0.9), t * hh]);
    }
    return lathe(p, 40);
  };
  const glow = (c, e) => toon(c, { emissive: e, emissiveIntensity: 0.45 });
  const [flP, fl] = pivot(h, 0, BASE + 0.82); // 火焰的樞紐在燈芯，搖曳時以底部為中心
  part(flame(0.42, 1.0), null, { parent: fl, pos: [0, BASE + 0.82, 0], mat: glow('#f07a2a', '#ff6a10') });
  part(flame(0.26, 0.66), null, { parent: fl, pos: [0, BASE + 0.86, 0.28], scale: [1, 1, 0.45], mat: glow('#ffc94a', '#ffb020'), outline: false });
  part(flame(0.13, 0.34), null, { parent: fl, pos: [0, BASE + 0.9, 0.37], scale: [1, 1, 0.4], mat: glow('#fff1b0', '#fff0a0'), outline: false });
  rig.flame = flP;
  const light = new THREE.PointLight('#ffb35a', 2.2, 4, 1.6);
  light.position.set(0, BASE + 1.3, 0.4);
  h.add(light);
  // 招牌姿勢：合十
  return finish(root, rig, { armL: [-0.58, 1.5], armR: [-0.58, 1.5], legL: [0, 0], legR: [0, 0], expr: 'smile' });
}

// ---------- D 瑞瑞：吉祥瑞雲 ----------
function ruirui() {
  const root = new THREE.Group();
  const W = '#fbfaf6', HAND = '#f7d4b4', ROBE = '#f3eadb', LEG = '#fffaf2', SCARF = '#2a8f86', SW = '#7cc8dc', SHOE = '#6d5547';
  const rig = {};
  for (const s of [-1, 1]) rig[s < 0 ? 'legL' : 'legR'] = makeLeg(root, s, [0.16, 0.56], { len: 0.34, r: 0.15, color: LEG, shoe: SHOE, shoeR: 0.17 });

  const [upper, g] = pivot(root, 0, 0.56);
  rig.upper = upper;
  part(cyl(0.36, 0.5, 0.76), ROBE, { parent: g, pos: [0, 0.9, 0] });
  part(box(0.03, 0.6, 0.02), SW, { parent: g, pos: [0.05, 0.86, 0.45], rot: [-0.18, 0, 0], outline: false });
  for (const s of [-1, 1]) rig[s < 0 ? 'armL' : 'armR'] = makeArm(g, s, [0.38, 1.15], { len: 0.58, r: 0.12, color: ROBE, hand: HAND, handR: 0.14, cuff: SCARF });
  // 圍巾
  part(new THREE.TorusGeometry(0.36, 0.11, 14, 48), SCARF, { parent: g, pos: [0, 1.3, 0], rot: [Math.PI / 2, 0, 0] });
  part(box(0.2, 0.62, 0.07), SCARF, { parent: g, pos: [0.2, 0.98, 0.46], rot: [-0.2, 0, 0.18] });

  // 雲朵頭（樞紐在脖子）
  const [head, h] = pivot(g, 0, 1.38);
  rig.head = head;
  const fc = [0, 2.0, 0], fr = [0.8, 0.66, 0.6];
  part(S(1), W, { parent: h, pos: fc, scale: fr });
  for (const [x, y, z, r] of [
    [-0.72, 1.82, -0.05, 0.42], [0.72, 1.82, -0.05, 0.42], [-0.62, 2.35, -0.08, 0.42],
    [-0.1, 2.6, -0.1, 0.48], [0.5, 2.48, -0.1, 0.44], [0.88, 2.15, -0.12, 0.33],
    [-0.9, 2.12, -0.12, 0.33], [-0.36, 1.52, 0, 0.32], [0.36, 1.52, 0, 0.32],
  ]) part(S(r), W, { parent: h, pos: [x, y, z] });
  const surf = ellipsoidSurf(fc, fr);
  rig.face = face(h, surf, { eyes: 'happy', spread: 0.34, eyeY: 0.1, mouthY: -0.2, blushOut: 0.16, blushY: -0.14 });
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
    stick(m, h, surf(s * 0.74, -0.02, 0.02));
  }
  // 招牌姿勢：右手在頭旁揮手、左手垂下、右腳往後踢
  return finish(root, rig, { armL: [0.5, 0.27], armR: [1.89, 0.75], legL: [0, 0], legR: [0.37, -0.98], expr: 'happy' });
}

// ---------- E 恕恕：如心小蓮花 ----------
function shushu() {
  const root = new THREE.Group();
  const F = '#fde8d2', P = '#f39cb3', PD = '#e57794', GOLD = '#f3b634', SK = '#55b36f', SKD = '#3f9259', FOOT = '#f4a7ab';
  const rig = {};
  for (const s of [-1, 1]) rig[s < 0 ? 'legL' : 'legR'] = makeLeg(root, s, [0.13, 0.5], { len: 0.3, r: 0.12, color: F, shoe: FOOT, shoeR: 0.15 });

  const [upper, g] = pivot(root, 0, 0.5);
  rig.upper = upper;
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
  for (const s of [-1, 1]) rig[s < 0 ? 'armL' : 'armR'] = makeArm(g, s, [0.28, 1.15], { len: 0.3, r: 0.08, color: F, hand: F, handR: 0.1, handScale: [0.8, 1.2, 0.8] });

  // 頭＋蓮花瓣（樞紐在脖子）
  const [head, h] = pivot(g, 0, 1.28);
  rig.head = head;
  const fc = [0, 1.85, 0], fr = [0.62, 0.58, 0.56];
  for (const [layer, color, d, z, sc] of [[0, PD, 0.8, -0.28, [0.25, 0.44, 0.1]], [1, P, 0.72, -0.14, [0.23, 0.4, 0.1]]]) {
    for (let k = 0; k < 12; k++) {
      const th = Math.PI / 2 + (k + layer * 0.5) * (Math.PI * 2 / 12);
      if (Math.sin(th) < -0.55) continue;
      part(S(1), color, { parent: h, pos: [Math.cos(th) * d, fc[1] + Math.sin(th) * d, z], scale: sc, rot: [0, 0, th - Math.PI / 2] });
    }
  }
  part(S(1), F, { parent: h, pos: fc, scale: fr });
  part(S(0.1), GOLD, { parent: h, pos: [0, 2.46, 0.06] });
  rig.face = face(h, ellipsoidSurf(fc, fr), { eyes: 'happy', spread: 0.36, eyeY: 0.06, mouthY: -0.24, blushY: -0.16 });
  // 招牌姿勢：雙手在胸前合攏、右腳往後踢
  return finish(root, rig, { armL: [-0.6, 1.63], armR: [-0.6, 1.63], legL: [0, 0], legR: [0.35, -1.02], expr: 'happy' });
}

export const BUILDERS = { quanquan, zhenzhen, zhongzhong, ruirui, shushu };

// 套用某位角色的招牌姿勢（建立時預設就是這個姿勢）
export function resetPose(rig) {
  const r = rig.rest;
  poseArm(rig.armL, -1, ...r.armL); poseArm(rig.armR, 1, ...r.armR);
  poseLeg(rig.legL, -1, ...r.legL); poseLeg(rig.legR, 1, ...r.legR);
  rig.upper.rotation.set(0, 0, 0);
  rig.head.rotation.set(0, 0, 0);
  rig.body.position.set(0, 0, 0);
  rig.body.rotation.set(0, 0, 0);
  rig.body.scale.set(1, 1, 1);
  rig.face.set(r.expr);
}

export function buildMascot3D(id) {
  const inner = BUILDERS[id]();
  const outer = new THREE.Group();
  outer.name = id;
  outer.add(inner);
  const rig = inner.userData.rig;
  rig.body = inner;
  rig.id = id;
  outer.userData.rig = rig;
  resetPose(rig);
  return outer;
}
