// Recorrido a pie: teclado (WASD/flechas), joystick tactil y arrastre para mirar.
// Colision contra las cajas solidas de la casa y alturas de piso por superficie.
import * as THREE from 'three';

const R = 0.24, EYE = 1.62, STEP_UP = 0.46, STEP_DOWN = 0.62;

export class Walker {
  constructor(camera, dom, house) {
    this.camera = camera; this.dom = dom; this.house = house;
    this.active = false; this.mirror = false;
    this.x = 0; this.z = 0; this.y = 0; this.yaw = 0; this.pitch = 0;
    this.keys = new Set(); this.joy = { x: 0, y: 0 };
    this._look = null;
    this._bind();
  }

  _xm(x) { return this.mirror ? -x : x; }

  groundAt(x, z, feet) {
    const xm = this._xm(x);
    let best = null;
    for (const s of this.house.surfaces) {
      if (xm < s.x0 || xm > s.x1 || z < s.z0 || z > s.z1) continue;
      let y = s.y;
      if (s.ramp) { const t = (z - s.z0) / (s.z1 - s.z0); y = s.y0 + (s.y1 - s.y0) * t; }
      if (y > feet + STEP_UP || y < feet - STEP_DOWN) continue;
      if (best === null || y > best) best = y;
    }
    return best;
  }

  blocked(x, z, feet) {
    const xm = this._xm(x);
    for (const s of this.house.solids) {
      if (xm + R > s.x0 && xm - R < s.x1 && z + R > s.z0 && z - R < s.z1 && s.y1 > feet + 0.4 && s.y0 < feet + 1.75) return true;
    }
    return false;
  }

  start(x, z, yaw, feet = 0) {
    this.x = x; this.z = z; this.yaw = yaw; this.pitch = 0;
    const g = this.groundAt(x, z, feet);
    this.y = g === null ? feet : g;
    this.active = true; this.apply();
  }

  stop() { this.active = false; this.keys.clear(); this.joy.x = this.joy.y = 0; }

  apply() {
    this.camera.position.set(this.x, this.y + EYE, this.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  update(dt) {
    if (!this.active) return;
    const k = this.keys;
    let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - this.joy.y;
    let s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0) + this.joy.x;
    if (k.has('ArrowLeft')) this.yaw += 1.8 * dt;
    if (k.has('ArrowRight')) this.yaw -= 1.8 * dt;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 3.2 : 1.7) * dt;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dx = (-sin * f + cos * s) * speed, dz = (-cos * f - sin * s) * speed;
    const tryMove = (nx, nz) => {
      if (this.blocked(nx, nz, this.y)) return false;
      const g = this.groundAt(nx, nz, this.y);
      if (g === null) return false;
      this.x = nx; this.z = nz; this.target = g; return true;
    };
    this.target = this.groundAt(this.x, this.z, this.y) ?? this.y;
    if (dx) tryMove(this.x + dx, this.z);
    if (dz) tryMove(this.x, this.z + dz);
    this.y += (this.target - this.y) * Math.min(1, dt * 12);
    this.apply();
  }

  _bind() {
    const d = this.dom;
    addEventListener('keydown', (e) => { if (this.active) { this.keys.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); } });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    d.addEventListener('pointerdown', (e) => {
      if (!this.active || e.target.closest('#joy')) return;
      this._look = { id: e.pointerId, x: e.clientX, y: e.clientY };
      d.setPointerCapture(e.pointerId);
    });
    d.addEventListener('pointermove', (e) => {
      if (!this.active || !this._look || e.pointerId !== this._look.id) return;
      this.yaw -= (e.clientX - this._look.x) * 0.0055;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - (e.clientY - this._look.y) * 0.0045));
      this._look.x = e.clientX; this._look.y = e.clientY;
    });
    const up = (e) => { if (this._look && e.pointerId === this._look.id) this._look = null; };
    d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
  }
}

// Joystick virtual (esquina inferior izquierda)
export function bindJoystick(el, walker) {
  const knob = el.querySelector('i');
  let id = null, cx = 0, cy = 0;
  const R_ = 48;
  const set = (e) => {
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const l = Math.hypot(dx, dy);
    if (l > R_) { dx = dx / l * R_; dy = dy / l * R_; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    walker.joy.x = dx / R_; walker.joy.y = dy / R_; // arriba = adelante
  };
  el.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); id = e.pointerId; el.setPointerCapture(id);
    const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; set(e);
  });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; walker.joy.x = walker.joy.y = 0; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
