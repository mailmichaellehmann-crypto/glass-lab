// BLOOM — a radial menu that flowers out of a glass drop, seen from above.
// Press and hold the drop: six glass bubbles well out of it one after another, overshooting a little,
// each still joined to the middle by a liquid neck. Slide toward one: it swells, its neck thickens,
// its pixel icon lights up in its own colour and the toggle's filament on the drop turns to point at
// it like a compass. Let go on it: the chosen bubble flies back into the drop and its icon becomes the
// drop's; the others are sucked back in. Let go anywhere else and they all retract. A quick tap
// opens the menu and leaves it open. One glass body throughout: drop, necks and bubbles are a smooth union.

import { glassStage, PixelMatrix, Spring, textCells, bitmapCells, hexRgb, mix3 } from '../glass/engine.js';
import { clamp } from '../kit.js';

const ICON = {
  menu: ['#.#.#', '.....', '#.#.#', '.....', '#.#.#'],
  home: ['...#...', '..###..', '.#####.', '#######', '.##.##.', '.##.##.', '.##.##.'],
  bell: ['...#...', '..###..', '.#####.', '.#####.', '.#####.', '#######', '...#...'],
  heart: ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'],
  camera: ['..##...', '#######', '#..#..#', '#.###.#', '#..#..#', '#######'],
  mail: ['#######', '##...##', '#.#.#.#', '#..#..#', '#.....#', '#######'],
  gear: ['..#.#..', '.#####.', '###.###', '##...##', '###.###', '.#####.', '..#.#..'],
};
const ITEMS = [
  { name: 'HOME', icon: 'home', color: '#ffb547' },
  { name: 'ALERTS', icon: 'bell', color: '#ff7a45' },
  { name: 'LIKE', icon: 'heart', color: '#ff5f8a' },
  { name: 'CAMERA', icon: 'camera', color: '#c58bff' },
  { name: 'MAIL', icon: 'mail', color: '#7fb2ff' },
  { name: 'SETTINGS', icon: 'gear', color: '#3dffa8' },
].map(it => ({ ...it, rgb: hexRgb(it.color) }));
const BASE = hexRgb('#c8a2ff');
const N = ITEMS.length;

