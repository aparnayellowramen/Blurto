// Real-time 3D Blurt o monster (WebGL, three.js).
//
// The monster is built from simple shapes covered in "shell" fur: each furry
// part is drawn as a stack of slightly inflated copies, and a fragment shader
// keeps only the pixels that belong to a strand, thinner towards the tip. That
// gives soft, realistic fur that still renders fast on phones.
//
// upgrade(root) swaps the flat SVG mascots inside `root` for live 3D canvases.
// One shared WebGL renderer draws every visible monster, then copies each frame
// into that monster's own 2D canvas, so the page only ever holds one GL context.

import * as THREE from '../vendor/three.module.min.js';

// ---- Look -----------------------------------------------------------------
const COL = {
  furTop: '#FBFDFF', furBottom: '#CFE3F7',
  horn: '#FFD23F', hornTip: '#FFEC9A',
  rainbow: ['#FFB3CB', '#9FE7D3', '#FFE48C', '#C7B6FF'],
  cheek: '#FF8FA6',
  eye: '#1C100E', mouth: '#3A1613', lip: '#B85A55', tongue: '#FF7F98',
  sketch: '#8E879C',
};
const TAU = Math.PI * 2;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export function supported() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

// ---- Fur shader -----------------------------------------------------------
const NOISE = /* glsl */`
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}`;

const FUR_VERT = /* glsl */`
uniform float uLayer;
uniform float uLen;
uniform float uTime;
uniform float uDroop;
uniform vec3 uWind;
uniform vec4 uSpots[4];
varying vec3 vBase;
varying vec3 vN;
varying vec3 vView;
varying float vMask;
float spotMask(vec3 p) {
  float m = 1.0;
  for (int i = 0; i < 4; i++) {
    vec4 s = uSpots[i];
    if (s.w > 0.0) m = min(m, smoothstep(s.w, s.w * 1.7, distance(p, s.xyz)));
  }
  return m;
}
void main() {
  vec3 n = normalize(normal);
  float mask = spotMask(position);
  float h = uLayer;
  float tip = h * h;
  vec3 p = position + n * (uLen * mask * h);
  vec3 sway = uWind * sin(uTime * 2.3 + position.y * 4.0 + position.x * 3.0);
  p += (vec3(0.0, -uDroop, 0.0) + sway) * uLen * mask * tip;
  vBase = position;
  vMask = mask;
  vN = normalize(normalMatrix * n);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FUR_FRAG = /* glsl */`
