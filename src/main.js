// Glass Toggle — remix, "world" edition.
//
//   CPU  · knob physics (track spring, or a free rigid body you can pull out and throw),
//          per-pixel icon morph springs + loose "slosh" physics inside the glass,
//          sparks, sun clock, input.
//   GPU  · one fragment shader paints page, track, glass, strip, sparks, waves.

import { ICON_SETS, CENTER, buildPairs } from './icons.js';
import { VERT, FRAG, MAX_SPARKS } from './shader.js';
import { Sfx } from './audio.js';
import { Motion } from './sensors.js';
import { sunElevation, guessLocation } from './sun.js';
import { DEFAULTS, SCHEMA, loadParams, saveParams } from './params.js';
import { createPanel } from './panel.js';

const canvas = document.getElementById('gl');
const hint = document.getElementById('hint');
const verb = hint.querySelector('.verb');
const clock = document.getElementById('clock');
const sw = document.getElementById('switch');
const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
if (!gl) {
  document.body.classList.add('nogl');
  throw new Error('WebGL2 not available');
}

const qs = new URLSearchParams(location.search);
const ZOOM = Math.max(0.5, +qs.get('zoom') || 1);
if (qs.has('embed')) document.body.classList.add('embed');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ params & devices
const P = loadParams();
if (qs.get('set') && ICON_SETS[qs.get('set')]) applySetColors(qs.get('set'));
const sfx = new Sfx();
sfx.enabled = P.sound; sfx.volume = P.volume;
const motionSensor = new Motion();
let location_ = guessLocation();

// ------------------------------------------------------------------ layout (design px)
const TRACK = { w: 420, h: 216, r: 70 };
const PAD = 12;
const KNOB_HALF = (TRACK.h - PAD * 2) / 2; // 96
const KNOB_R = 56;
const PITCH = 5.6, PSIZE = 4.5;
const WALL_INSET = 6.5;

let dpr = 1, vw = 0, vh = 0, cx = 0, cy = 0, leftX = 0, rightX = 0, S = 1;
const box = { x: 0, y: 0, w: 280, h: 280 }; // icon raster area, follows the knob
const bounds = { x0: 0, x1: 0, y0: 0, y1: 0 };

// ------------------------------------------------------------------ helpers
const clamp01 = x => Math.min(1, Math.max(0, x));
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const rand = (a, b) => a + Math.random() * (b - a);
const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function applySetColors(key) {
  P.iconSet = key;
  P.offColor = ICON_SETS[key].offColor;
  P.onColor = ICON_SETS[key].onColor;
}

// Rounded-box SDF + outward normal, used for pixel ↔ glass-wall collisions.
function sdBox(x, y, hx, hy, r) {
  const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r;
  const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  let nx, ny;
  if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy); nx = qx / l; ny = qy / l; }
  else if (qx > qy) { nx = 1; ny = 0; } else { nx = 0; ny = 1; }
  return [d, nx * Math.sign(x || 1), ny * Math.sign(y || 1)];
}

// ------------------------------------------------------------------ icon pixels
let PIX = [];
function rebuildIcons(scatter) {
  const set = ICON_SETS[P.iconSet] || ICON_SETS.celestial;
  PIX = buildPairs(set.off(), set.on());
  for (const px of PIX) { px.loose = false; px.hold = rand(0, 0.9); }
  if (scatter) {
    for (const px of PIX) {
      const a = rand(0, Math.PI * 2), r = rand(30, 90);
      Object.assign(px, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, ready: true });
    }
  }
  sw.setAttribute('aria-label', set.aria);
}
rebuildIcons(false);

const pcan = document.createElement('canvas');
const pctx = pcan.getContext('2d');
const gcan = document.createElement('canvas');
const gctx = gcan.getContext('2d');
const CAN_FILTER = typeof gctx.filter === 'string' && ((gctx.filter = 'blur(1px)'), gctx.filter === 'blur(1px)');
gctx.filter = 'none';

// ------------------------------------------------------------------ state
const savedOn = localStorage.getItem('glass-toggle:on');
const startOn = savedOn != null ? savedOn === '1' : matchMedia('(prefers-color-scheme: light)').matches;

const st = {
  p: startOn ? 1 : 0, v: 0, target: startOn ? 1 : 0,
  dragging: false, startX: 0, startY: 0, startP: 0, moved: 0, lastT: 0, dragV: 0, pendingClick: false,
  hover: 0, hoverT: 0, press: 0, pressT: 0, kick: 0,
  dir: startOn ? -1 : 1, sp: startOn ? 1 : 0, spv: 0,
  ptr: [0, 0], ptrOn: 0, ptrOnT: 0, ptrType: 'mouse',
  armed: false, wave: { x: 0, y: 0, t: -99 }, sweepT: -99,
  sparks: [], lightSide: null,
  // free knob
  mode: 'track', body: { x: 0, y: 0, vx: 0, vy: 0 }, hold: [0, 0], grab: [0, 0], restT: 0, height: 0,
  squash: 0, squashV: 0,
  kPrev: null, vPrev: [0, 0], acc: [0, 0], shake: 0, calmT: 0,
  sunStart: 0, sunEpoch: 0,
};

