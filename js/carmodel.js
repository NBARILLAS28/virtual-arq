// Carga un auto real (GLB de Sketchfab) y lo normaliza:
// +z = frente, origen en el suelo y centrado, largo en metros.
// Creditos de los modelos: ver CREDITS.md
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const loader = new GLTFLoader();

export const CAR_MODELS = {
  jeep:   { url: './models/jeep.glb',   length: 4.23, wheelbase: 2.57, flip: false, name: 'Jeep Renegade 2016' },
  ranger: { url: './models/ranger.glb', length: 5.36, wheelbase: 3.22, flip: false, name: 'Ford Ranger Raptor 2019' },
  mazda6: { url: './models/mazda6.glb', length: 4.87, wheelbase: 2.73, flip: false, name: 'Mazda 6 Sedan 2011' },
};

export async function loadCar(key = 'jeep', override = {}) {
  const cfg = { ...CAR_MODELS[key], ...override };
  const gltf = await loader.loadAsync(cfg.url);
  const inner = gltf.scene;
  inner.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(inner);
  let size = box.getSize(new THREE.Vector3());
  const pivot = new THREE.Group();
  pivot.add(inner);
  // el lado largo debe quedar en Z
  if (size.x > size.z) pivot.rotation.y = Math.PI / 2;
  if (cfg.flip) pivot.rotation.y += Math.PI;
  pivot.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(pivot);
  size = box.getSize(new THREE.Vector3());
  const s = cfg.length / size.z;
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);          // en coordenadas de pivot
  const root = new THREE.Group();
  root.add(pivot);
  pivot.scale.setScalar(s);
  pivot.position.set(0, 0, 0);
  // reajusta: el offset de inner esta en unidades del pivot sin escalar
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = false;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((m) => { if (m.map) m.map.anisotropy = 8; m.envMapIntensity = 1; });
    }
  });
  root.userData.cfg = cfg;
  return root;
}
