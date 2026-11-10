// BRIDGE — a range slider with two glass lenses and a bridge of liquid light between them.
// Seen from above, like everything here. Both lenses are one glass body (a smooth union): as they
// approach they bulge toward each other and flow into a single drop, with a plip and a wobble and
// one shared label; pull them apart and the drop tears with a pop and a few sparks. Between them
// liquid light runs along the tray, thick when they are close, thinning and flickering as they part,
// cool at the low end and warm at the high end; the scale dots inside the range light up. Each lens
// carries the toggle's filament, orbiting from the bottom at 0 to the top at 100.

import { glassStage, PixelMatrix, Spring, Orbit, textCells, hexRgb, mix3 } from '../glass/engine.js';
import { compact } from '../glass/engine.js';
import { clamp } from '../kit.js';

const TRACK_FULL = [300, 30], TRACK_ICON = [108, 30]; // tray half size (full / shelf miniature)
const R = 38;                                         // lens radius: it overhangs the tray like the toggle's knob
const COLD = hexRgb('#5b7bff'), MID = hexRgb('#b07cff'), HOT = hexRgb('#ffa630');
const ramp = v => (v < 0.5 ? mix3(COLD, MID, v * 2) : mix3(MID, HOT, (v - 0.5) * 2));

const FRAG = /* glsl */ `
uniform vec2  uTrack;          // tray half size
uniform vec2  uA, uB;          // lens centres
uniform vec2  uRA, uRB;        // lens radii (x stretched while moving)
uniform float uK;              // smooth-union strength (0 apart … large when merging)
uniform float uNeck;           // radius of the light bridge
uniform float uFlicker;
uniform vec3  uLA, uLB;        // light colour at each end
uniform float uThA, uThB;      // filament angles
uniform vec2  uRange;          // x of the low and high value on the scale
uniform float uEnergy, uLift, uPress;

float sdSeg(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a, ba = b - a;
  h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-3), 0.0, 1.0);
  return length(pa - ba * h);
}
float sdBlob(vec2 p) {
  float a = sdEllipse(p, uA, uRA), b = sdEllipse(p, uB, uRB);
  return uK > 0.01 ? smin(a, b, uK) : min(a, b);
}
vec2 blobNormal(vec2 p) {
  vec2 e = vec2(0.6, 0.0);
  vec2 n = vec2(sdBlob(p + e.xy) - sdBlob(p - e.xy), sdBlob(p + e.yx) - sdBlob(p - e.yx));
  return n / max(length(n), 1e-4);
}
float filA(vec2 p) { return filament(p, uA, sdEllipse(p, uA, uRA), uThA, 0.7); }
float filB(vec2 p) { return filament(p, uB, sdEllipse(p, uB, uRB), uThB, 0.7); }
float noise1(float x) { float i = floor(x), f = fract(x); return mix(hash12(vec2(i, 1.7)), hash12(vec2(i + 1.0, 1.7)), f * f * (3.0 - 2.0 * f)); }

// the light bridge: colour and brightness at q (flowing beads of light, flicker when thin)
vec4 bridge(vec2 q) {
  float h;
  float d = sdSeg(q, uA, uB, h) - uNeck;
  vec3 c = mix(uLA, uLB, h);
  float len = length(uB - uA);
  float flow = 0.75 + 0.25 * sin((h * len - uTime * 110.0) / 16.0);
  float fl = 1.0 - uFlicker * (0.55 * noise1(uTime * 26.0 + h * 9.0) + 0.25 * step(0.85, noise1(uTime * 9.0)));
  float core = 1.0 - smoothstep(-0.8, 0.8, d);
  float glow = exp(-max(d, 0.0) / 10.0) * 0.6 + exp(-max(d, 0.0) / 40.0) * 0.25;
  return vec4(c, (core * 1.2 + glow) * flow * fl);
}

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  vec2 hs = uTrack + vec2(18.0, 0.0);
  float sdT = sdRoundBox(q - uC, hs, hs.y);
  col = shadowed(col, sdRoundBox(q - uC - vec2(0.0, 12.0), hs, hs.y), sdRoundBox(q - uC - vec2(0.0, 1.5), hs, hs.y), 0.0);
  vec4 br = bridge(q);
  float fa = filA(q), fb = filB(q);
  col = emitC(col, br.rgb, br.a * 0.18 * uEnergy);
  col = emitC(col, uLA, filamentSpill(fa) * 0.55 * uEnergy);
  col = emitC(col, uLB, filamentSpill(fb) * 0.55 * uEnergy);
  if (sdT < 2.0) {
    vec3 tc = tray(col, sdT, sdRoundBox(q - uC - vec2(0.0, 6.0), hs, hs.y), q, uC, hs);
    // the scale: a row of dots, lit inside the chosen range
    float sx = (q.x - uC.x) / 12.0;
    float dotm = smoothstep(1.25, 0.55, length(vec2((fract(sx + 0.5) - 0.5) * 12.0, q.y - uC.y - hs.y * 0.62))) * step(abs(q.x - uC.x), uTrack.x - 4.0);
    float inR = smoothstep(uRange.x - 4.0, uRange.x + 2.0, q.x) * smoothstep(uRange.y + 4.0, uRange.y - 2.0, q.x);
    vec3 dc = mix(uLA, uLB, clamp((q.x - uRange.x) / max(uRange.y - uRange.x, 1.0), 0.0, 1.0));
    tc = mix(tc, mix(mix(vec3(0.16), vec3(0.62), uTheme), mix(dc, vec3(1.0), 0.35), inR), dotm * 0.85);
    tc = emitC(tc, dc, dotm * inR * 0.35);
    // liquid light flowing between the lenses
    tc = emitC(tc, br.rgb, br.a * uEnergy);
    tc = emitC(tc, uLA, filamentWash(fa) * 0.4 * uEnergy);
    tc = emitC(tc, uLB, filamentWash(fb) * 0.4 * uEnergy);
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdT));
  }
  // the glass body's shadow: longer when lifted, tight when pressed
  float ls = sdBlob(q - vec2(0.0, 9.0 + uLift * 6.0 - uPress * 5.0));
  col *= 1.0 - (1.0 - smoothstep(-8.0, 22.0 + uLift * 10.0, ls)) * mix(0.5, 0.18, uTheme);
  float cover;
  return ink(col, q, frost, vec2(0.0), br.a * 0.3, mix(uLA, uLB, 0.5), cover);
}

// clear glass with per-channel refraction, for any rounded body given by sdBlob
vec3 blobGlass(vec2 p, vec2 sp, float sd, vec3 light, float scatter) {
  vec2 n = blobNormal(p);
  float depth = max(-sd, 0.0);
  float Rr = min(uRA.y, uRB.y);
  float u = clamp(depth / Rr, 0.0, 1.0);
  float hgt = sqrt(max(1.0 - (1.0 - u) * (1.0 - u), 0.0));
  vec3 n3 = normalize(vec3(n.x * (1.0 - u), -n.y * (1.0 - u), hgt + 0.015));
  vec3 V = vec3(0.0, 0.0, -1.0);
  float thick = hgt * Rr * 0.95 + 6.0;
  vec3 tR = refract(V, n3, 1.0 / 1.44), tG = refract(V, n3, 1.0 / 1.5), tB = refract(V, n3, 1.0 / 1.57);
  vec2 oR = vec2(tR.x, -tR.y) / max(-tR.z, 0.3) * thick;
  vec2 oG = vec2(tG.x, -tG.y) / max(-tG.z, 0.3) * thick;
  vec2 oB = vec2(tB.x, -tB.y) / max(-tB.z, 0.3) * thick;
  float frost = 0.02 + 0.3 * pow(1.0 - u, 5.0);
  vec3 kc = vec3(scene(p + oR, sp + oR * uScale, frost).r, scene(p + oG, sp + oG * uScale, frost).g, scene(p + oB, sp + oB * uScale, frost).b);
  kc = emitC(kc, light, scatter * (0.35 + 0.65 * (1.0 - u)));
  vec3 Rv = reflect(V, n3);
  float fres = 0.03 + 0.97 * pow(1.0 - n3.z, 5.0);
  vec3 env = mix(vec3(0.07), vec3(0.5), smoothstep(-0.7, 0.9, Rv.y));
  env = mix(env, vec3(0.97), uTheme * 0.5);
  env = emitC(env, light, scatter * 0.9);
  kc = mix(kc, env, clamp(fres, 0.0, 0.75));
  kc *= 1.0 - smoothstep(0.2, 0.05, u) * smoothstep(0.0, 0.025, u) * mix(0.3, 0.12, uTheme);
  kc += smoothstep(0.035, 0.0, u) * mix(0.3, 0.4, uTheme);
  vec2 c = (uA + uB) * 0.5;
  vec2 tp = (uPtr - c) / 80.0;
  vec3 L = normalize(mix(vec3(-0.4, 0.65, 0.62), vec3(tp.x, -tp.y, 0.8), uPtrOn * 0.8));
  float s1 = max(dot(Rv, L), 0.0);
  kc += pow(s1, 240.0) * 1.8 + pow(s1, 22.0) * mix(0.08, 0.12, uTheme);
  float win = smoothstep(0.2, 0.13, abs(Rv.x + 0.3)) * smoothstep(0.15, 0.09, abs(Rv.y - 0.5)) * smoothstep(0.1, 0.4, Rv.z);
  kc += win * mix(0.22, 0.38, uTheme);
  if (uSweep < 1.2) {
    float s = dot(p - c, normalize(vec2(1.0, -0.75)));
    float pos = mix(-uTrack.x, uTrack.x, clamp(uSweep / 0.8, 0.0, 1.0));
    kc += exp(-pow((s - pos) / 10.0, 2.0)) * 0.28 * (1.0 - uSweep / 1.2) * hgt;
  }
  return kc;
}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);
  float sk = sdBlob(p);
  if (sk < 2.0) {
    // which end's light lights this part of the glass
    float w = clamp((p.x - uA.x) / max(uB.x - uA.x, 1.0), 0.0, 1.0);
    vec3 light = mix(uLA, uLB, w);
    float sc = (filamentScatter(filA(p)) + filamentScatter(filB(p))) * 0.8 * uEnergy + bridge(p).a * 0.15;
    vec3 kc = blobGlass(p, sp, sk, light, sc);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }
  col = drawFilament(col, filA(p), uLA, uEnergy * (1.0 + uKick * 0.5));
  col = drawFilament(col, filB(p), uLB, uEnergy * (1.0 + uKick * 0.5));
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const C = !thumb && compact();
  const TRACK = thumb ? TRACK_ICON : C ? [168, 30] : TRACK_FULL;
  const X0 = -TRACK[0] + 28, X1 = TRACK[0] - 28; // where 0 and 100 sit
  const toX = v => X0 + (v / 100) * (X1 - X0);
  const toV = x => ((x - X0) / (X1 - X0)) * 100;
  const st = glassStage(root, { frag: FRAG, box: [TRACK[0] * 2 + (C ? 60 : 140), TRACK[1] * 2 + 170], thumb });
  await st.ready; // the shader compiles off the main thread; show nothing half-made
  const S = st.sfx;
  // haptics only for a real control the user has touched (never in the shelf miniature)
  const buzz = pat => st.buzz(pat);

  // ---------------------------------------------------------------- state
  const V0 = thumb ? [10, 90] : [25, 70];
  const lens = [0, 1].map(i => ({
    v: V0[i], x: toX(V0[i]), vx: 0, jelly: new Spring(380, 11), orbit: new Orbit(V0[i] / 100),
    label: new PixelMatrix({ size: 3.8, swirl: 9, shyR: 14, shyF: 5 }), shown: null, lastTick: null,
  }));
  const joint = new PixelMatrix({ size: 3.2, swirl: 9, shyR: 14, shyF: 5 });
  let drag = null, press = 0, lift = 0, merged = false, jointShown = '', wasEdge = [false, false];

  const PITCH = 4.6;
  const setValue = (i, v) => {
    v = Math.round(clamp(v, 0, 100));
    const L = lens[i];
    if (v === L.v) return;
    const step5 = Math.floor(v / 5);
    if (L.lastTick !== null && step5 !== L.lastTick) { S.tick(v / 100, 0.7); L.jelly.kick(v > L.v ? -0.6 : 0.6); st.pulse(0.25); }
    L.lastTick = step5;
    L.v = v;
  };
  // keep lo ≤ hi: moving one into the other pushes it along
  const moveTo = (i, v) => {
    v = clamp(v, 0, 100);
    setValue(i, v);
    if (i === 0 && lens[0].v > lens[1].v) setValue(1, lens[0].v);
    if (i === 1 && lens[1].v < lens[0].v) setValue(0, lens[1].v);
  };

  // ---------------------------------------------------------------- input
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const nearest = x => (Math.abs(x - lens[0].x) <= Math.abs(x - lens[1].x) ? 0 : 1);
  const overTrack = ([x, y]) => Math.abs(y) < R + 10 && Math.abs(x) < TRACK[0] + 24;
  st.bindPointer({
    down: (p, e, d) => {
      const [x, y] = local(d);
      if (!overTrack([x, y])) return;
      S._ensure();
      const onA = Math.hypot(x - lens[0].x, y) < R + 6, onB = Math.hypot(x - lens[1].x, y) < R + 6;
      if (onA || onB) {
        // overlapping (merged): pick the one on the side you grabbed, so you can pull them apart
        const i = onA && onB ? (x < (lens[0].x + lens[1].x) / 2 ? 0 : 1) : onA ? 0 : 1;
        drag = { kind: 'lens', i, off: lens[i].x - x };
        lens[i].jelly.kick(-1.5);
      } else if (x > lens[0].x && x < lens[1].x && Math.abs(y) < 22) {
        drag = { kind: 'range', off: x, v0: lens[0].v, v1: lens[1].v }; // grab the bridge: move the whole range
      } else {
        const i = nearest(x); moveTo(i, toV(x)); lens[i].jelly.kick(-2);
        drag = { kind: 'lens', i, off: 0 };
      }
      press = 1;
    },
    move: (p, e, d) => {
      const [x, y] = local(d);
      const onLens = lens.some(L => Math.hypot(x - L.x, y) < R + 6);
      const onBridge = x > lens[0].x && x < lens[1].x && Math.abs(y) < 22;
      st.canvas.style.cursor = drag ? 'grabbing' : onLens || onBridge ? 'grab' : overTrack([x, y]) ? 'pointer' : 'default';
      if (!drag) return;
      if (drag.kind === 'lens') moveTo(drag.i, toV(x + drag.off));
      else {
        const dv = toV(x) - toV(drag.off);
        const span = drag.v1 - drag.v0;
        const lo = clamp(drag.v0 + dv, 0, 100 - span);
        setValue(0, lo); setValue(1, lo + span);
      }
    },
    up: () => { if (drag) { drag = null; st.glint(); st.pulse(0.5); lens.forEach(L => L.jelly.kick(1.2)); } },
  });
  const onKey = e => {
    const i = e.shiftKey ? 1 : 0;
    if (e.key === 'ArrowRight') { e.preventDefault(); moveTo(i, lens[i].v + 5); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); moveTo(i, lens[i].v - 5); }
  };
  if (!thumb) window.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- autopilot (shelf miniature)
  let demoT = 0;
  const demoPose = t => {
    const k = (t % 6) / 6;
    if (k < 0.35) return [10, 90];
    if (k < 0.65) return [46, 54];   // they meet and merge
    return [24, 76];
  };

  st.run((dt, t) => {
    if (demo) { demoT += dt; const [a, b] = demoPose(demoT); setValue(0, lens[0].v + (a - lens[0].v) * Math.min(1, dt * 3)); setValue(1, lens[1].v + (b - lens[1].v) * Math.min(1, dt * 3)); }

    // lenses spring toward their values, stretch with speed
    for (const [i, L] of lens.entries()) {
      const k = 260, c = 2 * Math.sqrt(k) * 0.7;
      const tx = toX(L.v);
      L.vx += (-k * (L.x - tx) - c * L.vx) * dt; L.x += L.vx * dt;
      // end stops: a soft impact with sparks, like Pour
      const atEdge = L.v === 0 || L.v === 100;
      if (atEdge && !wasEdge[i] && Math.abs(L.vx) > 260) {
        const s = Math.min(1, Math.abs(L.vx) / 900), side = L.v === 0 ? -1 : 1;
        L.jelly.kick(-4 * s);
        st.burst(L.x + side * R * 0.8, 0, Math.round(5 + 10 * s), 0.5 + s, side > 0 ? 0 : Math.PI, 1.0);
        S.land(0.3 + 0.4 * s); st.pulse(0.8);
      }
      wasEdge[i] = atEdge;
    }
    S.air(Math.max(Math.abs(lens[0].vx), Math.abs(lens[1].vx)) / 260);

    // merge / tear: one glass drop when they are close
    const sep = lens[1].x - lens[0].x;
    const nowMerged = sep < R * 1.75;
    if (nowMerged !== merged) {
      merged = nowMerged;
      const mid = (lens[0].x + lens[1].x) / 2;
      if (merged) { lens.forEach(L => L.jelly.kick(5)); S.drip(0.6, 0.9); st.pulse(0.9); st.burst(mid, 0, 8, 0.45); st.glint(); buzz(8); } // fusing throws a few sparks too
      else { lens.forEach(L => L.jelly.kick(-6)); S.drip(0.9, 0.7); S.tick(0.9, 1.1); st.burst(mid, 0, 10, 0.6); st.glint(); buzz([6, 20, 6]); }
    }
    // smooth-union strength grows as they approach, so they reach for each other before touching
    const kU = clamp((R * 3.0 - sep) / (R * 1.6), 0, 1) * R * 0.9;
    const neck = clamp(13 * Math.pow((R * 2.4) / Math.max(sep, 1), 0.85), 1.6, 13);
    const flicker = clamp((4.5 - neck) / 2.5, 0, 1) * (reducedMotion ? 0.2 : 1);

    // labels: each value under its lens; one shared label while merged
    const lo = lens[0].v, hi = lens[1].v;
    for (const L of lens) {
      const want = merged ? '' : String(L.v);
      if (want !== L.shown) { L.label.set(want ? textCells(want, want.length > 2 ? 3.5 : PITCH) : []); L.shown = want; }
      L.label.ox = L.x;
    }
    const jw = merged ? (lo === hi ? String(lo) : `${lo}-${hi}`) : '';
    if (jw !== jointShown) { joint.set(jw ? textCells(jw, jw.length > 3 ? 3.6 : PITCH) : []); jointShown = jw; }
    joint.ox = (lens[0].x + lens[1].x) / 2;
    for (const L of lens) L.label.step(dt, { ptr: st.local(L.label), shy: st.ptrOn * (drag ? 0 : 0.7), vel: L.vx });
    joint.step(dt, { ptr: st.local(joint), shy: st.ptrOn * (drag ? 0 : 0.7) });

    press += ((drag ? 1 : 0) - press) * Math.min(1, dt * 12);
    lift += ((st.ptrOn > 0.5 && !drag ? 1 : 0) - lift) * Math.min(1, dt * 8);
    const LA = ramp(lo / 100), LB = ramp(hi / 100);
    st.light = mix3(LA, LB, 0.5);
    const energy = 0.55 + 0.25 * (1 - Math.min(1, sep / 400)) + lift * 0.08;

    const radii = lens.map(L => {
      const j = L.jelly.step(dt) * 0.03;
      const stretch = Math.min(Math.abs(L.vx) * 0.0004, 0.16);
      const squeeze = 1 - press * 0.03;
      return [R * (1 + j + stretch) * squeeze, R * (1 - j - stretch * 0.5) * squeeze];
    });
    const thA = lens[0].orbit.step(dt, lo / 100), thB = lens[1].orbit.step(dt, hi / 100);

    st.drawPixels(ctx => { lens.forEach(L => L.label.draw(ctx)); joint.draw(ctx); });
    st.render(t, (U, gl) => {
      const X = st.cx, Y = st.cy;
      gl.uniform2f(U.uTrack, TRACK[0], TRACK[1]);
      gl.uniform2f(U.uA, X + lens[0].x, Y - lift * 2 + press * 2);
      gl.uniform2f(U.uB, X + lens[1].x, Y - lift * 2 + press * 2);
      gl.uniform2f(U.uRA, ...radii[0]);
      gl.uniform2f(U.uRB, ...radii[1]);
      gl.uniform1f(U.uK, kU);
      gl.uniform1f(U.uNeck, neck);
      gl.uniform1f(U.uFlicker, flicker);
      gl.uniform3f(U.uLA, ...LA);
      gl.uniform3f(U.uLB, ...LB);
      gl.uniform1f(U.uThA, thA);
      gl.uniform1f(U.uThB, thB);
      gl.uniform2f(U.uRange, X + toX(lo), X + toX(hi));
      gl.uniform1f(U.uEnergy, energy);
      gl.uniform1f(U.uLift, lift);
      gl.uniform1f(U.uPress, press);
    });
  });

  return { dispose() { window.removeEventListener('keydown', onKey); st.dispose(); } };
}