uniform float uLayer;
uniform float uDensity;
uniform vec3 uColTop;
uniform vec3 uColBottom;
uniform vec2 uYRange;
uniform float uRainbow;
uniform vec3 uRain[4];
uniform vec4 uCheeks[2];
uniform vec3 uCheekCol;
uniform float uSketch;
uniform vec3 uPaper;
uniform vec3 uKey;
varying vec3 vBase;
varying vec3 vN;
varying vec3 vView;
varying float vMask;
${NOISE}
void main() {
  float h = uLayer;
  if (h > 0.0) {
    if (uSketch > 0.5 || vMask < 0.04) discard;
    float n = noise3(vBase * uDensity) * 0.62 + noise3(vBase * uDensity * 2.7 + 11.0) * 0.38;
    float hh = h / max(vMask, 0.25);
    if (n < mix(0.32, 0.86, clamp(hh, 0.0, 1.0))) discard;
  }
  if (uSketch > 0.5) {
    gl_FragColor = vec4(uPaper, 1.0);
    #include <colorspace_fragment>
    return;
  }
  float g = clamp((vBase.y - uYRange.x) / (uYRange.y - uYRange.x), 0.0, 1.0);
  vec3 col = mix(uColBottom, uColTop, g);
  if (uRainbow > 0.0) {
    for (int i = 0; i < 4; i++) {
      float w = smoothstep(0.6, 0.88, noise3(vBase * 1.15 + vec3(float(i) * 3.1, float(i) * 1.7, 0.0)));
      col = mix(col, uRain[i], w * 0.42 * uRainbow);
    }
  }
  for (int i = 0; i < 2; i++) {
    vec4 c = uCheeks[i];
    if (c.w > 0.0) col = mix(col, uCheekCol, (1.0 - smoothstep(0.0, c.w, distance(vBase, c.xyz))) * 0.8);
  }
  // Soft fur lighting: wrapped diffuse, darker roots, a little sheen and rim.
  vec3 N = normalize(vN);
  vec3 V = normalize(-vView);
  float wrap = clamp((dot(N, uKey) + 0.6) / 1.6, 0.0, 1.0);
  float ao = mix(0.66, 1.0, h);
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
  vec3 lit = col * (0.66 + 0.5 * wrap) * ao;
  lit += col * 0.1 * h + vec3(1.0) * rim * 0.2 * (0.4 + 0.6 * h);
  gl_FragColor = vec4(lit, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Shared uniforms, updated once per frame.
const U = {
  time: { value: 0 },
  sketch: { value: 0 },
  paper: { value: new THREE.Color('#FBF8F3') },
  key: { value: new THREE.Vector3(0, 1, 0) },
  wind: { value: new THREE.Vector3(0.12, 0, 0.06) },
};
const KEY_WORLD = new THREE.Vector3(-0.45, 0.85, 0.55).normalize();

let LAYERS = 20;
const furGroups = [];

function furry(geo, o) {
  const v4 = (arr, n) => Array.from({ length: n }, (_, i) => (arr[i] ? new THREE.Vector4(...arr[i]) : new THREE.Vector4(0, 0, 0, 0)));
  const shared = {
    uLen: { value: o.len },
    uTime: U.time,
    uDroop: { value: o.droop ?? 0.35 },
    uWind: U.wind,
    uSpots: { value: v4(o.spots || [], 4) },
    uDensity: { value: o.density ?? 40 },
    uColTop: { value: new THREE.Color(o.top) },
    uColBottom: { value: new THREE.Color(o.bottom) },
    uYRange: { value: new THREE.Vector2(o.ymin ?? -1, o.ymax ?? 1) },
    uRainbow: { value: o.rainbow ?? 0 },
    uRain: { value: COL.rainbow.map((c) => new THREE.Color(c)) },
    uCheeks: { value: v4(o.cheeks || [], 2) },
    uCheekCol: { value: new THREE.Color(COL.cheek) },
    uSketch: U.sketch,
    uPaper: U.paper,
    uKey: U.key,
  };
  const layers = o.layers ?? LAYERS;
  const group = new THREE.Group();
  for (let i = 0; i < layers; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uLayer: { value: i / (layers - 1) } },
      vertexShader: FUR_VERT,
      fragmentShader: FUR_FRAG,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = i;
    group.add(mesh);
  }
  // Line-art moment: a slightly larger back-face copy draws a clean outline.
  const outline = new THREE.Mesh(geo, OUTLINE_MAT);
  outline.scale.setScalar(o.outline ?? 1.03);
  outline.visible = false;
  group.add(outline);
  furGroups.push(group);
  group.userData.outline = outline;
  return group;
}

let OUTLINE_MAT;

// ---- Shapes ---------------------------------------------------------------
const EGG_Y = 1.18;
const eggW = (y) => 1 + 0.12 * -y; // fuller at the bottom
function eggGeo() {
  const g = new THREE.SphereGeometry(1, 112, 84);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
    const w = eggW(y);
    p.setXYZ(i, x * w, y * EGG_Y, z * w);
    const nn = new THREE.Vector3(x / w, y / EGG_Y, z / w).normalize();
    n.setXYZ(i, nn.x, nn.y, nn.z);
  }
  return g;
}
const eggPoint = (x, y, z) => {
  const d = new THREE.Vector3(x, y, z).normalize();
  const w = eggW(d.y);
  return new THREE.Vector3(d.x * w, d.y * EGG_Y, d.z * w);
};
const eggNormal = (p) => new THREE.Vector3(p.x, p.y / (EGG_Y * EGG_Y), p.z).normalize();

