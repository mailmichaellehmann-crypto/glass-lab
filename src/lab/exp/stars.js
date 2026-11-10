// STARS — a five-star rating made of glass stars, seen from above.
// Each star is a thick, rounded glass body with per-channel refraction. Hovering pours light into the
// row like a level running from star to star: the light front sweeps through each body, so a star is
// briefly half full. The colour heats up with the rating, from ember orange at one star to white gold
// at five. Lit stars spill light into the tray and sparkle with soft diffraction spikes. Committing
// kicks the lit stars one after another; five stars sets off a chain reaction with a chord, sparks
// and a shockwave. The rating word sits in pixels underneath.

import { glassStage, PixelMatrix, Spring, textCells, hexRgb, mix3 } from '../glass/engine.js';
import { compact } from '../glass/engine.js';
import { clamp } from '../kit.js';

const R = 27;                     // star outer radius
const WORDS = ['RATE IT', 'MEH', 'OKAY', 'GOOD', 'GREAT', 'WOW'];
const HEAT = ['#ff5a36', '#ff7b2e', '#ff9f2a', '#ffc23a', '#ffe08a'].map(hexRgb);
const heat = f => { // f: 0..1 along the rating
  const x = clamp(f, 0, 1) * (HEAT.length - 1), i = Math.min(HEAT.length - 2, Math.floor(x));
  return mix3(HEAT[i], HEAT[i + 1], x - i);
};

