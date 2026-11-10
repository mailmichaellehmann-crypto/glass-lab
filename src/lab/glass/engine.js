// Glass engine: one WebGL2 canvas per control, a pixel layer drawn on the CPU (sharp + blurred,
// sampled through the glass by the shader), a springy pixel matrix for morphing glyphs, and
// a tiny 3×5 pixel font. Mirrors how the toggle itself is built.

import { autosize, pointer, makeCanvas, loop, loseContext, glProgramAsync, fullscreenTriangle, rand, reducedMotion } from '../kit.js';
import { buzz as hapticBuzz } from '../../haptics.js';
import { LIB } from './lib.glsl.js';
import { Sfx } from '../../audio.js';

export const sfx = new Sfx();
sfx.enabled = (() => { try { return JSON.parse(localStorage.getItem('glass-toggle:params:v1') || '{}').sound !== false; } catch { return true; } })();

// ------------------------------------------------------------------ pixel font (3×5)
const FONT = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111', '°': '010101010000000', '%': '101001010100101',
  'A': '010101111101101', 'C': '011100100100011', 'D': '110101101101110', 'E': '111100110100111',
  'H': '101101111101101', 'K': '101101110101101', 'L': '100100100100111', 'M': '101111111101101',
  'N': '110101101101101', 'O': '010101101101010', 'R': '110101110101101', 'S': '011100010001110',
  'T': '111010010010010', 'W': '101101111111101', 'Y': '101101010010010', 'U': '101101101101111',
  'I': '111010010010111', 'P': '110101110100100', 'G': '011100101101011', '!': '010010010000010',
  ' ': '000000000000000', '-': '000000111000000', '.': '000000000000010', ':': '000010000010000',
  'B': '110101110101110', 'F': '111100110100100', 'J': '001001001101010', 'Q': '010101101111011',
  'V': '101101101101010', 'X': '101101010101101', 'Z': '111001010100111', '#': '101111101111101',
  '?': '111001010000010', ',': '000000000010100', "'": '010010000000000', '/': '001001010100100',
  '+': '000010111010000', '_': '000000000000111', '=': '000111000111000', '×': '000101010101000',
  'Ä': '101010111101101', 'Ö': '101010101101010', 'Ü': '101000101101111', 'ß': '110101110101110',
};
export const hasGlyph = ch => ch.toUpperCase() in FONT;
export const glyphWidth = (n, pitch) => (n * 4 - 1) * pitch;

// Text → cells centred on (0,0). pitch in design px.
export function textCells(str, pitch, b = 1, { align = 'center' } = {}) {
  const chars = [...str.toUpperCase()];
  const w = chars.length * 4 - 1;
  const cells = [];
  chars.forEach((ch, k) => {
    const g = FONT[ch] || FONT[' '];
    for (let i = 0; i < 15; i++) if (g[i] === '1') {
      const gx = k * 4 + (i % 3), gy = (i / 3) | 0;
      const x = align === 'left' ? gx * pitch : (gx - (w - 1) / 2) * pitch;
      cells.push({ x, y: (gy - 2) * pitch, b, ch: k });
    }
  });
  return cells;
}

// Bitmap (array of strings, '#' on) → cells centred on (0,0).
export function bitmapCells(rows, pitch, b = 1) {
  const h = rows.length, w = rows[0].length, cells = [];
  rows.forEach((r, y) => [...r].forEach((c, x) => {
    if (c !== '.' && c !== ' ') cells.push({ x: (x - (w - 1) / 2) * pitch, y: (y - (h - 1) / 2) * pitch, b: c === '+' ? 0.45 : b });
  }));
  return cells;
}

// ------------------------------------------------------------------ springy pixel matrix
// Holds live pixels; set() retargets them to a new glyph. Pixels are paired by sweep angle so a
// change reads as one coherent swirl (the toggle's moon→sun trick), with per-pixel stagger.
// phones: the controls switch to compact layouts (shorter tracks, same size handles and text) so they
// can be shown near full size instead of shrunk to half
export const compact = () => !!window.matchMedia?.('(max-width: 600px)').matches;

// while a full-size control powers on, its first pixels do not simply appear: they gather from a loose
// cloud and swirl into place (the engine opens this window when a stage is created and when it is ready)
let assembleUntil = 0;
const gathered = []; // matrices that were scattered; one nobody steps (a static readout) is snapped into place instead

