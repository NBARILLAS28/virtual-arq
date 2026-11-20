// Muebles reales (GLB) para la casa. Dos usos:
//  1) placeFurniture: reemplaza las cajas de extras.furniture ajustando el modelo a la huella del plano.
//  2) placeDecor: pone piezas sueltas de extras.decor (inodoro, lavamanos, TV, estufa, lamparas...).
// Creditos de los modelos: ver CREDITS.md
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

// h = alto real (m). mode: 'fit' (escala uniforme dentro de la huella) | 'fill' (se estira hasta ~30% para llenar la huella).
// Todos los modelos miran hacia +z por defecto; yaw (grados) los gira: 0 mira +z, 90 mira +x, 180 mira -z, -90 mira -x.
export const FURN = {
  fridge:   { url: './models/muebles/fridge.glb',   h: 1.80, mode: 'fill' },
  sofa:     { url: './models/muebles/sofa.glb',     h: 0.85, mode: 'fill' },
  table:    { url: './models/muebles/table.glb',    h: 0.76, mode: 'fill' },
  chair:    { url: './models/muebles/chair.glb',    h: 0.80, mode: 'fit', lim: 1.7 },
  bed:      { url: './models/muebles/bed.glb',      h: 0.85, mode: 'fill' },
  wardrobe: { url: './models/muebles/wardrobe.glb', h: 2.10, mode: 'fill' },
};
export const DECOR = {
  toilet: { url: './models/muebles/toilet.glb', h: 0.80 },
  vanity: { url: './models/muebles/vanity.glb', h: 1.70 },
  tv:     { url: './models/muebles/tv.glb',     w: 1.10 },
  stove:  { url: './models/muebles/stove.glb',  w: 0.78 },
  lamp:   { url: './models/muebles/lamp.glb',   w: 1.30 },
};

async function loadModel(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url).then((g) => g.scene));
  return (await cache.get(url)).clone(true);
}

// modelo centrado en x/z, apoyado en y=0, girado yaw; devuelve {pivot,size}
function normalized(model, yawDeg) {
  model.updateMatrixWorld(true);
  const pivot = new THREE.Group(); pivot.add(model);
  const b = new THREE.Box3().setFromObject(model), c = b.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -b.min.y, -c.z);
  pivot.rotation.y = THREE.MathUtils.degToRad(yawDeg || 0);
  pivot.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(pivot).getSize(new THREE.Vector3());
  return { pivot, size };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function shadows(o) { o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); }

// Mueble del plano: ajustado a su huella x0..x1, z0..z1
export async function placeFurniture(group, item, y0) {
  const cfg = { ...FURN[item.t], ...(item.model || {}) };
  if (!cfg.url) return null;
  const { pivot, size } = normalized(await loadModel(cfg.url), item.yaw);
  const fw = item.x1 - item.x0, fd = item.z1 - item.z0;
  const s0 = cfg.h / size.y;
  let sx, sy = s0, sz;
  if (cfg.mode === 'fill') {
    sx = clamp(fw / size.x, 0.75 * s0, 1.3 * s0); sz = clamp(fd / size.z, 0.75 * s0, 1.3 * s0);
  } else {
    const lim = cfg.lim || 1.04;
    sx = sz = sy = Math.min(s0, (fw * lim) / size.x, (fd * lim) / size.z);
  }
  const root = new THREE.Group(); root.add(pivot); root.scale.set(sx, sy, sz);
  root.position.set((item.x0 + item.x1) / 2, y0, (item.z0 + item.z1) / 2);
  shadows(root); group.add(root);
  return root;
}

// Pieza suelta: centro (x,z), altura de piso y, giro yaw; tamano por h (alto), w (ancho en x tras el giro) o len (lado mayor)
export async function placeDecor(group, d, yFloor) {
  const cfg = { ...DECOR[d.m], ...d };
  if (!cfg.url) return null;
  const { pivot, size } = normalized(await loadModel(cfg.url), d.yaw);
  const s = cfg.h ? cfg.h / size.y : cfg.w ? cfg.w / size.x : cfg.len / Math.max(size.x, size.z);
  const root = new THREE.Group(); root.add(pivot); root.scale.setScalar(s);
  root.position.set(d.x, yFloor + (d.y || 0), d.z);
  shadows(root); group.add(root);
  return root;
}
