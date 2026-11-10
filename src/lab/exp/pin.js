// PIN — a four-digit code in glass cells, seen from above, with a keypad of glass buttons.
// Each digit swirls into its cell as pixels and, a moment later, folds into a dot like a real PIN.
// The toggle's filament circles the cell that comes next. A wrong code: the cells shake one after
// another like rubber, glow red and the pixels scatter. The right code (2580): the four cells flow
// together into one glass strip that says UNLOCKED, with a chord and a shockwave.

import { glassStage, PixelMatrix, Spring, textCells, bitmapCells, hexRgb, mix3 } from '../glass/engine.js';
import { domeLens } from '../glass/lib.glsl.js';
import { clamp } from '../kit.js';

const CODE = '2580';
const IDLE = hexRgb('#9b8cff'), RED = hexRgb('#ff4d5e'), OK = hexRgb('#3dffa8');
const DOT = ['.##.', '####', '####', '.##.'];
const BACK = ['..#....', '.#.....', '#######', '.#.....', '..#....'];
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'back'];

const FRAG = /* glsl */ `
uniform vec4  uCell[4];        // x, y (abs), half width, half height
uniform float uK;              // smooth union while merging
uniform vec2  uTrayC, uTray;   // tray centre (abs) and half size
uniform vec4  uKey[11];        // x, y (abs), radius, press
uniform int   uKeyN;
uniform vec3  uL;
uniform float uErr, uMerge, uEnergy, uCaretOn, uHead, uHalfLen;
uniform vec2  uCaretC, uCaretH;

float sdCells(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < 4; i++) {
    float e = sdRoundBox(p - uCell[i].xy, uCell[i].zw, 11.0);
    d = uK > 0.01 ? smin(d, e, uK) : min(d, e);
  }
  return d;
}
float sdKeys(vec2 p, out int idx) {
  float d = 1e5; idx = 0;
  for (int i = 0; i < 11; i++) {
    if (i >= uKeyN) break;
    float e = length(p - uKey[i].xy) - uKey[i].z;
    if (e < d) { d = e; idx = i; }
  }
  return d;
}
// Arc-length position (px, clockwise from the top centre) of the boundary point of a rounded box
// nearest to q; L returns the perimeter. Lets the light travel at an even speed with an even length
// around any box, a single cell or the whole strip.
float perimS(vec2 q, vec2 hs, float r, out float L) {
  vec2 b = hs - r;
  const float HP = 1.5707963;
  float O1 = b.x, O2 = O1 + HP * r, O3 = O2 + 2.0 * b.y, O4 = O3 + HP * r;
  float O5 = O4 + 2.0 * b.x, O6 = O5 + HP * r, O7 = O6 + 2.0 * b.y, O8 = O7 + HP * r;
  L = O8 + b.x;
  vec2 cq = clamp(q, -b, b);
  vec2 d = q - cq;
  bool ex = abs(cq.x) >= b.x - 1e-3, ey = abs(cq.y) >= b.y - 1e-3;
  if (dot(d, d) < 1e-6) {                       // inside the inner rectangle: project onto the nearest side
    if (b.y - abs(q.y) < b.x - abs(q.x)) { ey = true; ex = false; cq.y = sign(q.y) * b.y; }
    else { ex = true; ey = false; cq.x = sign(q.x) * b.x; }
    d = vec2(ex ? sign(q.x) : 0.0, ey ? sign(q.y) : 0.0);
  }
  float a = atan(d.y, d.x);                     // design space is y-down: the top is -pi/2
  // the quadrant comes from the outward direction d (a capsule has no straight sides, so cq alone can't tell)
  if (ex && ey) {
    if (d.x > 0.0 && d.y < 0.0) return O1 + r * (a + HP);
    if (d.x > 0.0) return O3 + r * a;
    if (d.y > 0.0) return O5 + r * (a - HP);
    return O7 + r * (a < 0.0 ? a + 2.0 * HP : a - 2.0 * HP);
  }
  if (ey) return d.y < 0.0 ? (cq.x >= 0.0 ? cq.x : L + cq.x) : O4 + (b.x - cq.x);
  return d.x > 0.0 ? O2 + (cq.y + b.y) : O6 + (b.y - cq.y);
}
// the toggle's filament, 6.5px outside the box, as a strip of length 2 * uHalfLen around uHead
float caret(vec2 p) {
  vec2 q = p - uCaretC;
  float sd = sdRoundBox(q, uCaretH, 11.0);
  float L;
  float s = perimS(q, uCaretH, 11.0, L);
  float ds = abs(s - uHead * L); ds = min(ds, L - ds);
  float hl = max(uHalfLen, 0.5);
  float tang = max(ds - hl, 0.0);
  float w = (1.8 - 0.9 * smoothstep(0.0, hl, ds)) * smoothstep(0.0, 6.0, uHalfLen + 2.0);
  return length(vec2(sd - 6.5, tang)) - w;
}

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  // the tray under the cells
  float sdT = sdRoundBox(q - uTrayC, uTray, 20.0);
  col = shadowed(col, sdRoundBox(q - uTrayC - vec2(0.0, 12.0), uTray, 20.0), sdRoundBox(q - uTrayC - vec2(0.0, 1.5), uTray, 20.0), 0.0);
  // the keys' shadows on the page
  if (uKeyN > 0) {
    int k;
    float ks = sdKeys(q - vec2(0.0, 6.0), k);
    col *= 1.0 - (1.0 - smoothstep(-6.0, 14.0, ks)) * mix(0.45, 0.16, uTheme);
  }
  float cf = caret(q);
  col = emitC(col, uL, filamentSpill(cf) * 0.45 * uCaretOn * uEnergy);
  if (sdT < 2.0) {
    vec3 tc = tray(col, sdT, sdRoundBox(q - uTrayC - vec2(0.0, 7.0), uTray, 20.0), q, uTrayC, uTray);
    tc = emitC(tc, uL, filamentWash(cf) * 0.4 * uCaretOn * uEnergy);
    float cs = sdCells(q - vec2(0.0, 7.0));
    tc *= 1.0 - (1.0 - smoothstep(-6.0, 12.0, cs)) * mix(0.45, 0.15, uTheme);
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdT));
  }
  // red after a wrong code, green when it opens: the light bleeds out of the cells
  float sc = sdCells(q);
  col = emitC(col, uL, (exp(-max(sc, 0.0) / 10.0) * 0.5 + exp(-max(sc, 0.0) / 40.0) * 0.25) * (uErr + uMerge * 0.7) * uEnergy);
  float cover;
  return ink(col, q, frost, vec2(0.0), 0.0, uL, cover);
}

${domeLens('keyDome', 'scene')}

// the cells: thick glass with per-channel refraction, one body that can flow into a strip
vec3 cellGlass(vec2 p, vec2 sp, float sd) {
  vec2 e = vec2(0.5, 0.0);
  vec2 n = normalize(vec2(sdCells(p + e.xy) - sdCells(p - e.xy), sdCells(p + e.yx) - sdCells(p - e.yx)) + 1e-5);
  float depth = max(-sd, 0.0);
  float u = clamp(depth / 14.0, 0.0, 1.0);
  float hgt = sqrt(max(1.0 - (1.0 - u) * (1.0 - u), 0.0));
  vec3 n3 = normalize(vec3(n.x * (1.0 - u), -n.y * (1.0 - u), hgt + 0.03));
  vec3 V = vec3(0.0, 0.0, -1.0);
  float thick = 6.0 + 12.0 * hgt;
  // no refraction in the outermost rim: there it focuses one bright spot nearby (the string, the tray's lit
  // lip) into a dot that reads like a stray pixel; the rim keeps its reflections and edge light
  thick *= smoothstep(0.0, 0.35, u);
  vec3 tR = refract(V, n3, 1.0 / 1.44), tG = refract(V, n3, 1.0 / 1.5), tB = refract(V, n3, 1.0 / 1.57);
  vec2 oR = vec2(tR.x, -tR.y) / max(-tR.z, 0.3) * thick;
  vec2 oG = vec2(tG.x, -tG.y) / max(-tG.z, 0.3) * thick;
  vec2 oB = vec2(tB.x, -tB.y) / max(-tB.z, 0.3) * thick;
  // the tight rim focuses single pixels into bright ghost dots: let it scatter them instead
  float frost = 0.04 + 0.85 * pow(1.0 - u, 3.0);
  vec3 kc = vec3(scene(p + oR, sp + oR * uScale, frost).r, scene(p + oG, sp + oG * uScale, frost).g, scene(p + oB, sp + oB * uScale, frost).b);
  kc = mix(kc, kc * 0.86 + vec3(0.1), 1.0 - uTheme);
  kc = emitC(kc, uL, (filamentScatter(caret(p)) * 0.7 * uCaretOn + (uErr + uMerge * 0.6) * (0.25 + 0.5 * (1.0 - u))) * uEnergy);
  vec3 Rv = reflect(V, n3);
  float fres = 0.04 + 0.96 * pow(1.0 - n3.z, 5.0);
  vec3 env = mix(vec3(0.06), vec3(0.55), smoothstep(-0.7, 0.9, Rv.y));
  env = mix(env, vec3(0.97), uTheme * 0.5);
  kc = mix(kc, env, clamp(fres, 0.0, 0.65));
  kc += smoothstep(0.06, 0.0, u) * mix(0.3, 0.4, uTheme);
  // the key light only leans a little toward the pointer: it usually rests on the keypad below, and a
  // light from below would draw a hard line along the cells' flat bottom edges
  vec2 tp = clamp((uPtr - uTrayC) / vec2(160.0, 60.0), vec2(-1.0, -1.0), vec2(1.0, 0.0));
  vec3 Ld = normalize(mix(vec3(-0.4, 0.65, 0.62), vec3(tp.x, -tp.y + 0.4, 0.8), uPtrOn * 0.35));
  float s1 = max(dot(Rv, Ld), 0.0);
  kc += pow(s1, 10.0) * mix(0.1, 0.14, uTheme) * smoothstep(0.2, 0.6, u); // a soft sheen only: a sharp glint shrank to a dot
  if (uSweep < 1.2) {
    float s = dot(p - uTrayC, normalize(vec2(1.0, -0.75)));
    float pos = mix(-uTray.x - 40.0, uTray.x + 40.0, clamp(uSweep / 0.8, 0.0, 1.0));
    kc += exp(-pow((s - pos) / 11.0, 2.0)) * 0.3 * (1.0 - uSweep / 1.2) * hgt;
  }
  return kc;
}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);
  if (uKeyN > 0) {
    int k;
    float sk = sdKeys(p, k);
    if (sk < 2.0) {
      vec4 key = uKey[k];
      vec3 kc = keyDome(p, sp, key.xy, vec2(key.z), 0.06, 0.9, vec4(0.0), uL, 0.06 + key.w * 0.9);
      col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
    }
  }
  float sc = sdCells(p);
  if (sc < 2.0) col = mix(cellGlass(p, sp, sc), col, smoothstep(-0.7, 0.7, sc));
  col = drawFilament(col, caret(p), uL, uEnergy * uCaretOn);
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const CELL = thumb ? [22, 28] : [25, 31];
  const GAP = thumb ? 58 : 66;
  const CY = thumb ? 0 : -150;                        // cells row y
  const TRAY = [1.5 * GAP + CELL[0] + 14, CELL[1] + 12];
  const KR = 26, KX = 76, KY = 66, K0 = -36;
  const keyPos = KEYS.map((k, i) => (i < 9 ? [((i % 3) - 1) * KX, K0 + Math.floor(i / 3) * KY] : i === 9 ? [0, K0 + 3 * KY] : [KX, K0 + 3 * KY]));
  const cellX = i => (i - 1.5) * GAP;
  const st = glassStage(root, { frag: FRAG, box: thumb ? [TRAY[0] * 2 + 60, TRAY[1] * 2 + 70] : [360, 470], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => st.buzz(pat);

  // ---------------------------------------------------------------- state
  let entered = '', busy = false, err = 0, merge = 0, mergeT = 0, caretX = cellX(0), head1 = 0, headS = 0, on1 = 1;
  const cells = [0, 1, 2, 3].map(i => {
    const m = new PixelMatrix({ size: 3.6, swirl: 12, shyR: 12, shyF: 4 });
    m.ox = cellX(i); m.oy = CY;
    return { m, shake: new Spring(300, 7), jelly: new Spring(380, 10) };
  });
  const strip = new PixelMatrix({ size: 3.2, swirl: 12, shyR: 16, shyF: 6 });
  strip.oy = CY;
  const keys = thumb ? [] : KEYS.map((k, i) => {
    const m = new PixelMatrix({ size: 2.8, swirl: 6, shyR: 10, shyF: 3 });
    m.ox = keyPos[i][0]; m.oy = keyPos[i][1];
    m.set(k === 'back' ? bitmapCells(BACK, 2.6) : textCells(k, 3), { instant: true });
    return { k, m, press: 0, jelly: new Spring(420, 12) };
  });
  const events = [];
  let clock = 0;
  const later = (dt, fn) => events.push({ t: clock + dt, fn });

  const pressKey = k => { const key = keys.find(x => x.k === k); if (key) { key.press = 1; key.jelly.kick(-3); } };
  const type = d => {
    pressKey(d);
    if (busy || entered.length >= 4) { S.tick(0.2, 0.3); return; }
    const i = entered.length;
    entered += d;
    const c = cells[i];
    c.m.set(textCells(d, 4.2));
    c.jelly.kick(-3.5); st.pulse(0.2);
    S.tick(0.5 + i * 0.08, 0.6); buzz(5);
    // a moment later the digit folds into a dot, like a real PIN
    const now = entered;
    later(0.65, () => { if (entered.startsWith(now) && !busy) c.m.set(bitmapCells(DOT, 3.4)); });
    if (entered.length === 4) { busy = true; later(0.35, check); }
  };
  const back = () => {
    pressKey('back');
    if (busy || !entered.length) return;
    const i = entered.length - 1;
    entered = entered.slice(0, -1);
    cells[i].m.set([]); cells[i].jelly.kick(2);
    S.tick(0.3, 0.45);
  };
  const check = () => (entered === CODE ? unlock() : wrong());
  const wrong = () => {
    err = 1;
    st.light = RED;
    cells.forEach((c, i) => later(i * 0.04, () => { c.shake.kick((i % 2 ? -1 : 1) * 70); c.jelly.kick(-3); }));
    later(0.2, () => cells.forEach(c => c.m.set([])));
    S.tick(0.14, 1); later(0.13, () => S.tick(0.1, 1));
    buzz([30, 40, 30]); st.pulse(0.6);
    later(0.55, () => { entered = ''; busy = false; });
  };
  const unlock = () => {
    mergeT = 1; headS = 0; // the strip's light is born at the top centre
    cells.forEach(c => c.m.set([]));
    st.light = OK;
    later(0.22, () => { strip.set(textCells(thumb ? 'OK' : 'UNLOCKED', thumb ? 4 : 3.6)); st.shock(0, CY); st.burst(0, CY, 22, 1); st.glint(); st.pulse(1); });
    S.ping(true); [0.45, 0.6, 0.75, 0.9].forEach((p, i) => later(0.15 + i * 0.07, () => S.key(p)));
    buzz([10, 40, 20]);
    later(thumb ? 1.5 : 2.8, () => {
      mergeT = 0; strip.set([]); entered = '';
      cells.forEach(c => c.jelly.kick(3));
      S.drip(0.5, 0.5);
      later(0.4, () => { busy = false; });
    });
  };

  // ---------------------------------------------------------------- input
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const keyAt = ([x, y]) => keys.findIndex((k, i) => Math.hypot(x - keyPos[i][0], y - keyPos[i][1]) < KR + 4);
  st.bindPointer({
    down: (p, e, d) => {
      const i = keyAt(local(d));
      if (i < 0) return;
      S._ensure();
      const k = KEYS[i];
      if (k === 'back') back(); else type(k);
    },
    move: (p, e, d) => { st.canvas.style.cursor = keyAt(local(d)) >= 0 ? 'pointer' : 'default'; },
  });
  const onKey = e => {
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); S._ensure(); type(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); back(); }
  };
  if (!thumb) window.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- autopilot (shelf miniature)
  let demoT = 0, demoI = 0;

  st.run((dt, t) => {
    clock += dt;
    for (let k = events.length - 1; k >= 0; k--) if (events[k].t <= clock) { const ev = events[k]; events.splice(k, 1); ev.fn(); }
    if (demo && !busy) { demoT += dt; if (demoT > 0.32) { demoT = 0; type(CODE[demoI % 4]); demoI++; } }

    err *= Math.exp(-dt * 2.2);
    merge += (mergeT - merge) * Math.min(1, dt * 7);
    const L = mix3(mix3(IDLE, RED, Math.min(1, err * 1.2)), OK, merge);
    if (!events.length) st.light = L;

    // the caret: the toggle's filament circles the cell that comes next
    const n = entered.length;
    // single cell: circles the cell that comes next. After the right code it fades, and a new light is
    // born as a point at the top centre of the strip and grows with the merge while it runs around it.
    const perim = (hx, hy, r) => 4 * (hx - r + hy - r) + 2 * Math.PI * r;
    const speed = reducedMotion ? 60 : 150;
    on1 += ((!busy && n < 4 && merge < 0.02 ? 1 : 0) - on1) * Math.min(1, dt * 8);
    caretX += (cellX(Math.min(n, 3)) - caretX) * Math.min(1, dt * 12);
    head1 = (head1 + dt * speed / perim(CELL[0], CELL[1], 11)) % 1;
    const stripW = 1.5 * GAP + GAP / 2 + 1.5, stripH = CELL[1] * 0.94;
    headS = (headS + dt * speed * 1.4 / perim(stripW, stripH, 11)) % 1;
    const grow = merge * merge * (3 - 2 * merge);
    const stripMode = merge > 0.02;
    const caretOn = stripMode ? 1 : on1;

    const cellU = [];
    cells.forEach((c, i) => {
      const sx = c.shake.step(dt) * 2.2;
      const j = c.jelly.step(dt) * 0.03;
      const hw = CELL[0] + merge * (GAP / 2 - CELL[0] + 1.5);
      const x = cellX(i) + sx * (1 - merge);
      cellU.push(st.cx + x, st.cy + CY, hw * (1 + j), CELL[1] * (1 - j) * (1 - merge * 0.06));
      c.m.ox = x;
      c.m.step(dt, { ptr: st.local(c.m), shy: st.ptrOn * 0.4, vel: c.shake.v * 0.3 });
    });
    strip.step(dt, { ptr: st.local(strip), shy: st.ptrOn * 0.5 });
    const keyU = [];
    keys.forEach((k, i) => {
      k.press *= Math.exp(-dt * 6);
      const j = k.jelly.step(dt) * 0.03;
      keyU.push(st.cx + keyPos[i][0], st.cy + keyPos[i][1], KR * (1 + j) * (1 - k.press * 0.05), k.press);
      k.m.step(dt, { ptr: st.local(k.m), shy: st.ptrOn * 0.6 });
    });

    st.drawPixels(ctx => {
      cells.forEach(c => c.m.draw(ctx, 1));
      strip.draw(ctx, 1);
      keys.forEach(k => k.m.draw(ctx, 0.85 + k.press * 0.15));
    });
    st.render(t, (U, gl) => {
      gl.uniform4fv(U.uCell, cellU);
      gl.uniform1f(U.uK, merge * 16);
      gl.uniform2f(U.uTrayC, st.cx, st.cy + CY);
      gl.uniform2f(U.uTray, TRAY[0], TRAY[1]);
      if (keys.length) gl.uniform4fv(U.uKey, keyU);
      gl.uniform1i(U.uKeyN, keys.length);
      gl.uniform3f(U.uL, ...L);
      gl.uniform1f(U.uErr, err);
      gl.uniform1f(U.uMerge, merge);
      gl.uniform1f(U.uEnergy, 0.75 + st.kick * 0.25);
      gl.uniform1f(U.uCaretOn, caretOn);
      if (stripMode) {
        gl.uniform2f(U.uCaretC, st.cx, st.cy + CY);
        gl.uniform2f(U.uCaretH, stripW, stripH);
        gl.uniform1f(U.uHead, headS);
        gl.uniform1f(U.uHalfLen, 70 * grow);
      } else {
        gl.uniform2f(U.uCaretC, st.cx + caretX, st.cy + CY);
        gl.uniform2f(U.uCaretH, CELL[0], CELL[1]);
        gl.uniform1f(U.uHead, head1);
        gl.uniform1f(U.uHalfLen, 24 * on1);
      }
    });
  });

  return { dispose() { window.removeEventListener('keydown', onKey); st.dispose(); } };
}
