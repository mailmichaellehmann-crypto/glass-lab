// PICKER — a time picker: two drums of pixel numbers under a glass rod, seen from above.
// The rod lies across both drums like a cylindrical lens: it magnifies the chosen row (a little more
// for blue than for red, so the edges fringe), and squeezes what lies under its rims. Away from the rod
// the drum curves away: rows get shorter, softer and colour-fringed toward the top and bottom. Light is
// fed into the rod from its ends like a light pipe; its colour is the sky at the chosen hour (night
// blue, dawn red, noon white, evening pink). Drag or flick a drum, it coasts, clicks past every row and
// settles with a little overshoot. The time of day sits underneath in pixels.

import { glassStage, PixelMatrix, Spring, textCells, hexRgb, mix3 } from '../glass/engine.js';
import { clamp } from '../kit.js';

// sky colour over the day (hour → colour), wrapping at midnight
const SKY = [[0, '#5e6cff'], [4.5, '#6f6cff'], [6, '#ff7d6b'], [8, '#ffb36b'], [12, '#fff0c2'], [16, '#ffbf5c'], [19, '#ff6f91'], [21.5, '#8a6cff'], [24, '#5e6cff']]
  .map(([h, c]) => [h, hexRgb(c)]);
const sky = h => {
  h = ((h % 24) + 24) % 24;
  for (let i = 0; i < SKY.length - 1; i++) if (h <= SKY[i + 1][0]) return mix3(SKY[i][1], SKY[i + 1][1], (h - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]));
  return SKY[0][1];
};
const partOfDay = h => (h < 5 ? 'NIGHT' : h < 8 ? 'DAWN' : h < 12 ? 'MORNING' : h < 14 ? 'NOON' : h < 18 ? 'AFTERNOON' : h < 22 ? 'EVENING' : 'NIGHT');
const pad = n => String(n).padStart(2, '0');

