// Muebles reales (GLB) que reemplazan las cajas referenciales de extras.furniture.
// Cada tipo del plano se asocia a un modelo; si el archivo no existe, queda la caja.
// Creditos de los modelos: ver CREDITS.md
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

// h = alto real en metros. face = hacia donde mira el frente del mueble por defecto (grados, 0 = +z).
// pos = 'floor' (sobre el piso) | 'top' (sobre el mueble de abajo).
export const FURN = {
  fridge:   { url: './models/muebles/fridge.glb',   h: 1.80 },
  sofa:     { url: './models/muebles/sofa.glb',     h: 0.85 },
  armchair: { url: './models/muebles/chair_arm.glb', h: 0.85 },
  table:    { url: './models/muebles/table.glb',    h: 0.76 },
  chair:    { url: './models/muebles/chair.glb',    h: 0.90 },
  bed:      { url: './models/muebles/bed.glb',      h: 1.00 },
  wardrobe: { url: './models/muebles/wardrobe.glb', h: 2.10 },
};

async function loadModel(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url).then((g) => g.scene));
  const scene = await cache.get(url);
  return scene.clone(true);
}

// Ajusta el modelo a la huella (x0..x1, z0..z1): alto real, eje largo alineado y centrado sobre y0.
export async function placeFurniture(group, item, y0, opts = {}) {
  const cfg = { ...FURN[item.t], ...(item.model || {}) };
  if (!cfg.url) return null;
  const model = await loadModel(cfg.url);
  model.updateMatrixWorld(true);
  const pivot = new THREE.Group(); pivot.add(model);
  let box = new THREE.Box3().setFromObject(model);
  const c = box.getCenter(new THREE.Vector3());
  model.position.set(-c.x, -box.min.y, -c.z);
  pivot.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(pivot);
  let size = box.getSize(new THREE.Vector3());

  const fw = item.x1 - item.x0, fd = item.z1 - item.z0;
  const footLong = fw >= fd ? 'x' : 'z';
  const modelLong = size.x >= size.z ? 'x' : 'z';
  let yaw = (cfg.yaw || 0) + (item.yaw || 0) * Math.PI / 180;
  if (footLong !== modelLong) yaw += Math.PI / 2;
  pivot.rotation.y = yaw;
  pivot.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(pivot);
  size = box.getSize(new THREE.Vector3());

  // escala: alto real, pero sin salirse de la huella del plano
  let s = (cfg.h || size.y) / size.y;
  s = Math.min(s, (fw * 1.04) / size.x, (fd * 1.04) / size.z);
  if (cfg.fill) s = Math.min((fw) / size.x, (fd) / size.z);
  const root = new THREE.Group(); root.add(pivot); pivot.scale.setScalar(s);
  root.position.set((item.x0 + item.x1) / 2, y0 + (opts.lift || 0), (item.z0 + item.z1) / 2);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(root);
  return root;
}
