// CHIPS — filter chips that work like a sieve. Seen from above.
// Six glass capsules lie in a ring round a collecting lens, each joined to it by a channel engraved in
// the page. Under the lens lies everything there is to find: a swarm of pixels, one per item. Tap a
// chip: liquid light floods the capsule from its middle, a thread of that light runs down the channel
// into the lens, the lens gulps, and the pixels that do not match drain away while the rest close
// ranks. The lens takes on the mixed colour of every chip that is on, its filament shrinks with the
// share of items left, and the count below ticks. Each chip is a note, so a selection is a chord.
// Drag across chips to switch several in one stroke; tap the lens to let everything go.

import { glassStage, PixelMatrix, Spring, textCells, hexRgb, mix3 } from '../glass/engine.js';
import { domeLens, thickGlass } from '../glass/lib.glsl.js';
import { clamp } from '../kit.js';

const TAGS = [
  { name: 'NEW', color: '#a98bff', p: 0.32, note: 1.0 },
  { name: 'QUICK', color: '#5cd2ff', p: 0.55, note: 0.84 },
  { name: 'SPICY', color: '#ff6a4d', p: 0.38, note: 0.66 },
  { name: 'SWEET', color: '#ff6fb5', p: 0.42, note: 0.5 },
  { name: 'CHEAP', color: '#ffc94d', p: 0.6, note: 0.34 },
  { name: 'VEGAN', color: '#4dff9a', p: 0.5, note: 0.2 },
].map(t => ({ ...t, rgb: hexRgb(t.color) }));
const NC = TAGS.length, TOTAL = 48;
const NEUTRAL = hexRgb('#cdd5ff'), EMPTY = hexRgb('#ff5a5a');
// the items: a fixed little catalogue (seeded, so the counts are the same on every visit)
const ITEMS = (() => { let s = 20261112; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); return Array.from({ length: TOTAL }, () => TAGS.map(t => rnd() < t.p)); })();

