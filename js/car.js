// Auto tipo SUV compacta, modelado por codigo (sin archivos externos).
// Ejes locales: +z = frente del auto, +x = lado derecho, y = arriba.
// El origen queda en el suelo, justo en medio de los dos ejes.
// Largo 4.40 m, ancho 1.85 m, alto 1.65 m, distancia entre ejes 2.70 m.
import * as THREE from 'three';

const W = 1.85;          // ancho de carroceria
const R = 0.35;          // radio de llanta
const AX = 1.35;         // mitad de la distancia entre ejes

// Extruye un perfil lateral (u = largo hacia el frente, v = altura) a lo ancho.
function sideExtrude(shape, width, bevel = 0.07) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 4, curveSegments: 20,
  });
  // el perfil esta en el plano XY y se extruye en +Z: lo giramos para que el
  // largo quede en Z del auto y el ancho en X, centrado
  g.translate(0, 0, -(width - 2 * bevel) / 2);
  g.rotateY(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

export function makeCar({ color = 0xb7bcc2 } = {}) {
  const car = new THREE.Group();

  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.65, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0f1a22, metalness: 0.1, roughness: 0.05, clearcoat: 1, side: THREE.DoubleSide });
  const plastic = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7, metalness: 0.1 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.2, metalness: 1 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.95 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.25, metalness: 0.9 });
  const lampW = new THREE.MeshStandardMaterial({ color: 0xf4f7ff, emissive: 0xdfe8ff, emissiveIntensity: 0.5, roughness: 0.15 });
  const lampR = new THREE.MeshStandardMaterial({ color: 0xb3121a, emissive: 0x7a0a10, emissiveIntensity: 0.6, roughness: 0.2 });
  const plate = new THREE.MeshStandardMaterial({ color: 0xe9e6d8, roughness: 0.5 });

  // ---- carroceria inferior (perfil lateral con arcos para las llantas) ----
  const s = new THREE.Shape();
  const bot = 0.27, arch = R + 0.09;
  s.moveTo(-2.15, bot + 0.10);
  s.lineTo(-2.15, 0.62);
  s.bezierCurveTo(-2.17, 0.82, -2.15, 0.98, -2.05, 1.05);      // cola
  s.lineTo(-1.0, 1.08);                                          // tapa de cajuela
  s.lineTo(0.95, 1.05);                                          // cintura
  s.bezierCurveTo(1.55, 1.04, 2.00, 0.98, 2.20, 0.86);          // cofre
  s.bezierCurveTo(2.27, 0.80, 2.28, 0.62, 2.25, 0.50);          // frente
  s.lineTo(2.22, bot + 0.10);
  s.lineTo(AX + arch + 0.04, bot);                               // piso delantero
  s.absarc(AX, R, arch, -0.2, Math.PI + 0.2, false);             // arco llanta delantera
  s.lineTo(-AX + arch + 0.04, bot);
  s.absarc(-AX, R, arch, -0.2, Math.PI + 0.2, false);            // arco llanta trasera
  s.lineTo(-2.15, bot + 0.10);
  const lower = new THREE.Mesh(sideExtrude(s, W, 0.08), paint);
  car.add(lower);

  // ---- cabina (techo y pilares): un poco mas angosta ----
  const c = new THREE.Shape();
  c.moveTo(1.12, 1.03);
  c.lineTo(0.50, 1.62);                                          // parabrisas (recto)
  c.bezierCurveTo(0.25, 1.67, -1.0, 1.68, -1.62, 1.64);          // techo
  c.lineTo(-2.02, 1.06);                                         // luneta (recta)
  c.lineTo(1.12, 1.03);
  const cabinW = 1.60;
  const cabin = new THREE.Mesh(sideExtrude(c, cabinW, 0.06), paint);
  car.add(cabin);

  // ---- vidrios laterales (laminas que sobresalen apenas de la cabina) ----
  const sideWin = (u0, u1, v0, v1a, v1b) => {
    const sh = new THREE.Shape();
    sh.moveTo(u0, v0); sh.lineTo(u1, v0); sh.lineTo(u1, v1b); sh.lineTo(u0, v1a); sh.lineTo(u0, v0);
    return sh;
  };
  const addSide = (sh) => {
    for (const sx of [-1, 1]) {
      const g = new THREE.ShapeGeometry(sh);
      g.rotateY(-Math.PI / 2);   // largo del perfil -> eje Z del auto (vidrio de doble cara)
      const m = new THREE.Mesh(g, glass);
      m.position.x = sx * (cabinW / 2 + 0.072);
      car.add(m);
    }
  };
  // puertas delanteras, traseras y ventanilla trasera pequena
  addSide(sideWin(0.0, 0.88, 1.12, 1.52, 1.20));
  addSide(sideWin(-0.95, -0.06, 1.12, 1.57, 1.57));
  addSide(sideWin(-1.62, -1.00, 1.12, 1.56, 1.40));

  // ---- parabrisas y luneta ----
  const glassPane = (a, b, wTop, wBot) => {
    // a y b = [z, y] de los extremos del cristal; ancho en cada extremo
    const geo = new THREE.BufferGeometry();
    const v = [
      -wBot / 2, a[1], a[0],  wBot / 2, a[1], a[0],
       wTop / 2, b[1], b[0], -wTop / 2, b[1], b[0],
    ];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, glass);
    car.add(m);
  };
  glassPane([1.176, 1.08], [0.556, 1.67], 1.28, 1.48);          // parabrisas
  glassPane([-2.08, 1.10], [-1.68, 1.68], 1.24, 1.44);        // luneta

  // ---- parachoques, parrilla y luces ----
  const box = (w, h, d, mat, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.rotation.y = ry; car.add(m); return m;
  };
  box(1.80, 0.20, 0.10, plastic, 0, 0.40, 2.28);               // parachoques delantero inferior
  box(1.10, 0.16, 0.05, plastic, 0, 0.68, 2.33);               // parrilla
  box(0.74, 0.015, 0.04, chrome, 0, 0.72, 2.36);
  box(0.30, 0.10, 0.06, lampW, -0.74, 0.78, 2.31);             // faros
  box(0.30, 0.10, 0.06, lampW, 0.74, 0.78, 2.31);
  box(1.80, 0.18, 0.10, plastic, 0, 0.40, -2.22);              // parachoques trasero
  box(0.22, 0.28, 0.06, lampR, -0.78, 0.86, -2.22);            // calaveras
  box(0.22, 0.28, 0.06, lampR, 0.78, 0.86, -2.22);
  box(0.40, 0.12, 0.02, plate, 0, 0.58, -2.29);                // placa trasera
  box(0.40, 0.12, 0.02, plate, 0, 0.45, 2.36);                 // placa delantera
  // espejos laterales
  box(0.10, 0.10, 0.20, paint, -0.97, 1.15, 0.92);
  box(0.10, 0.10, 0.20, paint, 0.97, 1.15, 0.92);
  // barras del techo
  box(0.04, 0.04, 1.9, plastic, -0.72, 1.70, -0.45);
  box(0.04, 0.04, 1.9, plastic, 0.72, 1.70, -0.45);
  // molduras laterales inferiores
  box(0.04, 0.12, 2.0, plastic, -0.93, 0.34, 0.0);
  box(0.04, 0.12, 2.0, plastic, 0.93, 0.34, 0.0);

  // ---- interior de los arcos (evita ver a traves del auto) ----
  for (const z of [AX, -AX]) box(1.46, 0.50, 0.86, plastic, 0, 0.58, z);

  // ---- llantas y rines ----
  const wheelGeo = new THREE.CylinderGeometry(R, R, 0.24, 28);
  const rimGeo = new THREE.CylinderGeometry(R - 0.10, R - 0.10, 0.25, 24);
  const hubGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.27, 12);
  const spokeGeo = new THREE.BoxGeometry(0.03, 0.27, R * 1.45);
  for (const sx of [-1, 1]) for (const z of [AX, -AX]) {
    const w = new THREE.Group();
    const t = new THREE.Mesh(wheelGeo, tire); const r = new THREE.Mesh(rimGeo, rim); const h = new THREE.Mesh(hubGeo, chrome);
    w.add(t, r, h);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(spokeGeo, rim); sp.rotation.y = (i / 5) * Math.PI; w.add(sp);
    }
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * 0.78, R, z);
    car.add(w);
  }

  car.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return car;
}