const FRAG = /* glsl */ `
#define NB ${N}
uniform vec2  uC0;             // drop centre (abs)
uniform float uCR;             // drop radius
uniform vec4  uB[NB];          // bubble x, y (abs), radius, hot
uniform float uNeck[NB];
uniform vec3  uBC[NB];         // bubble colours
uniform vec3  uL;
uniform float uTh, uFilOn, uEnergy, uLift, uPress;

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-3), 0.0, 1.0));
}
// the whole glass body; idx/hot tell which bubble a point belongs to (for its colour)
float sdBloomI(vec2 p, out int idx) {
  float d = length(p - uC0) - uCR;
  float best = d; idx = -1;
  for (int i = 0; i < NB; i++) {
    vec4 b = uB[i];
    if (b.z < 0.5) continue;
    float e = length(p - b.xy) - b.z;
    float m = smin(e, sdSeg(p, uC0, b.xy) - uNeck[i], 9.0);
    if (e < best) { best = e; idx = i; }
    d = smin(d, m, 13.0);
  }
  return d;
}
float sdBloom(vec2 p) { int k; return sdBloomI(p, k); }
float fil(vec2 p) { return filament(p, uC0, length(p - uC0) - uCR, uTh, 0.5); }

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  float f = fil(q);
  col = emitC(col, uL, filamentSpill(f) * 0.6 * uFilOn * uEnergy);
  // the glass body's shadow: longer when lifted, tight when pressed
  float ls = sdBloom(q - vec2(0.0, 9.0 + uLift * 5.0 - uPress * 4.0));
  col *= 1.0 - (1.0 - smoothstep(-8.0, 20.0 + uLift * 10.0, ls)) * mix(0.5, 0.18, uTheme);
  // each bubble throws a little of its colour onto the page
  for (int i = 0; i < NB; i++) {
    vec4 b = uB[i];
    if (b.z < 0.5) continue;
    col = emitC(col, uBC[i], exp(-max(length(q - b.xy) - b.z, 0.0) / 22.0) * (0.04 + 0.22 * b.w) * uEnergy);
  }
  float cover;
  return ink(col, q, frost, vec2(0.0), 0.0, uL, cover);
}

vec3 bloomGlass(vec2 p, vec2 sp, float sd, int idx) {
  vec2 e = vec2(0.5, 0.0);
  vec2 n = normalize(vec2(sdBloom(p + e.xy) - sdBloom(p - e.xy), sdBloom(p + e.yx) - sdBloom(p - e.yx)) + 1e-5);
  float depth = max(-sd, 0.0);
  float u = clamp(depth / 17.0, 0.0, 1.0);
  float hgt = sqrt(max(1.0 - (1.0 - u) * (1.0 - u), 0.0));
  vec3 n3 = normalize(vec3(n.x * (1.0 - u), -n.y * (1.0 - u), hgt + 0.02));
  vec3 V = vec3(0.0, 0.0, -1.0);
  float thick = 5.0 + 17.0 * hgt;
  vec3 tR = refract(V, n3, 1.0 / 1.44), tG = refract(V, n3, 1.0 / 1.5), tB = refract(V, n3, 1.0 / 1.58);
  vec2 oR = vec2(tR.x, -tR.y) / max(-tR.z, 0.3) * thick;
  vec2 oG = vec2(tG.x, -tG.y) / max(-tG.z, 0.3) * thick;
  vec2 oB = vec2(tB.x, -tB.y) / max(-tB.z, 0.3) * thick;
  float frost = 0.04 + 0.3 * pow(1.0 - u, 5.0);
  vec3 kc = vec3(scene(p + oR, sp + oR * uScale, frost).r, scene(p + oG, sp + oG * uScale, frost).g, scene(p + oB, sp + oB * uScale, frost).b);
  kc = mix(kc, kc * 0.86 + vec3(0.1), 1.0 - uTheme);
  // light inside: the drop carries the current colour, each bubble its own, brighter when hot
  vec3 lc = idx >= 0 ? uBC[idx] : uL;
  float hot = idx >= 0 ? uB[idx].w : 0.0;
  kc = emitC(kc, lc, (0.12 + 0.55 * hot + filamentScatter(fil(p)) * 0.7 * uFilOn) * (0.35 + 0.65 * (1.0 - u)) * uEnergy);
  kc = emitC(kc, lc, exp(-depth / 2.2) * (0.15 + 0.5 * hot) * uEnergy);
  vec3 Rv = reflect(V, n3);
  float fres = 0.04 + 0.96 * pow(1.0 - n3.z, 5.0);
  vec3 env = mix(vec3(0.06), vec3(0.55), smoothstep(-0.7, 0.9, Rv.y));
  env = mix(env, vec3(0.97), uTheme * 0.5);
  kc = mix(kc, env, clamp(fres, 0.0, 0.65));
  kc += smoothstep(0.06, 0.0, u) * mix(0.3, 0.4, uTheme);
  vec2 tp = (uPtr - uC0) / 120.0;
  vec3 Ld = normalize(mix(vec3(-0.4, 0.65, 0.62), vec3(tp.x, -tp.y, 0.8), uPtrOn * 0.5));
  float s1 = max(dot(Rv, Ld), 0.0);
  kc += pow(s1, 200.0) * 1.5 + pow(s1, 20.0) * mix(0.07, 0.11, uTheme);
  float win = smoothstep(0.2, 0.13, abs(Rv.x + 0.3)) * smoothstep(0.15, 0.09, abs(Rv.y - 0.5)) * smoothstep(0.1, 0.4, Rv.z);
  kc += win * mix(0.18, 0.32, uTheme);
  if (uSweep < 1.2) {
    float s = dot(p - uC0, normalize(vec2(1.0, -0.75)));
    float pos = mix(-150.0, 150.0, clamp(uSweep / 0.8, 0.0, 1.0));
    kc += exp(-pow((s - pos) / 11.0, 2.0)) * 0.3 * (1.0 - uSweep / 1.2) * hgt;
  }
  return kc;
}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);
  int idx;
  float sk = sdBloomI(p, idx);
  if (sk < 2.0) col = mix(bloomGlass(p, sp, sk, idx), col, smoothstep(-0.7, 0.7, sk));
  col = drawFilament(col, fil(p), uL, uEnergy * uFilOn * (1.0 + uKick * 0.5));
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const K = thumb ? 0.78 : 1;
  const CR = 34 * K, BR = 24 * K, ROUT = 98 * K;
  const st = glassStage(root, { frag: FRAG, box: [ROUT * 2 + BR * 2 + 80, ROUT * 2 + BR * 2 + (thumb ? 60 : 130)], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => st.buzz(pat);

  // ---------------------------------------------------------------- state
  const ang = i => -Math.PI / 2 + (i * Math.PI * 2) / N;
  const bubbles = ITEMS.map((it, i) => {
    const m = new PixelMatrix({ size: 2.7 * K, swirl: 6, shyR: 10, shyF: 3 });
    m.set(bitmapCells(ICON[it.icon], 2.7 * K), { instant: true });
    return { it, i, a: ang(i), r: 0, rv: 0, hot: 0, jelly: new Spring(380, 10), m };
  });
  const center = new PixelMatrix({ size: 3.4 * K, swirl: 10, shyR: 12, shyF: 4 });
  center.set(bitmapCells(ICON.menu, 3.4 * K), { instant: true });
  const label = new PixelMatrix({ size: 3, swirl: 9, shyR: 14, shyF: 5 });
  label.oy = ROUT + BR + 34;
  const drop = new Spring(360, 10);
  let open = false, sticky = false, openT = 0, hot = -1, chosen = -1, flying = -1, mode = null, downAt = 0, moved = 0;
  let theta = Math.PI / 2, filOn = 0, press = 0, lift = 0, shownLabel = null, keyHot = false;
  const events = [];
  let clock = 0;
  const later = (dt, fn) => events.push({ t: clock + dt, fn });

  const openMenu = () => {
    if (open) return;
    open = true; openT = 0; flying = -1;
    drop.kick(-3); st.pulse(0.4);
    S.drip(0.5, 0.6);
    bubbles.forEach((b, i) => later(0.04 + i * 0.035, () => { S.tick(0.45 + i * 0.06, 0.3); b.jelly.kick(-2); }));
  };
  const closeMenu = (silent = false) => {
    if (!open) return;
    open = false; sticky = false; hot = -1;
    if (!silent) { S.drip(0.32, 0.45); drop.kick(2.5); }
  };
  const setHot = i => {
    if (i === hot) return;
    hot = i;
    if (i >= 0) { const b = bubbles[i]; b.jelly.kick(-3); S.tick(0.55 + i * 0.07, 0.5); buzz(4); }
  };
  const select = i => {
    const b = bubbles[i];
    chosen = i; flying = i;
    closeMenu(true);
    st.light = b.it.rgb;
    S.ping(true); later(0.08, () => S.key(0.4 + i * 0.08));
    st.burst(Math.cos(b.a) * b.r, Math.sin(b.a) * b.r, 12, 0.6);
    st.glint(); st.pulse(0.8); buzz([8, 30, 12]);
  };

  // ---------------------------------------------------------------- input
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const hotAt = ([x, y]) => {
    const d = Math.hypot(x, y);
    if (d < CR + 6 || d > ROUT + BR + 34) return -1;
    let a = Math.atan2(y, x) + Math.PI / 2;
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return Math.round(a / ((Math.PI * 2) / N)) % N;
  };
  const onDrop = ([x, y]) => Math.hypot(x, y) < CR + 8;
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d);
      keyHot = false;
      if (sticky) {
        const h = hotAt(q);
        if (h >= 0) select(h); else closeMenu();
        return;
      }
      if (!onDrop(q)) return;
      S._ensure();
      mode = 'hold'; downAt = performance.now(); moved = 0; press = 1;
      openMenu();
    },
    move: (p, e, d) => {
      const q = local(d);
      if (mode === 'hold') moved = Math.max(moved, Math.hypot(q[0], q[1]));
      if (open && !keyHot) setHot(hotAt(q));
      st.canvas.style.cursor = onDrop(q) || (open && hotAt(q) >= 0) ? 'pointer' : 'default';
    },
    up: (p, e, d) => {
      if (mode !== 'hold') return;
      mode = null; press = 0;
      const q = d ? local(d) : [0, 0];
      const h = hotAt(q);
      if (h >= 0) select(h);
      else if (performance.now() - downAt < 280 && moved < CR + 6) { sticky = true; drop.kick(1.5); } // a tap: stay open
      else closeMenu();
    },
  });
  const onKey = e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault(); S._ensure();
      if (!open) { openMenu(); sticky = true; keyHot = true; setHot(Math.max(0, chosen)); }
      else if (hot >= 0) select(hot); else closeMenu();
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); S._ensure();
      const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      if (!open) { openMenu(); sticky = true; }
      keyHot = true;
      setHot(((hot < 0 ? Math.max(0, chosen) : hot + dir) + N) % N);
    }
  };
  if (!thumb) window.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- autopilot (shelf miniature)
  let demoT = 0;
  const DEMO_SEL = [3, 1, 5, 2];
  let demoK = 0;

  st.run((dt, t) => {
    clock += dt;
    for (let k = events.length - 1; k >= 0; k--) if (events[k].t <= clock) { const ev = events[k]; events.splice(k, 1); ev.fn(); }
    if (demo) {
      demoT += dt;
      const target = DEMO_SEL[demoK % DEMO_SEL.length];
      if (!open && demoT > 0.5 && demoT < 1) { openMenu(); sticky = true; }
      if (open && demoT > 0.8) setHot(Math.min(target, Math.floor((demoT - 0.8) / 0.22)));
      if (open && demoT > 0.8 + target * 0.22 + 0.45) { select(target); demoK++; }
      if (demoT > 3.4) demoT = 0;
    }
    if (open) openT += dt;

    // bubbles: out along their spokes with an overshoot, back in faster
    for (const b of bubbles) {
      const out = open && openT > 0.04 + b.i * 0.035;
      const k = out ? 240 : b.i === flying ? 380 : 300;
      const c = 2 * Math.sqrt(k) * (out ? 0.5 : 0.85);
      b.rv += (-k * (b.r - (out ? ROUT : 0)) - c * b.rv) * dt; b.r += b.rv * dt;
      if (!out && b.r < 0) { b.r = 0; b.rv = 0; }
      b.hot += ((open && hot === b.i ? 1 : 0) - b.hot) * Math.min(1, dt * 12);
      if (b.i === flying && b.r < CR * 0.6) {
        // the chosen one has arrived: its icon becomes the drop's
        flying = -1;
        center.set(bitmapCells(ICON[b.it.icon], 3.4 * K));
        drop.kick(-5); st.shock(0, 0); S.drip(0.7, 0.6);
      }
    }

    // the filament on the drop points at the hot bubble, like a compass
    const want = hot >= 0 ? bubbles[hot].a : theta;
    let dA = Math.atan2(Math.sin(want - theta), Math.cos(want - theta));
    theta += dA * Math.min(1, dt * 10);
    filOn += ((hot >= 0 || (open && !thumb) ? 1 : chosen >= 0 ? 0.55 : 0.3) - filOn) * Math.min(1, dt * 6);
    if (!open && hot < 0) theta += dt * 0.25; // idle: drifts slowly around the drop

    const L = hot >= 0 ? ITEMS[hot].rgb : chosen >= 0 ? ITEMS[chosen].rgb : BASE;
    if (!events.length) st.light = mix3(st.light, L, Math.min(1, dt * 8));

    const word = thumb ? '' : open ? (hot >= 0 ? ITEMS[hot].name : 'CHOOSE') : chosen >= 0 ? ITEMS[chosen].name : 'HOLD';
    if (word !== shownLabel) { label.set(word ? textCells(word, 3.4) : []); shownLabel = word; }
    label.step(dt, { ptr: st.local(label), shy: st.ptrOn * 0.5 });

    press += ((mode === 'hold' ? 1 : 0) - press) * Math.min(1, dt * 12);
    lift += ((st.ptrOn > 0.5 && !open ? 1 : 0) - lift) * Math.min(1, dt * 8);
    const dj = drop.step(dt) * 0.035;

    const bU = [], nU = [], cU = [];
    for (const b of bubbles) {
      const ext = clamp(b.r / ROUT, 0, 1.2);
      const j = b.jelly.step(dt) * 0.04;
      const rad = b.r < 2 ? 0 : BR * (0.3 + 0.7 * Math.min(1, ext)) * (1 + 0.2 * b.hot) * (1 + j);
      const x = Math.cos(b.a) * b.r, y = Math.sin(b.a) * b.r;
      bU.push(st.cx + x, st.cy + y, rad, b.hot);
      // a liquid neck: thick while the bubble is close, thinning as it reaches out; thicker when hot
      nU.push(BR * (0.16 + 0.3 * (1 - Math.min(1, ext))) * (1 + 0.6 * b.hot));
      cU.push(...b.it.rgb);
      b.m.ox = x; b.m.oy = y;
      b.m.step(dt, { ptr: st.local(b.m), shy: 0, vel: b.rv * 0.2 });
    }
    center.step(dt, { ptr: st.local(center), shy: st.ptrOn * 0.3 });

    st.drawPixels(ctx => {
      center.draw(ctx, 0.9);
      for (const b of bubbles) {
        const ext = clamp(b.r / ROUT, 0, 1);
        if (ext > 0.05) b.m.draw(ctx, Math.pow(ext, 2) * (0.6 + 0.4 * b.hot));
      }
      label.draw(ctx, open && hot >= 0 ? 1 : 0.6);
    });
    st.render(t, (U, gl) => {
      gl.uniform2f(U.uC0, st.cx, st.cy - lift * 1.5 + press * 1.5);
      gl.uniform1f(U.uCR, CR * (1 + dj) * (1 - press * 0.04));
      gl.uniform4fv(U.uB, bU);
      gl.uniform1fv(U.uNeck, nU);
      gl.uniform3fv(U.uBC, cU);
      gl.uniform3f(U.uL, ...L);
      gl.uniform1f(U.uTh, theta);
      gl.uniform1f(U.uFilOn, filOn);
      gl.uniform1f(U.uEnergy, 0.75 + lift * 0.1 + st.kick * 0.25);
      gl.uniform1f(U.uLift, lift);
      gl.uniform1f(U.uPress, press);
    });
  });

  return { dispose() { window.removeEventListener('keydown', onKey); st.dispose(); } };
}
