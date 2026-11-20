import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { Sky } from '../vendor/Sky.js';
import { makeMaterials, upgradeMaterials } from './materials.js';
import { buildHouse } from './builder.js';
import { Walker, bindJoystick } from './walk.js';
import { Recorder } from './record.js';

const $ = (s) => document.querySelector(s);
const isTouch = matchMedia('(pointer: coarse)').matches;
const quality = isTouch ? 'low' : 'high';

// ---------- escena ----------
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 2 : 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 6000);
camera.position.set(-13, 7.5, 19);

const sky = new Sky(); sky.scale.setScalar(3000); scene.add(sky);
const su = sky.material.uniforms;
su.turbidity.value = 4; su.rayleigh.value = 1.4; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.8;

const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
sun.castShadow = true;
const SM = isTouch ? 2048 : 4096;
sun.shadow.mapSize.set(SM, SM);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 160 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
sun.target.position.set(4, 2, -9);
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xfff3e4, 0x8a7a60, 0.3);
scene.add(hemi);

const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
let envRT = null;
const sunDir = new THREE.Vector3();

function setHour(h, rebuildEnv = true) {
  const el = THREE.MathUtils.degToRad(Math.max(6, 90 * Math.sin(Math.PI * (h - 5.5) / 13)) * 0.78);
  const az = THREE.MathUtils.degToRad(90 + (h - 6) * 15); // este -> sur -> oeste; norte = -z
  sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  su.sunPosition.value.copy(sunDir);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 70);
  const k = THREE.MathUtils.smoothstep(Math.sin(el), 0.0, 0.35);
  sun.intensity = 0.3 + 2.1 * k;
  sun.color.setHSL(0.09 + 0.03 * k, 0.55 - 0.25 * k, 0.6 + 0.2 * k);
  hemi.intensity = 0.16 + 0.16 * k;
  renderer.toneMappingExposure = 0.5 + 0.15 * k;
  if (rebuildEnv) {
    envScene.clear();
    const s2 = new Sky(); s2.scale.setScalar(3000);
    Object.keys(su).forEach((key) => { if (s2.material.uniforms[key]) s2.material.uniforms[key].value = su[key].value.clone ? su[key].value.clone() : su[key].value; });
    envScene.add(s2);
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene);
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.2;
  }
}

// ---------- modelo ----------
const M = makeMaterials(quality);
upgradeMaterials(M, renderer);
let house, walker, controls;
const state = { mode: 'orbit', level: 'todo', mirror: false, tour: null, hour: 11 };

async function load() {
  const [model, extras] = await Promise.all([
    fetch('models/casa-pastora.json').then((r) => r.json()),
    fetch('models/casa-pastora.extras.json').then((r) => r.json()),
  ]);
  house = buildHouse(model, extras, M, quality);
  scene.add(house.root);
  walker = new Walker(camera, canvas, house);
  bindJoystick($('#joy'), walker);
  controls = new OrbitControls(camera, canvas);
  controls.target.copy(house.center); controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.03; controls.minDistance = 2; controls.maxDistance = 90;
  controls.update();
  setHour(state.hour);
  $('#loading').remove();
  document.body.classList.add('ready');
  $('#info').textContent = `${model.meta.fuente} · ${house.stats.walls} muros, ${house.stats.windows} ventanas, ${house.stats.doors} puertas`;
  window.__va = { THREE, scene, camera, controls, walker, house, state, setMode, setLevel, setMirror, setHour, tour: startTour, renderer, recorder: () => rec };
  requestAnimationFrame(loop);
}

// ---------- modos ----------
function setMode(m) {
  state.mode = m;
  document.body.dataset.mode = m;
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  if (m === 'walk') {
    controls.enabled = false;
    const sp = house.spawn;
    walker.mirror = state.mirror;
    walker.start(state.mirror ? -sp.x : sp.x, sp.z, sp.yaw, 0);
    setLevel('todo');
  } else {
    walker.stop();
    controls.enabled = true;
    if (m === 'top') { setLevel('sin-techo'); flyTo(new THREE.Vector3(4.1, 40, -8.6), new THREE.Vector3(4.1, 0, -9), 900); }
    if (m === 'orbit') { flyTo(new THREE.Vector3(-13, 7.5, 19), house.center.clone(), 900); }
  }
}
function setLevel(l) {
  state.level = l;
  house.groups.roof.visible = l === 'todo';
  house.groups.pa.visible = l === 'todo' || l === 'sin-techo';
  document.querySelectorAll('[data-level]').forEach((b) => b.classList.toggle('on', b.dataset.level === l));
}
function setMirror(v) {
  state.mirror = v; house.root.scale.x = v ? -1 : 1;
  $('[data-act="mirror"]').classList.toggle('on', v);
}

