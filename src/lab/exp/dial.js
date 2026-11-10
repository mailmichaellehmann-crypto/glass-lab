// DIAL — a glass thermostat with weight and detents.
// A ring of 41 LED segments (10–30 °C in half degrees) sweeps from frost blue to ember orange.
// The knob is a hemisphere of glass: each pixel refracts through the dome onto the tray floor
// separately for red, green and blue (IOR 1.38 / 1.50 / 1.68), so the printed dot grid and the
// pixel temperature magnify, warp toward the rim and split into colour fringes. Its rim mirrors
// the glowing ring (Fresnel), a dark band of total internal reflection sits just inside the edge,
// and the dome throws a caustic into its own shadow. It clicks through detents, rubber-bands at
// the ends and keeps spinning when flicked.

import { glassStage, PixelMatrix, Spring, textCells, sfx, hexRgb, mix3 } from '../glass/engine.js';
import { clamp } from '../kit.js';

const N = 41, START = Math.PI * 0.75, SWEEP = Math.PI * 1.5;
const R_KNOB = 112, R_LED = 150, R_TRAY = 178;
const COLD = hexRgb('#4f8dff'), MID = hexRgb('#fff1d6'), HOT = hexRgb('#ff5a1f');
const colorAt = t => (t < 0.5 ? mix3(COLD, MID, t * 2) : mix3(MID, HOT, (t - 0.5) * 2));