// ------------------------------------------------------------------ GL programs
function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(fs) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const U = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(prog, i).name.replace(/\[0\]$/, '');
    U[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, U };
}
const MAIN = program(FRAG);

gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

function makeTexture(unit, filter = gl.LINEAR) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
const texPix = makeTexture(0), texGlow = makeTexture(1);
const sparkBuf = new Float32Array(MAX_SPARKS * 4);

// ------------------------------------------------------------------ resize
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  vw = window.innerWidth; vh = window.innerHeight;
  canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
  // leave room under the toggle for the lab shelf
  S = Math.max(0.35, Math.min(ZOOM, (vw - 36) / (TRACK.w + 24), (vh - 300) / (TRACK.h + 120)));
  cx = vw / 2; cy = vh / 2 - 70 * Math.min(1, vh / 900);
  document.documentElement.style.setProperty('--shelf-top', `${cy + (TRACK.h / 2 + 52) * S}px`);
  const travel = TRACK.w / 2 - PAD - KNOB_HALF;
  leftX = cx - travel; rightX = cx + travel;
  Object.assign(bounds, { x0: cx - cx / S, x1: cx + (vw - cx) / S, y0: cy - cy / S, y1: cy + (vh - cy) / S });
  const res = dpr * Math.max(S, 1);
  pcan.width = Math.round(box.w * res); pcan.height = Math.round(box.h * res);
  gcan.width = Math.round(box.w * res / 2); gcan.height = Math.round(box.h * res / 2);
  for (const px of PIX) px.ready = false;
}

// ------------------------------------------------------------------ track wall path
function wallGeometry() {
  const hx = TRACK.w / 2 - WALL_INSET, hy = TRACK.h / 2 - WALL_INSET, r = TRACK.r - WALL_INSET;
  const a = hx - r, b = hy - r, q = Math.PI * r / 2;
  const arc = (ox, oy, a0) => t => [ox + r * Math.cos(a0 - t / r), oy + r * Math.sin(a0 - t / r)];
  const segs = [
    [a, t => [t, hy]], [q, arc(a, b, Math.PI / 2)], [2 * b, t => [hx, b - t]], [q, arc(a, -b, 0)],
    [2 * a, t => [a - t, -hy]], [q, arc(-a, -b, -Math.PI / 2)], [2 * b, t => [-hx, -b + t]],
    [q, arc(-a, b, Math.PI)], [a, t => [-a + t, hy]],
  ];
  const per = segs.reduce((s, [l]) => s + l, 0);
  return { segs, per, half: per / 2 };
}
const WALL = wallGeometry();
function wallPoint(u) {
  u = ((u % WALL.per) + WALL.per) % WALL.per;
  for (const [len, fn] of WALL.segs) {
    if (u <= len) { const [x, y] = fn(u); return [cx + x, cy + y]; }
    u -= len;
  }
  return [cx, cy + TRACK.h / 2 - WALL_INSET];
}

// ------------------------------------------------------------------ icon morph
function cellLight(cell, px, time) {
  let b = cell.b;
  switch (cell.kind) {
    case 'star': case 'spark': b *= 0.4 + 0.6 * Math.sin(time * px.rate + px.phase) ** 2; break;
    case 'ray': b *= 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(time * 2.2 - cell.ang)); break;
    case 'wave': b *= 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 5 - cell.ang * 0.9)); break;
    case 'crack': b *= 0.7 + 0.3 * Math.sin(time * 9 + px.phase); break;
    case 'core': b *= 0.94 + 0.06 * Math.sin(time * 1.6); break;
  }
  return b;
}

function pixelGoal(px, pc, time, motion) {
  const t = clamp01((pc - px.delay) / 0.62);
  const e = easeInOut(t);
  const arc = Math.sin(Math.PI * e);
  const ox = (px.a.x - CENTER) * PITCH, oy = (px.a.y - CENTER) * PITCH;
  const tx = (px.b.x - CENTER) * PITCH, ty = (px.b.y - CENTER) * PITCH;
  const dx = tx - ox, dy = ty - oy, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  let x = ox + dx * e + nx * px.curl * P.swirl * motion * arc;
  let y = oy + dy * e + ny * px.curl * P.swirl * motion * arc;
  const r = Math.hypot(x, y) || 1;
  x += (x / r) * px.lift * arc * 1.4 * P.burst * motion;
  y += (y / r) * px.lift * arc * 1.4 * P.burst * motion;
  const ba = cellLight(px.a, px, time), bb = cellLight(px.b, px, time);
  return { x, y, bright: (ba + (bb - ba) * e) * (1 + 0.3 * arc), size: PSIZE * (1 - 0.45 * arc) };
}

// Shake the glass hard enough and the pixels come loose.
function loosen(kick) {
  if (!P.slosh || reduceMotion) return;
  let n = 0;
  for (const px of PIX) {
    if (px.loose) continue;
    px.loose = true; n++;
    px.vx += rand(-1, 1) * 120 - kick[0] * 0.25;
    px.vy += rand(-1, 1) * 120 - kick[1] * 0.25;
  }
  if (n) { st.calmT = 0; navigator.vibrate?.([10, 30, 10]); }
}

