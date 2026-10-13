import * as THREE from "three";
import { TREE_MAX_LEVEL } from "../../lib/tree";

/**
 * 神殿の 3D シーン（#93）。初代 PS / FF7 風のローポリ。
 * - 低い解像度で描いて拡大（ドットが見える）、頂点を画面の格子に吸着させて PS1 らしいカクつきを出す
 * - キャラ・神殿・木はすべてコードで組み立てる（外部の 3D モデルや画像は使わない）
 * React からは new TempleScene(host, callbacks) で作り、dispose() で片付ける。
 */

/** 描画する縦の解像度（px）。これを画面いっぱいに拡大する */
const RENDER_HEIGHT = 270;
/** 移動の速さ（1 秒あたり） */
const SPEED = 4.2;
/** 歩ける範囲（中心からの距離） */
const WALK_RADIUS = 13;
/** 木の台座の半径（ここより内側には入れない） */
const DAIS_RADIUS = 3.7;
/** 木にこの距離まで近づくと「捧げる」ボタンが出る */
const NEAR_RADIUS = 5.2;
const PLAYER_RADIUS = 0.4;
const PILLAR_RING = 11;
const PILLAR_RADIUS = 0.8;
const CAMERA_OFFSET = new THREE.Vector3(0, 5.4, 7.4);

export interface SceneCallbacks {
  /** 木の近くに入った / 離れた */
  onNear(near: boolean): void;
}

// ---------------------------------------------------------------------------
// PS1 風の材質: フラットシェーディング＋頂点の格子吸着
// ---------------------------------------------------------------------------
const snapUniform = { value: new THREE.Vector2(160, 120) };

