// Arboles y arbustos procedurales con aspecto real:
// tronco con corteza y ramas, copa hecha de cientos de tarjetas de hojas
// (textura con transparencia, normales redondeadas, oscurecimiento hacia adentro).
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

let leafTexCache = null, barkTexCache = null;

// Textura de racimo de hojas con fondo transparente
function leafTexture() {
  if (leafTexCache) return leafTexCache;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const r = rng(7);
  const greens = ['#2f6b25', '#3b7d2c', '#4a8f33', '#58a03a', '#2a5d22', '#66ad45', '#356f29'];
  for (let i = 0; i < 150; i++) {
    const x = S * (0.12 + 0.76 * r()), y = S * (0.12 + 0.76 * r());
    // las hojas del borde se acercan al centro para formar un racimo redondeado
    const dx = x - S / 2, dy = y - S / 2;
    if (dx * dx + dy * dy > (S * 0.42) ** 2) continue;
    const len = 34 + r() * 30, wid = len * (0.42 + r() * 0.12), ang = r() * Math.PI * 2;
    g.save(); g.translate(x, y); g.rotate(ang);
    g.fillStyle = greens[(r() * greens.length) | 0];
    g.beginPath(); g.moveTo(-len / 2, 0);
    g.quadraticCurveTo(0, -wid, len / 2, 0); g.quadraticCurveTo(0, wid, -len / 2, 0); g.fill();
    g.strokeStyle = 'rgba(210,235,170,0.55)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true;
  leafTexCache = t; return t;
}

function barkTexture() {
  if (barkTexCache) return barkTexCache;
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rng(21);
  g.fillStyle = '#5a4634'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 520; i++) {          // vetas verticales irregulares
    const x = r() * W, y = r() * H, h = 30 + r() * 120, w = 1 + r() * 4;
    const v = 40 + (r() * 60) | 0;
    g.fillStyle = `rgba(${v},${(v * 0.8) | 0},${(v * 0.6) | 0},${0.25 + r() * 0.35})`;
    g.fillRect(x, y, w, h);
  }
  for (let i = 0; i < 260; i++) {          // luces
    g.fillStyle = `rgba(150,125,95,${0.08 + r() * 0.12})`;
    g.fillRect(r() * W, r() * H, 1 + r() * 3, 20 + r() * 70);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  barkTexCache = t; return t;
}

let foliageMat = null, foliageDepth = null, barkMat = null;
function materials() {
  if (!foliageMat) {
    const map = leafTexture();
    foliageMat = new THREE.MeshStandardMaterial({
      map, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.85, metalness: 0,
    });
    foliageDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });
    barkMat = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 1, color: 0xd9c9b6 });
  }
  return { foliageMat, foliageDepth, barkMat };
}

