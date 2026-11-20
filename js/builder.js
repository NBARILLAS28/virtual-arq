// Construye la casa en 3D a partir del model.json (leido del PDF) y del
// archivo de extras (gradas, vacios, muebles). Unidades: metros.
// Ejes: x a la derecha, y arriba, z hacia la calle. Origen: ejes A y 1.
import * as THREE from 'three';

const EPS = 0.001;

export function buildHouse(model, extras, M, quality = 'high') {
  const L = model.levels;
  const T = 0.15; // espesor de losas
  const root = new THREE.Group();
  const G = { site: new THREE.Group(), pb: new THREE.Group(), pa: new THREE.Group(), roof: new THREE.Group() };
  Object.values(G).forEach((g) => root.add(g));
  const solids = [];   // cajas de colision {x0,x1,y0,y1,z0,z1}
  const surfaces = []; // superficies caminables {x0,x1,z0,z1,y} o rampas {ramp:true,...}
  const log = [];

  // ---------- utilidades ----------
  function worldUV(geo, cx, cy, cz) {
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const f = Math.floor(i / 4);
      const x = p.getX(i) + cx, y = p.getY(i) + cy, z = p.getZ(i) + cz;
      if (f < 2) uv.setXY(i, z, y);
      else if (f < 4) uv.setXY(i, x, z);
      else uv.setXY(i, x, y);
    }
    uv.needsUpdate = true;
  }
  function box(parent, x0, x1, y0, y1, z0, z1, mat, o = {}) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    if (w <= EPS || h <= EPS || d <= EPS) return null;
    const geo = new THREE.BoxGeometry(w, h, d);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    worldUV(geo, cx, cy, cz);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(cx, cy, cz);
    m.castShadow = o.cast !== false;
    m.receiveShadow = o.receive !== false;
    parent.add(m);
    if (o.solid) solids.push({ x0, x1, y0, y1, z0, z1 });
    return m;
  }
  const slabMats = (top, bottom = M.ceiling, side = M.concrete) => [side, side, top, bottom, side, side];

  // descompone un rectangulo restando vacios (rejilla de celdas)
  function cellsMinusVoids(x0, x1, z0, z1, voids) {
    const xs = new Set([x0, x1]), zs = new Set([z0, z1]);
    voids.forEach((v) => { [v.x0, v.x1].forEach((x) => x > x0 && x < x1 && xs.add(x)); [v.z0, v.z1].forEach((z) => z > z0 && z < z1 && zs.add(z)); });
    const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b), out = [];
    for (let i = 0; i < X.length - 1; i++) for (let j = 0; j < Z.length - 1; j++) {
      const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2;
      if (voids.some((v) => cx > v.x0 && cx < v.x1 && cz > v.z0 && cz < v.z1)) continue;
      out.push([X[i], X[i + 1], Z[j], Z[j + 1]]);
    }
    return out;
  }

  // ---------- muros desde el PDF ----------
  const levelCfg = {
    pb: { base: L.pb, top: L.pa - T, group: G.pb, inner: M.plasterInt },
    pa: { base: L.pa, top: L.techo - T, group: G.pa, inner: M.plasterInt },
  };
  const stats = { walls: 0, windows: 0, doors: 0 };

  function wallSpan(r) {
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    return { cx, cz };
  }

  function processLevel(key) {
    const cfg = levelCfg[key];
    const raw = model.walls[key].map((r) => {
      const w = r.x1 - r.x0, d = r.z1 - r.z0, { cx, cz } = wallSpan(r);
      let base = cfg.base, top = cfg.top, cat = 'n';
      if (key === 'pb') {
        if (cx > 5.0 && cz > -4.6) { base = L.garaje; top = L.pb; cat = 'g'; }          // muros de contencion del garage
        else if (cx > 4.0 && cz > -4.85 && cz < -4.5) { base = L.garaje; cat = 'd'; }  // pared sur del dormitorio
        else if (cx < 1 && cz > -3.0) { top = 2.4; cat = 'f'; }                         // muro lateral del jardin
        else if (cz < -18.5) { top = 2.4; cat = 'b'; }                                  // muro del fondo
      }
      return w >= d
        ? { o: 'h', c: cz, t: d, a: r.x0, b: r.x1, base, top, cat }
        : { o: 'v', c: cx, t: w, a: r.z0, b: r.z1, base, top, cat };
    });

    const isExterior = (o, c) => {
      const zFront = key === 'pb' ? -3.0 : -2.93;
      if (o === 'v') return Math.abs(c - 0) < 0.25 || Math.abs(c - 8.2) < 0.25;
      return Math.abs(c - -17.255) < 0.25 || Math.abs(c - zFront) < 0.25;
    };

    // agrupa por orientacion, categoria y linea; une tramos que se tocan
    const lines = [];
    ['h', 'v'].forEach((o) => {
      const ofO = raw.filter((s) => s.o === o).sort((p, q) => p.c - q.c);
      let cluster = null;
      ofO.forEach((s) => {
        if (cluster && Math.abs(s.c - cluster.c) < 0.06 && s.cat === cluster.cat) { cluster.items.push(s); cluster.t = Math.max(cluster.t, s.t); }
        else { cluster = { o, c: s.c, t: s.t, cat: s.cat, base: s.base, top: s.top, items: [s] }; lines.push(cluster); }
      });
    });

    lines.forEach((ln) => {
      const segs = [];
      ln.items.sort((p, q) => p.a - q.a).forEach((s) => {
        const last = segs[segs.length - 1];
        if (last && s.a <= last.b + 0.03) last.b = Math.max(last.b, s.b); else segs.push({ a: s.a, b: s.b });
      });
      // pieza solida de cada tramo
      const emit = (a, b, y0, y1, mat) => {
        if (b - a <= EPS || y1 - y0 <= EPS) return;
        if (ln.o === 'h') box(cfg.group, a, b, y0, y1, ln.c - ln.t / 2, ln.c + ln.t / 2, mat, { solid: true });
        else box(cfg.group, ln.c - ln.t / 2, ln.c + ln.t / 2, y0, y1, a, b, mat, { solid: true });
      };
      const ext = isExterior(ln.o, ln.c);
      const mat = ln.cat === 'g' ? M.concrete : ln.cat === 'f' || ln.cat === 'b' ? M.plasterExt : ext ? M.plasterExt : M.plasterInt;
      segs.forEach((s) => { emit(s.a, s.b, ln.base, ln.top, mat); stats.walls++; });

      // huecos entre tramos -> puertas y ventanas
      for (let i = 0; i < segs.length - 1; i++) {
        let gaps = [[segs[i].b, segs[i + 1].a]];
        if (gaps[0][1] - gaps[0][0] > 4.4) continue;
        // los muros perpendiculares que cruzan el hueco lo tapan
        raw.filter((p) => p.o !== ln.o && p.a - 0.1 <= ln.c && ln.c <= p.b + 0.1).forEach((p) => {
          const pa = p.c - p.t / 2, pb = p.c + p.t / 2, next = [];
          gaps.forEach(([ga, gb]) => {
            if (pb <= ga || pa >= gb) next.push([ga, gb]);
            else { if (pa > ga) next.push([ga, pa]); if (pb < gb) next.push([pb, gb]); }
          });
          gaps = next;
        });
        gaps.forEach(([ga, gb]) => {
          const w = gb - ga;
          if (w < 0.45) return;
          let sill, head, glass = false;
          if (ext) { glass = true; if (w >= 2.0) { sill = 0; head = 2.2; } else { sill = 1.0; head = 2.1; } }
          else { sill = 0; head = w > 1.3 ? 2.4 : 2.1; }
          const y0 = ln.base, y1 = ln.top;
          emit(ga, gb, y0, y0 + sill, mat);
          emit(ga, gb, y0 + head, y1, mat);
          if (glass) {
            stats.windows++;
            const t = 0.05, f = M.frame;
            const fb = (a, b, ya, yb) => ln.o === 'h'
              ? box(cfg.group, a, b, y0 + ya, y0 + yb, ln.c - t / 2, ln.c + t / 2, f, { solid: false })
              : box(cfg.group, ln.c - t / 2, ln.c + t / 2, y0 + ya, y0 + yb, a, b, f, { solid: false });
            fb(ga, gb, sill, sill + 0.05); fb(ga, gb, head - 0.05, head);
            fb(ga, ga + 0.05, sill, head); fb(gb - 0.05, gb, sill, head);
            if (w > 1.1) { const m = (ga + gb) / 2; fb(m - 0.025, m + 0.025, sill, head); }
            const gl = ln.o === 'h'
              ? box(cfg.group, ga, gb, y0 + sill, y0 + head, ln.c - 0.01, ln.c + 0.01, M.glass, { cast: false, solid: true })
              : box(cfg.group, ln.c - 0.01, ln.c + 0.01, y0 + sill, y0 + head, ga, gb, M.glass, { cast: false, solid: true });
            if (gl) gl.renderOrder = 2;
          } else stats.doors++;
        });
      }
    });
  }
  processLevel('pb');
  processLevel('pa');

  // ---------- terreno y obra exterior ----------
  const lot = extras.lot, gar = extras.garage, wk = extras.walkway;
  const bigX0 = -40, bigX1 = 48;
  // calle y banqueta
  box(G.site, bigX0, bigX1, -0.4, 0, 0.45, 14, M.asphalt, { solid: false });
  box(G.site, bigX0, bigX1, -0.4, 0.02, 0.45, 2.0, M.sidewalk, { solid: false });
  surfaces.push({ x0: bigX0, x1: bigX1, z0: 0.45, z1: 14, y: 0 });
  // terreno en torno al lote (nivel +0.90, como indica el cuadro de niveles)
  const dirtTop = L.pb - 0.12;
  const ground = [M.dirt, M.dirt, M.grass, M.dirt, M.dirt, M.dirt];
  const gtop = L.pb - 0.02;
  box(G.site, bigX0, 0, -1.2, gtop, -40, 0.45, ground, { solid: false });
  box(G.site, 8.28, bigX1, -1.2, gtop, -40, 0.45, ground, { solid: false });
  box(G.site, 0, 8.28, -1.2, gtop, -40, lot.zBack - 0.15, ground, { solid: false });
  // base del lote (se oculta bajo pisos y cesped)
  box(G.site, 0, gar.x0, -1.2, dirtTop, lot.zBack, 0.45, M.dirt, { solid: false });
  box(G.site, gar.x0, 8.28, -1.2, dirtTop, lot.zBack, gar.zIn, M.dirt, { solid: false });
  box(G.site, gar.x0, 8.28, -1.2, L.garaje - 0.15, gar.zIn, 0.45, M.dirt, { solid: false });
  // cesped jardin trasero y delantero
  box(G.site, 0.07, 8.12, dirtTop, L.pb - 0.01, lot.zBack + 0.15, -17.35, M.grass, { solid: false });
  surfaces.push({ x0: 0.07, x1: 8.12, z0: lot.zBack + 0.15, z1: -17.35, y: L.pb });
  box(G.site, 0.07, 4.2, dirtTop, L.pb - 0.01, -2.0, 0.1, M.grass, { solid: false });
  // deck de madera y pozo
  const dk = extras.deck;
  box(G.pb, dk.x0, dk.x1, L.pb - 0.12, L.pb + 0.04, dk.z0, dk.z1, M.deck, { solid: false });
  const well = extras.well;
  const wellMesh = new THREE.Mesh(new THREE.CylinderGeometry(well.r, well.r, 0.35, 28), M.concrete);
  wellMesh.position.set(well.x, L.pb + 0.04 + 0.175, well.z); wellMesh.castShadow = wellMesh.receiveShadow = true; G.pb.add(wellMesh);
  solids.push({ x0: well.x - well.r, x1: well.x + well.r, y0: L.pb, y1: L.pb + 0.4, z0: well.z - well.r, z1: well.z + well.r });
  const wellWater = new THREE.Mesh(new THREE.CircleGeometry(well.r - 0.07, 28), new THREE.MeshStandardMaterial({ color: 0x1d4f73, roughness: 0.1, metalness: 0.2 }));
  wellWater.rotation.x = -Math.PI / 2; wellWater.position.set(well.x, L.pb + 0.215, well.z); G.pb.add(wellWater);
  // muro frontal de piedra rustica
  const fw = extras.frontWall;
  box(G.site, fw.x0, fw.x1, 0, fw.h, fw.z0, fw.z1, M.stoneRustic, { solid: true });
  // caminamiento peatonal con gradas
  const rise = wk.riserH, tr = (Math.abs(wk.zTop - wk.zFront) - 0.3) / wk.risers;
  for (let i = 1; i <= wk.risers; i++) {
    const zf = wk.zFront - (i - 1) * tr, zb = i === wk.risers ? wk.zTop : wk.zFront - i * tr;
    box(G.site, wk.x0, wk.x1, 0, i * rise, zb, zf, M.concrete, { solid: false });
    surfaces.push({ x0: wk.x0, x1: wk.x1, z0: zb, z1: zf, y: i * rise });
  }
  box(G.site, wk.x0, wk.x1, -0.4, 0.02, 0.0, 0.45, M.concrete, { solid: false });
  surfaces.push({ x0: wk.x0, x1: wk.x1, z0: 0.0, z1: 0.45, y: 0 });
  // superficies caminables del lote a +0.90
  surfaces.push({ x0: 0.0, x1: 4.28, z0: -18.95, z1: 0.1, y: L.pb });
  surfaces.push({ x0: 4.28, x1: gar.x0, z0: -18.95, z1: wk.zTop, y: L.pb });
  surfaces.push({ x0: gar.x0, x1: 8.28, z0: -18.95, z1: gar.zIn, y: L.pb });

  // ---------- losa y piso de planta baja ----------
  const pbFloor = [[0.07, 8.12, -17.33, gar.zIn], [0.07, 4.12, gar.zIn, -3.0]];
  pbFloor.forEach(([x0, x1, z0, z1]) => box(G.pb, x0, x1, L.pb - T, L.pb, z0, z1, slabMats(M.tile, M.concrete), { solid: false }));
  // pasillo exterior cubierto frente a la puerta
  box(G.pb, 4.12, 5.35, L.pb - T, L.pb, gar.zIn, -3.0, slabMats(M.tile, M.concrete), { solid: false });
  box(G.pb, 4.12, 5.35, L.pb - T, L.pb, -4.55, -3.0, slabMats(M.concrete, M.concrete), { solid: false });

  // ---------- garage: piso, rampa, columnas, dintel, porton ----------
  box(G.pb, gar.x0, gar.x1, L.garaje - 0.15, L.garaje, gar.zIn, gar.rampFrom, M.concrete, { solid: false });
  surfaces.push({ x0: gar.x0, x1: gar.x1, z0: gar.zIn, z1: gar.rampFrom, y: L.garaje });
  const rl = Math.hypot(gar.rampTo - gar.rampFrom, L.garaje), ang = Math.atan2(L.garaje, gar.rampTo - gar.rampFrom);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(gar.x1 - gar.x0, 0.12, rl), M.concrete);
  ramp.position.set((gar.x0 + gar.x1) / 2, L.garaje / 2 - 0.06, (gar.rampFrom + gar.rampTo) / 2);
  ramp.rotation.x = ang; ramp.castShadow = ramp.receiveShadow = true; G.pb.add(ramp);
  surfaces.push({ ramp: true, x0: gar.x0, x1: gar.x1, z0: gar.rampFrom, z1: gar.rampTo, y0: L.garaje, y1: 0 });
  box(G.site, gar.x0, gar.x1, -0.4, 0.0, gar.rampTo, 0.45, M.concrete, { solid: false });
  surfaces.push({ x0: gar.x0, x1: gar.x1, z0: gar.rampTo, z1: 0.45, y: 0 });
  // columnas frontales de ladrillo y dintel
  [[5.15, 5.35], [8.1, 8.3]].forEach(([a, b]) => box(G.pb, a, b, L.garaje, L.pa, -0.05, 0.15, M.brick, { solid: true }));
  box(G.pb, 5.15, 8.3, L.pa - 0.95, L.pa + 0.9, -0.05, 0.2, M.brick, { solid: true });
  // porton corredizo (abierto parcialmente: hoja recogida a un lado)
  box(G.pb, 6.9, 8.1, L.garaje, L.pa - 0.95, 0.0, 0.05, M.metalDark, { solid: true });

  // ---------- gradas en U ----------
  const st = extras.stair, tw = (st.x1 - st.x0) / st.risersPerFlight;
  const landY = L.pb + st.risersPerFlight * st.riserH;
  for (let i = 1; i <= st.risersPerFlight; i++) {
    const y = L.pb + i * st.riserH;
    const xa = st.x1 - i * tw, xb = st.x1 - (i - 1) * tw;
    box(G.pb, xa, xb, L.pb, y, st.southZ0, st.southZ1, M.concrete, { solid: false });
    surfaces.push({ x0: xa, x1: xb, z0: st.southZ0, z1: st.southZ1, y });
    const y2 = landY + i * st.riserH;
    const xa2 = st.x0 + (i - 1) * tw, xb2 = i === st.risersPerFlight ? 2.8 : st.x0 + i * tw;
    box(G.pb, xa2, xb2, L.pb, y2, st.northZ0, st.northZ1, M.concrete, { solid: false });
    surfaces.push({ x0: xa2, x1: xb2, z0: st.northZ0, z1: st.northZ1, y: y2 });
  }
  box(G.pb, st.landingX0, st.x0, L.pb, landY, st.northZ0, st.southZ1, M.concrete, { solid: false });
  surfaces.push({ x0: st.landingX0, x1: st.x0, z0: st.northZ0, z1: st.southZ1, y: landY });
  // jardinera bajo el pozo de la escalera
  box(G.pb, st.x0, st.x1, L.pb, L.pb + 0.4, st.northZ1, st.southZ0, M.stoneRustic, { solid: true });
  const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), M.leaf);
  shrub.position.set((st.x0 + st.x1) / 2, L.pb + 0.7, (st.northZ1 + st.southZ0) / 2); shrub.scale.y = 0.7; shrub.castShadow = true; G.pb.add(shrub);
  // baranda del pozo en planta alta (lado este, tramo sur)
  box(G.pa, 2.78, 2.82, L.pa, L.pa + 0.9, st.southZ0, st.southZ1, M.wood, { solid: true });
  box(G.pa, 2.76, 2.84, L.pa + 0.88, L.pa + 0.94, st.southZ0, st.southZ1, M.wood, { solid: true });
  box(G.pa, st.x0, 2.78, L.pa, L.pa + 0.9, st.southZ1 - 0.04, st.southZ1, M.wood, { cast: false, solid: false });

  // ---------- losa de planta alta ----------
  const paVoids = extras.voids.pa;
  const paCells = cellsMinusVoids(-0.07, 8.28, -17.33, -2.93, paVoids);
  paCells.forEach(([x0, x1, z0, z1]) => {
    box(G.pa, x0, x1, L.pa - T, L.pa, z0, z1, slabMats(M.tile, M.ceiling), { solid: false });
    surfaces.push({ x0, x1, z0, z1, y: L.pa });
  });
  // balcon, terraza sobre garage
  const bc = extras.balcony, tz = extras.terrace;
  box(G.pa, bc.x0, bc.x1, L.pa - T, L.pa + 0.03, bc.z0, bc.z1, slabMats(M.deck, M.concrete), { solid: false });
  surfaces.push({ x0: bc.x0, x1: bc.x1, z0: bc.z0, z1: bc.z1, y: L.pa + 0.03 });
  box(G.pa, tz.x0, tz.x1, L.pa - T, L.pa, tz.z0, tz.z1, slabMats(M.concrete, M.ceiling), { solid: false });
  surfaces.push({ x0: tz.x0, x1: tz.x1, z0: tz.z0, z1: tz.z1, y: L.pa });
  const ph = tz.parapetH;
  box(G.pa, tz.x1 - 0.12, tz.x1, L.pa, L.pa + ph, tz.z0, tz.z1, M.plasterExt, { solid: true });
  box(G.pa, tz.x0, tz.x0 + 0.12, L.pa, L.pa + ph, tz.z0, tz.z1, M.plasterExt, { solid: true });
  // baranda de madera del balcon
  const rz = bc.z1 - 0.04, rh = bc.railH;
  box(G.pa, bc.x0, bc.x1, L.pa + 0.03 + rh - 0.07, L.pa + 0.03 + rh, rz - 0.04, rz + 0.04, M.wood, { solid: true });
  box(G.pa, bc.x0, bc.x1, L.pa + 0.03, L.pa + 0.1, rz - 0.05, rz + 0.05, M.wood, { solid: true });
  for (let x = bc.x0 + 0.05; x < bc.x1; x += 0.13) box(G.pa, x - 0.02, x + 0.02, L.pa + 0.1, L.pa + 0.03 + rh - 0.07, rz - 0.02, rz + 0.02, M.wood, { solid: false });
  [bc.x0, bc.x1 - 0.1].forEach((x) => box(G.pa, x, x + 0.1, L.pa + 0.03, L.pa + 0.03 + rh + 0.08, rz - 0.06, rz + 0.06, M.wood, { solid: true }));
  box(G.pa, bc.x0, bc.x0 + 0.06, L.pa + 0.03, L.pa + 0.03 + rh, bc.z0, bc.z1, M.wood, { cast: false, solid: true });
  box(G.pa, bc.x1 - 0.06, bc.x1, L.pa + 0.03, L.pa + 0.03 + rh, bc.z0, bc.z1, M.wood, { cast: false, solid: true });

  // ---------- techo, parapeto, fronton de madera ----------
  box(G.roof, -0.07, 8.28, L.techo - T, L.techo, -17.33, -2.93, slabMats(M.concrete, M.ceiling), { solid: false });
  const pH = 0.55;
  box(G.roof, -0.07, 8.28, L.techo, L.techo + pH, -17.33, -17.21, M.plasterExt, { solid: false });
  box(G.roof, -0.07, 0.05, L.techo, L.techo + pH, -17.33, -2.93, M.plasterExt, { solid: false });
  box(G.roof, 8.16, 8.28, L.techo, L.techo + pH, -17.33, -2.93, M.plasterExt, { solid: false });
  box(G.roof, -0.07, 8.28, L.techo, L.techo + pH, -3.05, -2.93, M.plasterExt, { solid: false });
  // remate decorativo y fachaleta de piedra del cuarto sobre el garage
  box(G.roof, 5.0, 6.5, L.techo + pH, 7.74, -3.0, -2.75, M.plasterExt, { solid: false });
  box(G.roof, 4.9, 6.6, L.techo + pH, L.techo + pH + 0.12, -3.05, -2.7, M.concrete, { solid: false });
  box(G.pa, 5.0, 5.3, L.pa, L.techo, -2.93, -2.8, M.stoneLaja, { solid: false });
  box(G.pa, 7.0, 7.3, L.pa, L.techo, -2.93, -2.8, M.stoneLaja, { solid: false });
  box(G.pa, 5.3, 7.0, L.pa + 2.1, L.techo, -2.93, -2.8, M.stoneLaja, { solid: false });
  box(G.pa, 5.3, 7.0, L.pa, L.pa + 1.0, -2.93, -2.8, M.stoneLaja, { solid: false });
  // fronton de madera sobre el balcon (estructura decorativa)
  const gz = bc.z1 - 0.04;
  const wd = (a, b, ya, yb, z) => box(G.roof, a, b, ya, yb, z - 0.07, z + 0.07, M.wood, { solid: false });
  [0.02, 4.1].forEach((x) => box(G.pa, x, x + 0.1, L.pa + 0.03, L.techo, gz - 0.06, gz + 0.06, M.wood, { solid: false }));
  wd(0.0, 4.2, L.techo - 0.01, L.techo + 0.14, gz);
  const apex = 7.62, mid = 2.1;
  const rafter = (xa, ya, xb, yb) => {
    const len = Math.hypot(xb - xa, yb - ya), m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.14), M.wood);
    m.position.set((xa + xb) / 2, (ya + yb) / 2, gz); m.rotation.z = Math.atan2(yb - ya, xb - xa); m.castShadow = true; G.roof.add(m);
  };
  rafter(0.0, L.techo + 0.1, mid, apex); rafter(mid, apex, 4.2, L.techo + 0.1);
  rafter(mid, L.techo + 0.1, mid, apex - 0.05); rafter(0.7, L.techo + 0.1, mid, L.techo + 1.0); rafter(mid, L.techo + 1.0, 3.5, L.techo + 0.1);
  const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(4.2, 0); tri.lineTo(mid, apex - L.techo); tri.closePath();
  const triGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.14, bevelEnabled: false });
  const triMesh = new THREE.Mesh(triGeo, M.plasterExt); triMesh.position.set(0, L.techo, -2.99); triMesh.castShadow = true; G.roof.add(triMesh);

  // ---------- vecinos (volumenes) y arboles ----------
  const tree = (x, z, s = 1) => {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.16 * s, 2.6 * s, 8), M.trunk); tr.position.set(x, 1.3 * s, z); tr.castShadow = true;
    const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * s, 1), M.leaf); cr.position.set(x, 3.4 * s, z); cr.scale.y = 0.85; cr.castShadow = true;
    G.site.add(tr, cr);
  };
  tree(-2.2, 2.4, 1.0); tree(11.0, 2.2, 1.15); tree(2.5, -18.0, 0.8); tree(6.2, -18.1, 0.7);

  // ---------- auto en el garage ----------
  const car = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.62, 4.3), M.carPaint); body.position.y = 0.62;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.2), M.carPaint); cab.position.set(0, 1.18, 0.1);
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.4, 2.0), M.glass); win.position.set(0, 1.2, 0.1);
  car.add(body, cab, win);
  [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]].forEach(([x, z]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 16), M.rubber); w.rotation.z = Math.PI / 2; w.position.set(x, 0.34, z); car.add(w);
  });
  car.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  car.position.set(6.7, L.garaje, -2.85); G.pb.add(car);
  solids.push({ x0: 5.8, x1: 7.6, y0: L.garaje, y1: L.garaje + 1.5, z0: -5.0, z1: -0.7 });

  // ---------- muebles referenciales ----------
  const furnMat = { bed: [M.bedding, 0.55], sofa: [M.fabric, 0.8], armchair: [M.fabric, 0.8], table: [M.wood, 0.75], coffee: [M.wood, 0.4], chair: [M.wood, 0.9], counter: [M.counter, 0.9], fridge: [M.white, 1.8], appliance: [M.white, 0.9], wardrobe: [M.wood, 2.0] };
  extras.furniture.forEach((f) => {
    const [mat, h] = furnMat[f.t] || [M.wood, 0.8];
    const y0 = f.lvl === 'pb' ? L.pb : L.pa;
    const grp = f.lvl === 'pb' ? G.pb : G.pa;
    box(grp, f.x0, f.x1, y0, y0 + h, f.z0, f.z1, mat, { solid: f.t !== 'chair' });
    if (f.t === 'bed') box(grp, f.x0 + 0.1, f.x1 - 0.1, y0 + h, y0 + h + 0.12, f.z0 + 0.05, f.z0 + 0.45, M.white, { solid: false });
    if (f.t === 'sofa' || f.t === 'armchair') box(grp, f.x0, f.x0 + 0.22, y0 + h, y0 + h + 0.3, f.z0, f.z1, M.fabric, { solid: false });
  });

  // ---------- limites y punto de partida ----------
  return {
    root, groups: G, solids, surfaces, stats, log,
    bounds: { x0: -30, x1: 40, z0: -26, z1: 30 },
    center: new THREE.Vector3(4.1, 2.5, -9.0),
    spawn: { x: 4.7, z: 6.0, yaw: 0 },
  };
}