// ------------------------------------------------------------------ sparks
function stripCenter(kx, ky, theta) {
  if (P.path === 'track' && st.mode === 'track') return st.lightSide || [kx, cy + TRACK.h / 2];
  const c = Math.cos(theta), s = Math.sin(theta);
  const R = Math.min((KNOB_HALF + WALL_INSET) / Math.max(Math.abs(c), Math.abs(s)), (KNOB_HALF + WALL_INSET) * 1.22);
  return [kx + c * R, ky + s * R];
}

function burst(origin, count, power, dirAngle = null) {
  if (!P.sparks || reduceMotion) return;
  const [ox, oy] = origin;
  for (let i = 0; i < count; i++) {
    const base = dirAngle ?? Math.atan2(oy - cy, ox - (ox > cx ? rightX : leftX));
    const a = base + rand(-0.9, 0.9);
    const sp = rand(90, 360) * power;
    const life = rand(0.45, 1.15);
    st.sparks.push({ x: ox + rand(-6, 6), y: oy + rand(-6, 6), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, size: rand(1.3, 3) });
  }
  if (st.sparks.length > MAX_SPARKS) st.sparks.splice(0, st.sparks.length - MAX_SPARKS);
}

function stepSparks(dt) {
  for (const s of st.sparks) {
    s.vy += 210 * dt;
    const damp = Math.exp(-dt * 2.4);
    s.vx *= damp; s.vy *= damp;
    s.x += s.vx * dt; s.y += s.vy * dt;
    s.life -= dt;
  }
  st.sparks = st.sparks.filter(s => s.life > 0);
}

// ------------------------------------------------------------------ switching
function setTarget(t, quiet = false) {
  t = t > 0.5 ? 1 : 0;
  st.kick = 1;
  if (t === st.target) return;
  st.target = t;
  st.armed = true;
  st.sweepT = performance.now() / 1000;
  if (!quiet) { sfx.ping(t === 1); navigator.vibrate?.(8); }
  sw.setAttribute('aria-checked', String(t === 1));
  try { localStorage.setItem('glass-toggle:on', t ? '1' : '0'); } catch { /* ignore */ }
}
function toggle() {
  if (P.sunClock) { P.sunClock = false; saveParams(P); panel.refresh(); }
  if (st.mode === 'free' || st.mode === 'held') { goHome(); return; }
  setTarget(st.target > 0.5 ? 0 : 1);
}
sw.setAttribute('aria-checked', String(st.target === 1));

function land(kx, ky, theta, strength) {
  const now = performance.now() / 1000;
  if (P.shockwave && !reduceMotion) st.wave = { x: kx, y: ky, t: now };
  burst(stripCenter(kx, ky, theta), Math.round(8 + 16 * strength), 0.5 + strength);
  sfx.land(strength);
  st.kick = Math.max(st.kick, 0.8);
}

// ------------------------------------------------------------------ free knob
function detach(kx) {
  st.mode = 'held';
  st.dragging = false;
  Object.assign(st.body, { x: kx, y: cy, vx: 0, vy: 0 });
  st.grab = [kx - st.ptr[0], cy - st.ptr[1]];
  st.hold = [...st.ptr];
  setTarget(st.p, true);
  sfx.land(0.45);
  burst([kx, cy - KNOB_HALF], 10, 0.7, -Math.PI / 2);
  navigator.vibrate?.(15);
}

function goHome() {
  if (st.mode === 'track') return;
  st.mode = 'home';
  st.restT = 0;
}

function releaseHeld() {
  const b = st.body;
  const inTrack = Math.abs(b.x - cx) < TRACK.w / 2 && Math.abs(b.y - cy) < TRACK.h / 2;
  if (inTrack) {
    // dropped back into the slot: the side you drop it on decides the state
    st.p = clamp01((b.x - leftX) / (rightX - leftX)); st.v = 0;
    setTarget(st.p);
    st.mode = 'home';
  } else st.mode = 'free';
}