function hornGeo() {
  const pts = [[0.17, 0], [0.165, 0.1], [0.14, 0.22], [0.105, 0.33], [0.065, 0.42], [0.03, 0.48], [0, 0.5]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(pts, 32);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + 0.22 * p.getY(i) ** 2); // curve outwards
  g.computeVertexNormals();
  return g;
}

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...extra });
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stripeTexture(a, b) {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 64;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect(0, i * 8, 8, 8); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- The rig --------------------------------------------------------------
let R = null;

function buildMonster() {
  OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: COL.sketch, side: THREE.BackSide });
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.5;
  root.add(body);

  // Face positions on the egg (front is +z).
  const eyeP = [eggPoint(-0.3, 0.24, 0.93), eggPoint(0.3, 0.24, 0.93)];
  const mouthP = eggPoint(0, -0.07, 1);
  const cheekP = [eggPoint(-0.52, 0.02, 0.85), eggPoint(0.52, 0.02, 0.85)];

  const fur = furry(eggGeo(), {
    len: 0.1, density: 42, top: COL.furTop, bottom: COL.furBottom, ymin: -EGG_Y, ymax: EGG_Y,
    rainbow: 1, spots: [[...eyeP[0].toArray(), 0.15], [...eyeP[1].toArray(), 0.15], [...mouthP.toArray(), 0.2]],
    cheeks: [[...cheekP[0].toArray(), 0.2], [...cheekP[1].toArray(), 0.2]], outline: 1.022,
  });
  body.add(fur);

  // Eyes: glossy beads with a highlight, plus closed "happy" arcs.
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: COL.eye, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1 });
  const glintMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
  const eyes = new THREE.Group();
  const happy = new THREE.Group();
  const eyeBalls = [];
  for (const p of eyeP) {
    const nrm = eggNormal(p);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 24), eyeMat);
    e.position.copy(p).addScaledVector(nrm, -0.015);
    e.scale.set(1, 1.08, 0.75);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), glintMat);
    glint.position.set(0.035, 0.045, 0.075);
    e.add(glint);
    eyes.add(e);
    eyeBalls.push(e);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.019, 10, 28, Math.PI), eyeMat);
    arc.position.copy(p).addScaledVector(nrm, 0.01);
    arc.quaternion.setFromUnitVectors(Z_AXIS, nrm);
    happy.add(arc);
  }
  body.add(eyes, happy);

  // Mouth: the round "o" with a lip, a tongue and one little fang.
  const mouth = new THREE.Group();
  const mouthInner = new THREE.Group();
  mouth.position.copy(mouthP).addScaledVector(eggNormal(mouthP), -0.005);
  mouth.quaternion.setFromUnitVectors(Z_AXIS, eggNormal(mouthP));
  const mouthMat = std(COL.mouth, { roughness: 0.9 });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.15, 40), mouthMat);
  disc.scale.y = 1.08;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.028, 12, 40), std(COL.lip, { roughness: 0.5 }));
  lip.scale.y = 1.08;
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), std(COL.tongue, { roughness: 0.45 }));
  tongue.position.set(0, -0.07, 0.01);
  tongue.scale.set(1, 0.5, 0.35);
  const fang = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 12), std('#FFFFFF', { roughness: 0.3 }));
  fang.rotation.x = Math.PI;
  fang.position.set(-0.055, 0.115, 0.02);
  mouthInner.add(disc, lip, tongue, fang);
  mouth.add(mouthInner);
  body.add(mouth);

  // Horns
  const hornL = furry(hornGeo(), { len: 0.045, density: 60, top: COL.hornTip, bottom: COL.horn, ymin: 0, ymax: 0.5, droop: 0.1, layers: 10, outline: 1.06 });
  const hornR = furry(hornGeo(), { len: 0.045, density: 60, top: COL.hornTip, bottom: COL.horn, ymin: 0, ymax: 0.5, droop: 0.1, layers: 10, outline: 1.06 });
  hornL.position.copy(eggPoint(0.42, 0.86, 0.08)).y -= 0.06;
  hornL.rotation.z = -0.42;
  hornR.position.copy(eggPoint(-0.42, 0.86, 0.08)).y -= 0.06;
  hornR.rotation.z = 0.42;
  hornR.scale.x = -1;
  body.add(hornL, hornR);

  // Arms (pivot at the shoulder)
  const armGeo = new THREE.CapsuleGeometry(0.17, 0.4, 8, 20);
  const mkArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.97, 0.02, 0.02);
    const a = furry(armGeo, { len: 0.06, density: 52, top: COL.hornTip, bottom: COL.horn, ymin: -0.37, ymax: 0.37, droop: 0.2, layers: 11, outline: 1.07 });
    a.position.y = -0.3;
    pivot.add(a);
    body.add(pivot);
    return pivot;
  };
  const armL = mkArm(1);
  const armR = mkArm(-1);

  // Legs (pivot at the hip, under the body)
  const legGeo = new THREE.CapsuleGeometry(0.19, 0.16, 8, 20);
  const mkLeg = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.4, 0.5, 0.02);
    const l = furry(legGeo, { len: 0.05, density: 52, top: COL.hornTip, bottom: COL.horn, ymin: -0.27, ymax: 0.27, droop: 0.15, layers: 10, outline: 1.07 });
    l.position.y = -0.24;
    pivot.add(l);
    root.add(pivot);
    return pivot;
  };
  const legL = mkLeg(1);
  const legR = mkLeg(-1);

  // ---- Props attached to the monster
  const brown = std('#5A3A30', { roughness: 0.4 });
  const glasses = new THREE.Group();
  for (const p of eyeP) {
    const nrm = eggNormal(p);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.018, 10, 36), brown);
    ring.position.copy(p).addScaledVector(nrm, 0.13);
    ring.quaternion.setFromUnitVectors(Z_AXIS, nrm);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), new THREE.MeshStandardMaterial({ color: '#E8F1FF', transparent: true, opacity: 0.22, roughness: 0.1 }));
    lens.position.copy(ring.position);
    lens.quaternion.copy(ring.quaternion);
    glasses.add(ring, lens);
    const temple = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.7), brown);
    temple.position.set(p.x * 1.75, p.y + 0.02, p.z - 0.32);
    temple.rotation.y = Math.sign(p.x) * 0.35;
    glasses.add(temple);
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), brown);
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, eyeP[0].y + 0.03, eyeP[0].z + 0.15);
  glasses.add(bridge);
  body.add(glasses);

  const hat = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 48), std('#FFFFFF', { map: stripeTexture('#FF9DB5', '#FFFFFF'), roughness: 0.7 }));
  cone.position.y = 0.45;
  const pom = furry(new THREE.SphereGeometry(0.1, 32, 24), { len: 0.04, density: 80, top: '#B9F2E2', bottom: '#7FDCC4', ymin: -0.1, ymax: 0.1, layers: 8, droop: 0.1 });
  pom.position.y = 0.92;
  hat.add(cone, pom);
  hat.position.copy(eggPoint(0.08, 1, 0.05)).y -= 0.08;
  hat.rotation.z = -0.28;
  body.add(hat);

  const wingGeo = new THREE.SphereGeometry(0.5, 40, 24);
  wingGeo.scale(1.35, 0.18, 0.75);
  const mkWing = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.5, 0.45, -0.62);
    const w = furry(wingGeo, { len: 0.07, density: 46, top: '#FFFFFF', bottom: '#E7EEFA', ymin: -0.1, ymax: 0.1, layers: 10, droop: 0.05, outline: 1.05 });
    w.position.x = side * 0.5;
    w.rotation.z = side * 0.25;
    pivot.add(w);
    body.add(pivot);
    return pivot;
  };
  const wingL = mkWing(1);
  const wingR = mkWing(-1);

  // Handheld mic, gripped by the handle in the near hand and angled up at the
  // mouth (the angle comes from solving the mic pose's arm position).
  const mic = new THREE.Group();
  const grille = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 24), std('#4A4A55', { roughness: 0.35, metalness: 0.75 }));
  grille.position.y = 0.3;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.133, 16, 12), new THREE.MeshBasicMaterial({ color: '#2A2A33', wireframe: true, transparent: true, opacity: 0.35 }));
  mesh.position.y = 0.3;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.022, 10, 32), std('#E8C35A', { roughness: 0.3, metalness: 0.8 }));
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.24;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.5, 24), std('#1E1E26', { roughness: 0.25, metalness: 0.3 }));
  handle.position.y = -0.02;
  mic.add(grille, mesh, band, handle);
  mic.position.set(0, -0.6, 0);
  mic.rotation.set(1.26, -0.3, -0.41);
  armR.add(mic);

  // Sound waves rippling out in front of the mouth, seen side-on.
  const waves = new THREE.Group();
  waves.position.copy(mouthP).add(new THREE.Vector3(0, 0.02, 0.22));
  const waveArcs = [0, 1, 2].map(() => {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 8, 32, 1.3), new THREE.MeshBasicMaterial({ color: '#8C9AE8', transparent: true, depthWrite: false }));
    arc.rotation.set(0, -Math.PI / 2, -0.65);
    waves.add(arc);
    return arc;
  });
  body.add(waves);

  return { mic, waves, waveArcs, root, body, fur, eyes, eyeBalls, happy, mouth: mouthInner, mouthMats: [mouthMat, eyeMat], armL, armR, legL, legR, hornL, hornR, glasses, hat, wingL, wingR, glints: eyeBalls.map((e) => e.children[0]) };
}