function ps1(color: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) {
  const mat = new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = snapUniform;
    shader.vertexShader =
      "uniform vec2 uSnap;\n" +
      shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        gl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;`,
      );
  };
  return mat;
}

function glow(color: number, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    blending: opacity < 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: opacity >= 1,
  });
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** 毎回同じ形になる乱数（木の枝葉の位置をレベルごとに固定するため） */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// 神殿
// ---------------------------------------------------------------------------
function buildTemple(): { group: THREE.Group; torches: THREE.PointLight[]; flames: THREE.Mesh[] } {
  const g = new THREE.Group();
  const stone = ps1(0x2b2840);
  const stoneLight = ps1(0x3a3556);
  const pillarMat = ps1(0x4a4466);

  // 床（八角形）と内側の輪、入口からの道
  g.add(mesh(new THREE.CylinderGeometry(15, 15, 0.5, 8), stone, 0, -0.25, 0));
  g.add(mesh(new THREE.CylinderGeometry(9, 9, 0.04, 8), ps1(0x332f4c), 0, 0.02, 0));
  g.add(mesh(new THREE.BoxGeometry(2.4, 0.06, 8), stoneLight, 0, 0.03, 9));

  // 台座（2 段）と土
  g.add(mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.35, 8), ps1(0x48426a), 0, 0.175, 0));
  g.add(mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.35, 8), ps1(0x564f7c), 0, 0.525, 0));
  g.add(mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.1, 8), ps1(0x3a2a1c), 0, 0.72, 0));

  // 台座を囲む光る紋様
  const rune = glow(0x5fd0ff, 0.55);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r = mesh(new THREE.BoxGeometry(0.5, 0.03, 0.18), rune, Math.sin(a) * 4.4, 0.05, Math.cos(a) * 4.4);
    r.rotation.y = a;
    g.add(r);
  }

  // 柱（8 本）
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.sin(a) * PILLAR_RING;
    const z = Math.cos(a) * PILLAR_RING;
    g.add(mesh(new THREE.BoxGeometry(1.7, 0.5, 1.7), stoneLight, x, 0.25, z));
    g.add(mesh(new THREE.CylinderGeometry(0.55, 0.65, 9, 6), pillarMat, x, 4.75, z));
    g.add(mesh(new THREE.BoxGeometry(1.7, 0.5, 1.7), stoneLight, x, 9.45, z));
  }

  // 外壁（内側だけ見える）
  g.add(mesh(new THREE.CylinderGeometry(15, 15, 14, 8, 1, true), ps1(0x1a1830, { side: THREE.BackSide }), 0, 7, 0));

  // 天井の穴から木に差し込む光
  const shaft = mesh(
    new THREE.CylinderGeometry(1.3, 3.4, 16, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2c0,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    0,
    8,
    0,
  );
  g.add(shaft);

  // 入口の両脇のかがり火
  const torches: THREE.PointLight[] = [];
  const flames: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * 2.9;
    const z = 6.2;
    g.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 5), stoneLight, x, 0.6, z));
    g.add(mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.35, 6), ps1(0x5a4a3a), x, 1.35, z));
    const flame = mesh(new THREE.ConeGeometry(0.28, 0.7, 5), glow(0xffa040), x, 1.85, z);
    flames.push(flame);
    g.add(flame);
    const light = new THREE.PointLight(0xff9a40, 2.2, 9, 0);
    light.position.set(x, 2.2, z);
    torches.push(light);
    g.add(light);
  }

  return { group: g, torches, flames };
}

/** 柱とかがり火の当たり判定（位置と半径） */
const OBSTACLES = [
  ...Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    return { x: Math.sin(a) * PILLAR_RING, z: Math.cos(a) * PILLAR_RING, r: PILLAR_RADIUS };
  }),
  { x: -2.9, z: 6.2, r: 0.45 },
  { x: 2.9, z: 6.2, r: 0.45 },
];

// ---------------------------------------------------------------------------
// 男の子（ローポリ）。前は +z
// ---------------------------------------------------------------------------
interface Hero {
  root: THREE.Group;
  body: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
}

function buildHero(): Hero {
  const skin = ps1(0xf1c7a0);
  const hair = ps1(0x7a4a22);
  const tunic = ps1(0x3f7fc8);
  const pants = ps1(0x2f3552);
  const shoes = ps1(0x5a3a22);
  const scarf = ps1(0xd8402f);
  const black = new THREE.MeshBasicMaterial({ color: 0x111111 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // 影
  const shadow = mesh(
    new THREE.CircleGeometry(0.42, 8),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }),
    0,
    0.03,
    0,
  );
  shadow.rotation.x = -Math.PI / 2;
  root.add(shadow);

  const leg = (x: number) => {
    const p = new THREE.Group();
    p.position.set(x, 0.74, 0);
    p.add(mesh(new THREE.BoxGeometry(0.17, 0.6, 0.19), pants, 0, -0.3, 0));
    p.add(mesh(new THREE.BoxGeometry(0.19, 0.12, 0.3), shoes, 0, -0.66, 0.05));
    body.add(p);
    return p;
  };
  const legL = leg(-0.11);
  const legR = leg(0.11);

  // 胴（四角い錐台を 45° 回してカクカクに）
  const torso = mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.58, 4), tunic, 0, 1.04, 0);
  torso.rotation.y = Math.PI / 4;
  body.add(torso);
  body.add(mesh(new THREE.BoxGeometry(0.4, 0.1, 0.3), pants, 0, 0.76, 0));
  body.add(mesh(new THREE.BoxGeometry(0.36, 0.09, 0.3), scarf, 0, 1.33, 0));
  const tail = mesh(new THREE.BoxGeometry(0.1, 0.32, 0.05), scarf, 0.08, 1.18, -0.17);
  tail.rotation.z = 0.25;
  body.add(tail);

  const arm = (x: number) => {
    const p = new THREE.Group();
    p.position.set(x, 1.27, 0);
    p.add(mesh(new THREE.BoxGeometry(0.12, 0.48, 0.13), tunic, 0, -0.24, 0));
    p.add(mesh(new THREE.BoxGeometry(0.11, 0.12, 0.12), skin, 0, -0.53, 0));
    body.add(p);
    return p;
  };
  const armL = arm(-0.3);
  const armR = arm(0.3);

  // 頭・目・とがった髪
  body.add(mesh(new THREE.DodecahedronGeometry(0.22, 0), skin, 0, 1.56, 0));
  body.add(mesh(new THREE.BoxGeometry(0.05, 0.07, 0.02), black, -0.08, 1.57, 0.2));
  body.add(mesh(new THREE.BoxGeometry(0.05, 0.07, 0.02), black, 0.08, 1.57, 0.2));
  body.add(mesh(new THREE.DodecahedronGeometry(0.235, 0), hair, 0, 1.66, -0.06));
  const spikes: [number, number, number, number, number][] = [
    // x, y, z, 前後の傾き, 左右の傾き
    [0, 1.86, -0.02, -0.3, 0],
    [-0.13, 1.8, 0.02, -0.1, 0.7],
    [0.13, 1.8, 0.02, -0.1, -0.7],
    [-0.08, 1.74, -0.2, -1.1, 0.4],
    [0.08, 1.74, -0.2, -1.1, -0.4],
    [0, 1.78, 0.14, 0.5, 0],
  ];
  for (const [x, y, z, rx, rz] of spikes) {
    const s = mesh(new THREE.ConeGeometry(0.09, 0.32, 4), hair, x, y, z);
    s.rotation.set(rx, 0, rz);
    body.add(s);
  }

  root.position.set(0, 0, 9);
  root.rotation.y = Math.PI;
  return { root, body, legL, legR, armL, armR };
}

// ---------------------------------------------------------------------------
// 木（レベル 1〜99 で少しずつ大きく、枝葉と光る実が増える）
// ---------------------------------------------------------------------------
/** レベルごとの木全体の大きさ（Lv1 = 0.45 → Lv99 = 1.75、99 段階で少しずつ） */
export function treeScale(level: number): number {
  const t = (Math.min(Math.max(level, 1), TREE_MAX_LEVEL) - 1) / (TREE_MAX_LEVEL - 1);
  return 0.45 + 1.3 * t;
}

const LEAF_SLOTS = (() => {
  const rnd = seeded(7);
  const slots: { x: number; y: number; z: number; r: number }[] = [{ x: 0, y: 2.25, z: 0, r: 0.72 }];
  for (let i = 0; i < 12; i++) {
    const a = i * 2.4 + rnd() * 0.6;
    const d = 0.5 + rnd() * 0.5;
    slots.push({ x: Math.sin(a) * d, y: 1.55 + rnd() * 1.0, z: Math.cos(a) * d, r: 0.42 + rnd() * 0.24 });
  }
  return slots;
})();

function buildTree(level: number): THREE.Group {
  const t = (level - 1) / (TREE_MAX_LEVEL - 1);
  const g = new THREE.Group();
  const bark = ps1(0x6b4a2e);

  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.17 + 0.08 * t, 2.0, 5), bark, 0, 1.0, 0));
  // 根元の張り出し
  for (let i = 0; i < 3 + Math.min(3, Math.floor(level / 20)); i++) {
    const a = (i / 5) * Math.PI * 2;
    const root = mesh(new THREE.ConeGeometry(0.09, 0.5, 4), bark, Math.sin(a) * 0.16, 0.12, Math.cos(a) * 0.16);
    root.rotation.set(Math.cos(a) * 1.2, 0, -Math.sin(a) * 1.2);
    g.add(root);
  }

  // 枝（Lv8 ごとに 1 本、最大 6 本）
  const rnd = seeded(13);
  const branches = Math.min(6, Math.floor(level / 8));
  for (let i = 0; i < branches; i++) {
    const a = i * 2.1 + rnd();
    const b = mesh(new THREE.CylinderGeometry(0.035, 0.07, 0.95, 4), bark, Math.sin(a) * 0.3, 1.25 + rnd() * 0.5, Math.cos(a) * 0.3);
    b.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9);
    g.add(b);
  }

  // 葉の塊（Lv9 ごとに 1 つ増える、最大 12）。高いレベルほど明るい緑に
  const leafCount = 1 + Math.min(12, Math.floor(level / 8));
  const shades = [0x3f9d4a, 0x56b85a, 0x2f8a3f];
  const bright = new THREE.Color(0x9fe870);
  for (let i = 0; i < leafCount; i++) {
    const s = LEAF_SLOTS[i];
    const c = new THREE.Color(shades[i % 3]).lerp(bright, t * 0.35);
    const leaf = mesh(new THREE.IcosahedronGeometry(s.r, 0), ps1(c.getHex()), s.x, s.y, s.z);
    leaf.rotation.set(i, i * 0.7, 0);
    g.add(leaf);
  }

  // 光る実（Lv30 から、10 レベルごとに 1 つ。Lv99 は 12 個）
  const fruits = level >= TREE_MAX_LEVEL ? 12 : level >= 30 ? Math.min(8, Math.floor((level - 20) / 10)) : 0;
  const fruitMat = glow(0xffd36b);
  for (let i = 0; i < fruits; i++) {
    const s = LEAF_SLOTS[(i * 5) % leafCount] ?? LEAF_SLOTS[0];
    const a = i * 1.7;
    g.add(mesh(new THREE.OctahedronGeometry(0.08, 0), fruitMat, s.x + Math.sin(a) * s.r * 0.9, s.y - s.r * 0.4, s.z + Math.cos(a) * s.r * 0.9));
  }

  // Lv99: 根元に金色の光の輪
  if (level >= TREE_MAX_LEVEL) {
    const ring = mesh(new THREE.RingGeometry(0.9, 1.15, 8), glow(0xffd36b, 0.6), 0, 0.05, 0);
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
  }
  return g;
}

// ---------------------------------------------------------------------------
// シーン本体
// ---------------------------------------------------------------------------
export class TempleScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 80);
  private hero = buildHero();
  private treeHolder = new THREE.Group();
  private tree: THREE.Group | null = null;
  private treeLight = new THREE.PointLight(0xffe6a0, 2.4, 13, 0);
  private torches: THREE.PointLight[];
  private flames: THREE.Mesh[];
  private dust: THREE.Points;
  private keys = new Set<string>();
  private stick = new THREE.Vector2();
  private near = false;
  private paused = false;
  private raf = 0;
  private last = 0;
  private walkPhase = 0;
  private level = 0;
  private scaleFrom = 0;
  private scaleTo = 0;
  private growT = 1;
  private sparks: { mesh: THREE.Mesh; t: number; from: THREE.Vector3; delay: number }[] = [];
  private flash = 0;
  private lookY = 1.2;
  private ro: ResizeObserver;

  constructor(
    private host: HTMLElement,
    private cb: SceneCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "low-power" });
    this.renderer.setPixelRatio(1);
    const canvas = this.renderer.domElement;
    canvas.className = "temple-canvas";
    canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);

    this.scene.background = new THREE.Color(0x07060f);
    this.scene.fog = new THREE.Fog(0x0b0a1a, 12, 32);
    this.scene.add(new THREE.AmbientLight(0x50487a, 1.4));
    const moon = new THREE.DirectionalLight(0x8a9cff, 0.5);
    moon.position.set(-4, 10, 6);
    this.scene.add(moon);

    const temple = buildTemple();
    this.torches = temple.torches;
    this.flames = temple.flames;
    this.scene.add(temple.group);

    this.treeHolder.position.set(0, 0.75, 0);
    this.scene.add(this.treeHolder);
    this.treeLight.position.set(0, 3.2, 0);
    this.scene.add(this.treeLight);
    this.scene.add(this.hero.root);

    // 光の中を舞う粒
    const n = 90;
    const pos = new Float32Array(n * 3);
    const rnd = seeded(3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * 3;
      pos.set([Math.sin(a) * d, rnd() * 12, Math.cos(a) * d], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffe8a0,
        size: 0.07,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.scene.add(this.dust);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.placeCamera(1);

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** 木のレベルを変える。animate なら今の大きさから育つ */
  setLevel(level: number, animate: boolean): void {
    if (level === this.level) return;
    const from = this.level === 0 ? treeScale(level) : treeScale(this.level);
    this.level = level;
    if (this.tree) {
      this.treeHolder.remove(this.tree);
      disposeTree(this.tree);
    }
    this.tree = buildTree(level);
    this.treeHolder.add(this.tree);
    this.scaleFrom = animate ? from : treeScale(level);
    this.scaleTo = treeScale(level);
    this.growT = animate ? 0 : 1;
    this.treeHolder.scale.setScalar(this.scaleFrom);
    this.treeLight.position.y = 1.6 + this.scaleTo * 1.6;
  }

  /** キャラから木へ光の粒が流れる演出 */
  playOffering(): void {
    const mat = glow(0xffd36b);
    for (let i = 0; i < 28; i++) {
      const m = mesh(new THREE.OctahedronGeometry(0.07, 0), mat);
      const from = this.hero.root.position.clone().add(new THREE.Vector3(0, 1.1, 0));
      m.position.copy(from);
      this.scene.add(m);
      this.sparks.push({ mesh: m, t: 0, from, delay: i * 0.035 });
    }
  }

  /** スマホのスティック。x: 右が +、y: 上（奥）が + 。長さ 0〜1 */
  setStick(x: number, y: number): void {
    this.stick.set(x, y);
  }

  /** 捧げる画面を開いている間はキー操作で動かさない */
  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.keys.clear();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // -------------------------------------------------------------------------
  private onKeyDown = (e: KeyboardEvent) => {
    if (this.paused || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = keyOf(e);
    if (!k) return;
    e.preventDefault();
    this.keys.add(k);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = keyOf(e);
    if (k) this.keys.delete(k);
  };

  private onBlur = () => this.keys.clear();

  private resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    const rh = Math.min(RENDER_HEIGHT, h);
    const rw = Math.max(1, Math.round((w / h) * rh));
    this.renderer.setSize(rw, rh, false);
    snapUniform.value.set(rw / 2, rh / 2);
    this.camera.aspect = w / h;
    // 縦長（スマホ）は少し引いて広く見せる
    this.camera.fov = w < h ? 64 : 50;
    this.camera.updateProjectionMatrix();
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.last ? (now - this.last) / 1000 : 0);
    this.last = now;
    this.update(dt, now / 1000);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number, time: number) {
    // 入力 → 移動方向（カメラは南から北を見ているので、上 = -z）
    let ix = 0;
    let iz = 0;
    if (!this.paused) {
      if (this.keys.has("left")) ix -= 1;
      if (this.keys.has("right")) ix += 1;
      if (this.keys.has("up")) iz -= 1;
      if (this.keys.has("down")) iz += 1;
      ix += this.stick.x;
      iz -= this.stick.y;
    }
    const len = Math.hypot(ix, iz);
    const moving = len > 0.08;
    const p = this.hero.root.position;
    if (moving) {
      const k = Math.min(1, len);
      const nx = (ix / len) * k * SPEED * dt;
      const nz = (iz / len) * k * SPEED * dt;
      p.x += nx;
      p.z += nz;
      this.collide(p);
      const target = Math.atan2(ix, iz);
      this.hero.root.rotation.y = turnToward(this.hero.root.rotation.y, target, dt * 12);
      this.walkPhase += dt * 10 * k;
    } else {
      this.walkPhase *= 0.85;
    }
    // 歩き（手足を振る・上下に弾む）
    const swing = moving ? Math.sin(this.walkPhase) * 0.7 : Math.sin(this.walkPhase) * 0.7 * 0.5;
    this.hero.legL.rotation.x = swing;
    this.hero.legR.rotation.x = -swing;
    this.hero.armL.rotation.x = -swing * 0.8;
    this.hero.armR.rotation.x = swing * 0.8;
    this.hero.body.position.y = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : Math.sin(time * 2) * 0.01;

    // 木に近いか
    const near = Math.hypot(p.x, p.z) < NEAR_RADIUS;
    if (near !== this.near) {
      this.near = near;
      this.cb.onNear(near);
    }

    this.placeCamera(dt * 4);

    // 木が育つ（ぐぐっと伸びる）・ゆれる
    if (this.growT < 1) {
      this.growT = Math.min(1, this.growT + dt / 1.6);
      const e = 1 - Math.pow(1 - this.growT, 3);
      const over = Math.sin(this.growT * Math.PI) * 0.06;
      this.treeHolder.scale.setScalar(this.scaleFrom + (this.scaleTo - this.scaleFrom) * e + over * this.scaleTo);
    }
    if (this.tree) this.tree.rotation.z = Math.sin(time * 0.8) * 0.012;

    // 光の粒が木へ
    for (const s of this.sparks) {
      s.t += dt;
      const u = Math.min(1, Math.max(0, (s.t - s.delay) / 0.9));
      const to = new THREE.Vector3(0, 0.75 + this.scaleTo * 1.8, 0);
      s.mesh.position.lerpVectors(s.from, to, u * u);
      s.mesh.position.y += Math.sin(u * Math.PI) * 1.5;
      if (u >= 1 && s.mesh.visible) {
        s.mesh.visible = false;
        this.flash = 1;
      }
    }
    if (this.sparks.length && this.sparks.every((s) => !s.mesh.visible)) {
      for (const s of this.sparks) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
      }
      this.sparks = [];
    }
    this.flash = Math.max(0, this.flash - dt * 1.5);
    this.treeLight.intensity = 2.4 + this.flash * 4 + Math.sin(time * 1.3) * 0.2;

    // かがり火のゆらぎ
    this.torches.forEach((l, i) => (l.intensity = 2 + Math.sin(time * 9 + i * 2) * 0.3 + Math.sin(time * 23 + i) * 0.15));
    this.flames.forEach((f, i) => f.scale.set(1, 1 + Math.sin(time * 11 + i * 3) * 0.12, 1));

    // 舞う粒はゆっくり昇る
    const pos = this.dust.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + dt * 0.35;
      if (y > 12) y = 0;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  }

  private collide(p: THREE.Vector3) {
    // 外周
    const d = Math.hypot(p.x, p.z);
    if (d > WALK_RADIUS) {
      p.x *= WALK_RADIUS / d;
      p.z *= WALK_RADIUS / d;
    }
    // 台座
    const dd = Math.hypot(p.x, p.z);
    const minD = DAIS_RADIUS + PLAYER_RADIUS;
    if (dd < minD) {
      const k = dd < 1e-4 ? 1 : minD / dd;
      if (dd < 1e-4) p.z = minD;
      else {
        p.x *= k;
        p.z *= k;
      }
    }
    // 柱・かがり火
    for (const c of OBSTACLES) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const dist = Math.hypot(dx, dz);
      const min = c.r + PLAYER_RADIUS;
      if (dist < min && dist > 1e-4) {
        p.x = c.x + (dx / dist) * min;
        p.z = c.z + (dz / dist) * min;
      }
    }
  }

  private placeCamera(lerp: number) {
    const p = this.hero.root.position;
    // 木の近くでは、育った木が収まるよう少し引いて見上げる
    const k = Math.min(1, Math.max(0, (9 - Math.hypot(p.x, p.z)) / 5));
    const size = this.scaleTo || 0.45;
    const want = p.clone().add(CAMERA_OFFSET.clone().multiplyScalar(1 + k * 0.25 * size));
    // 壁の外に出すぎないよう、水平方向の距離を抑える
    const r = Math.hypot(want.x, want.z);
    if (r > 15.5) {
      want.x *= 15.5 / r;
      want.z *= 15.5 / r;
    }
    this.camera.position.lerp(want, Math.min(1, lerp));
    this.lookY += (1.2 + k * size * 1.3 - this.lookY) * Math.min(1, lerp);
    this.camera.lookAt(p.x * 0.85, this.lookY, p.z * 0.85);
  }
}

function disposeTree(g: THREE.Group) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.Material | undefined)?.dispose?.();
  });
}

function turnToward(cur: number, target: number, step: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + Math.max(-step, Math.min(step, d));
}

function keyOf(e: KeyboardEvent): "up" | "down" | "left" | "right" | null {
  switch (e.code) {
    case "KeyW":
    case "ArrowUp":
      return "up";
    case "KeyS":
    case "ArrowDown":
      return "down";
    case "KeyA":
    case "ArrowLeft":
      return "left";
    case "KeyD":
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}
