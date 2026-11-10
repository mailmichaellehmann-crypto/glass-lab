// POUR — a volume slider made of a glass tube filled with liquid light, with a glass bead as handle.
// The bead rides the liquid's surface like the toggle's knob rides its track: it stretches with
// speed, squashes against the ends, lifts on hover and sinks when pressed; a light strip hugs its
// lower edge. The liquid tilts and sloshes with the acceleration and warms as it rises. The level
// reads through the bead as magnified pixels; hitting 0 or 100 lands with sparks and a shockwave.

import { glassStage, PixelMatrix, Spring, Orbit, textCells, bitmapCells, sfx, hexRgb, mix3 } from '../glass/engine.js';
import { compact } from '../glass/engine.js';
import { sdfNormal } from '../glass/lib.glsl.js';
import { clamp } from '../kit.js';

const TUBE_FULL = [290, 40], TUBE_ICON = [132, 38]; // half size, design px (full / shelf miniature)
const BEAD = 66, BEAD_R = 48; // bead half size and corner radius: it overhangs the tube, like the toggle knob

const FRAG = /* glsl */ `
uniform vec2  uTubeH;
uniform float uLevel, uTilt, uRipple, uEnergy;
uniform vec2  uK, uKH;
uniform float uKR, uLift, uPress;
uniform float uTheta;   // where the filament sits around the bead (orbits with the level)

float sdTube(vec2 p)  { return sdRoundBox(p - uC, uTubeH, uTubeH.y); }
float sdInner(vec2 p) { return sdRoundBox(p - uC, uTubeH - 8.0, uTubeH.y - 8.0); }
float surfX(float y) {
  float u = (y - uC.y) / (uTubeH.y - 8.0);
  return uLevel + uTilt * u + uRipple * sin(u * 4.0 + uTime * 11.0) * 0.5 + uRipple * 0.3 * sin(u * 9.0 - uTime * 17.0);
}
float sdLiquid(vec2 p) { return max(sdInner(p), p.x - surfX(p.y)); }
float sdBead(vec2 p) { return sdRoundBox(p - uK, uKH, uKR); }
${sdfNormal('sdTube')}
${sdfNormal('sdBead')}

// the toggle's filament, orbiting the bead: bottom when silent, top when full
float stripD(vec2 p) { return filament(p, uK, sdBead(p), uTheta, 0.9); }

vec3 liquidAt(vec2 q, vec3 floorc) {
  float ld = sdLiquid(q);
  if (ld >= 1.0) return floorc;
  float fromSurf = surfX(q.y) - q.x;
  vec3 deep = uLight * mix(0.22, 0.55, uTheme) * vec3(0.8, 0.75, 1.0);
  vec3 bright = mix(uLight, vec3(1.0), 0.08);
  vec3 liq = mix(deep, bright, exp(-fromSurf / 110.0));
  liq *= 0.88 + 0.12 * sin(q.x * 0.045 + uTime * 1.3 + sin(q.y * 0.08 + uTime) * 1.6);
  vec2 g = vec2(q.x * 0.11 - uTime * 0.6, q.y * 0.11 + uTime * 1.7);
  vec2 id = floor(g); vec2 f = fract(g) - 0.5;
  float h = hash12(id);
  liq += smoothstep(0.17, 0.08, length(f + vec2(sin(uTime * 3.0 + h * 20.0) * 0.15, 0.0))) * step(0.86, h) * 0.35 * smoothstep(-6.0, -40.0, ld);
  liq += mix(uLight, vec3(1.0), 0.7) * exp(-abs(fromSurf) / 1.8) * 0.9;
  return mix(floorc, liq, smoothstep(1.0, -1.0, ld));
}

// everything except the bead: page, tray, tube with its liquid, pixel ink
vec3 scene(vec2 p, vec2 sp, float frost, vec2 ca, out float cover) {
  vec2 hs = uTubeH + 22.0;
  float sdT = sdRoundBox(p - uC, hs, hs.y);
  vec3 col = pageBg(sp);
  col = shadowed(col, sdRoundBox(p - uC - vec2(0.0, 14.0), hs, hs.y), sdRoundBox(p - uC - vec2(0.0, 1.5), hs, hs.y), 0.0);
  float ld = max(sdLiquid(p), 0.0);
  float sd = max(stripD(p), 0.0);
  col = emit(col, (exp(-ld / 20.0) * 0.45 + exp(-ld / 90.0) * 0.3) * uEnergy * 0.55);
  col = emit(col, (exp(-sd / 18.0) * 0.5 + exp(-sd / 85.0) * 0.34) * uEnergy * 0.5);
  // the bead's shadow: longer when it lifts, tight when pressed
  float bs = sdRoundBox(p - uK - vec2(0.0, 9.0 + uLift * 7.0 - uPress * 5.0), uKH, uKR);
  float bshadow = 1.0 - smoothstep(-8.0, 22.0 + uLift * 12.0, bs);

  if (sdT < 2.0) {
    vec3 tc = tray(vec3(0.0), sdT, sdRoundBox(p - uC - vec2(0.0, 7.0), hs, hs.y), p, uC, hs);
    tc = emit(tc, exp(-ld / 16.0) * uEnergy * 0.35);
    tc = emit(tc, (exp(-sd / 14.0) * 0.85 + exp(-sd / 55.0) * 0.32) * uEnergy * 0.4);
    tc *= 1.0 - (1.0 - smoothstep(-6.0, 16.0, sdRoundBox(p - uC - vec2(0.0, 6.0), uTubeH, uTubeH.y))) * mix(0.55, 0.18, uTheme);
    float sk = sdTube(p);
    if (sk < 2.0) {
      vec2 n = sdTubeNormal(p);
      float depth = max(-sk, 0.0);
      float bevel = pow(1.0 - clamp(depth / 22.0, 0.0, 1.0), 2.4);
      vec2 rel = p - uC;
      vec2 q = p - n * bevel * 22.0 - vec2(0.0, rel.y * 0.08);
      vec2 hs2 = uTubeH + 22.0;
      float sdQ = sdRoundBox(q - uC, hs2, hs2.y);
      vec3 under = tray(vec3(0.0), sdQ, sdRoundBox(q - uC - vec2(0.0, 7.0), hs2, hs2.y), q, uC, hs2);
      under = emit(under, exp(-max(sdLiquid(q), 0.0) / 16.0) * uEnergy * 0.35);
      under = liquidAt(q, under);
      float scatter = exp(-max(sdLiquid(p), 0.0) / 26.0) * uEnergy;
      vec3 kc = glass(under, n, depth, bevel, p, uC, uTubeH, 0.0, scatter * 0.35, uLight);
      kc += exp(-pow((rel.y + uTubeH.y * 0.55) / 4.5, 2.0)) * smoothstep(uTubeH.x, uTubeH.x - 40.0, abs(rel.x)) * mix(0.2, 0.42, uTheme);
      tc = mix(kc, tc, smoothstep(-0.7, 0.7, sk));
    }
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdT));
  }
  col *= 1.0 - bshadow * mix(0.55, 0.2, uTheme);
  return ink(col, p, frost, ca, exp(-sd / 30.0) * uEnergy * 0.5, uLight, cover);
}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  float cover;
  vec3 col = scene(p, sp, 0.0, vec2(0.0), cover);

  float sk = sdBead(p);
  if (sk < 2.0) {
    vec2 n = sdBeadNormal(p);
    float depth = max(-sk, 0.0);
    float bevel = pow(1.0 - clamp(depth / 28.0, 0.0, 1.0), 2.6);
    vec2 rel = p - uK;
    vec2 bend = -n * bevel * 36.0 - rel * 0.1;
    float frost = 0.06 + 0.72 * bevel;
    vec3 g = scene(p + bend, sp + bend * uScale, frost, n * bevel * 3.2 + rel * 0.006, cover);
    float sq = max(stripD(p), 0.0);
    float scatter = ((exp(-sq / 24.0) * 0.8 + exp(-sq / 64.0) * 0.2) + exp(-max(sdLiquid(p), 0.0) / 30.0) * 0.5) * uEnergy;
    vec3 kc = glass(g, n, depth, bevel, p, uK, uKH, cover, scatter, uLight);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }
  col = drawFilament(col, stripD(p), uLight, max(uEnergy, 0.35) * (1.0 + uKick * 0.5));
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

const SPEAKER = {
  mute: ['....#......', '...##......', '####..#...#', '####...#.#.', '####....#..', '####...#.#.', '####..#...#', '...##......', '....#......'],
  low: ['....#......', '...##......', '####..#....', '####...#...', '####...#...', '####...#...', '####..#....', '...##......', '....#......'],
  loud: ['....#......', '...##...#..', '####..#..#.', '####...#..#', '####...#..#', '####...#..#', '####..#..#.', '...##...#..', '....#......'],
};
const COLD = hexRgb('#5b7bff'), MID = hexRgb('#b07cff'), HOT = hexRgb('#ffa630');

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const C = !thumb && compact();
  const TUBE = thumb ? TUBE_ICON : C ? [138, 40] : TUBE_FULL;
  const st = glassStage(root, { frag: FRAG, box: [TUBE[0] * 2 + (C ? 150 : 260), TUBE[1] * 2 + 140], thumb });
  await st.ready; // the shader compiles off the main thread; show nothing half-made
  const x0 = () => st.cx - TUBE[0] + 8, x1 = () => st.cx + TUBE[0] - 8;
  const beadMin = () => st.cx - TUBE[0] + BEAD - 6, beadMax = () => st.cx + TUBE[0] - BEAD + 6;

  let level = 0.62, target = 0.62, vel = 0, tilt = 0, tiltV = 0, ripple = 0, press = 0, lift = 0, dragging = false;
  let shownPct = -1, shownIcon = '', lastDecile = Math.floor(level * 10), wasEdge = false, prevBead = null;
  const jelly = new Spring(380, 11);
  const orbit = new Orbit(level);
  const digits = new PixelMatrix({ size: 4.0, swirl: 8, shyR: 18, shyF: 7 });
  const speaker = new PixelMatrix({ size: 3.8, swirl: 6, shyR: 16, shyF: 6 });
  speaker.ox = thumb ? -9999 : -TUBE[0] - 22 - (C ? 32 : 52);

  const toLevel = x => (x - x0()) / (x1() - x0());
  const overTube = ([x, y]) => Math.abs(x - st.cx) < TUBE[0] + 22 && Math.abs(y - st.cy) < TUBE[1] + 30;
  st.bindPointer({
    down: (p, e, d) => { if (!overTube(d)) return; dragging = true; target = toLevel(d[0]); st.sfx._ensure(); jelly.kick(-1.2); },
    move: (p, e, d) => {
      if (dragging) target = toLevel(d[0]); // may overshoot 0..1: the bead squashes against the end
      st.canvas.style.cursor = dragging ? 'grabbing' : overTube(d) ? 'grab' : 'default';
    },
    up: () => { if (dragging) { dragging = false; target = clamp(target, 0, 1); jelly.kick(1.4); st.glint(); st.pulse(0.6); } },
  });
  const onWheel = e => { e.preventDefault(); target = clamp(target - e.deltaY * 0.0011, 0, 1); };
  const onKey = e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') target = clamp(target + 0.1, 0, 1);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') target = clamp(target - 0.1, 0, 1);
    if (e.key === 'm' || e.key === 'M') target = target > 0 ? 0 : 0.5;
  };
  st.canvas.addEventListener('wheel', onWheel, { passive: false });
  if (!thumb) window.addEventListener('keydown', onKey);

  st.run((dt, t) => {
    if (demo) target = 0.5 + 0.34 * Math.sin(t * 1.3) + 0.08 * Math.sin(t * 3.1); // autopilot: pours up and down
    // pour toward the target (rubber band past the ends while dragging)
    const tgt = dragging ? (target < 0 ? target * 0.15 : target > 1 ? 1 + (target - 1) * 0.15 : target) : target;
    const k = 80, c = 2 * Math.sqrt(k) * 0.7;
    const acc = -k * (level - tgt) - c * vel;
    vel += acc * dt; level += vel * dt;
    const lv = clamp(level, 0, 1);
    const span = x1() - x0();
    tiltV += (-120 * tilt - 7 * tiltV - acc * span * 0.0045 * (reducedMotion ? 0.3 : 1)) * dt;
    tilt = clamp(tilt + tiltV * dt, -30, 30);
    ripple = Math.max(ripple * Math.exp(-dt * 2.2), Math.min(6, Math.abs(vel) * 6));
    press += ((dragging ? 1 : 0) - press) * Math.min(1, dt * 12);
    lift += ((st.ptrOn > 0.5 && !dragging ? 1 : 0) - lift) * Math.min(1, dt * 8);

    // landing on an end: impact
    const atEdge = level <= 0.002 || level >= 0.998;
    if (atEdge && !wasEdge && Math.abs(vel) > 0.6) {
      const s = Math.min(1, Math.abs(vel) / 3);
      const side = level < 0.5 ? -1 : 1;
      jelly.kick(-4 * s);
      st.burst(side * (TUBE[0] - 10), 0, Math.round(6 + 12 * s), 0.5 + s, side > 0 ? 0 : Math.PI, 1.0);
      if (s > 0.35) st.shock(side * (TUBE[0] - 30), 0);
      st.glint();
      st.sfx.land(0.3 + 0.5 * s); st.pulse(1);
      st.buzz(12);
    }
    wasEdge = atEdge;

    const decile = Math.floor(lv * 10 + 0.001);
    if (decile !== lastDecile) { st.sfx.tick(lv, 0.9); lastDecile = decile; jelly.kick(-0.5); st.pulse(0.35); }
    const pct = Math.round(lv * 100);
    if (pct !== shownPct) { digits.set(textCells(String(pct), 5.0)); shownPct = pct; }
    const icon = pct === 0 ? 'mute' : pct < 50 ? 'low' : 'loud';
    if (icon !== shownIcon) { speaker.set(bitmapCells(SPEAKER[icon], 4.4)); shownIcon = icon; }

    // bead: rides the surface, stretches with speed, squashes on overshoot and impacts
    const surf = x0() - 3 + lv * (span + 3);
    const bx = clamp(surf, beadMin(), beadMax());
    const bv = prevBead == null ? 0 : (bx - prevBead) / dt; prevBead = bx;
    const over = Math.max(0, -level, level - 1) * span;
    const stretch = Math.min(Math.abs(bv) * 0.012, 14);
    const j = jelly.step(dt) * 0.06;
    const squeeze = 1 - press * 0.035;
    const khx = (BEAD + stretch - over * 0.7) * (1 + j) * squeeze;
    const khy = Math.min(BEAD - stretch * 0.45 + over * 0.25, BEAD + 6) * (1 - j) * squeeze;
    const kx = bx + (level < 0 ? -over * 0.6 : level > 1 ? over * 0.6 : 0);
    digits.ox = kx - st.cx;
    digits.step(dt, { ptr: st.local(digits), shy: st.ptrOn, vel: bv });
    speaker.step(dt, { ptr: st.local(speaker), shy: st.ptrOn });
    st.sfx.air(Math.abs(bv) / 220);
    const theta = orbit.step(dt, lv);

    st.light = lv < 0.5 ? mix3(COLD, MID, lv * 2) : mix3(MID, HOT, (lv - 0.5) * 2);
    const energy = (pct === 0 ? 0.1 : 0.32 + lv * 0.5) * (1 + press * 0.15 + lift * 0.08 + st.kick * 0.14 + Math.min(Math.abs(bv) * 0.0004, 0.18));

    st.drawPixels(ctx => { digits.draw(ctx); speaker.draw(ctx, pct === 0 ? 0.5 : 0.85); });
    st.render(t, U => {
      const gl = st.gl;
      gl.uniform2f(U.uTubeH, TUBE[0], TUBE[1]);
      gl.uniform1f(U.uLevel, surf);
      gl.uniform1f(U.uTilt, tilt);
      gl.uniform1f(U.uRipple, ripple);
      gl.uniform1f(U.uEnergy, energy);
      gl.uniform2f(U.uK, kx, st.cy);
      gl.uniform2f(U.uKH, khx, khy);
      gl.uniform1f(U.uKR, Math.min(BEAD_R, khx - 1, khy - 1));
      gl.uniform1f(U.uLift, lift * (1 - press));
      gl.uniform1f(U.uPress, press);
      gl.uniform1f(U.uTheta, theta);
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