export class PixelMatrix {
  constructor({ size = 4.2, swirl = 10, shyR = 34, shyF = 18 } = {}) { this.px = []; this.size = size; this.swirl = swirl; this.ox = 0; this.oy = 0; this.shyR = shyR; this.shyF = shyF; }

  set(cells, { instant = false } = {}) {
    // learn the grid of what is shown, so the pixels keep a small gap like an LED display (crisp)
    let pitch = Infinity;
    for (let i = 1; i < Math.min(cells.length, 80); i++) {
      const dx = Math.abs(cells[i].x - cells[i - 1].x), dy = Math.abs(cells[i].y - cells[i - 1].y);
      for (const d of [dx, dy]) if (d > 0.01 && d < pitch) pitch = d;
    }
    if (Number.isFinite(pitch)) this.pitch = pitch;
    const gather = performance.now() < assembleUntil, first = this.px.length === 0;
    const key = (x, y) => Math.atan2(y, x) + Math.hypot(x, y) * 1e-3;
    const live = this.px.filter(p => !p.dying).sort((a, b) => key(a.tx, a.ty) - key(b.tx, b.ty));
    const tgt = [...cells].sort((a, b) => key(a.x, a.y) - key(b.x, b.y));
    const next = [];
    const n = Math.max(live.length, tgt.length);
    let lastJ = -1;
    for (let i = 0; i < n; i++) {
      let p, t;
      if (live.length >= tgt.length) {
        // more old pixels than new: extras merge into a partner and fade
        p = live[i];
        const j = tgt.length ? Math.floor(i * tgt.length / n) : -1;
        t = j >= 0 ? (j !== lastJ ? tgt[j] : { ...tgt[j], b: 0 }) : { x: p.x, y: p.y, b: 0 };
        lastJ = j;
      } else {
        // more new pixels than old: extras split off a partner and fade in
        t = tgt[i];
        const j = live.length ? Math.floor(i * live.length / n) : -1;
        const src = j >= 0 ? live[j] : null;
        p = src && j !== lastJ ? src : { x: src ? src.x : t.x, y: src ? src.y : t.y, vx: src ? src.vx : 0, vy: src ? src.vy : 0, b: 0 };
        lastJ = j;
      }
      // only a pixel at rest gets a little start delay; one already in flight just re-aims,
      // otherwise rapid updates (a counting number) would freeze it again and again
      const settled = p.tx === undefined || (Math.hypot(p.tx - p.x, p.ty - p.y) < 2 && Math.hypot(p.vx || 0, p.vy || 0) < 30);
      p.tx = t.x; p.ty = t.y; p.tb = t.b; p.dying = t.b === 0;
      if (settled) { p.k = rand(150, 280); p.curl = rand(-1, 1) * this.swirl; p.delay = rand(0, 0.1); }
      else p.delay = 0;
      p.drag = p.drag ?? rand(0.004, 0.016); p.sx = p.sx ?? 0; p.sy = p.sy ?? 0;
      if (p.vx === undefined) { p.vx = 0; p.vy = 0; }
      if (instant && !gather) { p.x = p.tx; p.y = p.ty; p.b = p.tb; p.vx = p.vy = 0; }
      else if (gather && first) {
        if (!gathered.includes(this)) gathered.push(this);
        const a = rand(0, Math.PI * 2), d = rand(26, 70);
        p.x = p.tx + Math.cos(a) * d; p.y = p.ty + Math.sin(a) * d; p.b = 0; p.vx = p.vy = 0;
        p.delay = 0.12 + rand(0, 0.3) + Math.min(0.25, Math.abs(p.tx) / 900); p.curl = rand(-1, 1) * Math.max(this.swirl, 8);
      }
      next.push(p);
    }
    this.px = next;
  }

