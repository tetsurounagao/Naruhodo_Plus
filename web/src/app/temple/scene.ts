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
/** 神殿の床・外壁の半径 */
const TEMPLE_RADIUS = 20;
/** 外壁の高さ（カメラが引いても壁の上から外が見えないように高め） */
const WALL_HEIGHT = 22;
/** 歩ける範囲（中心からの距離） */
const WALK_RADIUS = 17.5;
/** 木の台座の半径（ここより内側には入れない） */
const DAIS_RADIUS = 3.7;
/** 木にこの距離まで近づくと「捧げる」ボタンが出る */
const NEAR_RADIUS = 5.2;
const PLAYER_RADIUS = 0.4;
const PILLAR_RING = 15;
const PILLAR_RADIUS = 0.8;
const CAMERA_OFFSET = new THREE.Vector3(0, 5.4, 7.4);
/** カメラが動ける範囲（中心からの水平距離）。外に出そうなら代わりに上がる */
const CAMERA_RADIUS = TEMPLE_RADIUS - 0.6;
/** 入口のかがり火の位置 */
const TORCH_X = 3.2;
const TORCH_Z = 8.6;
/** アバターの最初の位置（入口の道の上） */
const HERO_START_Z = 12.5;

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
  g.add(mesh(new THREE.CylinderGeometry(TEMPLE_RADIUS, TEMPLE_RADIUS, 0.5, 8), stone, 0, -0.25, 0));
  g.add(mesh(new THREE.CylinderGeometry(12, 12, 0.04, 8), ps1(0x332f4c), 0, 0.02, 0));
  g.add(mesh(new THREE.CylinderGeometry(6.2, 6.2, 0.05, 8), ps1(0x38335a), 0, 0.03, 0));
  g.add(mesh(new THREE.BoxGeometry(2.6, 0.06, 13), stoneLight, 0, 0.04, 12.5));

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
    g.add(mesh(new THREE.CylinderGeometry(0.55, 0.65, 11, 6), pillarMat, x, 5.75, z));
    g.add(mesh(new THREE.BoxGeometry(1.7, 0.5, 1.7), stoneLight, x, 11.45, z));
  }

  // 外壁（内側だけ見える）
  g.add(
    mesh(
      new THREE.CylinderGeometry(TEMPLE_RADIUS, TEMPLE_RADIUS, WALL_HEIGHT, 8, 1, true),
      ps1(0x1a1830, { side: THREE.BackSide }),
      0,
      WALL_HEIGHT / 2,
      0,
    ),
  );

  // 天井の穴から木に差し込む光
  const shaft = mesh(
    new THREE.CylinderGeometry(1.6, 4.2, 24, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2c0,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    0,
    12,
    0,
  );
  g.add(shaft);

  // 入口の両脇のかがり火
  const torches: THREE.PointLight[] = [];
  const flames: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * TORCH_X;
    const z = TORCH_Z;
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
  { x: -TORCH_X, z: TORCH_Z, r: 0.45 },
  { x: TORCH_X, z: TORCH_Z, r: 0.45 },
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

  root.position.set(0, 0, HERO_START_Z);
  root.rotation.y = Math.PI;
  return { root, body, legL, legR, armL, armR };
}

// ---------------------------------------------------------------------------
// 木（レベル 1〜99 で少しずつ大きく、枝葉と光る実が増える）
// ---------------------------------------------------------------------------
/** レベルごとの木全体の大きさ（Lv1 = 0.45 → Lv99 = 2.6、99 段階で少しずつ） */
export function treeScale(level: number): number {
  const t = (Math.min(Math.max(level, 1), TREE_MAX_LEVEL) - 1) / (TREE_MAX_LEVEL - 1);
  return 0.45 + 2.15 * t;
}

/** 木の高さ（台座の上から梢まで、大きさ 1 のとき） */
const TREE_HEIGHT = 3.1;
/** 葉の茂みの中心の高さと横の広がり（大きさ 1 のとき） */
const CANOPY_Y = 2.2;
const CANOPY_R = 1.3;
/** 台座の上面の高さ（木の根元） */
const TREE_BASE_Y = 0.75;

