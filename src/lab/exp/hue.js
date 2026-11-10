// HUE — a colour picker you push around. Seen from above.
// A round tray whose floor is a mosaic of tiny coloured LEDs: hue runs round it, the centre is white.
// A clear glass ball lies on it. Push it over the floor and it soaks up the colour beneath: the glass,
// its filament, the page around it and the code under the tray all turn. The LEDs near the ball burn
// brighter, the rest stay dim. Let go and a drop of that colour splits off and settles in the palette
// below; tap a drop to send the ball back to it. Scroll (or ↑ ↓) dims and brightens, shown by the
// filament travelling round the ball like on the toggle.

import { glassStage, PixelMatrix, Spring, Orbit, textCells } from '../glass/engine.js';
import { domeLens } from '../glass/lib.glsl.js';
import { clamp } from '../kit.js';

const TAU = Math.PI * 2;
const NS = 5; // palette slots
const hsv = (h, s, v) => [0, 2 / 3, 1 / 3].map(o => { const k = Math.abs((((h + o) % 1) + 1) % 1 * 6 - 3) - 1; return v * (1 - s + s * clamp(k, 0, 1)); });
const hex = c => '#' + c.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

const FRAG = /* glsl */ `
#define NS ${NS}
uniform vec3  uT;              // tray centre (abs), radius
uniform float uRM;             // radius at which the colour is fully saturated (the ball's reach)
uniform vec2  uBall;           // ball centre (abs)
uniform vec2  uBR;             // ball radii
uniform vec3  uL;              // the picked colour
uniform float uVal, uEnergy, uLift, uPress, uTh, uPitch;
uniform vec3  uWell;           // palette: x of the first well (abs), y (abs), gap (0 = no palette)
uniform vec3  uSw[NS];         // drops in the palette: x, y (abs), radius
uniform vec3  uSwC[NS];
uniform vec3  uFly, uFlyC;     // the drop on its way: x, y, radius

vec3 hsv(float h, float s, float v) {
  vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  return v * mix(vec3(1.0), k, s);
}
float fil(vec2 p) { return filament(p, uBall, sdEllipse(p, uBall, uBR), uTh, 0.62); }

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  float sdT = length(q - uT.xy) - uT.z;
  col = shadowed(col, length(q - uT.xy - vec2(0.0, 13.0)) - uT.z, length(q - uT.xy - vec2(0.0, 1.5)) - uT.z, 0.0);
  float f = fil(q);
  col = emitC(col, uL, filamentSpill(f) * 0.5 * uEnergy);
  if (sdT < 2.0) {
    vec3 tc = tray(col, sdT, length(q - uT.xy - vec2(0.0, 7.0)) - uT.z, q, uT.xy, vec2(uT.z));
    // the floor: a mosaic of square LEDs with a gap between them, each one a single flat colour
    vec2 g = (q - uT.xy) / uPitch;
    vec2 cq = (floor(g) + 0.5) * uPitch;
    float cr = length(cq);
    if (cr < uT.z - 9.0) {
      vec3 hc = hsv(atan(cq.y, cq.x) / 6.2831853 + 0.5, clamp(cr / uRM, 0.0, 1.0), 1.0) * uVal;
      vec2 fc = abs(fract(g) - 0.5) * uPitch;
      float half_ = uPitch * 0.4, aa = 0.55 / uScale + frost * 3.0;
      float m = 1.0 - smoothstep(half_ - aa, half_ + aa, max(fc.x, fc.y));
      // LEDs near the ball burn at full strength, the far ones stay dim: the ball carries the light
      float nearB = exp(-length(cq + uT.xy - uBall) / 62.0);
      float gain = 0.3 + 0.7 * nearB + uKick * 0.25;
      tc = mix(tc + hc * m * gain, mix(tc, hc * 0.93 + 0.02, m * (0.5 + 0.5 * nearB)), uTheme);
    }
    tc = emitC(tc, uL, filamentWash(f) * 0.35 * uEnergy);
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdT));
  }
  // the palette: five small wells, and the drops lying in them
  if (uWell.z > 0.5) {
    for (int i = 0; i < NS; i++) {
      vec2 wc = vec2(uWell.x + float(i) * uWell.z, uWell.y);
      float sw = length(q - wc) - 14.0;
      if (sw < 16.0) {
        col = shadowed(col, length(q - wc - vec2(0.0, 6.0)) - 14.0, length(q - wc - vec2(0.0, 1.0)) - 14.0, 0.0);
        if (sw < 2.0) {
          vec3 tc = tray(col, sw, length(q - wc - vec2(0.0, 4.0)) - 14.0, q, wc, vec2(14.0));
          if (uSw[i].z > 0.5) {
            tc = emitC(tc, uSwC[i], exp(-length(q - uSw[i].xy - vec2(2.0, 3.0)) / 9.0) * 0.5);
            tc *= 1.0 - (1.0 - smoothstep(-3.0, 8.0, length(q - uSw[i].xy - vec2(0.0, 4.0)) - uSw[i].z)) * mix(0.4, 0.15, uTheme);
          }
          col = mix(tc, col, smoothstep(-0.6, 0.6, sw));
        }
      }
    }
  }
  // the ball's shadow (longer when lifted, tight when pressed) and the flying drop's
  float ls = sdEllipse(q - vec2(0.0, 10.0 + uLift * 6.0 - uPress * 5.0), uBall, uBR);
  col *= 1.0 - (1.0 - smoothstep(-9.0, 24.0 + uLift * 10.0, ls)) * mix(0.55, 0.2, uTheme);
  // and the pool of colour it focuses onto the floor beside it
  col = emitC(col, uL, exp(-length(q - uBall - vec2(7.0, 9.0)) / (uBR.x * 0.55)) * 0.3 * uEnergy);
  if (uFly.z > 0.5) col *= 1.0 - (1.0 - smoothstep(-3.0, 12.0, length(q - uFly.xy - vec2(4.0, 9.0)) - uFly.z)) * mix(0.35, 0.13, uTheme);
  float cover;
  return ink(col, q, frost, vec2(0.0), 0.0, uL, cover);
}

${domeLens('dome', 'scene')}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);
  for (int i = 0; i < NS; i++) {
    if (uSw[i].z < 0.5) continue;
    float d = length(p - uSw[i].xy) - uSw[i].z;
    if (d < 2.0) col = mix(dome(p, sp, uSw[i].xy, vec2(uSw[i].z), 0.05, 0.8, vec4(uSwC[i], 0.8), uSwC[i], 0.3), col, smoothstep(-0.7, 0.7, d));
  }
  float sk = sdEllipse(p, uBall, uBR);
  if (sk < 2.0) {
    // the ball soaks up the colour: its body is tinted with it and the light inside is that colour
    vec3 kc = dome(p, sp, uBall, uBR, 0.07, 1.0, vec4(uL, 0.42), uL, filamentScatter(fil(p)) * uEnergy * 0.9 + 0.16);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }
  col = drawFilament(col, fil(p), uL, uEnergy * (1.0 + uKick * 0.5));
  if (uFly.z > 0.5) {
    float d = length(p - uFly.xy) - uFly.z;
    if (d < 2.0) col = mix(dome(p, sp, uFly.xy, vec2(uFly.z), 0.05, 0.8, vec4(uFlyC, 0.8), uFlyC, 0.45), col, smoothstep(-0.7, 0.7, d));
  }
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const RT = 118, RB = 30, RM = RT - RB - 6;          // tray, ball, the ball's reach
  const TY = thumb ? 0 : -50;                            // tray centre (offset from the design centre)
  const CODE_Y = TY + RT + 34, WELL_Y = CODE_Y + 44, GAP = 40, SR = 10.5;
  const wellX = i => (i - (NS - 1) / 2) * GAP;
  const st = glassStage(root, { frag: FRAG, box: [RT * 2 + 70, thumb ? RT * 2 + 70 : (WELL_Y + 40) * 2], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => st.buzz(pat);

  // ---------------------------------------------------------------- state
  let hue = 0.07, sat = 0.82, val = 1;
  const posOf = (h, s) => { const a = (h - 0.5) * TAU; return [Math.cos(a) * s * RM, Math.sin(a) * s * RM]; };
  let [bx, by] = posOf(hue, sat), bvx = 0, bvy = 0, tx = bx, ty = by;
  let drag = null, press = 0, lift = 0, lastSector = Math.floor(hue * 12), lastSaved = '';
  const jelly = new Spring(360, 10);
  const orbit = new Orbit(val);
  const code = new PixelMatrix({ size: 3.0, swirl: 6, shyR: 16, shyF: 5 });
  code.oy = CODE_Y;
  let shown = '';
  const slots = Array.from({ length: NS }, () => ({ col: null, r: 0, pop: new Spring(420, 11) }));
  let next = 0, fly = null;

  const setFrom = (x, y) => { const r = Math.hypot(x, y); sat = clamp(r / RM, 0, 1); if (r > 0.5) hue = Math.atan2(y, x) / TAU + 0.5; };
  const land = () => {
    if (!fly) return;
    const s = slots[fly.i];
    s.col = fly.col; s.r = SR; s.pop.kick(7);
    S.drip(0.55 + fly.i * 0.08, 0.6); st.pulse(0.5); buzz(8);
    st.burst(wellX(fly.i), WELL_Y, 6, 0.35);
    fly = null;
  };
  // a drop of the current colour splits off the ball and travels to the next well
  const save = () => {
    if (thumb) return;
    const c = hsv(hue, sat, val), key = hex(c);
    if (key === lastSaved) return;
    lastSaved = key;
    land();
    fly = { i: next, col: c, x: bx, y: TY + by + RB * 0.7, vx: 0, vy: 0, r: 2 };
    next = (next + 1) % NS;
    jelly.kick(-4); S.tick(0.8, 0.6); st.glint();
  };
  const goTo = c => { // send the ball back to a saved colour
    const mx = Math.max(...c), mn = Math.min(...c);
    val = clamp(mx, 0.2, 1);
    const s = mx > 0 ? (mx - mn) / mx : 0;
    let h = 0;
    if (mx > mn) { const [r, g, b] = c; h = mx === r ? ((g - b) / (mx - mn) + 6) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; h /= 6; }
    [tx, ty] = posOf(h, s); lastSaved = hex(c);
    jelly.kick(3); S.ping(true); st.pulse(0.7);
  };

  // ---------------------------------------------------------------- input
  const local = d => [d[0] - st.cx, d[1] - st.cy - TY];
  const onBall = ([x, y]) => Math.hypot(x - bx, y - by) < RB + 8;
  const onTray = ([x, y]) => Math.hypot(x, y) < RT + 4;
  const wellAt = ([x, y]) => slots.findIndex((s, i) => s.col && Math.hypot(x - wellX(i), y + TY - WELL_Y) < 18);
  const aim = (x, y) => { const r = Math.hypot(x, y), k = r > RM ? (RM + (r - RM) * 0.18) / r : 1; tx = x * k; ty = y * k; }; // rubber band at the rim
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d);
      const w = wellAt(q);
      if (w >= 0) { S._ensure(); slots[w].pop.kick(-5); goTo(slots[w].col); return; }
      if (!onTray(q)) return;
      S._ensure();
      drag = onBall(q) ? { ox: bx - q[0], oy: by - q[1] } : { ox: 0, oy: 0 }; // tap the floor: the ball rolls there
      aim(q[0] + drag.ox, q[1] + drag.oy);
      jelly.kick(-2); S.tick(0.4, 0.5);
    },
    move: (p, e, d) => {
      const q = local(d);
      st.canvas.style.cursor = drag ? 'grabbing' : onBall(q) ? 'grab' : onTray(q) || wellAt(q) >= 0 ? 'pointer' : 'default';
      if (drag) aim(q[0] + drag.ox, q[1] + drag.oy);
    },
    up: () => {
      if (!drag) return;
      drag = null;
      const r = Math.hypot(tx, ty); if (r > RM) { tx *= RM / r; ty *= RM / r; }
      jelly.kick(2.5); settle = 0.28; // the drop splits off once the ball has come to rest
    },
  });
  let settle = -1;
  const dim = d => { const v = clamp(val + d, 0.2, 1); if (v !== val) { val = v; S.tick(0.3 + val * 0.6, 0.5); st.pulse(0.2); lastSaved = ''; } };
  const onKey = e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const h = hue + (e.key === 'ArrowRight' ? 1 : -1) / 24; [tx, ty] = posOf(h, Math.max(sat, 0.5)); settle = 0.6; e.preventDefault(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { dim(e.key === 'ArrowUp' ? 0.1 : -0.1); settle = 0.6; e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); save(); }
  };
  const onWheel = e => { e.preventDefault(); dim(-Math.sign(e.deltaY) * 0.05); settle = 0.7; };
  if (!thumb) { window.addEventListener('keydown', onKey); st.canvas.addEventListener('wheel', onWheel, { passive: false }); }

  let demoA = (hue - 0.5) * TAU;
  st.run((dt, t) => {
    if (demo) { demoA += dt * 1.5; tx = Math.cos(demoA) * RM * 0.72; ty = Math.sin(demoA) * RM * 0.72; }

    // the ball follows its target: tight while held, a soft roll otherwise
    const k = drag ? 620 : 150, c = 2 * Math.sqrt(k) * (drag ? 0.8 : 0.7);
    bvx += (-k * (bx - tx) - c * bvx) * dt; bvy += (-k * (by - ty) - c * bvy) * dt;
    bx += bvx * dt; by += bvy * dt;
    setFrom(bx, by);
    const speed = Math.hypot(bvx, bvy);
    S.air(speed / 420);
    // a soft click for every twelfth of the wheel the ball crosses, pitched by the hue
    const sector = Math.floor(hue * 12);
    if (sector !== lastSector && sat > 0.12) { lastSector = sector; S.tick(0.25 + hue * 0.7, 0.4); st.pulse(0.12); buzz(4); }
    if (settle > 0 && !drag) { settle -= dt; if (settle <= 0 && speed < 60) save(); else if (settle <= 0) settle = 0.1; }

    const L = hsv(hue, sat, val);
    st.light = L;
    press += ((drag ? 1 : 0) - press) * Math.min(1, dt * 12);
    lift += ((st.ptrOn > 0.5 && !drag && onBall(local(st.dp)) ? 1 : 0) - lift) * Math.min(1, dt * 8);
    const j = jelly.step(dt) * 0.03 * (reducedMotion ? 0.3 : 1);
    const stretch = Math.min(speed * 0.00022, 0.12);
    const va = Math.atan2(bvy, bvx), cs = Math.abs(Math.cos(va)), sn = Math.abs(Math.sin(va));
    const th = orbit.step(dt, (val - 0.2) / 0.8);

    // the drop on its way to the palette
    if (fly) {
      const gx = wellX(fly.i), gy = WELL_Y;
      fly.vx += (-160 * (fly.x - gx) - 17 * fly.vx) * dt; fly.vy += (-160 * (fly.y - gy) - 17 * fly.vy) * dt;
      fly.x += fly.vx * dt; fly.y += fly.vy * dt;
      fly.r += (SR + 2 - fly.r) * Math.min(1, dt * 10);
      if (Math.hypot(fly.x - gx, fly.y - gy) < 1.5) land();
    }

    const word = thumb ? '' : hex(L);
    if (word !== shown) { code.set(textCells(word, 3.5), { instant: true }); shown = word; } // a counting readout: instant
    code.step(dt, { ptr: st.local(code), shy: st.ptrOn * 0.5 });
    st.drawPixels(ctx => code.draw(ctx, 0.92));

    st.render(t, (U, gl) => {
      const X = st.cx, Y = st.cy + TY;
      gl.uniform3f(U.uT, X, Y, RT);
      gl.uniform1f(U.uRM, RM);
      gl.uniform1f(U.uPitch, thumb ? 9 : 7);
      gl.uniform2f(U.uBall, X + bx, Y + by - lift * 2 + press * 2);
      gl.uniform2f(U.uBR, RB * (1 + j + stretch * cs - stretch * 0.5 * sn) * (1 - press * 0.03), RB * (1 - j + stretch * sn - stretch * 0.5 * cs) * (1 - press * 0.03));
      gl.uniform3f(U.uL, ...L);
      gl.uniform1f(U.uVal, val);
      gl.uniform1f(U.uEnergy, 0.72 + lift * 0.1 + st.kick * 0.25);
      gl.uniform1f(U.uLift, lift);
      gl.uniform1f(U.uPress, press);
      gl.uniform1f(U.uTh, th);
      gl.uniform3f(U.uWell, X + wellX(0), st.cy + WELL_Y, thumb ? 0 : GAP);
      const sw = [], sc = [];
      slots.forEach((s, i) => {
        const pj = s.pop.step(dt) * 0.03;
        sw.push(X + wellX(i), st.cy + WELL_Y, s.col ? s.r * (1 + pj) : 0);
        sc.push(...(s.col || [0, 0, 0]));
      });
      gl.uniform3fv(U.uSw, sw);
      gl.uniform3fv(U.uSwC, sc);
      gl.uniform3f(U.uFly, fly ? X + fly.x : 0, fly ? st.cy + fly.y : 0, fly ? fly.r : 0);
      gl.uniform3f(U.uFlyC, ...(fly ? fly.col : [0, 0, 0]));
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