function stepBody(dt) {
  const b = st.body;
  if (st.mode === 'held') {
    const k = 650, c = 2 * Math.sqrt(k) * 0.75;
    const tx = st.hold[0] + st.grab[0], ty = st.hold[1] + st.grab[1];
    b.vx += (-k * (b.x - tx) - c * b.vx) * dt;
    b.vy += (-k * (b.y - ty) - c * b.vy) * dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
  } else if (st.mode === 'home') {
    const hx = leftX + (rightX - leftX) * clamp01(st.p);
    const k = 120, c = 2 * Math.sqrt(k) * 0.85;
    b.vx += (-k * (b.x - hx) - c * b.vx) * dt;
    b.vy += (-k * (b.y - cy) - c * b.vy) * dt - 400 * dt * Math.min(1, Math.abs(b.x - hx) / 200);
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.hypot(b.x - hx, b.y - cy) < 2 && Math.hypot(b.vx, b.vy) < 60) {
      st.mode = 'track';
      st.armed = true;
      land(hx, cy, Math.PI / 2, 0.55);
    }
  } else if (st.mode === 'free') {
    const g = motionSensor.active ? motionSensor.gravity : [0, 1];
    b.vx += g[0] * P.gravity * dt; b.vy += g[1] * P.gravity * dt;
    b.vx *= Math.exp(-dt * 0.15); b.vy *= Math.exp(-dt * 0.15);
    b.x += b.vx * dt; b.y += b.vy * dt;
    const R = KNOB_HALF + 8;
    const hit = (impact, nx, ny, x, y) => {
      if (impact > 260) {
        const s = clamp01(impact / 2600);
        sfx.land(s);
        burst([x, y], Math.round(4 + 14 * s), 0.4 + s, Math.atan2(-ny, -nx));
        if (impact > 1300 && P.shockwave && !reduceMotion) st.wave = { x, y, t: performance.now() / 1000 };
        if (impact > 650) loosen([nx * impact * 8, ny * impact * 8]);
      }
      st.squashV += (Math.abs(ny) > 0 ? 1 : -1) * impact / 2400;
    };
    if (b.y > bounds.y1 - R) { b.y = bounds.y1 - R; if (b.vy > 0) { hit(b.vy, 0, 1, b.x, b.y + R); b.vy *= -0.46; b.vx *= 0.9; } }
    if (b.y < bounds.y0 + R) { b.y = bounds.y0 + R; if (b.vy < 0) { hit(-b.vy, 0, -1, b.x, b.y - R); b.vy *= -0.46; } }
    if (b.x > bounds.x1 - R) { b.x = bounds.x1 - R; if (b.vx > 0) { hit(b.vx, 1, 0, b.x + R, b.y); b.vx *= -0.5; } }
    if (b.x < bounds.x0 + R) { b.x = bounds.x0 + R; if (b.vx < 0) { hit(-b.vx, -1, 0, b.x - R, b.y); b.vx *= -0.5; } }
    const onFloor = b.y >= bounds.y1 - R - 0.5;
    if (onFloor) b.vx *= Math.exp(-dt * 2.5);
    if (Math.hypot(b.vx, b.vy) < 30) st.restT += dt; else st.restT = 0;
    if (st.restT > 3.5) goHome();
  }
  // squash spring (positive = wider & flatter)
  st.squashV += (-380 * st.squash - 11 * st.squashV) * dt;
  st.squash += st.squashV * dt;
  st.squash = Math.max(-0.22, Math.min(0.22, st.squash));
}

// ------------------------------------------------------------------ sun clock
let clockText = '';
function sunTarget(nowMs) {
  let date;
  if (P.timelapse) {
    if (!st.sunStart) { st.sunStart = nowMs; st.sunEpoch = Date.now(); }
    date = new Date(st.sunEpoch + (nowMs - st.sunStart) * 86400 / 40);
  } else { st.sunStart = 0; date = new Date(); }
  const el = sunElevation(date, location_.lat, location_.lon);
  const hh = String(date.getHours()).padStart(2, '0'), mm = String(date.getMinutes()).padStart(2, '0');
  const text = `${hh}:${mm} · Sonne ${el >= 0 ? '+' : ''}${el.toFixed(1)}°${P.timelapse ? ' · Zeitraffer' : ''}`;
  if (text !== clockText) { clockText = text; clock.textContent = text; }
  // civil twilight (−6°) … a little above the horizon: the swarm is caught mid-morph
  return smoothstep(-6, 4, el);
}

// ------------------------------------------------------------------ frame
let lastT = performance.now();
let lastLight = null;