const FRAG = /* glsl */ `
#define N 5
uniform int   uN;
uniform vec2  uTray;           // tray half size
uniform vec4  uStar[N];        // centre xy, scale, rotation
uniform float uFill[N];        // 0..1 light in each star
uniform float uFront;          // where the light front is, in design x (relative to tray centre)
uniform vec3  uHot;            // light colour (depends on the rating)
uniform float uFlash[N];       // per-star flash (commit / celebration)
uniform float uEnergy, uLift, uPress;

float sdStar5(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}
// one rounded glass star (design space is y-down, so flip to keep a point up)
float sdStarI(vec2 p, int i) {
  vec4 s = uStar[i];
  vec2 q = (p - s.xy) / s.z;
  float c = cos(s.w), sn = sin(s.w);
  q = mat2(c, -sn, sn, c) * q;
  return (sdStar5(vec2(q.x, -q.y), ${R - 4}.0, 0.5) - 4.0) * s.z;
}
float sdStars(vec2 p, out int idx) {
  float d = 1e5; idx = 0;
  for (int i = 0; i < N; i++) { if (i >= uN) break; float e = sdStarI(p, i); if (e < d) { d = e; idx = i; } }
  return d;
}
vec2 starNormal(vec2 p, int i) {
  vec2 e = vec2(0.5, 0.0);
  vec2 n = vec2(sdStarI(p + e.xy, i) - sdStarI(p - e.xy, i), sdStarI(p + e.yx, i) - sdStarI(p - e.yx, i));
  return n / max(length(n), 1e-4);
}

// light spilled by the lit stars onto whatever is below
float spill(vec2 q) {
  float a = 0.0;
  for (int i = 0; i < N; i++) {
    if (i >= uN) break;
    float d = max(sdStarI(q, i), 0.0);
    float f = uFill[i] + uFlash[i] * 0.8;
    a += f * (exp(-d / 9.0) * 0.55 + exp(-d / 34.0) * 0.32);
  }
  return a;
}

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  vec2 hs = uTray;
  float sdT = sdRoundBox(q - uC, hs, hs.y);
  col = shadowed(col, sdRoundBox(q - uC - vec2(0.0, 12.0), hs, hs.y), sdRoundBox(q - uC - vec2(0.0, 1.5), hs, hs.y), 0.0);
  float sl = spill(q);
  col = emitC(col, uHot, sl * 0.22 * uEnergy);
  if (sdT < 2.0) {
    vec3 tc = tray(col, sdT, sdRoundBox(q - uC - vec2(0.0, 6.0), hs, hs.y), q, uC, hs);
    tc = emitC(tc, uHot, sl * 0.75 * uEnergy);
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdT));
  }
  // the glass stars' shadows: longer when lifted, tight when pressed
  int k;
  float ls = sdStars(q - vec2(0.0, 7.0 + uLift * 5.0 - uPress * 4.0), k);
  col *= 1.0 - (1.0 - smoothstep(-6.0, 16.0 + uLift * 8.0, ls)) * mix(0.55, 0.2, uTheme);
  float cover;
  return ink(col, q, frost, vec2(0.0), sl * 0.25, uHot, cover);
}

// star-local frame (y up, unscaled) and back
vec2 starLocal(vec2 p, int i) {
  vec4 s = uStar[i];
  vec2 q = (p - s.xy) / s.z;
  float c = cos(s.w), sn = sin(s.w);
  q = mat2(c, -sn, sn, c) * q;
  return vec2(q.x, -q.y);
}
// the cut: ten flat faces, ridges running from the centre to each tip and valleys to each inner corner
vec2 facetNormal(vec2 q, float rot) {
  float th = atan(q.x, q.y);
  const float SEC = 1.2566370614;
  float k = floor(th / SEC + 0.5);
  float ph = th - k * SEC;
  vec2 n = vec2(0.8968, 0.4426) * vec2(ph < 0.0 ? -1.0 : 1.0, 1.0);
  float a = k * SEC;
  vec2 nl = vec2(n.x * cos(a) + n.y * sin(a), -n.x * sin(a) + n.y * cos(a));
  float c = cos(rot), sn = sin(rot);
  return mat2(c, sn, -sn, c) * vec2(nl.x, -nl.y);   // back to design space (y down)
}

// a cut-glass star with per-channel refraction, lit from inside by liquid light
vec3 starGlass(vec2 p, vec2 sp, float sd, int i) {
  vec4 s = uStar[i];
  vec2 q = starLocal(p, i);
  float depth = max(-sd, 0.0);
  float u = clamp(depth / (11.0 * s.z), 0.0, 1.0);
  vec2 ne = starNormal(p, i);
  vec2 nf = facetNormal(q, s.w);
  // rounded rim → flat facets inward; the ridges stay crisp but anti-aliased by the blend
  vec3 nEdge = normalize(vec3(ne.x, -ne.y, 0.35 + u * 2.0));
  vec3 nFace = normalize(vec3(nf.x * 0.55, -nf.y * 0.55, 1.0));
  vec3 n3 = normalize(mix(nEdge, nFace, smoothstep(0.08, 0.45, u)));
  vec3 V = vec3(0.0, 0.0, -1.0);
  float thick = 6.0 + 20.0 * u;
  vec3 tR = refract(V, n3, 1.0 / 1.44), tG = refract(V, n3, 1.0 / 1.5), tB = refract(V, n3, 1.0 / 1.6);
  vec2 oR = vec2(tR.x, -tR.y) / max(-tR.z, 0.3) * thick;
  vec2 oG = vec2(tG.x, -tG.y) / max(-tG.z, 0.3) * thick;
  vec2 oB = vec2(tB.x, -tB.y) / max(-tB.z, 0.3) * thick;
  float frost = 0.03 + 0.2 * (1.0 - u);
  vec3 kc = vec3(scene(p + oR, sp + oR * uScale, frost).r, scene(p + oG, sp + oG * uScale, frost).g, scene(p + oB, sp + oB * uScale, frost).b);

  // facet shading: faces turned to the light are brighter, the others fall off
  vec3 Lsun = normalize(vec3(-0.45, 0.55, 0.7));
  float lam = dot(n3, Lsun);
  kc *= 0.86 + 0.22 * lam;
  // smoky body like the toggle's glass, so an empty star still reads as glass on the dark tray
  kc = mix(kc, kc * 0.84 + vec3(0.21) * (0.55 + 0.7 * lam), 1.0 - uTheme);
  kc += (lam - 0.72) * mix(0.42, 0.22, uTheme);
  kc = mix(kc, mix(kc, vec3(0.98), 0.35), uTheme * (1.0 - u * 0.5));

  // liquid light: the front sweeps through the body, with a slight meniscus wobble
  float front = uC.x + uFront + sin(p.y * 0.22 + uTime * 5.0) * 1.6;
  float has = step(0.001, uFill[i]);
  float lit = smoothstep(front + 3.0, front - 3.0, p.x) * has;
  float glowIn = lit + uFlash[i] * 0.9;
  float core = exp(-length(q) / 10.0);
  vec3 L = uHot;
  float facetGlow = 0.62 + 0.55 * (lam - 0.55);           // the cut catches the inner light unevenly
  kc = emitC(kc, L, glowIn * (0.45 * facetGlow + core * 1.1) * uEnergy);
  kc = emitC(kc, mix(L, vec3(1.0), 0.6), glowIn * core * core * 0.7 * uEnergy);
  // light gathers along the ridges and in the rim (total internal reflection)
  float ridge = exp(-abs(abs(mod(atan(q.x, q.y) + 0.6283185, 1.2566370614) - 0.6283185)) * length(q) / 1.2);
  kc = emitC(kc, L, glowIn * (ridge * 0.35 * u + exp(-depth / 2.2) * 0.9));
  float partial = has * (1.0 - step(0.999, uFill[i]));
  kc = emitC(kc, mix(L, vec3(1.0), 0.5), smoothstep(4.0, 0.0, abs(p.x - front)) * partial * 0.6);

  // reflections
  vec3 Rv = reflect(V, n3);
  float fres = 0.04 + 0.96 * pow(1.0 - n3.z, 5.0);
  vec3 env = mix(vec3(0.05), vec3(0.55), smoothstep(-0.7, 0.9, Rv.y));
  env = mix(env, vec3(0.97), uTheme * 0.5);
  kc = mix(kc, env, clamp(fres, 0.0, 0.6));
  kc += smoothstep(0.06, 0.0, u) * mix(0.3, 0.4, uTheme);
  vec2 tp = (uPtr - s.xy) / 70.0;
  vec3 Ld = normalize(mix(vec3(-0.4, 0.65, 0.62), vec3(tp.x, -tp.y, 0.8), uPtrOn * 0.8));
  float s1 = max(dot(Rv, Ld), 0.0);
  kc += pow(s1, 160.0) * 1.4 + pow(s1, 18.0) * mix(0.08, 0.12, uTheme);
  if (uSweep < 1.2) {
    float sw = dot(p - uC, normalize(vec2(1.0, -0.75)));
    float pos = mix(-uTray.x - 40.0, uTray.x + 40.0, clamp(uSweep / 0.8, 0.0, 1.0));
    kc += exp(-pow((sw - pos) / 10.0, 2.0)) * 0.3 * (1.0 - uSweep / 1.2) * (0.4 + 0.6 * u);
  }
  return kc;
}

// soft four-point diffraction spikes over a lit star
float twinkle(vec2 p) {
  float a = 0.0;
  for (int i = 0; i < N; i++) {
    if (i >= uN) break;
    vec2 d = p - uStar[i].xy;
    float f = uFill[i] * uFill[i] + uFlash[i] * 0.9;
    if (f < 0.01) continue;
    float t = uTime * 0.6 + float(i) * 1.7;
    float c = cos(t * 0.3), s = sin(t * 0.3);
    vec2 r = mat2(c, -s, s, c) * d;
    float len = 30.0 + 12.0 * sin(t * 2.3) + uFlash[i] * 16.0;
    float spikes = exp(-abs(r.y) / 0.9) * exp(-abs(r.x) / len) + exp(-abs(r.x) / 0.9) * exp(-abs(r.y) / len);
    a += spikes * f * (0.35 + 0.25 * sin(t * 3.1));
  }
  return a;
}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);
  int i;
  float sk = sdStars(p, i);
  if (sk < 2.0) {
    vec3 kc = starGlass(p, sp, sk, i);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }
  col = emitC(col, mix(uHot, vec3(1.0), 0.4), twinkle(p) * uEnergy * (1.0 - uTheme * 0.5));
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const N = thumb ? 3 : 5;
  const C = !thumb && compact();
  const GAP = thumb ? 66 : C ? 62 : 74;
  const TRAY = [((N - 1) * GAP) / 2 + 44, 40];
  const starX = i => (i - (N - 1) / 2) * GAP;
  const st = glassStage(root, { frag: FRAG, box: [TRAY[0] * 2 + (C ? 30 : 120), 250], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => st.buzz(pat);

  // ---------------------------------------------------------------- state
  let value = 0, hover = null;
  let level = 0, levelV = 0;                    // the light level (in stars), sprung toward the target
  const stars = Array.from({ length: N }, () => ({ jelly: new Spring(420, 12), turn: new Spring(260, 9), flash: 0 }));
  const label = new PixelMatrix({ size: 3.2, swirl: 9, shyR: 16, shyF: 6 });
  label.oy = TRAY[1] + 34;
  let shownWord = null, press = 0, lift = 0, lastCross = 0;
  const events = [];                            // scheduled effects, played from the frame loop
  let clock = 0;
  const later = (dt, fn) => events.push({ t: clock + dt, fn });

  const word = v => (thumb ? '' : WORDS[v]);

  const commit = v => {
    v = clamp(Math.round(v), 0, N);
    const prev = value;
    value = v;
    events.length = 0;
    if (v === 0) {
      S.drip(0.3, 0.8); st.pulse(0.4);
      for (let i = 0; i < N; i++) later(i * 0.03, () => stars[i].jelly.kick(2));
      return;
    }
    st.light = heat((v - 1) / (N - 1));
    // the lit stars bounce one after another, toward the chosen one
    for (let i = 0; i < v; i++) later(i * 0.045, () => { stars[i].jelly.kick(-4.5); stars[i].turn.kick(i % 2 ? 2.2 : -2.2); stars[i].flash = Math.max(stars[i].flash, 0.35); });
    S.ping(true); st.pulse(0.8); buzz(10);
    st.burst(starX(v - 1), 0, 8 + v * 2, 0.5 + v * 0.1);
    stars[v - 1].flash = 1;
    if (v === N && prev !== N) {
      // five stars: a chain reaction
      for (let i = 0; i < N; i++) later(0.16 + i * 0.09, () => {
        stars[i].flash = 1.3; stars[i].jelly.kick(-7); stars[i].turn.kick(i % 2 ? 4 : -4);
        S.key(0.35 + i * 0.13); st.burst(starX(i), 0, 9, 0.9, -Math.PI / 2, 1.3);
      });
      later(0.16 + N * 0.09, () => { st.shock(0, 0); st.glint(); st.pulse(1); buzz([8, 30, 8, 30, 16]); });
    } else later(0.12, () => st.glint());
  };

  // ---------------------------------------------------------------- input
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const overRow = ([x, y]) => Math.abs(y) < TRAY[1] + 14 && Math.abs(x) < TRAY[0] + 10;
  const starAt = x => clamp(Math.floor((x - starX(0) + GAP / 2) / GAP) + 1, 1, N);
  let dragging = false, downAt = null;
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d);
      if (!overRow(q)) return;
      S._ensure();
      dragging = true; downAt = starAt(q[0]); hover = downAt;
      stars[downAt - 1].jelly.kick(-2);
    },
    move: (p, e, d) => {
      const q = local(d);
      const on = overRow(q);
      st.canvas.style.cursor = on ? 'pointer' : 'default';
      hover = on || dragging ? starAt(q[0]) : null;
      if (on && e.pointerType !== 'mouse' && !dragging) hover = null;
    },
    up: (p, e, d) => {
      if (!dragging) return;
      dragging = false;
      const q = d ? local(d) : null;
      const v = q ? starAt(q[0]) : hover;
      // tapping the current rating again clears it
      commit(v === value && v === downAt ? 0 : v);
      if (q && !overRow(q)) hover = null;
    },
  });
  st.canvas.addEventListener('pointerleave', () => { if (!dragging) hover = null; });
  const onKey = e => {
    if (/^(Arrow(Left|Right|Up|Down)|[0-5])$/.test(e.key)) hover = null; // the keyboard wins until the pointer moves again
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); commit(value + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); commit(value - 1); }
    else if (/^[0-5]$/.test(e.key)) { e.preventDefault(); commit(+e.key); }
  };
  if (!thumb) window.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- autopilot (shelf miniature)
  let demoT = 0, demoStep = -1;
  const DEMO = [0, 1, 2, 3, 3, 0];

  st.run((dt, t) => {
    clock += dt;
    for (let k = events.length - 1; k >= 0; k--) if (events[k].t <= clock) { const ev = events[k]; events.splice(k, 1); ev.fn(); }
    if (demo) {
      demoT += dt;
      const s = Math.floor(demoT / 0.9) % DEMO.length;
      if (s !== demoStep) { demoStep = s; commit(DEMO[s]); }
    }

    // the light level: a spring toward the hovered (preview) or committed rating
    const target = hover ?? value;
    const k = 170, c = 2 * Math.sqrt(k) * 0.62;
    levelV += (-k * (level - target) - c * levelV) * dt; level += levelV * dt;
    if (level < 0) { level = 0; levelV = Math.max(0, levelV); }
    // a soft tick each time the light front enters a star
    const cross = Math.floor(clamp(level + 0.5, 0, N));
    if (cross !== lastCross) {
      if (Math.abs(levelV) > 0.4) S.tick(0.35 + cross * 0.1, 0.45);
      if (cross > lastCross && cross > 0) stars[cross - 1].jelly.kick(-1.6);
      lastCross = cross;
    }
    S.air(Math.abs(levelV) / 9);

    const hot = heat(clamp((level - 1) / (N - 1), 0, 1));
    if (!events.length) st.light = hot;

    const w = word(hover ?? value);
    if (w !== shownWord) { label.set(w ? textCells(w, 4.2) : []); shownWord = w; }
    label.step(dt, { ptr: st.local(label), shy: st.ptrOn * 0.6 });

    press += ((dragging ? 1 : 0) - press) * Math.min(1, dt * 12);
    lift += ((st.ptrOn > 0.5 && hover !== null && !dragging ? 1 : 0) - lift) * Math.min(1, dt * 8);
    const energy = 0.75 + lift * 0.1 + st.kick * 0.25;

    const starU = [], fillU = [], flashU = [];
    for (let i = 0; i < N; i++) {
      const s = stars[i];
      s.flash *= Math.exp(-dt * 3.2);
      const j = s.jelly.step(dt) * 0.035;
      const hovered = hover === i + 1 ? 1 : 0;
      const scale = (1 + j + hovered * 0.06 * lift) * (1 - press * (hover === i + 1 ? 0.05 : 0));
      const rot = s.turn.step(dt) * 0.05 + (reducedMotion ? 0 : Math.sin(t * 0.5 + i * 1.3) * 0.02);
      starU.push(st.cx + starX(i), st.cy - lift * hovered * 2, scale, rot);
      fillU.push(clamp(level - i, 0, 1));
      flashU.push(reducedMotion ? s.flash * 0.4 : s.flash);
    }
    // the light front, in tray x: walks across each star body as the level passes through it
    const li = Math.floor(clamp(level, 0, N - 0.0001)), lf = clamp(level, 0, N) - li;
    const front = level <= 0 ? -1e4 : level >= N ? 1e4 : starX(li) - R + lf * 2 * R;

    st.drawPixels(ctx => label.draw(ctx, value || hover ? 1 : 0.5));
    st.render(t, (U, gl) => {
      gl.uniform1i(U.uN, N);
      gl.uniform2f(U.uTray, TRAY[0], TRAY[1]);
      gl.uniform4fv(U.uStar, starU);
      gl.uniform1fv(U.uFill, fillU);
      gl.uniform1fv(U.uFlash, flashU);
      gl.uniform1f(U.uFront, front);
      gl.uniform3f(U.uHot, ...hot);
      gl.uniform1f(U.uEnergy, energy);
      gl.uniform1f(U.uLift, lift);
      gl.uniform1f(U.uPress, press);
    });
  });

  return { dispose() { window.removeEventListener('keydown', onKey); st.dispose(); } };
}