  // ptr: pointer relative to this matrix's origin, shy: 0..1 how much pixels flee it (the toggle's
  // "shy pixels"), vel: the body's velocity in px/s so pixels trail behind it (the toggle's drag)
  step(dt, { ptr = null, shy = 0, vel = 0 } = {}) {
    this.vel = vel; this.stepped = true;
    for (const p of this.px) {
      // shy offset springs toward a push away from the pointer
      let ox = 0, oy = 0;
      if (ptr && shy > 0.01) {
        const dx = p.tx - ptr[0], dy = p.ty - ptr[1], d = Math.hypot(dx, dy) || 1;
        if (d < this.shyR) { const f = (1 - d / this.shyR) ** 2 * this.shyF * shy; ox = dx / d * f; oy = dy / d * f; }
      }
      p.sx += (ox - p.sx) * Math.min(1, dt * 14); p.sy += (oy - p.sy) * Math.min(1, dt * 14);
      if (p.delay > 0) { p.delay -= dt; continue; }
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      // swirl perpendicular to the path while travelling
      const sw = d > 1 ? p.curl * Math.min(1, d / 30) : 0;
      const c = 2 * Math.sqrt(p.k) * 0.7;
      p.vx += (dx * p.k - p.vx * c + (-dy / (d || 1)) * sw * 40) * dt;
      p.vy += (dy * p.k - p.vy * c + (dx / (d || 1)) * sw * 40) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.b += (p.tb - p.b) * Math.min(1, dt * 9);
    }
    this.px = this.px.filter(p => !(p.dying && p.b < 0.01 && Math.hypot(p.tx - p.x, p.ty - p.y) < 1));
  }
  // where a pixel is drawn: spring position + shy offset + velocity drag
  at(p) {
    const lag = Math.max(-14, Math.min(14, -(this.vel || 0) * p.drag));
    return [this.ox + p.x + (p.sx || 0) + lag, this.oy + p.y + (p.sy || 0)];
  }

