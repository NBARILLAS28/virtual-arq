// Materiales procedurales (sin imagenes externas). Cada textura representa
// `tile` metros reales y se repite; las UV de la geometria estan en metros.
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTex(size, draw, tile, opts = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size, rng(opts.seed || 7));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / tile, 1 / tile);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(g, s, r, n, a, light = true) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${r() * a})`;
    g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2);
  }
}

export function makeMaterials(quality = 'high') {
  const S = quality === 'high' ? 512 : 256;
  const std = (map, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0, ...extra });

  const plasterExt = std(canvasTex(S, (g, s, r) => {
    g.fillStyle = '#eadfc8'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, s * 40, 0.10, false); speckle(g, s, r, s * 30, 0.12, true);
  }, 2));
  const plasterInt = std(canvasTex(S, (g, s, r) => {
    g.fillStyle = '#f2eee6'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, s * 25, 0.06, false);
  }, 2));
  const ceiling = std(canvasTex(S, (g, s) => { g.fillStyle = '#f7f6f2'; g.fillRect(0, 0, s, s); }, 2));
  const concrete = std(canvasTex(S, (g, s, r) => {
    g.fillStyle = '#9a9a94'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, s * 60, 0.18, false); speckle(g, s, r, s * 60, 0.14, true);
  }, 2));

  // ladrillo visto: 1 m = 4 ladrillos de ancho
  const brick = std(canvasTex(S, (g, s, r) => {
    g.fillStyle = '#7a6a5a'; g.fillRect(0, 0, s, s);
    const rows = 13, bw = s / 4, bh = s / rows;
    for (let y = 0; y < rows; y++) for (let x = -1; x < 5; x++) {
      const ox = (y % 2) * bw / 2;
      const k = 0.78 + r() * 0.3;
      g.fillStyle = `rgb(${190 * k | 0},${88 * k | 0},${58 * k | 0})`;
      g.fillRect(x * bw + ox + 2, y * bh + 2, bw - 4, bh - 4);
    }
    speckle(g, s, r, s * 20, 0.15, false);
  }, 1), { roughness: 0.95 });

  // piedra laja oscura (fachaleta)
  const stoneLaja = std(canvasTex(S, (g, s, r) => {
    g.fillStyle = '#2b2b2c'; g.fillRect(0, 0, s, s);
    let y = 0;
    while (y < s) {
      const h = 30 + r() * 36; let x = -r() * 60;
      while (x < s) {
        const w = 60 + r() * 90, k = 0.7 + r() * 0.6;
        g.fillStyle = `rgb(${62 * k | 0},${64 * k | 0},${68 * k | 0})`;
        g.fillRect(x + 2, y + 2, w - 4, h - 4);
        x += w;
      }
      y += h;
    }
    speckle(g, s, r, s * 30, 0.2, true);
  }, 2), { roughness: 0.8 });

  // piedra rustica gris (muro frontal)
  const stoneRustic = std(canvasTex(S, (g, s, r) => {
    g.fillStyle = '#222'; g.fillRect(0, 0, s, s);
    let y = 0;
    while (y < s) {
      const h = 40 + r() * 50; let x = -r() * 80;
      while (x < s) {
        const w = 70 + r() * 110, k = 0.75 + r() * 0.55;
        g.fillStyle = `rgb(${96 * k | 0},${96 * k | 0},${100 * k | 0})`;
        g.beginPath(); g.roundRect(x + 3, y + 3, w - 6, h - 6, 10); g.fill();
        x += w;
      }
      y += h;
    }
  }, 2), { roughness: 0.85 });

  const wood = std(canvasTex(S, (g, s, r) => {
    g.fillStyle = '#6b4226'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) {
      const y = r() * s, k = r() * 40;
      g.strokeStyle = `rgba(${30 + k},${15 + k / 2},5,${0.25 + r() * 0.3})`;
      g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(0, y);
      g.bezierCurveTo(s * 0.3, y + r() * 8, s * 0.7, y - r() * 8, s, y); g.stroke();
    }
  }, 1), { roughness: 0.7 });

  const deck = std(canvasTex(S, (g, s, r) => {
    const n = 8, h = s / n;
    for (let i = 0; i < n; i++) {
      const k = 0.8 + r() * 0.35;
      g.fillStyle = `rgb(${150 * k | 0},${96 * k | 0},${58 * k | 0})`; g.fillRect(0, i * h, s, h - 3);
      g.fillStyle = '#2a1a10'; g.fillRect(0, i * h + h - 3, s, 3);
    }
  }, 1), { roughness: 0.75 });

  // ceramica 0.5 m
  const tile = std(canvasTex(S, (g, s, r) => {
    const n = 2, c = s / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const k = 0.95 + r() * 0.08;
      g.fillStyle = `rgb(${214 * k | 0},${200 * k | 0},${176 * k | 0})`;
      g.fillRect(x * c + 2, y * c + 2, c - 4, c - 4);
    }
    g.strokeStyle = '#8f8670'; g.lineWidth = 4;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * c, 0); g.lineTo(i * c, s); g.stroke(); g.beginPath(); g.moveTo(0, i * c); g.lineTo(s, i * c); g.stroke(); }
  }, 1), { roughness: 0.35 });

  const grass = std(canvasTex(S, (g, s, r) => {
    g.fillStyle = '#4c7f35'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < s * 60; i++) {
      const k = r();
      g.fillStyle = `rgba(${40 + k * 60 | 0},${100 + k * 80 | 0},${30 + k * 30 | 0},0.5)`;
      g.fillRect(r() * s, r() * s, 1.5, 4);
    }
  }, 3), { roughness: 1, color: 0xb4c49a });

  const dirt = std(canvasTex(S, (g, s, r) => {
    g.fillStyle = '#7a6a52'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, s * 80, 0.25, false); speckle(g, s, r, s * 60, 0.2, true);
  }, 3), { roughness: 1 });

  const asphalt = std(canvasTex(S, (g, s, r) => {
    g.fillStyle = '#3a3b3d'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, s * 120, 0.3, true); speckle(g, s, r, s * 80, 0.25, false);
  }, 3), { roughness: 0.95 });

  const sidewalk = std(canvasTex(S, (g, s, r) => {
    g.fillStyle = '#b9b6ad'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, s * 40, 0.15, false);
    g.strokeStyle = '#7c7a72'; g.lineWidth = 3; g.strokeRect(0, 0, s, s);
  }, 1.5));

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xa8d0ee, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.32,
    envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false,
  });
  const frame = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.5, metalness: 0.6 });
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.55, metalness: 0.5 });
  const neighbor = std(canvasTex(S, (g, s, r) => { g.fillStyle = '#c9c3b6'; g.fillRect(0, 0, s, s); speckle(g, s, r, s * 30, 0.1, false); }, 2));
  const carPaint = new THREE.MeshPhysicalMaterial({ color: 0xb01218, roughness: 0.25, metalness: 0.5, clearcoat: 1 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const fabric = std(canvasTex(S, (g, s, r) => { g.fillStyle = '#7d8590'; g.fillRect(0, 0, s, s); speckle(g, s, r, s * 60, 0.15, true); }, 1));
  const bedding = std(canvasTex(S, (g, s) => { g.fillStyle = '#e9e6e0'; g.fillRect(0, 0, s, s); }, 1));
  const counter = std(canvasTex(S, (g, s, r) => { g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, s, s); speckle(g, s, r, s * 30, 0.2, false); }, 1), { roughness: 0.4 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.4 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3f7f2f, roughness: 0.9 });
  const trunk = new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 0.9 });

  return { plasterExt, plasterInt, ceiling, concrete, brick, stoneLaja, stoneRustic, wood, deck, tile, grass, dirt, asphalt, sidewalk, glass, frame, metalDark, neighbor, carPaint, rubber, fabric, bedding, counter, white, leaf, trunk };
}

// ---------------------------------------------------------------------------
// Texturas fotograficas (Poly Haven, licencia CC0). Se cargan despues de crear
// los materiales procedurales, que quedan como respaldo mientras descargan.
// Cada mapa: diff (color), nor_gl (relieve) y arm (oclusion/rugosidad/metal).
// `tile` = metros reales que cubre una repeticion de la textura.
// ---------------------------------------------------------------------------
const WARM = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);

export function upgradeMaterials(M, renderer, base = './textures/') {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const cache = new Map();
  const tex = (id, kind, tile) => {
    const key = `${id}|${kind}|${tile}`;
    if (cache.has(key)) return cache.get(key);
    const t = loader.load(`${base}${id}/${id}_${kind}_1k.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / tile, 1 / tile);
    t.anisotropy = aniso;
    t.colorSpace = kind === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    cache.set(key, t);
    return t;
  };
  const apply = (mat, id, tile, { color, normal = 1 } = {}) => {
    mat.map = tex(id, 'diff', tile);
    mat.normalMap = tex(id, 'nor_gl', tile);
    mat.normalScale.set(normal, normal);
    const arm = tex(id, 'arm', tile);
    mat.roughnessMap = arm;
    mat.aoMap = arm;
    mat.roughness = 1;
    if (color) mat.color.copy(color);
    mat.needsUpdate = true;
  };

  // repello: la textura base es beige oscuro casi plano; se aclara a crema
  apply(M.plasterExt, 'beige_wall_001', 2, { color: WARM(2.6, 3.0, 3.5), normal: 1.2 });
  apply(M.plasterInt, 'beige_wall_001', 2, { color: WARM(2.9, 3.5, 4.3), normal: 0.8 });
  apply(M.neighbor, 'beige_wall_001', 2, { color: WARM(2.0, 2.3, 2.5) });
  apply(M.brick, 'red_brick_03', 1.8);
  apply(M.stoneLaja, 'rock_wall_08', 2.4, { normal: 1.4 });
  apply(M.stoneRustic, 'rock_wall_08', 2.4, { color: WARM(1.25, 1.25, 1.3), normal: 1.4 });
  apply(M.wood, 'wood_planks', 1.0, { color: WARM(0.75, 0.62, 0.5) });
  apply(M.deck, 'wood_planks', 1.0);
  apply(M.tile, 'large_floor_tiles_02', 1.8, { color: WARM(1.9, 1.75, 1.5), normal: 0.7 });
  apply(M.concrete, 'concrete_wall_008', 2.0, { color: WARM(1.3, 1.3, 1.25) });
  apply(M.asphalt, 'asphalt_02', 3.0);
  apply(M.dirt, 'grass_path_2', 3.0);
  apply(M.sidewalk, 'concrete_wall_008', 1.5, { color: WARM(1.7, 1.7, 1.6) });
}