// Tarjetas de hojas dentro de un elipsoide
function foliageGeometry(rand, { cx = 0, cy = 0, cz = 0, rx, ry, rz, count, size }) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const tmp = new THREE.Vector3(), n = new THREE.Vector3();
  const quat = new THREE.Quaternion(), e = new THREE.Euler();
  let v = 0;
  for (let i = 0; i < count; i++) {
    // punto aleatorio dentro del elipsoide, sesgado hacia la superficie
    let x, y, z, d;
    do { x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1; d = x * x + y * y + z * z; } while (d > 1 || d < 0.04);
    const k = Math.pow(d, -0.18);          // empuja hacia afuera
    x *= k; y *= k; z *= k;
    const px = cx + x * rx, py = cy + y * ry, pz = cz + z * rz;
    // normal hacia afuera de la copa (sombreado esferico suave)
    n.set(x / rx, y / ry * 1.2, z / rz).normalize();
    // orientacion aleatoria de la tarjeta
    e.set((rand() - 0.5) * 1.6, rand() * Math.PI * 2, (rand() - 0.5) * 1.6);
    quat.setFromEuler(e);
    const s = size * (0.75 + rand() * 0.6);
    const shade = Math.min(1, 0.42 + 0.78 * Math.sqrt(Math.min(1, d)) + (y > 0 ? 0.1 * y : 0));
    const tint = 0.9 + rand() * 0.2;
    const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
    corners.forEach(([u, w, tu, tv]) => {
      tmp.set(u * s / 2, w * s / 2, 0).applyQuaternion(quat);
      pos.push(px + tmp.x, py + tmp.y, pz + tmp.z);
      nor.push(n.x, n.y, n.z); uv.push(tu, tv);
      col.push(shade * tint, shade * tint, shade * (0.92 + rand() * 0.1));
    });
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function branch(from, to, r0, r1, mat) {
  const dir = new THREE.Vector3().subVectors(to, from), len = dir.length();
  const geo = new THREE.CylinderGeometry(r1, r0, len, 7, 1);
  geo.translate(0, len / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(from);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  return m;
}

// Arbol de copa ancha. h = altura total en metros.
export function makeTree({ seed = 1, h = 6.5, crown = 1.0 } = {}) {
  const rand = rng(seed * 9973 + 13);
  const { foliageMat, foliageDepth, barkMat } = materials();
  const g = new THREE.Group();
  const trunkH = h * 0.38, trunkR = h * 0.026;
  // tronco con base ensanchada y ligera inclinacion
  const lean = new THREE.Vector3((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3);
  const top = new THREE.Vector3(lean.x, trunkH, lean.z);
  const tg = new THREE.CylinderGeometry(trunkR * 0.62, trunkR * 1.1, trunkH, 10, 6);
  tg.translate(0, trunkH / 2, 0);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i), f = y / trunkH;
    tp.setX(i, tp.getX(i) * (1 + 0.55 * Math.pow(1 - f, 6)) + lean.x * f);   // raiz abierta + inclinacion
    tp.setZ(i, tp.getZ(i) * (1 + 0.55 * Math.pow(1 - f, 6)) + lean.z * f);
  }
  tg.computeVertexNormals();
  const uvs = tg.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, uvs.getX(i) * 2, uvs.getY(i) * 2);
  const trunk = new THREE.Mesh(tg, barkMat); trunk.castShadow = true; g.add(trunk);

  // ramas principales hacia la copa
  const crownR = h * 0.30 * crown, crownY = trunkH + h * 0.30;
  const nb = 6;
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rand() * 0.8, out = crownR * (0.55 + rand() * 0.35);
    const to = new THREE.Vector3(top.x + Math.cos(a) * out, trunkH + h * (0.14 + rand() * 0.16), top.z + Math.sin(a) * out);
    g.add(branch(top.clone().add(new THREE.Vector3(0, -h * 0.05 * rand(), 0)), to, trunkR * 0.5, trunkR * 0.16, barkMat));
  }

  // copa: racimos grandes + relleno
  const geo = foliageGeometry(rand, {
    cx: top.x, cy: crownY, cz: top.z, rx: crownR, ry: h * 0.27, rz: crownR, count: 520, size: h * 0.20,
  });
  const leaves = new THREE.Mesh(geo, foliageMat);
  leaves.castShadow = true; leaves.customDepthMaterial = foliageDepth;
  g.add(leaves);
  g.userData.height = h;
  return g;
}

// Arbusto bajo (jardineras, bordes)
export function makeShrub({ seed = 3, r = 0.5 } = {}) {
  const rand = rng(seed * 7919 + 5);
  const { foliageMat, foliageDepth } = materials();
  const geo = foliageGeometry(rand, { cx: 0, cy: r * 0.8, cz: 0, rx: r, ry: r * 0.8, rz: r, count: 110, size: r * 0.8 });
  const m = new THREE.Mesh(geo, foliageMat); m.castShadow = true; m.customDepthMaterial = foliageDepth;
  const g = new THREE.Group(); g.add(m); return g;
}