// ---- World props ------------------------------------------------------------
function buildLaptop() {
  const g = new THREE.Group();
  const shell = std('#B8C6FF', { roughness: 0.35, metalness: 0.1 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 0.78), shell);
  base.position.y = 0.03;
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.42), std('#8D9CE6', { roughness: 0.8 }));
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, 0.062, 0.06);
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.06, -0.38);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.78, 0.04), shell);
  lid.position.y = 0.39;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.64), new THREE.MeshBasicMaterial({ color: '#E9F0FF' }));
  screen.position.set(0, 0.39, 0.022);
  hinge.add(lid, screen);
  hinge.rotation.x = -0.32;
  g.add(base, keys, hinge);
  return g;
}

function buildCake() {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.72, 0.05, 48), std('#FFFFFF', { roughness: 0.3 }));
  plate.position.y = 0.025;
  const sponge = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 48), std('#FFE08A', { roughness: 0.8 }));
  sponge.position.y = 0.3;
  const frosting = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.13, 48), std('#FF9DB5', { roughness: 0.5 }));
  frosting.position.y = 0.58;
  g.add(plate, sponge, frosting);
  const flames = [];
  ['#8FB4FF', '#FF8FA3', '#9FE7D3'].forEach((c, i) => {
    const x = (i - 1) * 0.22;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 12), std(c, { roughness: 0.5 }));
    candle.position.set(x, 0.8, 0.05);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: '#FFB347' }));
    flame.scale.set(1, 1.7, 1);
    flame.position.set(x, 1.02, 0.05);
    g.add(candle, flame);
    flames.push(flame);
  });
  g.userData.flames = flames;
  return g;
}