function frame(nowMs) {
  const dt = Math.max(1 / 240, Math.min(1 / 30, (nowMs - lastT) / 1000)); lastT = nowMs;
  const time = nowMs / 1000;
  const motion = reduceMotion ? 0.25 : 1;

  if (P.sunClock) {
    st.target = sunTarget(nowMs);
    document.body.classList.add('sun');
  } else document.body.classList.remove('sun');

  // knob progress spring (scrubbed directly while dragging in the track)
  const prevP = st.p;
  if (!st.dragging) {
    const k = P.stiffness, c = 2 * Math.sqrt(k) * 0.6, steps = 4, h = dt / steps;
    for (let i = 0; i < steps; i++) {
      st.v += (-k * (st.p - st.target) - c * st.v) * h;
      st.p += st.v * h;
    }
  }
  st.hover += (st.hoverT - st.hover) * Math.min(1, dt * 10);
  st.press += (st.pressT - st.press) * Math.min(1, dt * 18);
  st.ptrOn += (st.ptrOnT - st.ptrOn) * Math.min(1, dt * 6);
  st.kick *= Math.exp(-dt * 3.5);

  stepBody(dt);
  st.height += ((st.mode === 'track' ? 0 : st.mode === 'home' ? 0.4 : 1) - st.height) * Math.min(1, dt * 8);

  const pc = clamp01(st.p);
  const over = Math.max(-st.p, st.p - 1, 0);
  const speed = Math.abs(st.v);
  const theme = smoothstep(0.18, 0.82, pc);
  window.glassTheme = theme; // continuous 0..1: the lab's previews follow it frame by frame

  // knob position & shape
  let kx, ky, khx, khy;
  if (st.mode === 'track') {
    const stretch = Math.min(speed * 6.5, 16);
    const squeeze = 1 - st.press * 0.035;
    khx = (KNOB_HALF + stretch - over * 110) * squeeze;
    khy = Math.min(KNOB_HALF - stretch * 0.45 + over * 30, KNOB_HALF + 5) * squeeze;
    kx = leftX + (rightX - leftX) * pc;
    if (st.p > 1) kx += over * 110; else if (st.p < 0) kx -= over * 110;
    ky = cy;
  } else {
    const b = st.body;
    const lean = Math.max(-0.07, Math.min(0.07, (Math.abs(b.vx) - Math.abs(b.vy)) / 14000));
    khx = KNOB_HALF * (1 + st.squash + lean);
    khy = KNOB_HALF * (1 - st.squash - lean);
    kx = b.x; ky = b.y;
  }
  box.x = kx - box.w / 2; box.y = ky - box.h / 2;

  // knob kinematics → shake detection (pixels feel the inverse of this acceleration)
  if (!st.kPrev) st.kPrev = [kx, ky];
  const kvx = (kx - st.kPrev[0]) / dt, kvy = (ky - st.kPrev[1]) / dt;
  const ax = (kvx - st.vPrev[0]) / dt, ay = (kvy - st.vPrev[1]) / dt;
  st.acc[0] += (ax - st.acc[0]) * 0.5; st.acc[1] += (ay - st.acc[1]) * 0.5;
  st.shake = st.shake * Math.exp(-dt * 2) + Math.hypot(kvx - st.vPrev[0], kvy - st.vPrev[1]);
  st.kPrev = [kx, ky]; st.vPrev = [kvx, kvy];
  if (st.shake > 9000) loosen([st.acc[0] * 0.02, st.acc[1] * 0.02]);
  if (motionSensor.active && motionSensor.takeShake() > 14) loosen([0, -3000]);
  const accMag = Math.hypot(...st.acc);
  st.calmT = accMag < 2500 ? st.calmT + dt : 0;

  // light strip
  {
    const goal = easeInOut(pc), k = 70, c = 2 * Math.sqrt(k);
    st.spv += (-k * (st.sp - goal) - c * st.spv) * dt;
    st.sp += st.spv * dt;
  }
  const sp = clamp01(st.sp);
  if (sp < 0.015) st.dir = 1; else if (sp > 0.985) st.dir = -1;
  const HALF = Math.PI / 2;
  const theta = !P.orbit ? HALF : st.dir > 0 ? HALF - Math.PI * sp : -HALF - Math.PI * (1 - sp);
  const strip = !P.orbit ? wallPoint(kx - cx) : wallPoint(st.dir > 0 ? WALL.half * sp : WALL.half + WALL.half * (1 - sp));
  st.lightSide = strip;
  const pathMode = P.path === 'track' && st.mode === 'track' ? 1 : 0;

  if (st.armed && !st.dragging && st.mode === 'track') {
    const crossed = (prevP - st.target) * (st.p - st.target) <= 0 && prevP !== st.p;
    if (crossed) {
      st.armed = false;
      const strength = clamp01(speed / 4);
      if (strength > 0.12) land(kx, ky, theta, strength);
    }
  }
  const knobSpeed = Math.hypot(kvx, kvy);
  if (knobSpeed > 650 && Math.random() < knobSpeed / 9000) burst(stripCenter(kx, ky, theta), 1, 0.4);
  stepSparks(dt);
  sfx.air(Math.max(speed, knobSpeed / 220));


  // pixels
  const prx = st.ptr[0] - kx, pry = st.ptr[1] - ky;
  const magnet = P.magnet ? st.ptrOn : 0;
  const lag = st.mode === 'track' ? st.v * (rightX - leftX) : kvx;
  const grav = motionSensor.active ? motionSensor.gravity : [0, 1];
  const G = P.gravity * 0.45;
  const ACC_MAX = 40000;
  const acx = Math.max(-ACC_MAX, Math.min(ACC_MAX, st.acc[0]));
  const acy = Math.max(-ACC_MAX, Math.min(ACC_MAX, st.acc[1]));
  const wallX = khx - 13, wallY = khy - 13, wallR = Math.max(4, KNOB_R - 13);
  let looseCount = 0;

  for (const px of PIX) {
    const g = pixelGoal(px, pc, time, motion);
    px.bright = g.bright; px.size = g.size;
    if (!px.ready) { px.x = g.x; px.y = g.y; px.vx = px.vy = 0; px.ready = true; }

    if (px.loose) {
      looseCount++;
      // free particle inside the glass: gravity + inertial force from the knob's acceleration
      px.vx += (grav[0] * G - acx) * dt;
      px.vy += (grav[1] * G - acy) * dt;
      const damp = Math.exp(-dt * 0.8);
      px.vx *= damp; px.vy *= damp;
      px.x += px.vx * dt; px.y += px.vy * dt;
      if (st.calmT > 1.3 + px.hold) px.loose = false; // calm again → spring home, reassemble
    } else {
      let gx = g.x, gy = g.y;
      if (magnet > 0.01) {
        const dx = gx - prx, dy = gy - pry, d = Math.hypot(dx, dy) || 1;
        if (d < 34) { const f = (1 - d / 34) ** 2 * 18 * magnet; gx += dx / d * f; gy += dy / d * f; }
      }
      const k = px.k, c = 2 * Math.sqrt(k) * 0.72;
      px.vx += (-k * (px.x - gx) - c * px.vx) * dt;
      px.vy += (-k * (px.y - gy) - c * px.vy) * dt;
      px.x += px.vx * dt; px.y += px.vy * dt;
    }
    px.size = px.loose ? PSIZE : px.size;
  }

  if (looseCount) {
    // keep loose pixels from overlapping (cheap pairwise relax) and inside the glass walls
    const minD = PSIZE + 0.7;
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < PIX.length; i++) {
        const a = PIX[i]; if (!a.loose) continue;
        for (let j = i + 1; j < PIX.length; j++) {
          const b = PIX[j]; if (!b.loose) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          if (Math.abs(dx) > minD || Math.abs(dy) > minD) continue;
          const d = Math.hypot(dx, dy) || 0.01;
          if (d < minD) {
            const push = (minD - d) / 2, nx = dx / d, ny = dy / d;
            a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
            const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rv < 0) { a.vx += nx * rv * 0.5; a.vy += ny * rv * 0.5; b.vx -= nx * rv * 0.5; b.vy -= ny * rv * 0.5; }
          }
        }
      }
      for (const px of PIX) {
        if (!px.loose) continue;
        const [d, nx, ny] = sdBox(px.x, px.y, wallX, wallY, wallR);
        if (d > 0) {
          px.x -= nx * d; px.y -= ny * d;
          const vn = px.vx * nx + px.vy * ny;
          if (vn > 0) {
            px.vx -= 1.35 * vn * nx; px.vy -= 1.35 * vn * ny;
            px.vx *= 0.88; px.vy *= 0.88;
          }
        }
      }
    }
  }

  // raster the icon (box follows the knob)
  const res = pcan.width / box.w;
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.clearRect(0, 0, pcan.width, pcan.height);
  pctx.setTransform(res, 0, 0, res, -box.x * res, -box.y * res);
  pctx.fillStyle = '#fff';
  for (const px of PIX) {
    const b = px.loose ? Math.max(px.bright, 0.55) * (px.a.b + px.b.b > 0 ? 1 : 0) : px.bright;
    if (b <= 0.002) continue;
    pctx.globalAlpha = Math.min(1, b);
    const sx = kx + px.x + (px.loose ? 0 : Math.max(-14, Math.min(14, -lag * px.drag))), sy = ky + px.y;
    pctx.fillRect(sx - px.size / 2, sy - px.size / 2, px.size, px.size);
  }
  pctx.globalAlpha = 1;
  gctx.setTransform(1, 0, 0, 1, 0, 0);
  gctx.clearRect(0, 0, gcan.width, gcan.height);
  if (CAN_FILTER) {
    gctx.filter = `blur(${2 * res}px)`;
    gctx.drawImage(pcan, 0, 0, gcan.width, gcan.height);
    gctx.filter = 'none';
  } else {
    const r = 1.5 * res;
    gctx.globalAlpha = 0.16;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      gctx.drawImage(pcan, Math.cos(a) * r, Math.sin(a) * r, gcan.width, gcan.height);
    }
    gctx.globalAlpha = 1;
  }
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texPix);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pcan);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texGlow);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gcan);

  const nS = Math.min(st.sparks.length, MAX_SPARKS);
  for (let i = 0; i < nS; i++) {
    const s = st.sparks[i], k = s.life / s.max;
    sparkBuf.set([s.x, s.y, Math.pow(k, 1.4) * 0.95, s.size * (0.6 + 0.4 * k)], i * 4);
  }

  const light = lerp3(hexToRgb(P.offColor), hexToRgb(P.onColor), theme);
  const waveAge = time - st.wave.t;
  const led = (1 + st.hover * 0.08 + Math.min(speed * 0.05, 0.18) + st.kick * 0.14) * P.intensity;
  const common = U => {
    gl.uniform2f(U.uC, cx, cy);
    gl.uniform2f(U.uTH, TRACK.w / 2, TRACK.h / 2);
    gl.uniform1f(U.uTR, TRACK.r);
    gl.uniform2f(U.uK, kx, ky);
    gl.uniform2f(U.uKH, khx, khy);
    gl.uniform1f(U.uKR, Math.min(KNOB_R, khx - 1, khy - 1));
    gl.uniform1f(U.uScale, S);
    gl.uniform1f(U.uTheme, theme);
    gl.uniform1f(U.uLed, led);
    gl.uniform3f(U.uLight, ...light);
    gl.uniform1f(U.uTheta, theta);
    gl.uniform1f(U.uHalfW, P.lightWidth);
    gl.uniform1f(U.uMode, pathMode);
    gl.uniform2f(U.uStrip, strip[0], strip[1]);
    gl.uniform1f(U.uStripLen, P.lightWidth * 130);
    gl.uniform3f(U.uWave, st.wave.x, st.wave.y, waveAge < 2.5 ? waveAge : -1);
    gl.uniform4fv(U.uSpark, sparkBuf);
    gl.uniform1i(U.uSparkN, nS);
  };

  // ---- draw
  const U = MAIN.U;
  gl.useProgram(MAIN.prog);
  gl.viewport(0, 0, canvas.width, canvas.height);
  common(U);
  gl.uniform1i(U.uPix, 0); gl.uniform1i(U.uGlow, 1);
  gl.uniform2f(U.uRes, canvas.width, canvas.height);
  gl.uniform1f(U.uDpr, dpr);
  gl.uniform1f(U.uTime, time % 1000);
  gl.uniform1f(U.uLift, st.hover * (1 - st.press));
  gl.uniform1f(U.uHeight, st.height);
  gl.uniform4f(U.uBox, box.x, box.y, box.w, box.h);
  gl.uniform1f(U.uRefract, P.refraction);
  gl.uniform1f(U.uFrost, P.frost);
  gl.uniform1f(U.uDisp, P.dispersion);
  gl.uniform1f(U.uGlowAmt, P.glow);
  gl.uniform2f(U.uPtr, st.ptr[0], st.ptr[1]);
  gl.uniform1f(U.uPtrOn, st.ptrOn);
  gl.uniform1f(U.uSweep, Math.min(time - st.sweepT, 99));
  gl.uniform1f(U.uStars, P.stars ? 1 : 0);
  gl.uniform1f(U.uSlot, st.mode === 'track' ? 0 : st.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const isLight = theme > 0.5;
  if (isLight !== lastLight) {
    lastLight = isLight;
    document.body.classList.toggle('light', isLight);
    document.querySelector('meta[name=theme-color]').content = isLight ? '#ececea' : '#0b0b0b';
  }
  if (labOpen) { looping = false; return; } // an experiment is open: the toggle sleeps
  requestAnimationFrame(frame);
}