  draw(ctx, gain = 1) {
    const s = Math.min(this.size, (this.pitch || Infinity) * 0.86);
    for (const p of this.px) {
      const b = p.b * gain; if (b < 0.004) continue;
      ctx.globalAlpha = Math.min(1, b);
      const travel = Math.min(1, Math.hypot(p.tx - p.x, p.ty - p.y) / 25);
      const sz = s * (1 - 0.4 * travel);
      const [x, y] = this.at(p);
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ jelly spring
// A damped spring around 0 for squash, wobble and recoil. kick() adds velocity.
export class Spring {
  constructor(k = 420, c = 13) { this.x = 0; this.v = 0; this.k = k; this.c = c; }
  kick(v) { this.v += v; return this; }
  step(dt, target = 0) {
    const h = dt / 2;
    for (let i = 0; i < 2; i++) { this.v += (-this.k * (this.x - target) - this.c * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
}

// ------------------------------------------------------------------ orbiting light
// The toggle's light-strip orbit: the strip rests at the bottom at 0 and at the top at 1; on the
// way it sweeps round the leading side, always circling one way. Its phase is eased and follows
// with a critically damped spring so it glides behind the control; direction latches only at rest.
export class Orbit {
  constructor(p = 0) { this.sp = p; this.v = 0; this.dir = p > 0.5 ? -1 : 1; }
  step(dt, progress) {
    const pc = Math.min(1, Math.max(0, progress));
    const goal = pc < 0.5 ? 4 * pc ** 3 : 1 - Math.pow(-2 * pc + 2, 3) / 2;
    const k = 70, c = 2 * Math.sqrt(k);
    this.v += (-k * (this.sp - goal) - c * this.v) * dt;
    this.sp += this.v * dt;
    const sp = Math.min(1, Math.max(0, this.sp));
    if (sp < 0.015) this.dir = 1; else if (sp > 0.985) this.dir = -1;
    return this.dir > 0 ? Math.PI / 2 - Math.PI * sp : -Math.PI / 2 - Math.PI * (1 - sp);
  }
}

// ------------------------------------------------------------------ stage
// Creates canvas + program, sizes the design box to the viewport, uploads the pixel layer,
// sets the shared uniforms. The control supplies its fragment body, layout box and frame().
// thumb: { span, fx, fy } renders a miniature: `span` design px fill the container, centred on the
// design point (fx, fy); it is silent and keeps its drawing buffer so it can be snapshotted.
const SILENT = new Proxy({}, { get: () => () => {} });
// ?perf in the URL: window.labPerf collects the CPU time spent per frame
const PERF = /[?&]perf\b/.test(location.search) ? (window.labPerf = { n: 0, sum: 0, max: 0, reset() { this.n = this.sum = this.max = 0; } }) : null;
export function glassStage(root, { frag, box, light = [0.43, 0.52, 1], thumb = null }) {
  const canvas = makeCanvas(root);
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: !!thumb });
  if (!gl) throw new Error('WebGL2 required');
  let prog = null;
  const ready = glProgramAsync(gl, `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`, LIB + frag).then(p => { prog = p; st.U = p.U; return st; });
  const tri = fullscreenTriangle(gl);
  const pcan = document.createElement('canvas'), pctx = pcan.getContext('2d');
  const gcan = document.createElement('canvas'), gctx = gcan.getContext('2d');
  const canFilter = typeof gctx.filter === 'string';
  const mkTex = unit => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const texPix = mkTex(0), texGlow = mkTex(1);
  // the pixel layer is sampled without smoothing: pixel edges stay hard instead of smearing by a texel
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texPix);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const st = {
    gl, U: {}, canvas, S: 1, cx: 0, cy: 0, dpr: 1, w: 0, h: 0, box, ready,
    theme: document.body.classList.contains('light') ? 1 : 0,
    light: [...light], ptr: null, dp: [0, 0], ptrOn: 0, thumb, sfx: thumb ? SILENT : sfx,
    sparks: [], wave: null, sweepT: -99, fxLight: [...light], kick: 0,
  };
  // pointer relative to a pixel matrix's origin (design px)
  st.local = m => [st.dp[0] - st.cx - (m?.ox || 0), st.dp[1] - st.cy - (m?.oy || 0)];
  st.pulse = (v = 1) => { st.kick = Math.max(st.kick, v); };
  // haptics: never in a shelf miniature, never before the user has touched the page
  st.buzz = pat => { if (!thumb) hapticBuzz(pat); };
  const sparkBuf = new Float32Array(28 * 4);
  const calm = reducedMotion();
  const now = () => performance.now() / 1000;
  if (!thumb && !calm) { assembleUntil = performance.now() + 2500; ready.then(() => { assembleUntil = performance.now() + 220; }); }
  // idle life: the light breathes, and a glint crosses the glass now and then while nobody touches it
  let lastTouch = now(), idleGlint = 0;
  const touched = () => { lastTouch = now(); };
  if (!thumb) window.addEventListener('keydown', touched);

  // ---- effects (coordinates are offsets from the design centre)
  st.burst = (x, y, count = 12, power = 1, dir = null, spread = Math.PI) => {
    if (calm) return;
    st.fxLight = [...st.light];
    for (let i = 0; i < count; i++) {
      const a = (dir ?? rand(0, Math.PI * 2)) + rand(-spread, spread) * (dir == null ? 0 : 1);
      const sp = rand(110, 420) * power, life = rand(0.45, 1.1);
      st.sparks.push({ x: st.cx + x, y: st.cy + y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life, max: life, size: rand(1.3, 2.9) });
    }
    if (st.sparks.length > 28) st.sparks.splice(0, st.sparks.length - 28);
  };
  st.shock = (x, y) => { if (calm) return; st.fxLight = [...st.light]; st.wave = { x: st.cx + x, y: st.cy + y, t: now() }; };
  st.glint = () => { st.sweepT = now(); };
  const stepFx = dt => {
    for (const s of st.sparks) {
      s.vy += 230 * dt; const d = Math.exp(-dt * 2.4);
      s.vx *= d; s.vy *= d; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    }
    st.sparks = st.sparks.filter(s => s.life > 0);
  };
  const view = autosize(canvas, s => {
    st.dpr = s.dpr; st.w = s.w; st.h = s.h;
    if (thumb) {
      st.S = Math.min(s.w, s.h) / thumb.span;
      st.cx = s.w / 2 - (thumb.fx || 0) * st.S; st.cy = s.h / 2 - (thumb.fy || 0) * st.S;
    } else {
      st.S = Math.min(1.15, (s.w - (s.w < 600 ? 14 : 40)) / box[0], (s.h - 190) / box[1]);
      st.cx = s.w / 2; st.cy = s.h / 2 - 10;
    }
    const res = s.dpr * Math.max(st.S, 1);
    pcan.width = Math.round(box[0] * res); pcan.height = Math.round(box[1] * res);
    gcan.width = Math.round(box[0] * res / 2); gcan.height = Math.round(box[1] * res / 2);
  }, 2);

  st.toDesign = (x, y) => [st.cx + (x - st.cx) / st.S, st.cy + (y - st.cy) / st.S];
  // thumbnails only: glide the framing toward a design-space point (offset from the design centre),
  // like a camera following the moving part
  st.follow = (fx, fy, dt) => {
    if (!thumb) return;
    const k = Math.min(1, dt * 6);
    thumb.fx += (fx - thumb.fx) * k; thumb.fy += (fy - thumb.fy) * k;
    st.cx = st.w / 2 - thumb.fx * st.S; st.cy = st.h / 2 - thumb.fy * st.S;
  };
  st.bindPointer = handlers => {
    const wrap = fn => fn && ((p, e) => { touched(); st.dp = st.toDesign(p.x, p.y); fn(p, e, st.dp); });
    st.ptr = pointer(canvas, { down: wrap(handlers.down), up: wrap(handlers.up), move: wrap(handlers.move) });
    return st.ptr;
  };

  // draw pixel matrices, centred on design (x, y) offsets relative to the design centre
  // a cheap recorder: the pixel layer is only redrawn, blurred and uploaded when it changed
  let lastSig = null, lastW = 0;
  const rec = {
    sig: 0, n: 0, globalAlpha: 1, fillStyle: '#fff',
    fillRect(x, y, w, h) { this.sig = (this.sig * 1.000173 + x * 1.37 + y * 7.13 + w * 3.71 + h * 5.31 + this.globalAlpha * 11.9) % 1e9; this.n++; },
    translate(x, y) { this.sig += x * 0.917 + y * 0.311; }, scale(x, y) { this.sig += x * 13.7 + y * 17.3; },
    save() {}, restore() {}, setTransform() {},
  };
  st.drawPixels = draw => {
    rec.sig = 0; rec.n = 0; rec.globalAlpha = 1;
    draw(rec);
    const sig = rec.sig.toFixed(2) + ':' + rec.n;
    if (sig === lastSig && lastW === pcan.width) return;
    lastSig = sig; lastW = pcan.width;
    const res = pcan.width / box[0];
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, pcan.width, pcan.height);
    pctx.fillStyle = '#fff';
    // every square lands on whole device pixels (origin = design centre): no anti-aliased fuzz
    const ox = box[0] / 2 * res, oy = box[1] / 2 * res;
    let T = { s: 1, x: 0, y: 0 };
    const stack = [];
    const snap = {
      get globalAlpha() { return pctx.globalAlpha; }, set globalAlpha(v) { pctx.globalAlpha = v; },
      fillStyle: '#fff',
      fillRect(x, y, w, h) {
        const X0 = Math.round((T.x + x * T.s) * res + ox), Y0 = Math.round((T.y + y * T.s) * res + oy);
        const X1 = Math.max(X0 + 1, Math.round((T.x + (x + w) * T.s) * res + ox)), Y1 = Math.max(Y0 + 1, Math.round((T.y + (y + h) * T.s) * res + oy));
        pctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
      },
      translate(x, y) { T = { ...T, x: T.x + x * T.s, y: T.y + y * T.s }; },
      scale(k) { T = { ...T, s: T.s * k }; },
      save() { stack.push(T); }, restore() { T = stack.pop() || { s: 1, x: 0, y: 0 }; }, setTransform() {},
    };
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    draw(snap);
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, gcan.width, gcan.height);
    if (canFilter) { gctx.filter = `blur(${2 * res}px)`; gctx.drawImage(pcan, 0, 0, gcan.width, gcan.height); gctx.filter = 'none'; }
    else gctx.drawImage(pcan, 0, 0, gcan.width, gcan.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texPix);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pcan);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texGlow);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gcan);
  };

  let lastFrame = null;
  st.render = (t, set) => {
    if (!prog) return;
    lastFrame = [t, set];
    const U = prog.U;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog.prog);
    gl.uniform1i(U.uPix, 0); gl.uniform1i(U.uGlow, 1);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uDpr, st.dpr);
    gl.uniform1f(U.uTime, t % 1000);
    // a still can force a theme; otherwise follow the toggle's continuous theme live
    gl.uniform1f(U.uTheme, forcedTheme ?? thumb?.theme ?? window.glassTheme ?? st.theme);
    gl.uniform2f(U.uC, st.cx, st.cy);
    gl.uniform1f(U.uScale, st.S);
    gl.uniform2f(U.uPtr, st.dp[0], st.dp[1]);
    gl.uniform1f(U.uPtrOn, st.ptrOn);
    gl.uniform4f(U.uBox, st.cx - box[0] / 2, st.cy - box[1] / 2, box[0], box[1]);
    gl.uniform3f(U.uLight, ...st.light);
    const n = Math.min(st.sparks.length, 28);
    for (let i = 0; i < n; i++) { const s = st.sparks[i], k = s.life / s.max; sparkBuf.set([s.x, s.y, Math.pow(k, 1.4) * 0.95, s.size * (0.6 + 0.4 * k)], i * 4); }
    gl.uniform4fv(U.uSpark, sparkBuf);
    gl.uniform1i(U.uSparkN, n);
    const wa = st.wave ? now() - st.wave.t : -1;
    gl.uniform3f(U.uWave, st.wave?.x ?? 0, st.wave?.y ?? 0, wa >= 0 && wa < 2.5 ? wa : -1);
    gl.uniform1f(U.uSweep, Math.min(99, now() - st.sweepT));
    gl.uniform3f(U.uFxLight, ...st.fxLight);
    gl.uniform1f(U.uKick, st.kick + (thumb || calm ? 0 : 0.11 * (0.5 + 0.5 * Math.sin(t * 0.85))));
    set(U, gl);
    tri.draw();
  };

  // stills: render the current frame again with a given theme and copy it out (same pose for
  // both themes, so cross-fading them never ghosts)
  let forcedTheme = null;
  canvas.glassCapture = (theme, ctx, size) => {
    if (!prog || !lastFrame) return false;
    forcedTheme = theme; st.render(...lastFrame); forcedTheme = null;
    // shrink in halving steps with high-quality smoothing: one big jump would alias the pixels to grey mush
    let src = canvas, w = canvas.width, h = canvas.height;
    while (w > size * 2) {
      const t = document.createElement('canvas');
      t.width = Math.max(size, Math.round(w / 2)); t.height = Math.max(size, Math.round(h / 2));
      const tc = t.getContext('2d'); tc.imageSmoothingQuality = 'high';
      tc.drawImage(src, 0, 0, t.width, t.height);
      src = t; w = t.width; h = t.height;
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, size, size); ctx.drawImage(src, 0, 0, size, size);
    return true;
  };

  // pointer light fades in when the mouse is near the control
  st.trackPointer = dt => {
    const p = st.ptr; if (!p) return;
    p.tick(dt);
    if (p.inside) st.dp = st.toDesign(p.x, p.y);
    const [x, y] = st.dp;
    const near = p.inside && p.type === 'mouse' && Math.abs(x - st.cx) < box[0] / 2 + 80 && Math.abs(y - st.cy) < box[1] / 2 + 80;
    st.ptrOn += ((near || p.down ? 1 : 0) - st.ptrOn) * Math.min(1, dt * 6);
  };

  st.run = step => {
    let born = false, frames = 0;
    const L = loop((dt, t) => {
      const t0 = performance.now();
      // power-on: a control arrives with a surge of its light and a glint wiping across the glass
      if (!born && prog) { born = true; if (!thumb && !calm) { st.glint(); st.pulse(1); } }
      else if (born && !thumb && gathered.length && ++frames > 3) {
        for (const m of gathered) if (!m.stepped) for (const p of m.px) { p.x = p.tx; p.y = p.ty; p.b = p.tb; p.vx = p.vy = 0; p.delay = 0; }
        gathered.length = 0;
      }
      if (born && !thumb && !calm && now() - Math.max(lastTouch, idleGlint) > 9) { idleGlint = now(); st.glint(); }
      st.trackPointer(dt); stepFx(dt); st.kick *= Math.exp(-dt * 3.5); step(dt, t);
      if (PERF) { const ms = performance.now() - t0; PERF.n++; PERF.sum += ms; PERF.max = Math.max(PERF.max, ms); }
    });
    L.start();
    st.loop = L;
  };

  st.dispose = () => {
    st.loop?.dispose(); st.ptr?.dispose(); view.dispose(); if (!thumb) { sfx.air(0); window.removeEventListener('keydown', touched); }
    gl.deleteTexture(texPix); gl.deleteTexture(texGlow); tri.dispose(); if (prog) gl.deleteProgram(prog.prog);
    loseContext(gl); canvas.remove();
  };
  return st;
}

export const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
export const mix3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