function buildSpeedLines() {
  const g = new THREE.Group();
  const lines = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.75, 4, 8), new THREE.MeshBasicMaterial({ color: i === 1 ? '#B9C3F5' : '#8C9AE8', transparent: true }));
    m.rotation.z = Math.PI / 2;
    m.position.y = 1.2 + i * 0.32;
    g.add(m);
    return m;
  });
  g.userData.lines = lines;
  return g;
}

// ---- Scene, cameras, renderer ----------------------------------------------
let renderer, scene, camFront, camWide, shadow, laptop, cake, speed, pivot;

function init() {
  const weak = (navigator.hardwareConcurrency || 4) <= 4 || Math.min(screen.width, screen.height) < 500;
  LAYERS = weak ? 16 : 22;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x000000, 0);

  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#FFFFFF', '#E9D8C8', 1.6));
  const key = new THREE.DirectionalLight('#FFFFFF', 2.2);
  key.position.copy(KEY_WORLD).multiplyScalar(10);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#DDE8FF', 0.8);
  rim.position.set(3, 2, -6);
  scene.add(rim);

  R = buildMonster();
  pivot = new THREE.Group();
  pivot.add(R.root);
  scene.add(pivot);

  shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.1), new THREE.MeshBasicMaterial({ map: radialTexture(), color: '#98A7F3', transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.003;
  scene.add(shadow);

  laptop = buildLaptop();
  cake = buildCake();
  speed = buildSpeedLines();
  scene.add(laptop, cake, speed);

  camFront = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  camFront.position.set(0, 1.75, 10);
  camFront.lookAt(0, 1.58, 0);
  camWide = new THREE.PerspectiveCamera(27, 1.2, 0.1, 100);
  camWide.position.set(0, 2.0, 11);
  camWide.lookAt(0.1, 1.5, 0);
}

// ---- Posing -----------------------------------------------------------------
const LANDING_TURN = 0.95; // facing right, three-quarter view

function reset() {
  pivot.position.set(0, 0, 0);
  pivot.rotation.set(0, 0, 0);
  R.root.position.set(0, 0, 0);
  R.root.rotation.set(0, 0, 0);
  R.body.position.set(0, 1.5, 0);
  R.body.rotation.set(0, 0, 0);
  R.body.scale.set(1, 1, 1);
  R.armL.position.set(0.97, 0.02, 0.02);
  R.armR.position.set(-0.97, 0.02, 0.02);
  R.armL.rotation.set(0, 0, 0.14);
  R.armR.rotation.set(0, 0, -0.14);
  R.legL.rotation.set(0, 0, 0);
  R.legR.rotation.set(0, 0, 0);
  R.legL.position.y = 0.5;
  R.legR.position.y = 0.5;
  R.mouth.scale.set(1, 1, 1);
  R.eyes.visible = true;
  R.eyes.scale.set(1, 1, 1);
  R.eyes.position.set(0, 0, 0);
  R.happy.visible = false;
  R.glasses.visible = false;
  R.hat.visible = false;
  R.wingL.visible = R.wingR.visible = false;
  R.mic.visible = R.waves.visible = false;
  laptop.visible = cake.visible = speed.visible = false;
  shadow.position.set(0, 0.003, 0.05);
  shadow.scale.set(1, 1, 1);
  shadow.material.opacity = 0.85;
  shadow.material.color.set('#98A7F3');
  U.wind.value.set(0.12, 0, 0.06);
  setSketch(false);
}

let sketchOn = false;
function setSketch(on) {
  if (on === sketchOn) return;
  sketchOn = on;
  U.sketch.value = on ? 1 : 0;
  for (const g of furGroups) g.userData.outline.visible = on;
  R.mouthMats.forEach((m) => { m.userData.c ??= m.color.clone(); m.color.copy(on ? new THREE.Color(COL.sketch) : m.userData.c); });
  R.glints.forEach((g) => { g.visible = !on; });
  R.mouth.children.forEach((c, i) => { if (i > 0) c.visible = !on; });
}

function shut(on) {
  R.eyes.visible = !on;
  R.happy.visible = on;
}

function blink(t) {
  const b = t % 3.7;
  R.eyes.scale.y = b < 0.13 ? 0.15 : 1;
}

function poseFront(mood, t) {
  reset();
  const s = Math.sin(t * 2.1);
  if (mood === 'idle' || mood === 'logo') {
    R.body.position.y = 1.5 + s * 0.025;
    R.body.scale.set(1 - s * 0.006, 1 + s * 0.01, 1 - s * 0.006);
    R.armL.rotation.z = 0.14 + s * 0.04;
    R.armR.rotation.z = -0.14 - s * 0.04;
    if (mood === 'logo') R.mouth.scale.setScalar(1.35);
    else blink(t);
  } else if (mood === 'curious') {
    R.root.rotation.y = 0.32;
    R.body.rotation.z = 0.1 + Math.sin(t * 1.3) * 0.03;
    R.body.position.y = 1.5 + s * 0.02;
    R.eyes.position.x = 0.02;
    R.mouth.scale.setScalar(0.62);
    R.armR.rotation.set(-0.5, 0, -0.3);
    blink(t + 1.3);
  } else if (mood === 'speak') {
    R.mouth.scale.set(1 + Math.abs(Math.sin(t * 7.5)) * 0.25, 0.8 + Math.abs(Math.sin(t * 7.5)) * 0.55, 1);
    R.body.position.y = 1.5 + Math.abs(Math.sin(t * 3.7)) * 0.03;
    R.armR.rotation.set(-0.45 + Math.sin(t * 3.7) * 0.3, 0, -0.35);
    R.armL.rotation.set(-0.2 - Math.sin(t * 3.7) * 0.15, 0, 0.3);
    blink(t);
  } else if (mood === 'cheer') {
    shut(true);
    const hop = Math.abs(Math.sin(t * 4.5));
    R.root.position.y = hop * 0.24;
    R.body.scale.set(1 + (1 - hop) * 0.025, 1 - (1 - hop) * 0.035, 1 + (1 - hop) * 0.025);
    R.armL.rotation.z = 2.4 + Math.sin(t * 9) * 0.22;
    R.armR.rotation.z = -2.4 - Math.sin(t * 9) * 0.22;
    R.mouth.scale.setScalar(1.25);
    shadow.scale.setScalar(1 - hop * 0.18);
  }
  U.wind.value.set(0.08 + Math.sin(t) * 0.04, 0, 0.05);
}

// Landing loop, timed to the reference recording (ms per step).
const STEPS = [
  ['study', 380, ''],
  ['party', 400, ''],
  ['mic', 520, ''],
  ['fly', 420, ''],
  ['trot', 1700, 'shut'],
  ['trot', 420, 'shut sketch'],
  ['trot', 700, ''],
];

function poseLanding(step, t) {
  reset();
  const [name, , mods] = step;
  pivot.rotation.y = LANDING_TURN;
  if (name === 'study') {
    pivot.position.set(-0.75, 0, 0);
    R.glasses.visible = true;
    laptop.visible = true;
    laptop.position.set(0.55, 0, 0.75);
    laptop.rotation.y = LANDING_TURN + Math.PI;
    const tap = Math.sin(t * 17.5);
    R.armR.rotation.set(-1.15 + tap * 0.12, 0.2, -0.1);
    R.armL.rotation.set(-0.9 - tap * 0.1, -0.2, 0.1);
    R.body.position.y = 1.5 + tap * 0.008;
    R.eyes.position.y = -0.012;
    shadow.position.x = -0.4;
    shadow.scale.set(1.25, 1, 1.1);
  } else if (name === 'party') {
    pivot.position.set(-0.9, 0, -0.1);
    R.hat.visible = true;
    cake.visible = true;
    cake.position.set(1.05, 0, 0.55);
    cake.userData.flames.forEach((f, i) => { const k = 1 + Math.sin(t * 26 + i * 2) * 0.12; f.scale.set(k, 1.7 * k, k); });
    R.body.position.y = 1.32;
    R.body.rotation.x = -0.14;
    R.body.rotation.z = Math.sin(t * 7.85) * 0.05;
    R.legL.rotation.x = R.legR.rotation.x = -1.35;
    R.legL.position.y = R.legR.position.y = 0.36;
    R.armL.rotation.z = 2.35 + Math.sin(t * 7.85) * 0.18;
    R.armR.rotation.z = -2.35 - Math.sin(t * 7.85) * 0.18;
    R.mouth.scale.setScalar(1.15);
    shadow.position.x = 0.1;
    shadow.scale.set(1.5, 1, 1.2);
  } else if (name === 'mic') {
    // Talking into a handheld mic: near hand holds it up, the other gestures.
    pivot.position.set(-0.35, 0, 0);
    R.mic.visible = R.waves.visible = true;
    const talk = Math.abs(Math.sin(t * 9.5));
    R.mouth.scale.set(1 + talk * 0.2, 0.75 + talk * 0.6, 1);
    R.body.position.y = 1.5 + Math.abs(Math.sin(t * 4.75)) * 0.035;
    R.body.rotation.x = -0.06;
    // The shoulder slides forward for this pose so the stubby arm can reach the chin.
    R.armR.position.set(-0.66, -0.05, 0.72);
    R.armR.rotation.set(-1.2 + Math.sin(t * 4.75) * 0.04, 0.65, 0.7);
    R.armL.rotation.set(-0.6 + Math.sin(t * 4.75) * 0.35, 0, 0.55 + Math.sin(t * 4.75) * 0.2);
    R.waveArcs.forEach((arc, i) => {
      const k = ((t * 2.2) + i / 3) % 1;
      arc.position.z = k * 0.45;
      arc.scale.setScalar(0.7 + k * 0.9);
      arc.material.opacity = Math.sin(k * Math.PI) * 0.9;
    });
    blink(t);
  } else if (name === 'fly') {
    pivot.position.set(0.15, 0.55 + Math.sin(t * 7.85) * 0.07, 0);
    R.body.rotation.x = 0.3;
    R.legL.rotation.x = R.legR.rotation.x = 1.15;
    R.armL.rotation.set(-1.35, 0, 0.25);
    R.armR.rotation.set(-1.35, 0, -0.25);
    R.wingL.visible = R.wingR.visible = true;
    // Wings raised so their broad side faces the camera, beating fast.
    const flap = Math.sin(t * 22.4);
    R.wingL.rotation.set(0, -0.35, 0.95 + flap * 0.4);
    R.wingR.rotation.set(0, 0.35, -0.95 - flap * 0.4);
    R.mouth.scale.set(1.1, 1.2, 1);
    speed.visible = true;
    speed.position.set(-1.9, 0.55, 0.3);
    speed.userData.lines.forEach((m, i) => {
      const k = ((t * 3.1) + i * 0.37) % 1;
      m.position.x = -k * 1.1;
      m.material.opacity = Math.sin(k * Math.PI);
    });
    U.wind.value.set(-0.6, 0.1, 0);
    shadow.position.x = 0.15;
    shadow.scale.setScalar(0.72 - Math.sin(t * 7.85) * 0.05);
    shadow.material.opacity = 0.4;
  } else {
    // Trot: legs in turn, each foot lifting as it swings forward.
    const ph = (t / 0.44) * TAU;
    const sw = Math.sin(ph);
    const up = Math.abs(Math.cos(ph));
    R.legL.rotation.x = sw * 0.55;
    R.legR.rotation.x = -sw * 0.55;
    R.legL.position.y = 0.5 + Math.max(0, -Math.cos(ph)) * 0.08;
    R.legR.position.y = 0.5 + Math.max(0, Math.cos(ph)) * 0.08;
    R.armL.rotation.x = -sw * 0.5;
    R.armR.rotation.x = sw * 0.5;
    R.body.position.y = 1.5 + up * 0.065;
    R.body.scale.set(1 + (1 - up) * 0.012, 1 - (1 - up) * 0.02, 1 + (1 - up) * 0.012);
    R.body.rotation.x = 0.04;
    U.wind.value.set(-0.2, 0.05, -0.1);
    shadow.scale.set(1 - up * 0.06, 1, 1);
    if (mods.includes('shut')) shut(true);
    if (mods.includes('sketch')) {
      setSketch(true);
      shadow.material.color.set('#D3E6F5');
    }
  }
  // The ground shadow always sits under the monster.
  shadow.position.x = pivot.position.x + (name === 'study' ? 0.25 : name === 'party' ? 0.55 : name === 'mic' ? 0.1 : 0);
  shadow.position.z = pivot.position.z + 0.1;
}

// ---- Views and the render loop -------------------------------------------------
const views = new Set();
let running = false;
let reduce = false;
const t0 = performance.now();

function frameView(v, now) {
  const dpr = Math.min(window.devicePixelRatio || 1, LAYERS < 20 ? 1.5 : 2);
  const cw = v.canvas.clientWidth;
  if (!cw) return;
  const w = Math.round(cw * dpr);
  const h = Math.round(w / v.aspect);
  if (v.canvas.width !== w || v.canvas.height !== h) { v.canvas.width = w; v.canvas.height = h; v.drawn = false; }
  if (v.static && v.drawn) return;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (size.x < w || size.y < h) renderer.setSize(Math.max(size.x, w), Math.max(size.y, h), false);
  const bufH = renderer.getDrawingBufferSize(new THREE.Vector2()).y;

  const t = reduce ? 0.6 : (now - t0) / 1000;
  U.time.value = t;
  let cam = camFront;
  if (v.kind === 'landing') {
    cam = camWide;
    if (!reduce) {
      const s = v.loop;
      if (now - s.at > STEPS[s.i][1]) {
        const prevName = STEPS[s.i][0];
        s.i = (s.i + 1) % STEPS.length;
        s.at = now;
        if (STEPS[s.i][0] !== prevName) { // a scene change: keep the last frame as a ghost
          s.ghost.width = v.canvas.width; s.ghost.height = v.canvas.height;
          s.ghost.getContext('2d').drawImage(v.canvas, 0, 0);
          s.ghostAt = now;
          s.ghostDir = prevName === 'study' || prevName === 'party' || prevName === 'mic' ? 1 : -1;
        }
      }
      poseLanding(STEPS[s.i], t);
    } else {
      poseLanding(['trot', 0, ''], 0);
    }
  } else {
    poseFront(v.mood, t);
  }
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  U.key.value.copy(KEY_WORLD).transformDirection(cam.matrixWorldInverse);
  renderer.setViewport(0, 0, w, h);
  renderer.setScissor(0, 0, w, h);
  renderer.setScissorTest(true);
  renderer.clear();
  renderer.render(scene, cam);
  const ctx = v.ctx;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(renderer.domElement, 0, bufH - h, w, h, 0, 0, w, h);
  if (v.loop && v.loop.ghostAt) {
    const k = (now - v.loop.ghostAt) / 130;
    if (k < 1) {
      ctx.globalAlpha = 0.55 * (1 - k);
      ctx.drawImage(v.loop.ghost, v.loop.ghostDir * k * 16 * dpr, 0);
      ctx.globalAlpha = 1;
    } else v.loop.ghostAt = 0;
  }
  v.drawn = true;
}

function loop() {
  if (!running) return;
  const now = performance.now();
  let animated = false;
  for (const v of views) {
    if (!v.canvas.isConnected) { views.delete(v); continue; }
    frameView(v, now);
    if (!v.static) animated = true;
  }
  if (animated && !reduce && !document.hidden) requestAnimationFrame(loop);
  else running = false;
}

function start() {
  if (running) return;
  running = true;
  requestAnimationFrame(loop);
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
window.addEventListener('resize', () => { for (const v of views) v.drawn = false; start(); });

/** Replace the flat SVG monsters inside `root` with live 3D ones. */
export function upgrade(root) {
  if (!renderer) {
    try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { reduce = false; }
    init();
  }
  // Line art is drawn on the page's own background colour (light or dark).
  try { U.paper.value.set(getComputedStyle(document.body).backgroundColor); } catch { /* keep default */ }
  root.querySelectorAll('svg.mascot, svg.side-scene').forEach((svg) => {
    const landing = svg.classList.contains('side-scene');
    const mood = landing ? 'landing' : ([...svg.classList].find((c) => c.startsWith('m-')) || 'm-idle').slice(2);
    const vb = svg.viewBox.baseVal;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('class', `${svg.getAttribute('class')} m3d`);
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = vb.width * 4;
    canvas.height = vb.height * 4;
    svg.replaceWith(canvas);
    views.add({
      canvas,
      ctx: canvas.getContext('2d'),
      kind: landing ? 'landing' : 'front',
      mood,
      aspect: vb.width / vb.height,
      static: mood === 'logo',
      drawn: false,
      loop: landing ? { i: 0, at: performance.now(), ghost: document.createElement('canvas'), ghostAt: 0, ghostDir: 1 } : null,
    });
  });
  start();
}
