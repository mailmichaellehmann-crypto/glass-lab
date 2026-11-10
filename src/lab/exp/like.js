// LIKE — a reaction you can feel. Seen from above.
// A heart cut from thick glass like a gem: a flat table on top, a bevel of facets all round that flash
// as the light (your pointer) moves. Tap it and light wells up inside, from its two chambers outward
// until the whole stone glows; sparks fly, the count ticks up, and from then on it beats, lub-dub.
// Tap again and the light drains. Press and hold instead: a filament closes round the heart, it swells
// and trembles, and when you let go it bursts into a shower of small hearts.

import { glassStage, PixelMatrix, Spring, textCells, hexRgb, mix3 } from '../glass/engine.js';
import { clamp, rand } from '../kit.js';

const NM = 8; // small hearts in a burst
const IDLE = hexRgb('#c6b6dc'), HOT = hexRgb('#ff3d77'), GOLD = hexRgb('#ffd27a');

const FRAG = /* glsl */ `
#define NM ${NM}
uniform vec2  uH;              // heart centre (abs)
uniform float uS;              // size
uniform vec2  uSq;             // squash (x, y)
uniform vec3  uL;
uniform float uFill, uCharge, uEnergy, uLift, uPress, uFlashH;
uniform vec4  uMini[NM];       // x, y (abs), size, alpha

float dot2(vec2 v) { return dot(v, v); }
// unit heart: tip at (0,0), lobes up to y ≈ 1.1 (after Inigo Quilez)
float sdHeartU(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - 0.35355339;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
float sdHeartAt(vec2 p, vec2 c, float s, vec2 sq) {
  vec2 q = (p - c) / (s * sq);
  return sdHeartU(vec2(q.x, 0.56 - q.y)) * s * min(sq.x, sq.y) - 5.0; // rounded: no needle-sharp tip
}
float sdHeart(vec2 p) { return sdHeartAt(p, uH, uS, uSq); }
float fil(vec2 p) { return filament(p, uH, sdHeart(p), -1.5707963, 0.12 + uCharge * 3.1); }

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  float on = smoothstep(0.0, 0.06, uCharge);
  col = emitC(col, uL, filamentSpill(fil(q)) * 0.55 * on * uEnergy);
  // the stone floats a little above the page: a soft shadow that tightens when it is pressed
  float hs = sdHeart(q - vec2(0.0, 15.0 + uLift * 7.0 - uPress * 8.0));
  col *= 1.0 - (1.0 - smoothstep(-12.0, 30.0 + uLift * 12.0, hs)) * mix(0.5, 0.18, uTheme);
  // lit from inside, it throws its colour onto the page around it
  col = emitC(col, uL, (exp(-max(sdHeart(q), 0.0) / 30.0) * 0.32 + exp(-max(sdHeart(q), 0.0) / 90.0) * 0.14) * uFill * uEnergy);
  float cover;
  return ink(col, q, frost, vec2(0.0), 0.0, uL, cover);
}

vec3 heartGlass(vec2 p, vec2 sp, float sd) {
  vec2 e = vec2(0.5, 0.0);
  vec2 n = normalize(vec2(sdHeart(p + e.xy) - sdHeart(p - e.xy), sdHeart(p + e.yx) - sdHeart(p - e.yx)) + 1e-5);
  float depth = max(-sd, 0.0);
  const float BEV = 24.0;
  float bev = 1.0 - smoothstep(BEV - 0.8, BEV + 0.8, depth);     // 1 on the bevel, 0 on the flat table
  // the bevel is cut into flat facets that radiate from the middle, like a gem
  vec2 rel = p - uH;
  const float SEG = 6.2831853 / 14.0;
  float a = atan(rel.y, rel.x) + 0.2244;
  float fa = (floor(a / SEG) + 0.5) * SEG - 0.2244;
  vec2 fn = vec2(cos(fa), sin(fa));
  vec2 n2 = normalize(mix(n, fn, 0.55) + 1e-5);
  vec3 n3 = normalize(vec3(n2.x * 0.85 * bev, -n2.y * 0.85 * bev, 1.0));
  vec3 V = vec3(0.0, 0.0, -1.0);
  float thick = 9.0 + 15.0 * clamp(depth / BEV, 0.0, 1.0);
  vec3 tR = refract(V, n3, 1.0 / 1.45), tG = refract(V, n3, 1.0 / 1.5), tB = refract(V, n3, 1.0 / 1.56);
  vec2 oR = vec2(tR.x, -tR.y) / max(-tR.z, 0.3) * thick;
  vec2 oG = vec2(tG.x, -tG.y) / max(-tG.z, 0.3) * thick;
  vec2 oB = vec2(tB.x, -tB.y) / max(-tB.z, 0.3) * thick;
  float frost = 0.015 + 0.1 * bev;
  vec3 kc = vec3(scene(p + oR, sp + oR * uScale, frost).r, scene(p + oG, sp + oG * uScale, frost).g, scene(p + oB, sp + oB * uScale, frost).b);
  // a trace of smoke in the dark, so the empty stone does not vanish
  kc = mix(kc * 0.9 + vec3(0.075) + (1.0 - bev) * 0.02, kc, uTheme);

  // light wells up from the two chambers (where the glass is deepest) and spreads to the rim
  float lvl = (1.0 - uFill) * 44.0;
  float core = smoothstep(lvl - 7.0, lvl + 7.0, depth + 3.0) * smoothstep(0.0, 0.03, uFill);
  // deeper in the middle, thinner toward the rim: the facets stay readable through the glow
  kc = emitC(kc, uL, core * (0.26 + 0.22 * smoothstep(0.0, 44.0, depth) + 0.12 * bev) * uEnergy);
  kc = emitC(kc, mix(uL, vec3(1.0), 0.6), exp(-pow((depth + 3.0 - lvl) / 3.0, 2.0)) * 0.35 * uFill * (1.0 - uFill) * 4.0); // the bright front while it fills
  kc = emitC(kc, uL, filamentScatter(fil(p)) * 0.7 * smoothstep(0.0, 0.06, uCharge) * uEnergy);

  // each facet catches the light on its own: lit ones glow, the ones turned away go dark, and the
  // ones that mirror the key light flash (it follows the pointer)
  vec2 tp = (uPtr - uH) / (uS * 1.2);
  vec3 L3 = normalize(mix(vec3(-0.4, 0.7, 0.6), vec3(tp.x, -tp.y, 0.75), uPtrOn * 0.8));
  float fb = dot(vec2(fn.x, -fn.y), normalize(L3.xy + 1e-4));
  kc += max(fb, 0.0) * bev * mix(0.13, 0.17, uTheme);
  kc *= 1.0 - max(-fb, 0.0) * bev * mix(0.3, 0.1, uTheme);
  vec3 R = reflect(V, n3);
  float spec = max(dot(R, L3), 0.0);
  kc += pow(spec, 26.0) * bev * mix(0.7, 0.55, uTheme);
  kc = emitC(kc, uL, pow(spec, 10.0) * bev * 0.35 * uFill);
  // the ridges between facets and the edge of the table: thin bright lines
  float fr = fract(a / SEG);
  float ridge = 1.0 - smoothstep(0.0, 1.1, min(fr, 1.0 - fr) * SEG * length(rel));
  kc += ridge * bev * mix(0.12, 0.16, uTheme);
  kc += exp(-pow((depth - BEV) / 0.9, 2.0)) * mix(0.16, 0.2, uTheme);
  // the table: a soft sheen toward the light, and the pointer's glow
  kc += pow(max(dot(normalize(vec3(-rel.x, rel.y, uS * 2.2)), L3), 0.0), 18.0) * (1.0 - bev) * mix(0.1, 0.12, uTheme);
  kc += exp(-length(p - uPtr) / 40.0) * uPtrOn * (1.0 - bev) * 0.05;
  kc = edgeCut(kc, depth, 0.85);
  if (uSweep < 1.2) {
    float s = dot(rel, normalize(vec2(1.0, -0.75)));
    float pos = mix(-uS - 60.0, uS + 60.0, clamp(uSweep / 0.8, 0.0, 1.0));
    kc += exp(-pow((s - pos) / 11.0, 2.0)) * 0.3 * (1.0 - uSweep / 1.2);
  }
  return emitC(kc, mix(uL, vec3(1.0), 0.5), uFlashH * 0.6);
}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);
  float sk = sdHeart(p);
  if (sk < 2.0) col = mix(heartGlass(p, sp, sk), col, smoothstep(-0.7, 0.7, sk));
  float fd = fil(p);
  col = mix(col, drawFilament(col, fd, uL, uEnergy * (1.0 + uKick * 0.5)), smoothstep(0.0, 0.06, uCharge));
  // the small hearts of a burst: light, not glass, like sparks
  for (int i = 0; i < NM; i++) {
    vec4 m = uMini[i];
    if (m.w < 0.01) continue;
    float d = sdHeartAt(p, m.xy, m.z, vec2(1.0)) + 4.0;
    col = emitC(col, uFxLight, ((1.0 - smoothstep(-0.8, 0.8, d)) * 0.95 + exp(-max(d, 0.0) / 7.0) * 0.4) * m.w);
    col += (1.0 - smoothstep(0.0, 1.2, abs(d + 0.6))) * 0.25 * m.w;
  }
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const SZ = 104, HY = thumb ? 0 : -22, COUNT_Y = HY + 96;
  const st = glassStage(root, { frag: FRAG, box: [SZ * 2 + 110, thumb ? SZ * 2 + 80 : (COUNT_Y + 46) * 2], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => st.buzz(pat);

  // ---------------------------------------------------------------- state
  let liked = false, count = 128, fill = 0, fillV = 0;
  let holding = false, holdT = 0, charge = 0, lastStep = 0, press = 0, lift = 0, flash = 0, beatT = 0;
  const jelly = new Spring(340, 9);
  const minis = [];
  const num = new PixelMatrix({ size: 3.6, swirl: 10, shyR: 20, shyF: 7 });
  num.oy = COUNT_Y;
  const showCount = () => { if (!thumb) num.set(textCells(String(count), 4.2), { instant: true }); }; // a counter: instant
  showCount();
  const events = [];
  let clock = 0;
  const later = (dt, fn) => events.push({ t: clock + dt, fn });

  const like = () => {
    liked = true; count++; showCount(); beatT = 0.7;
    jelly.kick(-6.5); flash = 1;
    st.fxLight = [...HOT];
    st.burst(0, HY, 16, 0.9); st.glint(); st.pulse(1);
    S.ping(true); later(0.07, () => S.key(0.72)); buzz([10, 30, 14]);
  };
  const unlike = () => {
    liked = false; count--; showCount();
    jelly.kick(3.5); st.pulse(0.3);
    S.drip(0.3, 0.6); buzz(6);
  };
  // the charged release: the heart bursts into a shower of small ones
  const superLike = power => {
    if (!liked) { liked = true; count++; showCount(); }
    beatT = 0.6; flash = 1.4; jelly.kick(-9);
    st.light = mix3(HOT, GOLD, 0.4);
    const n = Math.round(4 + power * (NM - 4));
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * (Math.PI * 1.5 / n) + rand(-0.15, 0.15), sp = rand(230, 380) * (0.7 + power * 0.5);
      minis.push({ x: Math.cos(a) * 30, y: HY + Math.sin(a) * 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: rand(13, 20), life: rand(0.9, 1.4), max: 1.4 });
    }
    while (minis.length > NM) minis.shift();
    st.shock(0, HY); st.burst(0, HY, 24, 1.2); st.glint(); st.pulse(1);
    S.ping(true); [0.5, 0.66, 0.84, 1].forEach((p, i) => later(0.06 + i * 0.07, () => S.key(p)));
    buzz([12, 30, 12, 30, 24]);
  };

  // ---------------------------------------------------------------- input
  const over = d => { const x = d[0] - st.cx, y = d[1] - st.cy - HY; return Math.abs(x) < SZ * 0.66 && y > -SZ * 0.62 && y < SZ * 0.62 && Math.abs(x) < SZ * 0.66 - Math.max(0, y) * 0.9 + 8; };
  const begin = () => { if (holding) return; S._ensure(); holding = true; holdT = 0; lastStep = 0; jelly.kick(2.4); S.tick(0.35, 0.5); };
  const end = cancel => {
    if (!holding) return;
    holding = false;
    if (cancel) { jelly.kick(-2); charge = 0; return; }
    if (charge > 0.22) superLike(charge); else if (liked) unlike(); else like();
    charge = 0;
  };
  st.bindPointer({
    down: (p, e, d) => { if (over(d)) begin(); },
    move: (p, e, d) => { st.canvas.style.cursor = over(d) ? 'pointer' : 'default'; if (holding && !over(d)) end(true); },
    up: () => end(false),
  });
  const isKey = e => e.key === ' ' || e.key === 'Enter' || e.key === 'l' || e.key === 'L';
  const onKey = e => { if (isKey(e)) { e.preventDefault(); if (!e.repeat) begin(); } };
  const onKeyUp = e => { if (isKey(e)) { e.preventDefault(); end(false); } };
  if (!thumb) { window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp); }

  let demoT = 0, demoN = 0;
  st.run((dt, t) => {
    clock += dt;
    for (let k = events.length - 1; k >= 0; k--) if (events[k].t <= clock) { const ev = events[k]; events.splice(k, 1); ev.fn(); }
    if (demo) { demoT += dt; if (demoT > 1.25) { demoT = 0; demoN++; if (liked) unlike(); else if (demoN % 4 === 3) superLike(0.8); else like(); } }

    // holding charges it: the filament closes round the heart, ticks climb, the glass trembles
    if (holding) {
      holdT += dt;
      charge = clamp((holdT - 0.24) / 1.15, 0, 1);
      const step = Math.floor(charge * 8);
      if (step > lastStep) { lastStep = step; S.tick(0.3 + charge * 0.7, 0.4 + charge * 0.5); st.pulse(0.15 + charge * 0.3); buzz(5); }
    }
    // the light inside follows the state like a liquid, with a little overshoot
    { const k = 55, c = 2 * Math.sqrt(k) * 0.72; fillV += (-k * (fill - (liked ? 1 : 0)) - c * fillV) * dt; fill = clamp(fill + fillV * dt, 0, 1.08); }
    // once liked it beats: lub-dub, then a pause
    if (liked && !holding && !reducedMotion) {
      const b0 = beatT; beatT += dt;
      if (b0 < 1.5 && beatT >= 1.5) { jelly.kick(-1.7); st.pulse(0.2); }
      if (b0 < 1.74 && beatT >= 1.74) { jelly.kick(-1.2); st.pulse(0.14); beatT = 0; }
    }
    press += ((holding ? 1 : 0) - press) * Math.min(1, dt * 14);
    lift += ((st.ptrOn > 0.5 && !holding && over(st.dp) ? 1 : 0) - lift) * Math.min(1, dt * 8);
    flash *= Math.exp(-dt * 4);

    const L = mix3(mix3(IDLE, HOT, clamp(fill, 0, 1)), GOLD, charge * 0.75);
    st.light = mix3(st.light, L, Math.min(1, dt * 7));

    for (const m of minis) { const d = Math.exp(-dt * 2.2); m.vx *= d; m.vy *= d; m.x += m.vx * dt; m.y += m.vy * dt; m.life -= dt; }
    while (minis.length && minis[0].life <= 0) minis.shift();

    const j = jelly.step(dt) * 0.03 * (reducedMotion ? 0.3 : 1);
    const tr = reducedMotion ? 0 : Math.pow(charge, 2) * 2.4;
    const jx = tr * (Math.sin(t * 73) * 0.6 + Math.sin(t * 111) * 0.4), jy = tr * (Math.sin(t * 87 + 1) * 0.6 + Math.sin(t * 61) * 0.4);
    const grow = (1 + charge * 0.09 + lift * 0.02) * (1 - press * 0.045);

    num.step(dt, { ptr: st.local(num), shy: st.ptrOn * 0.5 });
    st.drawPixels(ctx => num.draw(ctx, 0.55 + 0.45 * clamp(fill, 0, 1)));

    st.render(t, (U, gl) => {
      gl.uniform2f(U.uH, st.cx + jx, st.cy + HY + jy - lift * 2 + press * 3);
      gl.uniform1f(U.uS, SZ);
      gl.uniform2f(U.uSq, grow * (1 + j), grow * (1 - j * 0.8));
      gl.uniform3f(U.uL, ...st.light);
      gl.uniform1f(U.uFill, clamp(fill, 0, 1));
      gl.uniform1f(U.uCharge, charge);
      gl.uniform1f(U.uEnergy, 0.8 + lift * 0.1 + st.kick * 0.3);
      gl.uniform1f(U.uLift, lift);
      gl.uniform1f(U.uPress, press);
      gl.uniform1f(U.uFlashH, flash);
      const mu = new Float32Array(NM * 4);
      minis.forEach((m, i) => { const k = clamp(m.life / m.max, 0, 1); mu.set([st.cx + m.x, st.cy + m.y, m.size * (1.5 - 0.5 * k), Math.pow(k, 0.7)], i * 4); }); // nearer the eye as they rise: larger, fainter
      gl.uniform4fv(U.uMini, mu);
    });
  });

  return {
    dispose() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      st.dispose();
    },
  };
}