const WHITE = new THREE.Color(0xffffff);

/** 木を白く光らせる（0 = 元の色、1 = 真っ白）。元の色は材質の userData に覚えておく */
function whiten(g: THREE.Object3D, w: number) {
  g.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | THREE.MeshBasicMaterial | undefined;
    if (!mat || !("color" in mat)) return;
    const base = (mat.userData.base ??= mat.color.clone()) as THREE.Color;
    mat.color.copy(base).lerp(WHITE, w);
    if ("emissive" in mat) mat.emissive.setScalar(w * 0.95);
  });
}

/** ふわっとした白い光の粒の絵（中心が白く、外に向かって透ける） */
function softTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.22, "rgba(255,255,255,0.9)");
  g.addColorStop(0.55, "rgba(225,238,255,0.28)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 捧げたポイントから光の粒の数を決める（10 pt で 1 つ、3〜80 個） */
export function orbCount(amount: number): number {
  return Math.max(3, Math.min(80, Math.round(amount / 10)));
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** 光の粒 1 つ。アバターから浮かび上がり、弧を描いて木の茂みに吸い込まれる */
interface Orb {
  sprite: THREE.Sprite;
  t: number;
  delay: number;
  start: THREE.Vector3;
  rise: THREE.Vector3;
  ctrl: THREE.Vector3;
  end: THREE.Vector3;
  size: number;
  wobble: number;
  done: boolean;
}

/** 粒が出てから吸い込まれるまで（秒）: 浮かぶ → 木へ飛ぶ → 吸い込まれる */
const ORB_RISE = 0.7;
const ORB_FLY = 1.3;
const ORB_FADE = 0.25;

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
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
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
  /** 今の木の大きさと、育つときの始まり・終わり */
  private curScale = 0.45;
  private scaleFrom = 0.45;
  private scaleTo = 0.45;
  /**
   * レベルアップの流れ: 白くなる（whiten）→ 白いまま次の大きさへ（grow）→ 元の色に戻る（fade）。
   * 途中でさらにレベルが上がったら target を差し替えて、そのまま続けて育つ
   */
  private lv: { phase: "idle" | "whiten" | "grow" | "fade"; t: number; target: number } = {
    phase: "idle",
    t: 0,
    target: 0,
  };
  /** 木の白さ（レベルアップ）と、光の粒を吸ったときの一瞬の明るさ */
  private white = 0;
  private pulse = 0;
  private appliedWhite = -1;
  private halo: THREE.Sprite;
  private orbTexture = softTexture();
  private offerings: { orbs: Orb[]; resolve: () => void }[] = [];
  private look = new THREE.Vector3(0, 1.2, 0);
  /** 全体を収める位置を探すための、画面に出さないカメラ */
  private fitCam = new THREE.PerspectiveCamera();
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
    this.scene.fog = new THREE.Fog(0x0b0a1a, 16, 46);
    this.scene.add(new THREE.AmbientLight(0x50487a, 1.4));
    const moon = new THREE.DirectionalLight(0x8a9cff, 0.5);
    moon.position.set(-4, 10, 6);
    this.scene.add(moon);

    const temple = buildTemple();
    this.torches = temple.torches;
    this.flames = temple.flames;
    this.scene.add(temple.group);

    this.treeHolder.position.set(0, TREE_BASE_Y, 0);
    this.scene.add(this.treeHolder);
    // レベルアップのときに木を包む光
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.orbTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.scene.add(this.halo);
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
      pos.set([Math.sin(a) * d, rnd() * 16, Math.cos(a) * d], i * 3);
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

  /**
   * 木のレベルを変える。animate なら、木が光を放って白くなり、白いまま次の大きさへ育って元の色に戻る。
   * animate でなければすぐその大きさにする（ページを開いたとき）。
   */
  setLevel(level: number, animate: boolean): void {
    if (!animate || !this.tree) {
      if (level === this.level && this.tree) return;
      this.lv = { phase: "idle", t: 0, target: level };
      this.swapTree(level);
      this.curScale = this.scaleFrom = this.scaleTo = treeScale(level);
      this.white = 0;
      return;
    }
    this.lv.target = level;
    // 白くなっている途中・育っている途中なら、その流れのまま新しい大きさを目指す
    if (this.lv.phase === "idle" || this.lv.phase === "fade") this.lv = { phase: "whiten", t: 0, target: level };
  }

  /**
   * 捧げる演出。アバターから白い光の粒がポイントに応じた数だけ浮かび上がり、木に吸い込まれる。
   * 最後の粒が吸い込まれたら resolve する（そこでレベルアップの演出を始める）。
   */
  playOffering(amount: number): Promise<void> {
    const n = orbCount(amount);
    const rnd = Math.random;
    const spread = Math.min(2.2, n * 0.06);
    const hero = this.hero.root.position;
    const s = this.scaleTo;
    const canopy = new THREE.Vector3(0, TREE_BASE_Y + s * CANOPY_Y, 0);
    const orbs: Orb[] = [];
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const start = hero.clone().add(new THREE.Vector3(Math.sin(a) * 0.25, 0.9 + rnd() * 0.4, Math.cos(a) * 0.25));
      const rise = start.clone().add(new THREE.Vector3(Math.sin(a) * 0.7, 0.9 + rnd() * 0.8, Math.cos(a) * 0.7));
      // 茂みの中のどこか
      const b = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * s * CANOPY_R * 0.6;
      const end = canopy.clone().add(new THREE.Vector3(Math.sin(b) * r, (rnd() - 0.5) * s * 0.8, Math.cos(b) * r));
      const ctrl = rise
        .clone()
        .lerp(end, 0.5)
        .add(new THREE.Vector3((rnd() - 0.5) * 3, 1.2 + rnd() * 1.6 + s * 0.6, (rnd() - 0.5) * 3));
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.orbTexture,
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      sprite.position.copy(start);
      sprite.scale.setScalar(0.001);
      this.scene.add(sprite);
      orbs.push({
        sprite,
        t: 0,
        delay: (i / n) * spread + rnd() * 0.08,
        start,
        rise,
        ctrl,
        end,
        size: 0.32 + rnd() * 0.22,
        wobble: rnd() * Math.PI * 2,
        done: false,
      });
    }
    return new Promise((resolve) => this.offerings.push({ orbs, resolve }));
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
    for (const o of this.offerings) o.resolve();
    this.offerings = [];
    this.orbTexture.dispose();
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

    this.updateOrbs(dt);
    this.updateGrowth(dt);
    if (this.tree) this.tree.rotation.z = Math.sin(time * 0.8) * 0.012;
    this.treeLight.intensity = 2.4 + this.white * 7 + this.pulse * 3 + Math.sin(time * 1.3) * 0.2;
    this.treeLight.distance = 12 + this.curScale * 6;

    // かがり火のゆらぎ
    this.torches.forEach((l, i) => (l.intensity = 2 + Math.sin(time * 9 + i * 2) * 0.3 + Math.sin(time * 23 + i) * 0.15));
    this.flames.forEach((f, i) => f.scale.set(1, 1 + Math.sin(time * 11 + i * 3) * 0.12, 1));

    // 舞う粒はゆっくり昇る
    const pos = this.dust.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + dt * 0.35;
      if (y > 16) y = 0;
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

  /**
   * box の角が全部画面に収まるカメラ位置。center を見ながら、いつもの向きのまま少しずつ引いていく。
   * 画面の下はボタン・案内の分だけ余白を空ける。
   */
  private fitCamera(box: THREE.Box3, center: THREE.Vector3): THREE.Vector3 {
    const cam = this.fitCam;
    cam.fov = this.camera.fov;
    cam.aspect = this.camera.aspect;
    cam.updateProjectionMatrix();
    const dir = CAMERA_OFFSET.clone().normalize();
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(
      (i) =>
        new THREE.Vector3(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z,
        ),
    );
    const v = new THREE.Vector3();
    let dist = CAMERA_OFFSET.length();
    const pos = new THREE.Vector3();
    for (let i = 0; i < 40; i++) {
      pos.copy(center).addScaledVector(dir, dist);
      keepInside(pos);
      cam.position.copy(pos);
      cam.lookAt(center);
      cam.updateMatrixWorld();
      const fits = corners.every((c) => {
        v.copy(c).project(cam);
        return v.z < 1 && Math.abs(v.x) <= 0.88 && v.y <= 0.86 && v.y >= -0.66;
      });
      if (fits) break;
      dist *= 1.07;
    }
    return pos;
  }

  /** 木を差し替える（白さは今の値のまま引き継ぐ） */
  private swapTree(level: number) {
    if (this.tree) {
      this.treeHolder.remove(this.tree);
      disposeTree(this.tree);
    }
    this.level = level;
    this.tree = buildTree(level);
    this.treeHolder.add(this.tree);
    this.appliedWhite = -1;
  }

  private updateOrbs(dt: number) {
    for (const batch of this.offerings) {
      for (const o of batch.orbs) {
        if (o.done) continue;
        o.t += dt;
        const t = o.t - o.delay;
        if (t < 0) continue;
        const mat = o.sprite.material;
        const sway = Math.sin(o.t * 3 + o.wobble) * 0.12;
        if (t < ORB_RISE) {
          // アバターからふわっと浮かぶ
          const u = easeOut(t / ORB_RISE);
          o.sprite.position.lerpVectors(o.start, o.rise, u);
          o.sprite.position.x += sway;
          o.sprite.scale.setScalar(o.size * Math.min(1, t / 0.25));
          mat.opacity = Math.min(1, t / 0.25) * 0.95;
        } else if (t < ORB_RISE + ORB_FLY) {
          // 弧を描いて木へ
          const u = easeInOut((t - ORB_RISE) / ORB_FLY);
          const a = o.rise.clone().lerp(o.ctrl, u);
          const b = o.ctrl.clone().lerp(o.end, u);
          o.sprite.position.lerpVectors(a, b, u);
          o.sprite.position.x += sway * (1 - u);
          o.sprite.scale.setScalar(o.size * (1 - 0.25 * u));
          mat.opacity = 0.95;
        } else if (t < ORB_RISE + ORB_FLY + ORB_FADE) {
          // 吸い込まれる
          const u = (t - ORB_RISE - ORB_FLY) / ORB_FADE;
          o.sprite.position.copy(o.end);
          o.sprite.scale.setScalar(o.size * 0.75 * (1 + u * 0.8));
          mat.opacity = 0.95 * (1 - u);
        } else {
          o.done = true;
          o.sprite.visible = false;
          this.pulse = Math.min(1, this.pulse + 0.18);
        }
      }
    }
    // 全部吸い込まれた回は片付けて知らせる
    this.offerings = this.offerings.filter((batch) => {
      if (!batch.orbs.every((o) => o.done)) return true;
      for (const o of batch.orbs) {
        this.scene.remove(o.sprite);
        o.sprite.material.dispose();
      }
      batch.resolve();
      return false;
    });
    this.pulse = Math.max(0, this.pulse - dt * 1.6);
  }

  private updateGrowth(dt: number) {
    const L = this.lv;
    if (L.phase === "whiten") {
      // 光を放って白くなる
      this.white = Math.min(1, this.white + dt / 0.6);
      if (this.white >= 1) {
        this.swapTree(L.target);
        this.scaleFrom = this.curScale;
        this.scaleTo = treeScale(L.target);
        L.phase = "grow";
        L.t = 0;
      }
    } else if (L.phase === "grow") {
      // 白いまま次の大きさへ（途中でさらに上がったら、今の大きさからそこへ）
      if (L.target !== this.level) {
        this.swapTree(L.target);
        this.scaleFrom = this.curScale;
        this.scaleTo = treeScale(L.target);
        L.t = 0;
      }
      L.t = Math.min(1, L.t + dt / 1.5);
      this.curScale = this.scaleFrom + (this.scaleTo - this.scaleFrom) * easeInOut(L.t);
      if (L.t >= 1) L.phase = "fade";
    } else if (L.phase === "fade") {
      this.white = Math.max(0, this.white - dt / 1.1);
      if (this.white <= 0) L.phase = "idle";
    }
    this.treeHolder.scale.setScalar(this.curScale);

    const w = Math.max(this.white, this.pulse * 0.22);
    if (this.tree && Math.abs(w - this.appliedWhite) > 0.002) {
      whiten(this.tree, w);
      this.appliedWhite = w;
    }
    // 木を包む光
    this.halo.position.set(0, TREE_BASE_Y + this.curScale * CANOPY_Y * 0.85, 0);
    this.halo.scale.setScalar(this.curScale * (4 + this.white * 3));
    this.halo.material.opacity = this.white * 0.7 + this.pulse * 0.12;
    this.treeLight.position.y = TREE_BASE_Y + this.curScale * CANOPY_Y;
  }

  /**
   * カメラ。ふだんはアバターの後ろ上から追いかける。
   * 木が大きいとき・木の近くにいるときは、アバターと木の全体が収まるまで引く（神殿の外に出そうなら上がる）。
   */
  private placeCamera(lerp: number) {
    const p = this.hero.root.position;
    const s = this.curScale;

    // 追いかけるカメラ
    const followPos = p.clone().add(CAMERA_OFFSET);
    const followLook = new THREE.Vector3(p.x * 0.85, 1.2, p.z * 0.85);

    // アバターと木をまとめて囲む箱。その角が全部画面に収まるまで引く（神殿の外に出そうなら上がる）
    const R = s * CANOPY_R;
    const box = new THREE.Box3(
      new THREE.Vector3(Math.min(p.x - 0.5, -R), 0, Math.min(p.z - 0.5, -R)),
      new THREE.Vector3(Math.max(p.x + 0.5, R), Math.max(2.1, TREE_BASE_Y + s * TREE_HEIGHT), Math.max(p.z + 0.5, R)),
    );
    const center = box.getCenter(new THREE.Vector3());
    const framePos = this.fitCamera(box, center);

    // どれだけ「全体を収める」側に寄せるか: 木の近くほど、木が大きいほど
    const d = Math.hypot(p.x, p.z);
    const nearK = Math.min(1, Math.max(0, (13 - d) / 5));
    const sizeK = Math.min(1, Math.max(0, (s - 1.0) / 0.7));
    const k = Math.max(nearK * Math.min(1, s / 0.9), sizeK);

    const want = followPos.lerp(framePos, k);
    const lookWant = followLook.lerp(center, k);
    keepInside(want);
    const a = Math.min(1, lerp);
    this.camera.position.lerp(want, a);
    this.look.lerp(lookWant, a);
    this.camera.lookAt(this.look);
    // 引いたぶんだけ霧も遠ざける（遠くから見ても暗く沈まないように）
    const fog = this.scene.fog as THREE.Fog;
    const extra = Math.max(0, this.camera.position.distanceTo(this.look) - CAMERA_OFFSET.length());
    fog.near = 16 + extra;
    fog.far = 46 + extra;
  }
}

/** 外壁の外に出るぶんは、代わりに上がる */
function keepInside(v: THREE.Vector3) {
  const r = Math.hypot(v.x, v.z);
  if (r > CAMERA_RADIUS) {
    v.x *= CAMERA_RADIUS / r;
    v.z *= CAMERA_RADIUS / r;
    v.y += r - CAMERA_RADIUS;
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