const FRAG = /* glsl */ `
uniform vec2  uTray;           // tray half size
uniform vec2  uRod;            // rod half size
uniform float uRodY;           // rod centre offset (lift / squash)
uniform float uMag;            // magnification of the rod
uniform float uActive;         // x of the active drum (design, relative)
uniform vec3  uL;              // light colour (the sky at that hour)
uniform float uEnergy, uLift, uPress, uSpin;

float sdRod(vec2 p) { vec2 c = uC + vec2(0.0, uRodY); return sdRoundBox(p - c, uRod, uRod.y); }

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  vec2 hs = uTray;
  float sdT = sdRoundBox(q - uC, hs, 30.0);
  float dy = (q.y - uC.y) / hs.y;
  float fr = smoothstep(0.22, 0.95, abs(dy)) * (1.0 - smoothstep(-4.0, 2.0, sdT)); // only the drum curves away
  col = shadowed(col, sdRoundBox(q - uC - vec2(0.0, 14.0), hs, 30.0), sdRoundBox(q - uC - vec2(0.0, 1.5), hs, 30.0), 0.0);
  if (sdT < 2.0) {
    vec3 tc = tray(col, sdT, sdRoundBox(q - uC - vec2(0.0, 7.0), hs, 30.0), q, uC, hs);
    // the drum curves away from the eye: darker toward top and bottom
    tc *= 1.0 - dy * dy * mix(0.55, 0.12, uTheme);
    // light from the rod falls into the tray, and a caustic line runs under it
    float ry = q.y - uC.y - uRodY;
    float inX = smoothstep(uRod.x + 6.0, uRod.x - 30.0, abs(q.x - uC.x));
    tc = emitC(tc, uL, (exp(-abs(ry) / 26.0) * 0.16 + exp(-abs(ry - 5.0) / 3.0) * 0.12) * inX * uEnergy);
    // the active drum glows faintly along its column
    tc = emitC(tc, uL, exp(-abs(q.x - uC.x - uActive) / 34.0) * (1.0 - abs(dy)) * 0.06 * uEnergy);
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdT));
  }
  float cover;
  // rows on the curved part of the drum: softer and colour-fringed (they are seen at an angle)
  return ink(col, q, max(frost, fr * 0.75), vec2(0.0, dy * 2.4 * fr), exp(-abs(q.y - uC.y - uRodY) / 14.0) * 0.5, uL, cover);
}

vec3 rodGlass(vec2 p, vec2 sp, float sd) {
  vec2 c = uC + vec2(0.0, uRodY);
  vec2 d = p - c;
  vec2 e = vec2(0.5, 0.0);
  vec2 n = normalize(vec2(sdRod(p + e.xy) - sdRod(p - e.xy), sdRod(p + e.yx) - sdRod(p - e.yx)) + 1e-5);
  float depth = max(-sd, 0.0);
  float u = clamp(depth / uRod.y, 0.0, 1.0);
  float hgt = sqrt(max(1.0 - (1.0 - u) * (1.0 - u), 0.0));
  vec3 n3 = normalize(vec3(n.x * (1.0 - u), -n.y * (1.0 - u), hgt + 0.02));
  float v = clamp(d.y / uRod.y, -1.0, 1.0);
  // a cylinder lens: magnify across its axis, squeeze toward its rims; blue bends a little more
  float comp = 1.0 + 1.3 * pow(abs(v), 3.0);
  float sx = 1.0 - 0.06 * hgt;
  vec2 qR = c + vec2(d.x * sx, d.y * comp / (uMag * 0.975));
  vec2 qG = c + vec2(d.x * sx, d.y * comp / uMag);
  vec2 qB = c + vec2(d.x * sx, d.y * comp / (uMag * 1.03));
  vec3 kc = vec3(scene(qR, sp + (qR - p) * uScale, 0.0).r, scene(qG, sp + (qG - p) * uScale, 0.0).g, scene(qB, sp + (qB - p) * uScale, 0.0).b);
  kc = mix(kc, kc * 0.9 + 0.05, 1.0 - uTheme);

  // reflections: a cylinder throws one long, thin highlight along its length
  vec3 V = vec3(0.0, 0.0, -1.0);
  vec3 Rv = reflect(V, n3);
  float fres = 0.04 + 0.96 * pow(1.0 - n3.z, 5.0);
  vec3 env = mix(vec3(0.06), vec3(0.55), smoothstep(-0.7, 0.9, Rv.y));
  env = mix(env, vec3(0.97), uTheme * 0.5);
  kc = mix(kc, env, clamp(fres, 0.0, 0.65));
  float along = smoothstep(uRod.x, uRod.x - uRod.y * 1.2, abs(d.x));
  vec2 tp = (uPtr - c) / vec2(220.0, 60.0);
  float hy = -0.52 + clamp(tp.y, -1.0, 1.0) * 0.12 * uPtrOn;
  kc += exp(-pow((v - hy) / 0.085, 2.0)) * mix(0.42, 0.55, uTheme) * along;
  kc += exp(-pow((v - 0.66) / 0.13, 2.0)) * 0.08 * along;
  kc += smoothstep(0.07, 0.0, u) * mix(0.3, 0.4, uTheme);
  // a light pipe: light enters at both ends and runs along the core
  float endD = uRod.x - abs(d.x);
  kc = emitC(kc, uL, (exp(-endD / 15.0) * 0.95 + exp(-abs(v) / 0.14) * (0.08 + 0.25 * uSpin) * along) * uEnergy * (1.0 + uKick * 0.6));
  kc = emitC(kc, uL, exp(-depth / 2.0) * 0.35 * uEnergy);
  if (uSweep < 1.2) {
    float s = dot(d, normalize(vec2(1.0, -0.6)));
    float pos = mix(-uRod.x - 40.0, uRod.x + 40.0, clamp(uSweep / 0.8, 0.0, 1.0));
    kc += exp(-pow((s - pos) / 12.0, 2.0)) * 0.28 * (1.0 - uSweep / 1.2) * hgt;
  }
  return kc;
}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);
  float sr = sdRod(p);
  // the rod's shadow falls past its lower rim (it rests on the tray's lips)
  float sh = sdRod(p - vec2(0.0, 8.0 + uLift * 5.0 - uPress * 4.0));
  col *= 1.0 - (1.0 - smoothstep(-4.0, 14.0 + uLift * 8.0, sh)) * smoothstep(-2.0, 2.0, sr) * mix(0.5, 0.18, uTheme);
  if (sr < 2.0) col = mix(rodGlass(p, sp, sr), col, smoothstep(-0.7, 0.7, sr));
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const K = thumb ? 0.8 : 1;
  const ROW = 42 * K, A = 0.4, RD = ROW / A;          // row spacing at the centre, angle per row, drum radius
  const PITCH = (thumb ? 4 : 4.4);
  const TRAY = thumb ? [96, 66] : [138, 104];
  const WX = thumb ? 40 : 58;                           // drum x
  const ROD = [TRAY[0] + 16, 25 * K];
  const st = glassStage(root, { frag: FRAG, box: [TRAY[0] * 2 + 120, TRAY[1] * 2 + (thumb ? 70 : 120)], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => st.buzz(pat);

  // ---------------------------------------------------------------- state
  const wheels = [
    { x: -WX, n: 24, pos: 7, vel: 0, tgt: 7, free: false, last: 7, settled: true, val: 7 },
    { x: WX, n: 60, pos: 30, vel: 0, tgt: 30, free: false, last: 30, settled: true, val: 30 },
  ];
  let active = 0, drag = null, press = 0, lift = 0, spin = 0;
  const rod = new Spring(380, 10);
  const caption = new PixelMatrix({ size: 3.2, swirl: 9, shyR: 16, shyF: 6 });
  caption.oy = TRAY[1] + 34;
  let captionShown = null;
  const cellCache = new Map();
  const cells = s => { let c = cellCache.get(s); if (!c) { c = textCells(s, PITCH); cellCache.set(s, c); } return c; };
  const wrap = (w, k) => ((k % w.n) + w.n) % w.n;

  const stepTo = (i, d) => {
    const w = wheels[i];
    w.free = false; w.settled = false;
    w.tgt = Math.round(w.tgt) + d;
    active = i;
  };

  // ---------------------------------------------------------------- input
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const over = ([x, y]) => Math.abs(x) < TRAY[0] + 14 && Math.abs(y) < TRAY[1] + 6;
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d);
      if (!over(q)) return;
      S._ensure();
      const i = q[0] < 0 ? 0 : 1;
      const w = wheels[i];
      active = i;
      drag = { i, y0: q[1], p0: w.pos, last: w.pos, t: performance.now(), moved: 0 };
      w.free = false; w.vel = 0; w.settled = false;
      rod.kick(-0.8);
    },
    move: (p, e, d) => {
      const q = local(d);
      st.canvas.style.cursor = drag ? 'grabbing' : over(q) ? 'grab' : 'default';
      if (!drag) return;
      const w = wheels[drag.i];
      const now = performance.now(), dt = Math.max(8, now - drag.t) / 1000;
      const np = drag.p0 - (q[1] - drag.y0) / ROW;
      const v = (np - drag.last) / dt;
      w.vel = w.vel * 0.4 + v * 0.6;
      drag.last = np; drag.t = now; drag.moved = Math.max(drag.moved, Math.abs(q[1] - drag.y0));
      w.pos = np;
    },
    up: (p, e, d) => {
      if (!drag) return;
      const w = wheels[drag.i];
      const q = d ? local(d) : null;
      if (drag.moved < 4 && q && Math.abs(q[1]) > ROD[1]) {
        // a tap on a row above or below brings it under the rod
        const off = Math.round(Math.asin(clamp(q[1] / RD, -1, 1)) / A);
        w.tgt = Math.round(w.pos) + off; w.free = false;
      } else if (performance.now() - drag.t > 90) {
        w.vel = 0; w.tgt = Math.round(w.pos); w.free = false; // held still before letting go: no flick
      } else {
        w.vel = clamp(w.vel, -38, 38);
        w.free = Math.abs(w.vel) > 2.5;
        w.tgt = Math.round(w.pos + w.vel * 0.12);
      }
      drag = null;
      rod.kick(1); st.glint();
    },
  });
  const onWheel = e => {
    e.preventDefault();
    const r = st.canvas.getBoundingClientRect();
    const x = (e.clientX - r.left - st.cx) / st.S;
    const i = x < 0 ? 0 : 1;
    const w = wheels[i];
    w.acc = (w.acc || 0) + e.deltaY;
    while (Math.abs(w.acc) >= 40) { stepTo(i, Math.sign(w.acc)); w.acc -= Math.sign(w.acc) * 40; }
  };
  st.canvas.addEventListener('wheel', onWheel, { passive: false });
  const onKey = e => {
    if (e.key === 'ArrowUp') { e.preventDefault(); stepTo(active, -1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); stepTo(active, 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); active = e.key === 'ArrowLeft' ? 0 : 1; rod.kick(-0.6); S.tick(0.6, 0.4); }
  };
  if (!thumb) window.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- autopilot (shelf miniature)
  let demoT = 0, demoK = -1;
  const DEMO = [[0, 9], [1, -14], [0, -2], [1, 25]];

  st.run((dt, t) => {
    if (demo) {
      demoT += dt;
      const k = Math.floor(demoT / 1.5);
      if (k !== demoK) { demoK = k; const [i, v] = DEMO[k % DEMO.length]; const w = wheels[i]; w.vel = v; w.free = true; w.settled = false; active = i; }
    }

    let fastest = 0;
    for (const [i, w] of wheels.entries()) {
      if (!(drag && drag.i === i)) {
        if (w.free) {
          // coasting: friction, then hand over to the snap spring
          w.pos += w.vel * dt;
          w.vel *= Math.exp(-dt * 2.4);
          if (Math.abs(w.vel) < 3) { w.free = false; w.tgt = Math.round(w.pos + w.vel * 0.1); }
        } else {
          const k = 230, c = 2 * Math.sqrt(k) * 0.62;
          w.vel += (-k * (w.pos - w.tgt) - c * w.vel) * dt;
          w.pos += w.vel * dt;
          if (!w.settled && Math.abs(w.pos - w.tgt) < 0.02 && Math.abs(w.vel) < 0.08) {
            w.settled = true;
            const val = wrap(w, w.tgt);
            if (val !== w.val) {
              w.val = val; S.drip(0.55 + i * 0.15, 0.35); rod.kick(1.6); st.pulse(0.5); buzz(6);
              // the drum locks in: the rod spits a few sparks from both ends
              st.burst(-ROD[0], 0, 4, 0.4, Math.PI, 0.7); st.burst(ROD[0], 0, 4, 0.4, 0, 0.7);
            }
          }
        }
      }
      // a click for every row that passes under the rod
      const idx = Math.round(w.pos);
      if (idx !== w.last) {
        const sp = Math.abs(w.vel);
        S.tick(0.42 + i * 0.2 + Math.min(0.25, sp * 0.01), clamp(0.35 + sp * 0.02, 0.35, 0.8));
        rod.kick(-0.35); st.pulse(0.12);
        w.last = idx;
      }
      fastest = Math.max(fastest, Math.abs(w.vel));
    }
    S.air(fastest / 14);
    spin += (Math.min(1, fastest / 12) - spin) * Math.min(1, dt * 6);

    const hourF = ((wheels[0].pos % 24) + 24) % 24 + wrap(wheels[1], Math.round(wheels[1].pos)) / 60; // the sky moves as you spin
    const L = sky(hourF);
    st.light = L;
    const hour = wrap(wheels[0], Math.round(wheels[0].pos));
    const word = thumb ? '' : partOfDay(hour);
    if (word !== captionShown) { caption.set(word ? textCells(word, 3.4) : []); captionShown = word; }
    caption.step(dt, { ptr: st.local(caption), shy: st.ptrOn * 0.6 });

    press += ((drag ? 1 : 0) - press) * Math.min(1, dt * 12);
    lift += ((st.ptrOn > 0.5 && !drag ? 1 : 0) - lift) * Math.min(1, dt * 8);
    const j = rod.step(dt) * 0.035;

    st.drawPixels(ctx => {
      for (const w of wheels) {
        const base = Math.floor(w.pos);
        const blur = reducedMotion ? 0 : Math.min(0.9, Math.abs(w.vel) * 0.03); // fast rows smear vertically
        for (let k = base - 4; k <= base + 5; k++) {
          const a = (k - w.pos) * A;
          if (Math.abs(a) > 1.42) continue;
          const y = RD * Math.sin(a), sc = Math.cos(a);
          const edge = clamp((TRAY[1] - 6 - Math.abs(y)) / 14, 0, 1); // rows stay inside the tray
          if (edge <= 0) continue;
          const alpha = Math.pow(sc, 1.6) * edge;
          ctx.globalAlpha = alpha;
          for (const c of cells(pad(wrap(w, k)))) {
            const h = PITCH * sc * (1 + blur);
            ctx.fillRect(w.x + c.x - PITCH / 2, y + c.y * sc - h / 2, PITCH, h);
          }
        }
      }
      ctx.globalAlpha = 1;
      for (const c of cells(':')) ctx.fillRect(c.x - PITCH / 2, c.y - PITCH / 2, PITCH, PITCH);
      caption.draw(ctx, 0.8);
    });
    st.render(t, (U, gl) => {
      gl.uniform2f(U.uTray, TRAY[0], TRAY[1]);
      gl.uniform2f(U.uRod, ROD[0] * (1 - j * 0.3), ROD[1] * (1 + j) * (1 - press * 0.04));
      gl.uniform1f(U.uRodY, -lift * 1.5 + press * 1.5);
      gl.uniform1f(U.uMag, 1.42);
      gl.uniform1f(U.uActive, wheels[active].x);
      gl.uniform3f(U.uL, ...L);
      gl.uniform1f(U.uEnergy, 0.7 + lift * 0.1 + st.kick * 0.25);
      gl.uniform1f(U.uLift, lift);
      gl.uniform1f(U.uPress, press);
      gl.uniform1f(U.uSpin, spin);
    });
  });

  return {
    dispose() {
      window.removeEventListener('keydown', onKey);
      st.canvas.removeEventListener('wheel', onWheel);
      st.dispose();
    },
  };
}