const FRAG = /* glsl */ `
#define NC ${NC}
uniform vec4  uChip[NC];       // centre (abs), half width, half height
uniform vec4  uChipS[NC];      // fill, lift, thread (0 chip … 1 lens), press
uniform vec3  uCol[NC];
uniform vec3  uLens;           // centre (abs), resting radius
uniform vec2  uLR;             // its radii right now (it gulps)
uniform vec3  uL;              // the mixed light in the lens
uniform float uMixA, uEnergy, uFrac, uLensLift;

float sdLens(vec2 p) { return sdEllipse(p, uLens.xy, uLR); }
float fil(vec2 p) { return filament(p, uLens.xy, sdLens(p), -1.5707963, 0.1 + uFrac * 3.05); }
float sdChip(vec2 p, vec4 c) { return sdRoundBox(p - c.xy, c.zw, c.w); }

vec3 scene(vec2 q, vec2 sp, float frost, out float cover) {
  vec3 col = pageBg(sp);
  float wash = 0.0; vec3 inkL = uL;
  // the dish the lens lies in
  float RD = uLens.z + 10.0;
  float sdD = length(q - uLens.xy) - RD;
  col = shadowed(col, length(q - uLens.xy - vec2(0.0, 11.0)) - RD, length(q - uLens.xy - vec2(0.0, 1.5)) - RD, 0.0);
  float f = fil(q);
  col = emitC(col, uL, filamentSpill(f) * 0.45 * uEnergy);
  if (sdD < 2.0) {
    vec3 tc = tray(col, sdD, length(q - uLens.xy - vec2(0.0, 6.0)) - RD, q, uLens.xy, vec2(RD));
    tc = emitC(tc, uL, filamentWash(f) * 0.35 * uEnergy);
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdD));
  }
  for (int i = 0; i < NC; i++) {
    vec4 c = uChip[i], s = uChipS[i];
    // a channel engraved from the chip to the dish, and the thread of light that runs in it
    vec2 ab = uLens.xy - c.xy; float len = length(ab); vec2 d = ab / len;
    float h = dot(q - c.xy, d), off = abs(dot(q - c.xy, vec2(-d.y, d.x)));
    float inSeg = step(0.0, h) * step(h, len);
    if (inSeg > 0.5 && off < 60.0) {
      float chan = (1.0 - smoothstep(1.1, 2.2, off));
      col *= 1.0 - chan * mix(0.55, 0.17, uTheme);
      col += (1.0 - smoothstep(0.0, 0.9, abs(off - 2.5))) * mix(0.03, 0.06, uTheme);
      if (s.z > 0.001) {
        float lit = step(h, s.z * len);
        float flow = 0.72 + 0.28 * sin(h * 0.4 - uTime * 10.0);
        float core = 1.0 - smoothstep(0.4, 1.4, off);
        col = emitC(col, uCol[i], (core * 1.1 + exp(-off / 5.0) * 0.42 + exp(-off / 20.0) * 0.12) * lit * flow * uEnergy);
        // the bright head while it is still travelling
        col = emitC(col, mix(uCol[i], vec3(1.0), 0.6), exp(-length(vec2(h - s.z * len, off)) / 4.5) * step(s.z, 0.995) * 1.1);
      }
    }
    // the chip's shallow well, lit along its lower lip when the chip is on
    vec2 wh = c.zw + 5.0;
    float sw = sdRoundBox(q - c.xy, wh, wh.y);
    if (sw < 46.0) {
      col = shadowed(col, sdRoundBox(q - c.xy - vec2(0.0, 7.0), wh, wh.y), sdRoundBox(q - c.xy - vec2(0.0, 1.2), wh, wh.y), 0.0);
      if (sw < 2.0) {
        vec3 tc = tray(col, sw, sdRoundBox(q - c.xy - vec2(0.0, 4.5), wh, wh.y), q, c.xy, wh);
        tc = emitC(tc, uCol[i], exp(-abs(sw + 1.5) / 1.4) * smoothstep(-wh.y * 0.3, wh.y, q.y - c.y) * (0.1 + 0.7 * s.x) * uEnergy);
        col = mix(tc, col, smoothstep(-0.6, 0.6, sw));
      }
      // the capsule's shadow: longer when it rises (on, or under the pointer), tight when pressed
      float cs = sdRoundBox(q - c.xy - vec2(0.0, 4.0 + s.y * 6.0 - s.w * 3.0), c.zw, c.w);
      col *= 1.0 - (1.0 - smoothstep(-5.0, 11.0 + s.y * 8.0, cs)) * mix(0.5, 0.17, uTheme);
    }
    float sc = sdChip(q, c);
    col = emitC(col, uCol[i], (exp(-max(sc, 0.0) / 14.0) * 0.3 + exp(-max(sc, 0.0) / 50.0) * 0.1) * s.x * uEnergy);
    if (sc < 0.0) {
      // liquid light floods the capsule from its middle to both ends. It lies under the label, so the
      // word turns dark on bright and stays razor sharp instead of drowning in the glow
      float rx = abs(q.x - c.x) / c.z, lv = s.x * 1.25;
      float fl = smoothstep(lv, lv - 0.22, rx) * smoothstep(0.0, 0.03, s.x);
      col = emitC(col, mix(uCol[i], vec3(1.0), 0.12), fl * 1.0);
      inkL = uCol[i];
    }
  }
  // the lens's shadow in its dish
  float ls = sdEllipse(q - vec2(0.0, 8.0 + uLensLift * 5.0), uLens.xy, uLR);
  col *= 1.0 - (1.0 - smoothstep(-8.0, 20.0 + uLensLift * 8.0, ls)) * mix(0.5, 0.18, uTheme);
  return ink(col, q, frost, vec2(0.0), wash, inkL, cover);
}
vec3 sceneD(vec2 q, vec2 sp, float frost) { float cv; return scene(q, sp, frost, cv); }

${thickGlass('thick', 'scene')}
${domeLens('dome', 'sceneD')}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  float cover;
  vec3 col = scene(p, sp, 0.0, cover);
  vec2 e = vec2(0.5, 0.0);
  for (int i = 0; i < NC; i++) {
    vec4 c = uChip[i], s = uChipS[i];
    c.y -= s.y * 1.6 - s.w * 1.6;
    float sd = sdChip(p, c);
    if (sd < 2.0) {
      vec2 n = normalize(vec2(sdChip(p + e.xy, c) - sdChip(p - e.xy, c), sdChip(p + e.yx, c) - sdChip(p - e.yx, c)) + 1e-5);
      float depth = max(-sd, 0.0);
      vec3 kc = thick(p, sp, n, depth, c.xy, c.zw, 9.0, 8.0, 0.08, 0.04 + s.x * 0.16, uCol[i]);
      // the bright front of the flood while it spreads
      float rx = abs(p.x - c.x) / c.z, lv = s.x * 1.25;
      kc = emitC(kc, mix(uCol[i], vec3(1.0), 0.55), exp(-pow((rx - lv + 0.1) / 0.07, 2.0)) * 0.3 * s.x * (1.0 - min(s.x, 1.0)) * 4.0);
      // a long streak of gloss along the top of the capsule (no sharp glint on a body this flat)
      kc += exp(-pow((p.y - c.y + c.w * 0.45) / 2.6, 2.0)) * smoothstep(c.z - 6.0, c.z - 22.0, abs(p.x - c.x)) * mix(0.1, 0.14, uTheme);
      col = mix(kc, col, smoothstep(-0.7, 0.7, sd));
    }
  }
  float sk = sdLens(p);
  if (sk < 2.0) {
    vec3 kc = dome(p, sp, uLens.xy, uLR, 0.07, 1.0, vec4(uL, uMixA), uL, filamentScatter(fil(p)) * uEnergy * 0.8 + 0.1 + uMixA * 0.3);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }
  col = drawFilament(col, fil(p), uL, uEnergy * (1.0 + uKick * 0.5));
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const LR = 44, HH = 17, PITCH = 3.2;
  const RX = thumb ? 104 : 130, RY = thumb ? 104 : 112, COUNT_Y = RY + HH + 44;
  const st = glassStage(root, { frag: FRAG, box: [thumb ? 300 : 372, thumb ? 300 : COUNT_Y * 2 + 64], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => st.buzz(pat);

  // ---------------------------------------------------------------- the chips, in a ring round the lens
  const chips = TAGS.map((tag, i) => {
    const a = -Math.PI / 2 + (i / NC) * Math.PI * 2;
    const hw = thumb ? 26 : Math.max(31, ((tag.name.length * 4 - 1) * PITCH) / 2 + 15);
    const m = new PixelMatrix({ size: 2.8, swirl: 6, shyR: 12, shyF: 3 });
    m.ox = Math.cos(a) * RX; m.oy = Math.sin(a) * RY;
    if (!thumb) m.set(textCells(tag.name, PITCH), { instant: true });
    return { tag, i, x: m.ox, y: m.oy, hw, m, on: false, fill: 0, fillV: 0, lift: 0, press: 0, thread: 0, jelly: new Spring(400, 11) };
  });
  // ---------------------------------------------------------------- the items under the lens
  const dots = new PixelMatrix({ size: 3.0, swirl: 16, shyR: 0, shyF: 0 });
  const SPREAD = 30 / Math.sqrt(TOTAL);
  const cloud = n => Array.from({ length: n }, (_, k) => { const r = SPREAD * Math.sqrt(k + 0.5), a = k * 2.399963; return { x: Math.cos(a) * r, y: Math.sin(a) * r, b: 1 }; });
  const setDots = (n, instant) => { dots.set(cloud(n), { instant }); dots.pitch = 99; }; // a cloud has no grid: keep the dots at full size
  const matches = () => ITEMS.reduce((n, it) => n + (chips.every(c => !c.on || it[c.i]) ? 1 : 0), 0);
  const label = new PixelMatrix({ size: 2.8, swirl: 8, shyR: 16, shyF: 5 });
  label.oy = COUNT_Y;
  let count = TOTAL, shownLabel = '';
  const say = () => { if (thumb) return; const s = count ? `${count} OF ${TOTAL}` : 'NOTHING'; if (s === shownLabel) return; const num = /^\d/.test(s) && /^\d/.test(shownLabel); shownLabel = s; label.set(textCells(s, 3.4), { instant: num }); };
  setDots(TOTAL, true); say();

  const lensJ = new Spring(340, 9), shake = new Spring(300, 8);
  let lensLift = 0, mixA = 0, frac = 1, light = [...NEUTRAL];
  const events = [];
  let clock = 0;
  const later = (dt, fn) => events.push({ t: clock + dt, fn });

  // the lens takes in what the chips send: recount, let the pixels regroup, answer
  const recount = () => {
    const n = matches();
    if (n === count) return;
    const fewer = n < count;
    count = n; setDots(n, false); say();
    lensJ.kick(fewer ? 4.5 : -3.5); st.pulse(0.6);
    if (n === 0) { shake.kick(90); S.tick(0.12, 0.9); buzz([30, 40, 30]); } // nothing left: it shakes its head
  };
  const setChip = (c, on, quiet) => {
    if (c.on === on) return;
    c.on = on;
    if (on) {
      c.jelly.kick(-5.5);
      st.burst(c.x, c.y, 9, 0.55); st.fxLight = [...c.tag.rgb];
      if (!quiet) { S.key(c.tag.note); buzz(8); }
    } else {
      c.jelly.kick(3); if (!quiet) { S.drip(0.3 + c.tag.note * 0.4, 0.55); buzz(5); }
      recount(); // the light is cut at once; the thread drains back to the chip
    }
  };
  const clearAll = () => {
    const on = chips.filter(c => c.on);
    if (!on.length) { lensJ.kick(-2); S.tick(0.4, 0.4); return; }
    on.forEach((c, k) => later(k * 0.07, () => { setChip(c, false, true); S.key(0.9 - k * 0.14); }));
    lensJ.kick(-6); st.glint(); buzz([8, 30, 8]);
  };

  // ---------------------------------------------------------------- input
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const chipAt = ([x, y]) => chips.find(c => Math.abs(x - c.x) < c.hw + 5 && Math.abs(y - c.y) < HH + 7);
  const onLens = ([x, y]) => Math.hypot(x, y) < LR + 6;
  let paint = null, lensDown = false;
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d), c = chipAt(q);
      if (c) { S._ensure(); paint = { on: !c.on, last: c }; c.press = 1; setChip(c, paint.on); }
      else if (onLens(q)) { S._ensure(); lensDown = true; lensJ.kick(2.5); }
    },
    move: (p, e, d) => {
      const q = local(d), c = chipAt(q);
      st.canvas.style.cursor = c || onLens(q) ? 'pointer' : 'default';
      // dragging on paints: every chip you cross takes the state of the first
      if (paint && c && c !== paint.last) { paint.last = c; c.press = 1; setChip(c, paint.on); }
    },
    up: (p, e, d) => { paint = null; if (lensDown) { lensDown = false; if (onLens(local(d))) clearAll(); } },
  });
  const onKey = e => {
    const k = '123456'.indexOf(e.key);
    if (k >= 0) { const c = chips[k]; c.press = 1; setChip(c, !c.on); }
    else if (e.key === '0' || e.key === 'Backspace' || e.key === 'Escape' && chips.some(c => c.on)) { e.preventDefault(); clearAll(); }
  };
  if (!thumb) window.addEventListener('keydown', onKey);

  let demoT = 0, demoK = 0;
  st.run((dt, t) => {
    clock += dt;
    for (let k = events.length - 1; k >= 0; k--) if (events[k].t <= clock) { const ev = events[k]; events.splice(k, 1); ev.fn(); }
    if (demo) { demoT += dt; if (demoT > 0.75) { demoT = 0; const c = chips[[1, 4, 2, 1, 5, 4, 2, 5][demoK++ % 8]]; setChip(c, !c.on); } }

    const hover = st.ptrOn > 0.5 && !paint ? chipAt(local(st.dp)) : null;
    const onCols = [];
    for (const c of chips) {
      // liquid light: a spring with a little overshoot
      const k = 95, cc = 2 * Math.sqrt(k) * 0.62;
      c.fillV += (-k * (c.fill - (c.on ? 1 : 0)) - cc * c.fillV) * dt; c.fill = clamp(c.fill + c.fillV * dt, 0, 1.12);
      c.lift += ((c.on ? 0.55 : 0) + (c === hover ? 0.45 : 0) - c.lift) * Math.min(1, dt * 9);
      c.press *= Math.exp(-dt * 7);
      // the thread runs to the lens when the chip goes on (and the lens answers when it arrives)
      const before = c.thread;
      c.thread = clamp(c.thread + (c.on ? dt / 0.24 : -dt / 0.18), 0, 1);
      if (c.on && before < 1 && c.thread >= 1) { recount(); S.tick(0.55 + c.tag.note * 0.4, 0.4); }
      c.m.step(dt, { ptr: st.local(c.m), shy: st.ptrOn * 0.4 });
      if (c.on) onCols.push(c.tag.rgb);
    }
    // the lens: the average of every colour that reaches it; red and dim when nothing is left
    const reached = chips.filter(c => c.thread >= 1).map(c => c.tag.rgb);
    const target = count === 0 ? EMPTY : reached.length ? reached.reduce((a, c) => a.map((v, k) => v + c[k] / reached.length), [0, 0, 0]) : NEUTRAL;
    light = mix3(light, target, Math.min(1, dt * 7));
    st.light = light;
    mixA += ((reached.length ? 0.34 : 0) - mixA) * Math.min(1, dt * 6);
    frac += (count / TOTAL - frac) * Math.min(1, dt * 7);
    lensLift += ((st.ptrOn > 0.5 && onLens(local(st.dp)) && !lensDown ? 1 : 0) - lensLift) * Math.min(1, dt * 8);
    const lj = lensJ.step(dt) * 0.03 * (reducedMotion ? 0.3 : 1), sx = shake.step(dt) * 0.12 * (reducedMotion ? 0 : 1);

    dots.ox = sx; dots.step(dt);
    label.step(dt, { ptr: st.local(label), shy: st.ptrOn * 0.5 });
    st.drawPixels(ctx => {
      const off = 0.55 + 0.3 * (window.glassTheme ?? 0); // dark ink on a light page needs more weight to read
      for (const c of chips) c.m.draw(ctx, off + (1 - off) * clamp(c.fill, 0, 1));
      dots.draw(ctx, 0.95);
      label.draw(ctx, 0.85);
    });

    st.render(t, (U, gl) => {
      const X = st.cx, Y = st.cy, cu = [], cs = [], cc = [];
      for (const c of chips) {
        const j = c.jelly.step(dt) * 0.03 * (reducedMotion ? 0.3 : 1), sq = 1 - c.press * 0.05;
        cu.push(X + c.x, Y + c.y, c.hw * (1 + j) * sq, HH * (1 - j * 1.3) * sq);
        cs.push(clamp(c.fill, 0, 1.1), c.lift, c.thread, c.press);
        cc.push(...c.tag.rgb);
      }
      gl.uniform4fv(U.uChip, cu);
      gl.uniform4fv(U.uChipS, cs);
      gl.uniform3fv(U.uCol, cc);
      gl.uniform3f(U.uLens, X + sx, Y, LR);
      gl.uniform2f(U.uLR, LR * (1 + lj + lensLift * 0.02), LR * (1 - lj + lensLift * 0.02));
      gl.uniform3f(U.uL, ...light);
      gl.uniform1f(U.uMixA, mixA);
      gl.uniform1f(U.uEnergy, 0.78 + st.kick * 0.3);
      gl.uniform1f(U.uFrac, clamp(frac, 0, 1));
      gl.uniform1f(U.uLensLift, lensLift);
    });
  });

  return { dispose() { window.removeEventListener('keydown', onKey); st.dispose(); } };
}