// The lab shelf opens full-screen experiments; never run both scenes at once.
let labOpen = false, looping = true;
window.addEventListener('lab:open', () => { labOpen = true; });
window.addEventListener('lab:close', () => {
  labOpen = false;
  if (!looping) { looping = true; lastT = performance.now(); requestAnimationFrame(frame); }
});

// ------------------------------------------------------------------ input
function inRoundRect(x, y, ox, oy, hw, hh, r) {
  const qx = Math.abs(x - ox) - hw + r, qy = Math.abs(y - oy) - hh + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0;
}
const toDesign = (x, y) => [cx + (x - cx) / S, cy + (y - cy) / S];
const overTrack = (x, y) => inRoundRect(x, y, cx, cy, TRACK.w / 2, TRACK.h / 2, TRACK.r);
const trackKnobX = () => leftX + (rightX - leftX) * clamp01(st.p);
const overKnob = (x, y) => st.mode === 'track'
  ? inRoundRect(x, y, trackKnobX(), cy, KNOB_HALF, KNOB_HALF, KNOB_R)
  : inRoundRect(x, y, st.body.x, st.body.y, KNOB_HALF, KNOB_HALF, KNOB_R);

canvas.addEventListener('pointermove', e => {
  const [x, y] = toDesign(e.clientX, e.clientY);
  st.ptr = [x, y]; st.ptrType = e.pointerType;
  const onTrack = overTrack(x, y);
  const kx = st.mode === 'track' ? cx : st.body.x, ky = st.mode === 'track' ? cy : st.body.y;
  const near = inRoundRect(x, y, kx, ky, TRACK.w / 2 + 90, TRACK.h / 2 + 90, TRACK.r + 90);
  st.ptrOnT = (near && e.pointerType === 'mouse') || st.dragging || st.mode === 'held' ? 1 : 0;
  const grabbable = st.mode !== 'track' && overKnob(x, y);
  canvas.style.cursor = st.dragging || st.mode === 'held' ? 'grabbing' : grabbable ? 'grab' : onTrack ? 'pointer' : 'default';
  st.hoverT = onTrack && st.mode === 'track' && e.pointerType === 'mouse' ? 1 : 0;

  if (st.mode === 'held') { st.hold = [x, y]; return; }
  if (!st.dragging) return;
  const dx = (e.clientX - st.startX) / S, dy = (e.clientY - st.startY) / S;
  st.moved = Math.max(st.moved, Math.hypot(dx, dy) * S);
  if (P.detach && Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx) * 0.8) {
    detach(trackKnobX());
    return;
  }
  let p = st.startP + dx / (rightX - leftX);
  if (p > 1) p = 1 + (p - 1) * 0.22;
  if (p < 0) p *= 0.22;
  const t = performance.now();
  const ddt = Math.max(1, t - st.lastT) / 1000;
  st.dragV = st.dragV * 0.6 + ((p - st.p) / ddt) * 0.4;
  st.v = st.dragV; st.p = p; st.lastT = t;
  if (P.sunClock) { P.sunClock = false; saveParams(P); panel.refresh(); }
});