let fly = null;
function flyTo(pos, target, ms = 900) {
  fly = { t0: performance.now(), ms, p0: camera.position.clone(), p1: pos, t0v: controls.target.clone(), t1: target };
}

// ---------- recorrido automatico ----------
function startTour(withVideo = false) {
  if (state.mode === 'walk') setMode('orbit');
  const P = (x, y, z) => new THREE.Vector3(x, y, z);
  const pos = [P(-9, 10, 18), P(1, 3.2, 14), P(9, 3.6, 13), P(18, 9.5, 4), P(17, 10, -12), P(4, 13, -27), P(-10, 11, -14), P(-8, 10, 2),
    P(4.1, 30, 3), P(4.1, 36, -9), P(-6, 16, 8)];
  const tgt = [P(4, 3, -5), P(4.2, 3.4, -3), P(4.2, 3.2, -3), P(4, 2.5, -9), P(4, 2.5, -9), P(4, 2.5, -9), P(4, 2.5, -9), P(4, 2.5, -4),
    P(4.1, 0, -9), P(4.1, 0, -9), P(4.1, 1.5, -9)];
  state.tour = { t0: performance.now(), dur: 44000, cp: new THREE.CatmullRomCurve3(pos, false, 'centripetal'), ct: new THREE.CatmullRomCurve3(tgt, false, 'centripetal'), roofOff: false, video: withVideo };
  controls.enabled = false;
  setLevel('todo');
  if (withVideo) startRec();
}
function tourStep(now) {
  const T = state.tour, u = Math.max(0, Math.min(1, (now - T.t0) / T.dur));
  const e = u * u * (3 - 2 * u) * 0.35 + u * 0.65; // arranque y llegada suaves
  camera.position.copy(T.cp.getPoint(e));
  camera.lookAt(T.ct.getPoint(e));
  if (u > 0.74 && !T.roofOff) { T.roofOff = true; setLevel('sin-techo'); }
  if (u >= 1) {
    const v = T.video; state.tour = null; controls.enabled = true;
    controls.target.copy(house.center); setLevel('todo'); setMode('orbit');
    if (v) stopRec();
  }
}

// ---------- grabacion ----------
const rec = new Recorder(canvas);
function startRec() {
  if (rec.active) return;
  if (!rec.start()) { toast('Este navegador no permite grabar video.'); return; }
  $('[data-act="rec"]').classList.add('on'); $('[data-act="rec"]').textContent = '■ Detener';
  toast(`Grabando (${rec.ext.toUpperCase()})…`);
}
async function stopRec() {
  $('[data-act="rec"]').classList.remove('on'); $('[data-act="rec"]').textContent = '● Grabar';
  const res = await rec.stop();
  if (res) showVideo(res);
}
function showVideo({ url, ext, blob }) {
  $('#vid video').src = url;
  const a = $('#vid a'); a.href = url; a.download = `virtual-arq.${ext}`;
  const share = $('#vid [data-act="share"]');
  const file = new File([blob], `virtual-arq.${ext}`, { type: blob.type });
  share.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
  share.onclick = () => navigator.share({ files: [file], title: 'Virtual ARQ' }).catch(() => {});
  $('#vid').hidden = false;
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 3200); }

// ---------- interfaz ----------
document.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || !house) return;
  if (b.dataset.mode) { state.tour = null; setMode(b.dataset.mode); }
  else if (b.dataset.level) setLevel(b.dataset.level);
  else if (b.dataset.act === 'mirror') { setMirror(!state.mirror); if (state.mode === 'walk') setMode('walk'); }
  else if (b.dataset.act === 'rec') rec.active ? stopRec() : startRec();
  else if (b.dataset.act === 'tour') startTour(false);
  else if (b.dataset.act === 'tourvideo') startTour(true);
  else if (b.dataset.act === 'closevid') { $('#vid').hidden = true; $('#vid video').removeAttribute('src'); }
  else if (b.dataset.act === 'help') $('#help').hidden = !$('#help').hidden;
});
$('#hour').addEventListener('input', (e) => { state.hour = +e.target.value; setHour(state.hour, false); $('#hourl').textContent = fmtHour(state.hour); });
$('#hour').addEventListener('change', () => setHour(state.hour, true));
const fmtHour = (h) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
$('#hourl').textContent = fmtHour(state.hour);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------- bucle ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (fly) {
    const t = Math.min(1, (now - fly.t0) / fly.ms), e = t * t * (3 - 2 * t);
    camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0v, fly.t1, e);
    if (t >= 1) fly = null;
  }
  if (state.tour) tourStep(now);
  else if (state.mode === 'walk') walker.update(dt);
  else controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
load().catch((e) => { console.error(e); const l = $('#loading'); if (l) l.textContent = 'Error al cargar: ' + e.message; });
