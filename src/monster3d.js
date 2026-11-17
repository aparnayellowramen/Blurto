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
};
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** The intro's jump: three hops, the last one biggest. Shared with app.js. */
export const JUMP = { period: 0.72, count: 3 };

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
uniform vec3 uKey;
uniform vec3 uFog;
uniform float uFogAmt;
varying vec3 vBase;
varying vec3 vN;
varying vec3 vView;
varying float vMask;
${NOISE}
void main() {
  float h = uLayer;
  if (h > 0.0) {
    if (vMask < 0.04) discard;
    float n = noise3(vBase * uDensity) * 0.62 + noise3(vBase * uDensity * 2.7 + 11.0) * 0.38;
    float hh = h / max(vMask, 0.25);
    if (n < mix(0.32, 0.86, clamp(hh, 0.0, 1.0))) discard;
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
  // Distant background puffs fade into the page colour.
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFog, uFogAmt);
  #include <colorspace_fragment>
}`;

// Shared uniforms, updated once per frame.
const U = {
  time: { value: 0 },
  key: { value: new THREE.Vector3(0, 1, 0) },
  wind: { value: new THREE.Vector3(0.12, 0, 0.06) },
  fog: { value: new THREE.Color('#FBF8F3') },
};
const KEY_WORLD = new THREE.Vector3(-0.45, 0.85, 0.55).normalize();

let LAYERS = 20;

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
    uKey: U.key,
    uFog: U.fog,
    uFogAmt: { value: o.fog ?? 0 },
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
  return group;
}

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

// ---- The rig --------------------------------------------------------------
let R = null;

function buildMonster() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.5;
  root.add(body);

  // Face positions on the egg (front is +z).
  const eyeP = [eggPoint(-0.3, 0.24, 0.93), eggPoint(0.3, 0.24, 0.93)];
  const mouthP = eggPoint(0, -0.07, 1);
  const cheekP = [eggPoint(-0.52, 0.02, 0.85), eggPoint(0.52, 0.02, 0.85)];

  body.add(furry(eggGeo(), {
    len: 0.1, density: 42, top: COL.furTop, bottom: COL.furBottom, ymin: -EGG_Y, ymax: EGG_Y,
    rainbow: 1, spots: [[...eyeP[0].toArray(), 0.15], [...eyeP[1].toArray(), 0.15], [...mouthP.toArray(), 0.2]],
    cheeks: [[...cheekP[0].toArray(), 0.2], [...cheekP[1].toArray(), 0.2]],
  }));

  // Eyes: glossy beads with a highlight, plus closed "happy" arcs.
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: COL.eye, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1 });
  const glintMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
  const eyes = new THREE.Group();
  const happy = new THREE.Group();
  for (const p of eyeP) {
    const nrm = eggNormal(p);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 24), eyeMat);
    e.position.copy(p).addScaledVector(nrm, -0.015);
    e.scale.set(1, 1.08, 0.75);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), glintMat);
    glint.position.set(0.035, 0.045, 0.075);
    e.add(glint);
    eyes.add(e);
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
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.15, 40), std(COL.mouth, { roughness: 0.9 }));
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
  const horn = () => furry(hornGeo(), { len: 0.045, density: 60, top: COL.hornTip, bottom: COL.horn, ymin: 0, ymax: 0.5, droop: 0.1, layers: 10 });
  const hornL = horn();
  const hornR = horn();
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
    const a = furry(armGeo, { len: 0.06, density: 52, top: COL.hornTip, bottom: COL.horn, ymin: -0.37, ymax: 0.37, droop: 0.2, layers: 11 });
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
    const l = furry(legGeo, { len: 0.05, density: 52, top: COL.hornTip, bottom: COL.horn, ymin: -0.27, ymax: 0.27, droop: 0.15, layers: 10 });
    l.position.y = -0.24;
    pivot.add(l);
    root.add(pivot);
    return pivot;
  };
  const legL = mkLeg(1);
  const legR = mkLeg(-1);

  return { root, body, eyes, happy, mouth: mouthInner, armL, armR, legL, legR };
}

// ---- Scene, cameras, renderer ----------------------------------------------
let renderer, scene, shadow, platform;
const cams = {};

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
  scene.add(R.root);

  shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.1), new THREE.MeshBasicMaterial({ map: radialTexture(), color: '#98A7F3', transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, 0.003, 0.05);
  scene.add(shadow);

  // A frosted glass platform for the picker page's hero monster to stand on.
  platform = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.15, 0.2, 96), new THREE.MeshPhysicalMaterial({
    color: '#F4EDFF', transparent: true, opacity: 0.5, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15, depthWrite: false,
  }));
  glass.position.y = -0.1;
  const rimTop = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.035, 12, 120), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.85 }));
  rimTop.rotation.x = Math.PI / 2;
  const inner = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.62, 96), new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.002;
  platform.add(glass, rimTop, inner);
  platform.renderOrder = -1;
  scene.add(platform);

  // Front view for the small monsters, and a taller frame for the jumping intro.
  cams.front = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  cams.front.position.set(0, 1.75, 10);
  cams.front.lookAt(0, 1.58, 0);
  cams.intro = new THREE.PerspectiveCamera(28, 0.75, 0.1, 100);
  cams.intro.position.set(0, 2.25, 9.2);
  cams.intro.lookAt(0, 2.1, 0);
  // Looking slightly down, so the platform reads as a disc.
  cams.hero = new THREE.PerspectiveCamera(27, 1, 0.1, 100);
  cams.hero.position.set(0, 3.4, 10.6);
  cams.hero.lookAt(0, 1.35, 0);
  buildBackground();
}

// ---- Background: floating fluff puffs ------------------------------------------
// Soft pastel puffs in the monster's fur, drifting at different depths. Their
// x/y are fractions of the visible area at their depth, so they frame any screen.
// [x, y, z, size, colour, speed]
const PUFFS = [
  [-0.98, 0.8, -1, 0.55, 0, 1], [0.92, 0.58, -3, 0.78, 1, 0.8], [-0.86, -0.12, 1.5, 0.42, 2, 1.2],
  [1.02, -0.42, 0, 0.5, 3, 0.9], [-0.3, 1.02, -6, 0.95, 1, 0.6], [0.36, -1.02, -2, 0.66, 0, 1],
  [-1.04, -0.86, -4, 0.82, 3, 0.7], [0.62, 0.98, 2, 0.34, 2, 1.3], [0.08, 0.22, -9, 1.15, 0, 0.5],
  [0.96, 0.1, -7, 1.0, 2, 0.55], [-0.55, 0.42, -8, 0.9, 3, 0.6],
];
// Pink, lilac, orange and plum, like balls of yarn.
const PUFF_COLS = [['#FFC2DE', '#F28CBF'], ['#D9C8FF', '#A98BEA'], ['#FFC79A', '#F59A52'], ['#C9A8F0', '#8F68D9']];
let bgScene;
const puffs = [];
const lean = { x: 0, y: 0, tx: 0, ty: 0 };

function buildBackground() {
  bgScene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(1, 48, 32);
  for (const [fx, fy, z, size, ci, speed] of PUFFS) {
    const [top, bottom] = PUFF_COLS[ci];
    const g = furry(geo, {
      len: 0.16, density: 26, top, bottom, ymin: -1, ymax: 1, droop: 0.25, layers: 9,
      fog: THREE.MathUtils.clamp(0.3 + (2 - z) * 0.05, 0.25, 0.8),
    });
    g.scale.setScalar(size);
    g.userData = { fx, fy, z, speed, phase: fx * 3.1 + fy * 1.7, fog: g.children[0].material.uniforms.uFogAmt };
    g.userData.fogBase = g.userData.fog.value;
    bgScene.add(g);
    puffs.push(g);
  }
  cams.bg = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  cams.bg.position.set(0, 0, 10);
  // Lean with the mouse, or with the phone's tilt where the browser allows it.
  window.addEventListener('pointermove', (e) => {
    lean.tx = (e.clientX / innerWidth) * 2 - 1;
    lean.ty = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
  window.addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    lean.tx = THREE.MathUtils.clamp(e.gamma / 30, -1, 1);
    lean.ty = THREE.MathUtils.clamp((e.beta - 45) / 30, -1, 1);
  }, { passive: true });
}

function poseBackground(t, aspect) {
  const halfH = (z) => (10 - z) * Math.tan(THREE.MathUtils.degToRad(25));
  for (const g of puffs) {
    const { fx, fy, z, speed, phase } = g.userData;
    const h = halfH(z);
    g.position.set(
      fx * h * aspect + Math.cos(t * 0.17 * speed + phase) * 0.3,
      fy * h + Math.sin(t * 0.23 * speed + phase) * 0.38,
      z,
    );
    g.rotation.set(Math.sin(t * 0.1 * speed + phase) * 0.4, t * 0.12 * speed + phase, 0);
  }
  lean.x += (lean.tx - lean.x) * 0.04;
  lean.y += (lean.ty - lean.y) * 0.04;
  cams.bg.position.set(lean.x * 0.7, -lean.y * 0.5, 10);
  cams.bg.lookAt(0, 0, 0);
  U.wind.value.set(0.1 + Math.sin(t * 0.7) * 0.05, 0.03, 0.05);
}

// The page colour changes per phase (Learn, Speak); keep the fade colour in step.
let toneCheck = 0;
function syncFog() {
  if (toneCheck-- > 0) return;
  toneCheck = 20;
  try { U.fog.value.set(getComputedStyle(document.body).backgroundColor); } catch { return; }
  // On a dark page bright pastels pop too much, so they sink further back.
  const hsl = U.fog.value.getHSL({});
  const extra = hsl.l < 0.3 ? 0.3 : 0;
  for (const g of puffs) g.userData.fog.value = Math.min(0.92, g.userData.fogBase + extra);
}

// ---- Posing -----------------------------------------------------------------
function reset() {
  R.root.position.set(0, 0, 0);
  R.root.rotation.set(0, 0, 0);
  R.body.position.set(0, 1.5, 0);
  R.body.rotation.set(0, 0, 0);
  R.body.scale.set(1, 1, 1);
  R.armL.rotation.set(0, 0, 0.14);
  R.armR.rotation.set(0, 0, -0.14);
  R.legL.rotation.set(0, 0, 0);
  R.legR.rotation.set(0, 0, 0);
  R.mouth.scale.set(1, 1, 1);
  R.eyes.visible = true;
  R.eyes.scale.set(1, 1, 1);
  R.eyes.position.set(0, 0, 0);
  R.happy.visible = false;
  shadow.scale.set(1, 1, 1);
  shadow.material.opacity = 0.85;
  platform.visible = false;
}

function shut(on) {
  R.eyes.visible = !on;
  R.happy.visible = on;
}

function blink(t) {
  R.eyes.scale.y = t % 3.7 < 0.13 ? 0.15 : 1;
}

/** Squash or stretch the body while keeping its bottom on the ground. */
function squash(sy) {
  const sx = 1 / Math.sqrt(sy);
  R.body.scale.set(sx, sy, sx);
  R.body.position.y = 1.5 - (1 - sy) * EGG_Y;
}

const ease = (k) => k * k * (3 - 2 * k);

/** Three hops: crouch, spring up with arms raised, land with a squash. */
function poseJump(t) {
  const { period, count } = JUMP;
  const n = Math.floor(t / period);
  if (n >= count) { // after the jumps: a happy settle
    blink(t);
    R.body.position.y = 1.5 + Math.sin(t * 2.1) * 0.025;
    return;
  }
  const p = (t % period) / period;
  const H = n === count - 1 ? 1.3 : 0.85;
  let y = 0; let sy = 1; let air = 0;
  if (p < 0.2) { // crouch
    sy = 1 - 0.14 * ease(p / 0.2);
  } else if (p < 0.64) { // airborne
    const k = (p - 0.2) / 0.44;
    y = H * 4 * k * (1 - k);
    air = Math.sin(k * Math.PI);
    sy = 1 + 0.1 * Math.abs(1 - 2 * k) - 0.02;
  } else if (p < 0.8) { // landing squash
    sy = 1 - 0.15 * Math.sin(((p - 0.64) / 0.16) * Math.PI);
  }
  R.root.position.y = y;
  squash(sy);
  const crouch = p < 0.2 ? ease(p / 0.2) : 0;
  R.armL.rotation.set(0.25 * crouch, 0, 0.14 + air * 2.1 - crouch * 0.1);
  R.armR.rotation.set(0.25 * crouch, 0, -0.14 - air * 2.1 + crouch * 0.1);
  R.legL.rotation.set(-air * 0.25, 0, -air * 0.18);
  R.legR.rotation.set(-air * 0.25, 0, air * 0.18);
  R.mouth.scale.setScalar(1 + air * 0.4);
  if (n === count - 1 && air > 0.55) shut(true);
  shadow.scale.setScalar(1 - (y / 1.3) * 0.45);
  shadow.material.opacity = 0.85 - (y / 1.3) * 0.5;
  U.wind.value.set(0.05, -air * 0.4 + (sy < 1 ? 0.2 : 0), 0.05);
}

function pose(mood, t) {
  reset();
  const s = Math.sin(t * 2.1);
  U.wind.value.set(0.08 + Math.sin(t) * 0.04, 0, 0.05);
  if (mood === 'jump') {
    poseJump(t);
  } else if (mood === 'hero') {
    // Standing on the glass platform: breathing, blinking, and a little wave now and then.
    R.body.position.y = 1.5 + s * 0.03;
    R.body.scale.set(1 - s * 0.006, 1 + s * 0.012, 1 - s * 0.006);
    R.root.rotation.y = -0.18 + Math.sin(t * 0.5) * 0.06;
    const w = t % 5.5;
    const wave = w < 1.4 ? Math.sin((w / 1.4) * Math.PI) : 0;
    R.armR.rotation.set(0, 0, -0.14 - wave * 2.3 - wave * Math.sin(t * 14) * 0.25);
    R.armL.rotation.z = 0.14 + s * 0.04;
    R.mouth.scale.setScalar(1 + wave * 0.3);
    if (wave > 0.4) shut(true); else blink(t);
    shadow.material.opacity = 0.6;
  } else if (mood === 'idle' || mood === 'logo') {
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
    const talk = Math.abs(Math.sin(t * 7.5));
    R.mouth.scale.set(1 + talk * 0.25, 0.8 + talk * 0.55, 1);
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
}

// ---- Views and the render loop -------------------------------------------------
const views = new Set();
let running = false;
let reduce = false;
const t0 = performance.now();

function frameView(v, now) {
  const bg = v.kind === 'bg';
  // The full-screen background renders at a lower resolution: it's soft anyway.
  const dpr = Math.min(window.devicePixelRatio || 1, bg ? 1.25 : LAYERS < 20 ? 1.5 : 2);
  const cw = v.canvas.clientWidth;
  if (!cw) return;
  const w = Math.round(cw * dpr);
  const h = bg ? Math.round(v.canvas.clientHeight * dpr) : Math.round(w / v.aspect);
  if (v.canvas.width !== w || v.canvas.height !== h) { v.canvas.width = w; v.canvas.height = h; v.drawn = false; }
  if (v.static && v.drawn) return;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  if (size.x < w || size.y < h) renderer.setSize(Math.max(size.x, w), Math.max(size.y, h), false);
  const bufH = renderer.getDrawingBufferSize(new THREE.Vector2()).y;

  // The jump plays from the moment its monster appears; other moods share one clock.
  const t = reduce ? 0.6 : (now - (v.mood === 'jump' ? v.born : t0)) / 1000;
  U.time.value = t;
  let cam;
  if (bg) {
    syncFog();
    poseBackground(t, w / h);
    cam = cams.bg;
  } else {
    pose(v.mood, t);
    // Monsters on a page's stage stand on the glass platform, seen from slightly above.
    platform.visible = v.stage;
    cam = v.mood === 'jump' ? cams.intro : v.stage ? cams.hero : cams.front;
  }
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  U.key.value.copy(KEY_WORLD).transformDirection(cam.matrixWorldInverse);
  renderer.setViewport(0, 0, w, h);
  renderer.setScissor(0, 0, w, h);
  renderer.setScissorTest(true);
  renderer.clear();
  renderer.render(bg ? bgScene : scene, cam);
  v.ctx.clearRect(0, 0, w, h);
  v.ctx.drawImage(renderer.domElement, 0, bufH - h, w, h, 0, 0, w, h);
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

function ensureInit() {
  if (renderer) return;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { reduce = false; }
  init();
}

/** Start the floating-puffs background behind the whole app (once). */
export function background() {
  ensureInit();
  if (document.querySelector('canvas.bg3d')) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'bg3d';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  views.add({ canvas, ctx: canvas.getContext('2d'), kind: 'bg', mood: 'bg', aspect: 1, static: false, drawn: false, born: performance.now() });
  start();
}

/** Replace the flat SVG monsters inside `root` with live 3D ones. */
export function upgrade(root) {
  ensureInit();
  root.querySelectorAll('svg.mascot:not(.flat)').forEach((svg) => { // tiny avatars stay flat
    const mood = ([...svg.classList].find((c) => c.startsWith('m-')) || 'm-idle').slice(2);
    const vb = svg.viewBox.baseVal;
    const aspect = mood === 'jump' ? 0.75 : vb.width / vb.height;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('class', `${svg.getAttribute('class')} m3d`);
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = 400;
    canvas.height = Math.round(400 / aspect);
    svg.replaceWith(canvas);
    const onStage = svg.classList.contains('hero');
    views.add({ canvas, ctx: canvas.getContext('2d'), mood, aspect, stage: onStage, static: mood === 'logo', drawn: false, born: performance.now() });
  });
  start();
}