canvas.addEventListener('pointerdown', e => {
  const [x, y] = toDesign(e.clientX, e.clientY);
  st.ptr = [x, y];
  sfx._ensure();
  if (st.mode !== 'track') {
    if (overKnob(x, y)) {
      canvas.setPointerCapture(e.pointerId);
      st.mode = 'held';
      st.grab = [st.body.x - x, st.body.y - y];
      st.hold = [x, y];
      st.restT = 0;
    } else if (overTrack(x, y)) goHome();
    return;
  }
  if (!overTrack(x, y)) return;
  canvas.setPointerCapture(e.pointerId);
  st.pressT = 1; st.moved = 0;
  if (overKnob(x, y)) {
    Object.assign(st, { dragging: true, startX: e.clientX, startY: e.clientY, startP: st.p, lastT: performance.now(), dragV: 0 });
    if (e.pointerType !== 'mouse') st.ptrOnT = 1;
  } else st.pendingClick = true;
});

function release(e) {
  st.pressT = 0;
  if (st.mode === 'held') { releaseHeld(); return; }
  if (st.dragging) {
    st.dragging = false;
    if (st.moved < 4) toggle();
    else {
      const prev = st.target;
      setTarget(st.p + st.dragV * 0.15);
      if (st.target === prev) st.armed = true;
      st.kick = 0.6;
    }
  } else if (st.pendingClick) toggle();
  st.pendingClick = false;
  if (e?.pointerType !== 'mouse') st.ptrOnT = 0;
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('pointerleave', () => { st.hoverT = 0; if (st.mode !== 'held') st.ptrOnT = 0; });
canvas.addEventListener('dblclick', () => goHome());

window.addEventListener('keydown', e => {
  if (e.target.closest?.('.panel') || labOpen) return;
  // a focused control (e.g. a lab bead) keeps its own Enter/Space; the toggle's own switch does not
  if ((e.code === 'Space' || e.code === 'Enter') && e.target.closest?.('button, input, select, a') && e.target !== sw) return;
  const setKeys = Object.keys(ICON_SETS);
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); sfx._ensure(); toggle(); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); sfx._ensure(); setTarget(0); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); sfx._ensure(); setTarget(1); }
  else if (e.key === 'h' || e.key === 'H') panel.toggle();
  else if (e.key === 'm' || e.key === 'M') { P.sound = !P.sound; onParam('sound'); panel.refresh(); }
  else if (e.key === 'r' || e.key === 'R') shuffle();
  else if (e.key === 'a' || e.key === 'A') { P.sunClock = !P.sunClock; onParam('sunClock'); panel.refresh(); }
  else if (e.key === 't' || e.key === 'T') { P.timelapse = !P.timelapse; if (P.timelapse) P.sunClock = true; onParam('timelapse'); panel.refresh(); }
  else if (e.key === 's' || e.key === 'S') loosen([rand(-1, 1) * 3000, -4000]);
  else if (/^[1-9]$/.test(e.key) && setKeys[+e.key - 1]) { applySetColors(setKeys[+e.key - 1]); onParam('iconSet'); panel.refresh(); }
});
window.addEventListener('resize', resize);
if (matchMedia('(hover: none)').matches) verb.textContent = 'Tap, drag, or pull it out';