const FRAG = /* glsl */ `
uniform float uVal;      // 0..1 (continuous, for the lit head)
uniform float uRot;      // knob rotation, rad
uniform float uPress;
uniform float uLift;
uniform float uRK;      // knob radius (pulses with detents, shrinks when pressed)
uniform vec2  uKOff;    // knob offset (bounces)
uniform float uSpin;    // 0..1 how fast it is turning
uniform vec3  uCold, uMid, uHot;

const float N = ${N}.0, START = ${START.toFixed(6)}, SWEEP = ${SWEEP.toFixed(6)};
const float RK = ${R_KNOB}.0, RL = ${R_LED}.0, RT = ${R_TRAY}.0;

vec3 ramp(float t) { return t < 0.5 ? mix(uCold, uMid, t * 2.0) : mix(uMid, uHot, (t - 0.5) * 2.0); }
float arcT(vec2 q) { float a = atan(q.y, q.x) - START; a = mod(a + 12.566370, 6.2831853); return a / SWEEP; }

// nearest LED segment: (sdf, index t, lit amount)
vec3 led(vec2 q) {
  float t = arcT(q);
  if (t > 1.0) t = (t - 1.0) * SWEEP < (6.2831853 - SWEEP) * 0.5 ? 1.0 : 0.0; // the gap at the bottom
  float i = clamp(floor(t * (N - 1.0) + 0.5), 0.0, N - 1.0);
  float ai = START + i / (N - 1.0) * SWEEP;
  vec2 dir = vec2(cos(ai), sin(ai));
  vec2 loc = vec2(dot(q, dir) - RL, dot(q, vec2(-dir.y, dir.x)));
  float sd = sdRoundBox(loc, vec2(8.0, 2.1), 2.0);
  float head = uVal * (N - 1.0);
  float lit = clamp(head - i + 1.0, 0.0, 1.0);
  return vec3(sd, i / (N - 1.0), lit);
}
// distance to the lit part of the ring (for glow), and the colour there: the true nearest point,
// either the projection onto the arc or one of its two ends
float litArc(vec2 q, out vec3 c) {
  float a0 = START, a1 = START + uVal * SWEEP;
  float d0 = length(q - RL * vec2(cos(a0), sin(a0)));
  float d1 = length(q - RL * vec2(cos(a1), sin(a1)));
  float t = arcT(q);
  float dp = 1e5, tp = 0.0;
  if (t <= uVal) { float a = START + t * SWEEP; dp = length(q - RL * vec2(cos(a), sin(a))); tp = t; }
  float best = min(dp, min(d0, d1));
  // blend the candidates' colours softly so no seam appears where the nearest one switches
  float w0 = exp(-(d0 - best) / 40.0), w1 = exp(-(d1 - best) / 40.0), wp = exp(-(dp - best) / 40.0);
  c = (ramp(0.0) * w0 + ramp(uVal) * w1 + ramp(tp) * wp) / (w0 + w1 + wp);
  return best;
}

// the toggle's filament, hugging the knob at the angle it points to
float filD(vec2 p) { vec2 qk = p - uC - uKOff; return filament(p, uC + uKOff, length(qk) - uRK, uRot, 0.42); }

vec3 trayAt(vec2 p, vec2 sp, out float cover, float frost, vec2 ca) {
  vec2 q = p - uC;
  float sdT = length(q) - RT;
  vec3 page = pageBg(sp);
  vec3 col = tray(page, sdT, length(q - vec2(0.0, 7.0)) - RT, p, uC, vec2(RT));
  // a fine polar dot grid printed on the floor: the glass dome magnifies, warps and splits it
  float rr = length(q);
  if (rr < RL - 20.0 && rr > 4.0) {
    float ring = rr / 8.0, ri = floor(ring + 0.5);
    float circ = 6.2831853 * ri * 8.0;
    float nAng = max(floor(circ / 8.0), 1.0);
    float ang = atan(q.y, q.x) / 6.2831853 * nAng;
    vec2 cell = vec2((ring - ri) * 8.0, (fract(ang + 0.5) - 0.5) * circ / nAng);
    float dotm = smoothstep(1.2 + frost * 2.2, 0.5 - frost * 0.4, length(cell)) * (1.0 - frost * 0.45) * smoothstep(RL - 20.0, RL - 50.0, rr);
    col = mix(col, mix(vec3(0.34, 0.35, 0.4), vec3(0.55), uTheme), dotm * 0.85);
  }
  vec3 lc; float d = litArc(q, lc);
  float glow = (exp(-d / 16.0) * 0.6 + exp(-d / 60.0) * 0.3) * (1.0 + uSpin * 0.8 + uKick * 0.5);
  col = emitC(col, lc, glow * step(0.001, uVal + 0.001) * 0.7);
  col = emitC(col, ramp(uVal), filamentWash(filD(p)) * 0.5 * (1.0 + uKick * 0.4));
  vec3 s = led(q);
  vec3 segc = ramp(s.y);
  vec3 off = mix(vec3(0.09), vec3(0.78), uTheme);
  vec3 on = mix(segc * 1.1, mix(segc, vec3(1.0), 0.55), 0.35);
  float m = 1.0 - smoothstep(-0.6, 0.6, s.x);
  col = mix(col, mix(off, on, s.z), m);
  return ink(col, p, frost, ca, glow * 0.4, lc, cover);
}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec2 q = p - uC;
  vec3 col = pageBg(sp);
  float sdT = length(q) - RT;
  col = shadowed(col, length(q - vec2(0.0, 14.0)) - RT, length(q - vec2(0.0, 1.5)) - RT, 0.0);
  vec3 lc; float d = litArc(q, lc);
  col = emitC(col, lc, (exp(-d / 30.0) * 0.4 + exp(-d / 120.0) * 0.25) * 0.6 * (1.0 + uSpin));
  col = emitC(col, ramp(uVal), filamentSpill(filD(p)) * 0.6);

  float cover;
  if (sdT < 2.0) {
    vec3 tc = trayAt(p, sp, cover, 0.0, vec2(0.0));
    // knob shadow inside the tray
    float ks = length(q - uKOff - vec2(0.0, 10.0 + uLift * 9.0 - uPress * 7.0)) - uRK;
    tc *= 1.0 - (1.0 - smoothstep(-10.0, 26.0 + uLift * 10.0, ks)) * mix(0.6, 0.2, uTheme);
    // caustic: the dome focuses the key light into a bright, colour-fringed spot in its shadow
    vec2 cc = q - uKOff - vec2(14.0, 0.3 * uRK + 12.0);
    float cr = length(cc * vec2(1.0, 1.4));
    tc += vec3(1.0, 0.92, 0.8) * exp(-cr / 26.0) * 0.12 * (1.0 - uTheme * 0.5);
    tc = emitC(tc, ramp(uVal), exp(-cr / 40.0) * 0.18);
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdT));
  }

  vec2 qk = q - uKOff;
  float sk = length(qk) - uRK;
  if (sk < 2.0) {
    // ---- a hemisphere of glass. Every pixel is a ray from above hitting the dome.
    float x = clamp(length(qk) / uRK, 0.0, 1.0);
    float hgt = sqrt(max(1.0 - x * x, 0.0));                 // dome height (0 at the rim, 1 on top)
    vec3 n3 = normalize(vec3(qk.x / uRK, -qk.y / uRK, hgt + 0.02)); // y up in 3D
    vec3 V = vec3(0.0, 0.0, -1.0);
    // refraction toward the tray floor, separately per channel: strong chromatic aberration
    float thick = hgt * uRK * 1.05 + 16.0;
    vec3 tR = refract(V, n3, 1.0 / 1.38);
    vec3 tG = refract(V, n3, 1.0 / 1.50);
    vec3 tB = refract(V, n3, 1.0 / 1.68);
    vec2 oR = vec2(tR.x, -tR.y) / max(-tR.z, 0.25) * thick;
    vec2 oG = vec2(tG.x, -tG.y) / max(-tG.z, 0.25) * thick;
    vec2 oB = vec2(tB.x, -tB.y) / max(-tB.z, 0.25) * thick;
    float frost = 0.2 + 0.4 * pow(x, 4.0); // slightly milky glass: everything behind it softens a little
    float cR, cG, cB;
    vec3 gR = trayAt(p + oR, sp + oR * uScale, cR, frost, vec2(0.0));
    vec3 gG = trayAt(p + oG, sp + oG * uScale, cG, frost, vec2(0.0));
    vec3 gB = trayAt(p + oB, sp + oB * uScale, cB, frost, vec2(0.0));
    vec3 g = vec3(gR.r, gG.g, gB.b);
    cover = cG;
    // absorption: thicker glass in the middle is a touch deeper in tone
    vec3 kc = g * mix(vec3(0.94, 0.97, 1.0), vec3(1.0), x) * mix(0.9, 1.0, uTheme);
    kc += mix(vec3(0.03, 0.035, 0.045), vec3(0.06), uTheme) * hgt;
    // milk: a faint opal haze, densest where the glass is thickest, that also catches the ring's light
    vec3 milk = mix(vec3(0.5, 0.52, 0.57), vec3(0.97, 0.97, 0.98), uTheme);
    kc = mix(kc, milk, 0.08 + 0.07 * hgt);
    kc = emitC(kc, ramp(uVal), 0.06 * hgt);

    // light from the LED ring and filament scattering inside the glass
    vec3 lc2; float d2 = litArc(q, lc2);
    kc = emitC(kc, lc2, (exp(-max(d2, 0.0) / 50.0) * 0.35 + 0.08) * (1.0 + uSpin + uKick * 0.4) * (0.4 + 0.6 * x));
    kc = emitC(kc, ramp(uVal), filamentScatter(filD(p)) * 0.8 * (1.0 + uKick * 0.4));

    // Fresnel reflection: the rim mirrors the room and the glowing ring around it
    vec3 R = reflect(V, n3);
    float fres = 0.05 + 0.95 * pow(1.0 - n3.z, 4.0);
    vec3 env = mix(vec3(0.02), vec3(0.16), smoothstep(-0.6, 0.8, R.y));
    env = mix(env, vec3(0.9), uTheme * 0.6);
    // the LED ring as seen in the dome's rim
    vec2 rdir = normalize(vec2(R.x, -R.y) + 1e-4);
    vec3 rc; float rd = litArc(rdir * RL, rc);
    env += rc * (exp(-rd / 45.0) * 2.6 + exp(-rd / 120.0) * 0.6) * smoothstep(0.3, 0.92, x);
    kc = mix(kc, env, clamp(fres, 0.0, 1.0));
    // a thin dark band just inside the rim (total internal reflection), then the bright edge
    kc *= 1.0 - smoothstep(0.8, 0.95, x) * smoothstep(1.0, 0.97, x) * mix(0.55, 0.25, uTheme);
    kc += smoothstep(0.965, 0.995, x) * smoothstep(1.01, 0.99, x) * mix(0.35, 0.45, uTheme);

    // the key light (follows the pointer when it is near) as a soft and a sharp highlight
    vec2 toPtr = (uPtr - (uC + uKOff)) / uRK;
    vec3 L = normalize(mix(vec3(-0.45, 0.6, 0.66), vec3(toPtr.x * 0.8, -toPtr.y * 0.8, 0.7), uPtrOn * 0.8));
    float sp1 = max(dot(R, L), 0.0);
    kc += pow(sp1, 260.0) * 2.2 + pow(sp1, 24.0) * mix(0.12, 0.18, uTheme);
    // a curved softbox window reflected across the upper dome
    float wx = R.x + 0.28, wy = R.y - 0.52;
    float win = smoothstep(0.2, 0.14, abs(wx)) * smoothstep(0.17, 0.1, abs(wy)) * smoothstep(0.1, 0.4, R.z);
    kc += win * mix(0.32, 0.5, uTheme);
    // light gathered inside the dome: a bright crescent on the side away from the light
    vec2 away = -normalize(L.xy + 1e-4);
    float cres = smoothstep(0.55, 0.85, x) * smoothstep(1.0, 0.86, x) * max(dot(normalize(vec2(qk.x, -qk.y) + 1e-4), away), 0.0);
    kc = emitC(kc, mix(vec3(1.0), ramp(uVal), 0.5), cres * 0.35);
    // a faint secondary highlight on the opposite side, where light leaves the glass
    vec3 L2 = normalize(vec3(-L.x, -L.y, 0.35));
    kc += pow(max(dot(R, L2), 0.0), 60.0) * 0.18;

    // the glass sweep after an interaction
    if (uSweep < 1.2) {
      float s = dot(qk, normalize(vec2(1.0, -0.75)));
      float pos = mix(-uRK - 60.0, uRK + 60.0, clamp(uSweep / 0.8, 0.0, 1.0));
      kc += exp(-pow((s - pos) / 12.0, 2.0)) * 0.3 * (1.0 - uSweep / 1.2) * hgt;
    }

    // the indicator: a glowing bead set into the glass, refracted like everything else
    vec2 wc = 0.72 * uRK * vec2(cos(uRot), sin(uRot));
    float wd = length(qk - wc) - 7.0;
    vec3 cur = ramp(uVal);
    kc = mix(kc, mix(cur, vec3(1.0), 0.45) * 1.1, (1.0 - smoothstep(-0.8, 0.8, wd)) * 0.9);
    kc = emitC(kc, cur, exp(-max(wd, 0.0) / 7.0) * 0.7);

    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }
  col = drawFilament(col, filD(p), ramp(uVal), 1.0 + uKick * 0.5 + uSpin * 0.3);
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const st = glassStage(root, { frag: FRAG, box: [R_TRAY * 2 + 80, R_TRAY * 2 + 80], thumb });
  await st.ready; // the shader compiles off the main thread; show nothing half-made
  const digits = new PixelMatrix({ size: 4.4, swirl: 9, shyR: 22, shyF: 9 });
  digits.oy = 4;

  let pos = 22; // in steps (0..40), continuous
  let vel = 0, dragging = false, lastAng = 0, press = 0, lift = 0, shown = -1, stepShown = Math.round(pos);
  let spin = 0, wasSpinning = false, lastStepT = 0;
  const pulse = new Spring(520, 16);   // radius bump per detent
  const bounce = new Spring(260, 10);  // vertical recoil at the end stops
  const sway = new Spring(260, 10);    // sideways recoil at the end stops
  const center = () => [st.cx, st.cy];
  const angleOf = ([x, y]) => Math.atan2(y - st.cy, x - st.cx);
  const STEP_ANG = SWEEP / (N - 1);

  st.bindPointer({
    down: (p, e, d) => {
      const r = Math.hypot(d[0] - st.cx, d[1] - st.cy);
      if (r > R_TRAY + 30) return;
      dragging = true; lastAng = angleOf(d); vel = 0; st.sfx._ensure(); pulse.kick(-40);
    },
    move: (p, e, d) => {
      const r = Math.hypot(d[0] - st.cx, d[1] - st.cy);
      st.canvas.style.cursor = dragging ? 'grabbing' : r < R_TRAY + 30 ? 'grab' : 'default';
      if (!dragging) return;
      const a = angleOf(d);
      let da = Math.atan2(Math.sin(a - lastAng), Math.cos(a - lastAng));
      lastAng = a;
      // rubber band past the ends
      const over = pos < 0 ? -pos : pos > N - 1 ? pos - (N - 1) : 0;
      const ds = da / STEP_ANG / (1 + over * 0.8);
      pos += ds;
      const now = performance.now();
      vel = vel * 0.6 + (ds / Math.max(0.008, (now - (st.lastMove || now)) / 1000)) * 0.4;
      st.lastMove = now;
    },
    up: () => { dragging = false; pulse.kick(-30); st.glint(); },
  });
  const onWheel = e => { e.preventDefault(); vel = 0; pos = clamp(Math.round(pos) + (e.deltaY > 0 ? -1 : 1), 0, N - 1); };
  const onKey = e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') pos = clamp(Math.round(pos) + 1, 0, N - 1);
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') pos = clamp(Math.round(pos) - 1, 0, N - 1);
  };
  st.canvas.addEventListener('wheel', onWheel, { passive: false });
  if (!thumb) window.addEventListener('keydown', onKey);

  st.run((dt, t) => {
    if (demo) { // autopilot: a hand sweeps the dial back and forth
      const want = 20 + 15 * Math.sin(t * 0.9);
      vel = (want - pos) / Math.max(dt, 1e-3); pos = want;
    }
    if (!dragging && !demo) {
      // momentum, detent torque pulling toward the nearest step, and walls at both ends
      const nearest = Math.round(pos);
      const detent = -Math.sin((pos - nearest) * Math.PI * 2) * 38;
      vel += detent * dt;
      vel = clamp(vel, -45, 45);
      vel *= Math.exp(-dt * (Math.abs(vel) > 2 ? 2.2 : 7));
      // the ends are soft walls that swallow momentum instead of bouncing it back
      if (pos < 0) { vel += -pos * 160 * dt; vel *= Math.exp(-dt * 14); }
      else if (pos > N - 1) { vel -= (pos - (N - 1)) * 160 * dt; vel *= Math.exp(-dt * 14); }
      pos += vel * dt;
      if (Math.abs(vel) < 0.05 && Math.abs(pos - nearest) < 0.02) { pos = nearest; vel = 0; }
    } else {
      st.lastMove = st.lastMove || performance.now();
      if (performance.now() - st.lastMove > 60) vel *= Math.exp(-dt * 12);
    }
    const stepNow = clamp(Math.round(pos), 0, N - 1);
    if (stepNow !== stepShown) {
      const atEnd = stepNow === 0 || stepNow === N - 1;
      st.sfx.tick(stepNow / (N - 1), atEnd ? 1.4 : 0.8);
      st.buzz(atEnd ? 14 : 4);
      pulse.kick(stepNow > stepShown ? 26 : -26);
      st.pulse(atEnd ? 1 : 0.3);
      if (atEnd) {
        // slam into the stop: the knob recoils, the LED end throws sparks, a ring rolls out
        st.sfx.land(0.5);
        const s = Math.min(1, Math.abs(vel) / 25 + 0.3);
        const a = START + (stepNow === 0 ? 0 : SWEEP);
        const ex = Math.cos(a) * R_LED, ey = Math.sin(a) * R_LED;
        st.burst(ex, ey, Math.round(6 + 14 * s), 0.6 + s, Math.atan2(ey, ex), 0.9);
        if (s > 0.5) st.shock(ex * 0.5, ey * 0.5);
        bounce.kick(-Math.sin(a) * 300 * s); sway.kick(-Math.cos(a) * 300 * s);
        st.glint();
      }
      stepShown = stepNow;
    }
    const temp = 10 + stepNow * 0.5;
    if (temp !== shown) { digits.set(textCells(temp.toFixed(1) + '°', 5.2)); shown = temp; }
    digits.step(dt, { ptr: st.local(digits), shy: st.ptrOn * (dragging ? 0 : 1) });
    st.sfx.air(Math.abs(vel) / 7);
    press += ((dragging ? 1 : 0) - press) * Math.min(1, dt * 12);
    lift += ((st.ptrOn > 0.5 && !dragging ? 1 : 0) - lift) * Math.min(1, dt * 8);

    const val = clamp(pos / (N - 1), 0, 1);
    st.light = colorAt(val);
    const rot = START + clamp(pos, -1.5, N + 0.5) / (N - 1) * SWEEP;
    spin += (Math.min(1, Math.abs(vel) / 18) - spin) * Math.min(1, dt * 8);
    const spinning = spin > 0.25;
    if (wasSpinning && !spinning && !dragging) st.glint(); // it comes to rest: a glint sweeps over
    wasSpinning = spinning;
    const rk = R_KNOB * (1 + pulse.step(dt) * 0.02) * (1 - press * 0.03 + lift * 0.01);
    const off = [sway.step(dt) * 0.45, bounce.step(dt) * 0.45 + press * 2];

    st.drawPixels(ctx => digits.draw(ctx));
    st.render(t, U => {
      const gl = st.gl;
      gl.uniform1f(U.uVal, val);
      gl.uniform1f(U.uRot, rot);
      gl.uniform1f(U.uPress, press);
      gl.uniform1f(U.uLift, lift);
      gl.uniform1f(U.uRK, rk);
      gl.uniform2f(U.uKOff, off[0], off[1]);
      gl.uniform1f(U.uSpin, spin);
      gl.uniform3f(U.uCold, ...COLD); gl.uniform3f(U.uMid, ...MID); gl.uniform3f(U.uHot, ...HOT);
    });
  });

  return {
    dispose() {
      st.canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      st.dispose();
    },
  };
}