// ------------------------------------------------------------------ panel
function onParam(key) {
  if (key === 'iconSet') { applySetColors(P.iconSet); rebuildIcons(true); panel?.refresh(); }
  if (key === 'sound') sfx.setEnabled(P.sound);
  if (key === 'volume') sfx.setVolume(P.volume);
  if (key === 'sunClock' && !P.sunClock) {
    P.timelapse = false;
    st.target = st.target > 0.5 ? 1 : 0;
    sw.setAttribute('aria-checked', String(st.target === 1));
  }
  if (key === 'timelapse') st.sunStart = 0;
  saveParams(P);
}

async function onAction(key) {
  if (key === 'motion') { await motionSensor.start(); return '📱 Active'; }
  if (key === 'locate') {
    const pos = await new Promise((ok, fail) => navigator.geolocation.getCurrentPosition(ok, fail, { timeout: 10000 }));
    location_ = { lat: pos.coords.latitude, lon: pos.coords.longitude, guessed: false };
    return `📍 ${location_.lat.toFixed(1)}°, ${location_.lon.toFixed(1)}°`;
  }
}

function shuffle() {
  const hue = rand(0, 360);
  const hsl = (h, s, l) => {
    const f = n => { const k = (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  };
  Object.assign(P, {
    offColor: hsl(hue, 0.95, 0.62),
    onColor: hsl((hue + rand(120, 200)) % 360, 1, 0.58),
    intensity: rand(1.3, 2.6), lightWidth: rand(0.45, 1.6), refraction: rand(20, 70),
    frost: rand(0.4, 0.95), dispersion: rand(0.5, 3), swirl: rand(0.6, 3), burst: rand(0.1, 1.2),
    stiffness: rand(80, 220),
  });
  saveParams(P);
  panel.refresh();
}

SCHEMA.find(r => r.key === 'iconSet').options = Object.entries(ICON_SETS).map(([k, s]) => [k, s.label]);
const panel = createPanel(document.body, SCHEMA, P, {
  onChange: onParam,
  onAction,
  onReset: () => { Object.assign(P, DEFAULTS); onParam('iconSet'); onParam('sound'); onParam('volume'); onParam('sunClock'); panel.refresh(); },
  onRandom: shuffle,
});
if (qs.has('embed')) panel.toggle(true);

resize();
requestAnimationFrame(frame);
