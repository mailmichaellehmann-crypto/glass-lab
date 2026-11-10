// BEADS — a task list of glass beads in a rail, built like the toggle. Seen from above.
// Every task is a glass slab with a flat face and a bevelled rim (the toggle's glass), its word crisp in
// pixels underneath. At the end of the row waits an empty bead with the toggle's filament circling it:
// type straight into it, it grows with the word; Enter turns it into a task and a fresh empty bead
// grows beside it. Tap a task: green light pours into its bead from the left and a filament strikes
// the word through; the bead stays where it is. Drag a bead to reorder: it lifts above the others,
// which slide aside. Drag it out of the rail and let go: it bursts, and only then the gap closes.
// When everything is done a chain of light runs along the rail's lower lip.

import { glassStage, PixelMatrix, Spring, textCells, hasGlyph, hexRgb, mix3 } from '../glass/engine.js';
import { compact } from '../glass/engine.js';
import { clamp } from '../kit.js';

const NB = 14, MAXC = 10;                     // beads drawn at once (only the visible ones are sent)
const OPEN = hexRgb('#ff9ad5'), DONE = hexRgb('#3dffa8');
const PITCH = 3.4;
const DOT = PITCH * 0.84;                    // a small gap between pixels, like an LED display (as in PIN): crisp, not blurred
const textW = s => (s.length ? s.length * 4 - 1 : 0) * PITCH;

const FRAG = /* glsl */ `
#define NB ${NB}
uniform vec2  uRail;           // rail half size (centre = uC)
uniform vec4  uBead[NB];       // x, y (abs), half width, half height (last used = the input bead)
uniform vec4  uBeadF[NB];      // done fill (0..1), strike (0..1), flash, lift
uniform float uBeadT[NB];      // half width of the word (for the strike)
uniform int   uBeadN;
uniform int   uDrag;           // index of the lifted bead, -1 none
uniform int   uIn;             // index of the input bead
uniform vec3  uL, uLD;
uniform float uEnergy, uChain, uFilOn, uHead, uFocus;
uniform vec2  uMore;           // how much of the row hides past the left / right end

float sdBead(vec2 p, int i) { vec4 b = uBead[i]; return sdRoundBox(p - b.xy, b.zw, b.w); }
// a resting bead slides under the rail's lip at the ends: it is cut by the rail's inner edge
float sdBeadIn(vec2 p, int i) { return max(sdBead(p, i), sdRoundBox(p - uC, uRail, uRail.y) + 4.0); }
// all beads resting in the rail (the lifted one is drawn on top, separately)
float sdRest(vec2 p, out int idx) {
  float d = 1e5; idx = -1;
  for (int i = 0; i < NB; i++) {
    if (i >= uBeadN) break;
    if (i == uDrag || uBead[i].w < 0.5) continue;
    float e = sdBeadIn(p, i);
    if (e < d) { d = e; idx = i; }
  }
  return d;
}
vec2 beadNormal(vec2 p, int i) {
  vec2 e = vec2(0.5, 0.0);
  if (i == uDrag) return normalize(vec2(sdBead(p + e.xy, i) - sdBead(p - e.xy, i), sdBead(p + e.yx, i) - sdBead(p - e.yx, i)) + 1e-5);
  return normalize(vec2(sdBeadIn(p + e.xy, i) - sdBeadIn(p - e.xy, i), sdBeadIn(p + e.yx, i) - sdBeadIn(p - e.yx, i)) + 1e-5);
}

// arc-length position around a rounded box: the filament runs at an even speed around a capsule
float perimS(vec2 q, vec2 hs, float r, out float L) {
  vec2 b = hs - r;
  const float HP = 1.5707963;
  float O1 = b.x, O2 = O1 + HP * r, O3 = O2 + 2.0 * b.y, O4 = O3 + HP * r;
  float O5 = O4 + 2.0 * b.x, O6 = O5 + HP * r, O7 = O6 + 2.0 * b.y, O8 = O7 + HP * r;
  L = O8 + b.x;
  vec2 cq = clamp(q, -b, b);
  vec2 d = q - cq;
  bool ex = abs(cq.x) >= b.x - 1e-3, ey = abs(cq.y) >= b.y - 1e-3;
  if (dot(d, d) < 1e-6) {
    if (b.y - abs(q.y) < b.x - abs(q.x)) { ey = true; ex = false; cq.y = sign(q.y) * b.y; }
    else { ex = true; ey = false; cq.x = sign(q.x) * b.x; }
    d = vec2(ex ? sign(q.x) : 0.0, ey ? sign(q.y) : 0.0);
  }
  float a = atan(d.y, d.x);
  if (ex && ey) {
    if (d.x > 0.0 && d.y < 0.0) return O1 + r * (a + HP);
    if (d.x > 0.0) return O3 + r * a;
    if (d.y > 0.0) return O5 + r * (a - HP);
    return O7 + r * (a < 0.0 ? a + 2.0 * HP : a - 2.0 * HP);
  }
  if (ey) return d.y < 0.0 ? (cq.x >= 0.0 ? cq.x : L + cq.x) : O4 + (b.x - cq.x);
  return d.x > 0.0 ? O2 + (cq.y + b.y) : O6 + (b.y - cq.y);
}
// the toggle's filament around the input bead
float fil(vec2 p) {
  if (uIn < 0) return 1e5;
  vec4 b = uBead[uIn];
  vec2 q = p - b.xy;
  float sd = sdRoundBox(q, b.zw, b.w);
  float L;
  float s = perimS(q, b.zw, b.w, L);
  float ds = abs(s - uHead * L); ds = min(ds, L - ds);
  float hl = min(30.0, L * 0.2);
  return length(vec2(sd - 6.5, max(ds - hl, 0.0))) - (1.8 - 0.9 * smoothstep(0.0, hl, ds));
}

// the rail and everything lying in it: the light inside done beads, the strikes, the lip light
vec3 railAt(vec2 p, vec2 sp, float frost, vec2 ca, out float cover) {
  vec2 hs = uRail;
  float sdR = sdRoundBox(p - uC, hs, hs.y);
  vec3 col = tray(pageBg(sp), sdR, sdRoundBox(p - uC - vec2(0.0, 7.0), hs, hs.y), p, uC, hs);
  float f = max(fil(p), 0.0);
  float wash = filamentWash(f) * uFilOn;
  col = emitC(col, uL, wash * 0.45 * uEnergy);
  // the lower lip carries a thread of light: green under done beads, all of it when everything is done
  float lip = exp(-abs(sdR + 2.0) / 1.6) * smoothstep(-hs.y * 0.2, hs.y, p.y - uC.y);
  float front = mix(uC.x - hs.x - 30.0, uC.x + hs.x + 30.0, uChain);
  float lipDone = uChain > 0.0 ? smoothstep(front + 16.0, front - 16.0, p.x) : 0.0;
  for (int i = 0; i < NB; i++) {
    if (i >= uBeadN) break;
    if (i == uIn) continue;
    vec4 b = uBead[i]; vec4 fl = uBeadF[i];
    if (b.w < 0.5) continue;
    float inB = 1.0 - smoothstep(-1.0, 1.0, sdBead(p, i));
    // done: green light pours in from the left; its front is a bright meniscus
    float fx = b.x - b.z + 2.0 * b.z * fl.x;
    float has = step(0.001, fl.x);
    float lit = smoothstep(fx + 4.0, fx - 4.0, p.x) * has;
    col = emitC(col, uLD, inB * lit * (0.42 + 0.25 * fl.z) * uEnergy);
    col = emitC(col, mix(uLD, vec3(1.0), 0.5), inB * smoothstep(3.0, 0.0, abs(p.x - fx)) * has * step(fl.x, 0.995) * 0.6);
    // a flash when it is ticked off
    col = emitC(col, uLD, inB * fl.z * 0.35 * uEnergy);
    // the lip under a done bead
    lipDone = max(lipDone, step(abs(p.x - b.x), b.z) * fl.x);
    // the strike: a filament of light across the word
    if (fl.y > 0.01) {
      float hw = uBeadT[i] + 5.0;
      float len = hw * fl.y;
      float sd = length(vec2(max(abs(p.x - (b.x - hw + len)) - len, 0.0), p.y - b.y)) - 0.9;
      col = mix(col, mix(mix(uLD, vec3(1.0), 0.55), uLD * 0.45, uTheme), (1.0 - smoothstep(-0.5, 0.5, sd)) * fl.y * 0.9); // dark green on the light page
      col = emitC(col, uLD, exp(-max(sd, 0.0) / 3.0) * 0.25 * fl.y * uEnergy);
    }
  }
  col = emitC(col, mix(uL, uLD, lipDone), lip * (0.25 + 0.75 * lipDone) * uEnergy);
  // where the row goes on past an end, that end falls into shadow: there is more under the lip
  float ex = p.x - uC.x;
  col *= 1.0 - (uMore.x * exp(-(ex + hs.x) / 34.0) + uMore.y * exp(-(hs.x - ex) / 34.0)) * mix(0.55, 0.22, uTheme);
  // the beads' shadows in the rail; the lifted one throws a longer, softer one
  for (int i = 0; i < NB; i++) {
    if (i >= uBeadN) break;
    vec4 b = uBead[i];
    if (b.w < 0.5) continue;
    float lift = uBeadF[i].w;
    float sh = sdRoundBox(p - b.xy - vec2(0.0, 7.0 + lift * 10.0), b.zw, b.w);
    col *= 1.0 - (1.0 - smoothstep(-8.0, 14.0 + lift * 20.0, sh)) * mix(0.5, 0.18, uTheme) * (1.0 - lift * 0.35) * step(sdR, 0.5);
  }
  return ink(col, p, frost, ca, wash, uL, cover);
}

// one glass bead: flat face, bevelled rim (the toggle's glass)
vec3 beadGlass(vec2 p, vec2 sp, float sk, int i) {
  vec4 b = uBead[i];
  vec2 n = beadNormal(p, i);
  float depth = max(-sk, 0.0);
  float bevel = pow(1.0 - clamp(depth / 13.0, 0.0, 1.0), 2.4);
  vec2 bend = -n * bevel * 11.0;                  // only the rim bends; the flat face shows the word 1:1, never resampled
  float frost = 0.02 + 0.95 * bevel;               // the rim scatters what it bends: no dotted ghosts of the word
  float cover;
  vec3 g = railAt(p + bend, sp + bend * uScale, frost, n * bevel * 2.4, cover);
  float sq = max(fil(p), 0.0);
  float scatter = (i == uIn ? filamentScatter(sq) * uFilOn : 0.0) + uBeadF[i].x * 0.35 + uBeadF[i].z * 0.6;
  vec3 lc = mix(uL, uLD, i == uIn ? 0.0 : uBeadF[i].x);
  vec3 kc = glass(g, n, depth, bevel, p, b.xy, b.zw, cover, scatter, lc);
  // the empty input bead is thinner glass: a little clearer
  if (i == uIn) kc = mix(kc, g, 0.18 * (1.0 - uFocus));
  return kc;
}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = pageBg(sp);
  float sdR = sdRoundBox(p - uC, uRail, uRail.y);
  col = shadowed(col, sdRoundBox(p - uC - vec2(0.0, 14.0), uRail, uRail.y), sdRoundBox(p - uC - vec2(0.0, 1.5), uRail, uRail.y), 0.0);
  float sf = max(fil(p), 0.0);
  col = emitC(col, uL, filamentSpill(sf) * 0.6 * uFilOn * uEnergy);
  float cover;
  // pixels outside the rail too (the count underneath)
  col = ink(col, p, 0.0, vec2(0.0), 0.0, uL, cover);
  if (sdR < 2.0) col = mix(railAt(p, sp, 0.0, vec2(0.0), cover), col, smoothstep(-0.6, 0.6, sdR));
  int idx;
  float sk = sdRest(p, idx);
  if (sk < 2.0 && idx >= 0) col = mix(beadGlass(p, sp, sk, idx), col, smoothstep(-0.7, 0.7, sk));
  if (uDrag >= 0) {
    // the lifted bead: drawn above the others, with its shadow on them
    float sl = sdBead(p - vec2(0.0, 16.0), uDrag);
    col *= 1.0 - (1.0 - smoothstep(-8.0, 26.0, sl)) * mix(0.35, 0.14, uTheme);
    float sd = sdBead(p, uDrag);
    if (sd < 2.0) col = mix(beadGlass(p, sp, sd, uDrag), col, smoothstep(-0.7, 0.7, sd));
  }
  if (uFilOn > 0.01) col = mix(col, drawFilament(col, fil(p), uL, uEnergy * (1.0 + uKick * 0.5)), uFilOn);
  fragColor = vec4(finishAt(col, p), 1.0);
}`;


export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  // the rail grows with its tasks up to RMAX; past that the row scrolls inside it, endlessly
  const C = !thumb && compact();
  const RMIN = thumb ? 84 : C ? 120 : 150, RMAX = thumb ? 84 : C ? 172 : 300, RH = thumb ? 28 : 34;
  const HH = thumb ? 20 : 23, GAP = 8, PAD = thumb ? 9 : 11;
  const st = glassStage(root, { frag: FRAG, box: [RMAX * 2 + (C ? 24 : 80), RH * 2 + (thumb ? 60 : 150)], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => st.buzz(pat);

  let clock = 0;
  const events = [];
  const later = (dt, fn) => events.push({ t: clock + dt, fn });
  const halfFor = s => Math.max(textW(s), 14) / 2 + (thumb ? 14 : 19);

  // ---------------------------------------------------------------- beads (positions along the row, from its start)
  const makeBead = (word, done = false) => {
    const m = new PixelMatrix({ size: DOT, swirl: 7, shyR: 12, shyF: 4 });
    m.set(textCells(word, PITCH), { instant: true });
    const hw = halfFor(word);
    return { word, done, x: 0, vx: 0, y: 0, vy: 0, slot: 0, hw, hwC: hw, grow: 1, state: 'on', lift: 0, jelly: new Spring(380, 10), m, fill: done ? 1 : 0, strike: done ? 1 : 0, flash: 0, sx: 0 };
  };
  const tasks = (thumb ? [['UI', false], ['FX', true]] : [['CALL MOM', false], ['MILK', true], ['GYM', false]]).map(([w, d]) => makeBead(w, d));
  const input = { text: '', x: 0, slot: 0, hw: halfFor(''), hwC: 0, grow: 0, jelly: new Spring(380, 10), m: new PixelMatrix({ size: DOT, swirl: 6, shyR: 10, shyF: 3 }), shake: 0, sx: 0 };
  let rowW = 0;
  const layout = () => {
    let x = PAD;
    for (const b of tasks) { if (b.state === 'pop') continue; b.slot = x + b.hw; x += b.hw * 2 + GAP; }
    input.slot = x + input.hw;
    rowW = x + input.hw * 2 + PAD;
  };
  layout();
  tasks.forEach(b => { b.x = b.slot; });
  input.x = input.slot; input.hwC = input.hw; input.grow = 1;

  // ---------------------------------------------------------------- the rail's length and the scroll
  let railH = Math.min(RMAX, Math.max(RMIN, rowW / 2)), railV = 0;
  let scroll = 0, scrollV = 0, follow = 1;          // follow: glide to the input bead (after typing)
  const maxScroll = () => Math.max(0, rowW - railH * 2);
  const toScreen = u => -railH + u - scroll;        // row position → design x
  const toRow = x => x + railH + scroll;

  let chain = 0, allDoneSeen = false;
  const live = () => tasks.filter(b => b.state !== 'pop');
  const checkAllDone = () => {
    const l = live();
    if (l.length && l.every(b => b.done)) {
      if (allDoneSeen) return;
      allDoneSeen = true;
      later(0.55, () => {
        if (!live().every(b => b.done)) return;
        chain = 0.001; st.light = DONE; st.glint(); st.shock(0, 0);
        [0.45, 0.6, 0.75, 0.9].forEach((p, i) => later(i * 0.08, () => S.key(p)));
        live().forEach((b, i) => later(0.08 + i * 0.07, () => { b.flash = 1; b.jelly.kick(-4); }));
        buzz([10, 40, 10, 40, 20]);
      });
    } else { allDoneSeen = false; chain = 0; }
  };
  const toggle = b => {
    b.done = !b.done;
    b.jelly.kick(-5);
    if (b.done) { b.flash = 1; st.light = DONE; S.ping(true); buzz(10); st.pulse(0.6); st.burst(b.sx - b.hw + 10, 0, 6, 0.35, 0, 0.7); }
    else { S.ping(false); st.pulse(0.3); }
    checkAllDone();
  };
  const pop = b => {
    if (b.state === 'pop') return;
    b.state = 'pop'; b.m.set([]);
    st.light = b.done ? DONE : OPEN;
    st.burst(b.sx, b.y, 18, 0.8);
    S.drip(0.95, 0.7); S.tick(0.9, 0.5); buzz(8);
    // the gap closes only after the bead is gone, so nothing slides through it
    later(0.22, () => { const i = tasks.indexOf(b); if (i >= 0) tasks.splice(i, 1); layout(); checkAllDone(); });
  };
  let inp = null, focused = false, caretT = 0;
  const commit = () => {
    const w = input.text.trim();
    if (!w) { input.jelly.kick(-2); S.tick(0.25, 0.3); return; }
    const b = makeBead(w);
    b.x = input.x; b.slot = input.slot; b.hwC = input.hwC; b.jelly.kick(-4); b.flash = 0.5;
    tasks.push(b);
    input.text = ''; input.m.set([], { instant: true }); input.hw = halfFor(''); input.hwC = 0; input.grow = 0;
    if (inp) inp.value = '';
    layout(); input.x = input.slot;
    follow = 1;
    S.drip(0.55, 0.55); S.tick(0.7, 0.4); st.glint(); st.pulse(0.4);
    allDoneSeen = false; chain = 0;
  };
  const setText = s => {
    input.text = s; input.hw = halfFor(s);
    input.m.set(textCells(s, PITCH));
    layout(); follow = 1;
  };

  // ---------------------------------------------------------------- typing straight into the input bead
  if (!thumb) {
    inp = document.createElement('input');
    Object.assign(inp, { type: 'text', autocomplete: 'off', spellcheck: false, maxLength: MAXC, ariaLabel: 'New task' });
    inp.setAttribute('autocapitalize', 'characters');
    inp.setAttribute('enterkeyhint', 'done');
    inp.style.cssText = 'position:absolute;opacity:0;border:0;padding:0;margin:0;background:transparent;color:transparent;caret-color:transparent;font-size:16px;pointer-events:none;z-index:1';
    root.appendChild(inp);
    inp.addEventListener('input', () => {
      const want = [...inp.value.toUpperCase()].filter(c => hasGlyph(c)).join('').replace(/^ +/, '').replace(/ {2,}/g, ' ').slice(0, MAXC);
      if (want !== input.text) {
        const grew = want.length > input.text.length;
        setText(want);
        if (grew) { S.tick(0.5 + want.length * 0.03, 0.35); input.jelly.kick(-1); }
      }
      if (inp.value !== input.text) inp.value = input.text;
      caretT = 0;
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); S._ensure(); commit(); }
      else if (e.key === 'Backspace' && !inp.value) {
        e.preventDefault();
        const last = [...tasks].reverse().find(b => b.state === 'on');
        if (last) { pop(last); follow = 1; }
      }
    });
    inp.addEventListener('focus', () => { focused = true; });
    inp.addEventListener('blur', () => { focused = false; });
    setTimeout(() => inp?.focus({ preventScroll: true }), 350);
  }

  // ---------------------------------------------------------------- pointer: tap ticks off, drag lifts a bead, drag the rail scrolls
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const inRail = ([x, y]) => Math.abs(x) < railH + 4 && Math.abs(y) < RH + 4;
  const taskAt = ([x, y]) => (inRail([x, y]) ? tasks.find(b => b.state === 'on' && Math.abs(x - b.sx) < b.hwC + 3 && Math.abs(y - b.y) < HH + 4) : null);
  const onInput = ([x, y]) => inRail([x, y]) && Math.abs(x - input.sx) < input.hwC + 6 && Math.abs(y) < HH + 6;
  let drag = null, hoverB = null;
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d);
      S._ensure();
      const b = taskAt(q);
      if (b) { drag = { kind: 'bead', b, off: [q[0] - b.sx, q[1] - b.y], x0: q[0], y0: q[1], moved: 0 }; b.jelly.kick(-2); return; }
      if (inp && onInput(q)) { inp.focus({ preventScroll: true }); input.jelly.kick(-2); return; }
      if (inRail(q)) { drag = { kind: 'pan', x0: q[0], s0: scroll, last: q[0], t: performance.now(), v: 0 }; scrollV = 0; follow = 0; }
    },
    move: (p, e, d) => {
      const q = local(d);
      hoverB = taskAt(q);
      st.canvas.style.cursor = drag ? 'grabbing' : hoverB ? 'pointer' : onInput(q) ? 'text' : inRail(q) && maxScroll() > 0 ? 'grab' : 'default';
      if (!drag) return;
      if (drag.kind === 'pan') {
        const now = performance.now(), dtp = Math.max(8, now - drag.t) / 1000;
        drag.v = drag.v * 0.4 + (-(q[0] - drag.last) / dtp) * 0.6;
        drag.last = q[0]; drag.t = now;
        scroll = drag.s0 - (q[0] - drag.x0);
        return;
      }
      const b = drag.b;
      drag.moved = Math.max(drag.moved, Math.hypot(q[0] - drag.x0, q[1] - drag.y0));
      if (drag.moved < 7) return;
      if (b.state !== 'drag') { b.state = 'drag'; follow = 0; S.tick(0.55, 0.4); }
      drag.qx = q[0];
      b.tsx = q[0] - drag.off[0]; b.ty = q[1] - drag.off[1];
      const off = Math.abs(b.ty) > RH + 22;
      if (off !== !!b.off) { b.off = off; S.tick(off ? 0.25 : 0.6, 0.4); }
    },
    up: () => {
      if (!drag) return;
      const dd = drag;
      drag = null;
      if (dd.kind === 'pan') { scrollV = clamp(dd.v, -2500, 2500); suppressClick = Math.abs(dd.last - dd.x0) > 4; return; }
      if (dd.moved >= 7) suppressClick = true;
      const { b, moved } = dd;
      if (b.state === 'drag') {
        if (b.off) { pop(b); return; }
        b.state = 'on'; b.x = toRow(b.sx); b.vx = 0; b.jelly.kick(3); S.tick(0.5, 0.4); st.glint();
        return;
      }
      if (moved < 7) toggle(b);
    },
  });
  // trackpads and wheels scroll the row
  const onWheel = e => {
    if (maxScroll() <= 0) return;
    e.preventDefault();
    scroll += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / st.S;
    scrollV = 0; follow = 0;
  };
  st.canvas.addEventListener('wheel', onWheel, { passive: false });
  // a click focuses the input bead, but not the click that ends a pan or a drag
  let suppressClick = false;
  const onClick = () => { if (suppressClick) { suppressClick = false; return; } if (!drag) inp?.focus({ preventScroll: true }); };
  st.canvas.addEventListener('click', onClick);

  // ---------------------------------------------------------------- autopilot (shelf miniature): ticks the tasks off, then starts over
  let demoT = 0, filOn = 0, head = 0, shownCaption = null, lastEdge = 0;
  const caption = new PixelMatrix({ size: 2.4, swirl: 8, shyR: 12, shyF: 4 });
  caption.oy = RH + 34;
  const bU = new Float32Array(NB * 4), fU = new Float32Array(NB * 4), tU = new Float32Array(NB);
  // a bead's pixels fade where it slides under the rail's lip
  const edgeA = x => clamp((railH - 10 - Math.abs(x)) / 12, 0, 1);
  const drawClipped = (m, gain) => {
    for (const p of m.px) {
      const [x, y] = m.at(p);
      const a = p.b * gain * edgeA(x);
      if (a < 0.01) continue;
      ctx_.globalAlpha = Math.min(1, a);
      ctx_.fillRect(x - m.size / 2, y - m.size / 2, m.size, m.size);
    }
    ctx_.globalAlpha = 1;
  };
  let ctx_ = null;

  st.run((dt, t) => {
    clock = t;
    for (let k = events.length - 1; k >= 0; k--) if (events[k].t <= clock) { const ev = events[k]; events.splice(k, 1); ev.fn(); }
    if (demo) {
      demoT += dt;
      if (demoT > 1.1) {
        demoT = 0;
        const open = tasks.find(b => !b.done);
        if (open) toggle(open); else tasks.forEach(b => toggle(b));
      }
    }
    if (chain > 0) chain = Math.min(1, chain + dt * 1.2);

    // the rail stretches to its row (a spring), up to its full length
    const wantH = Math.min(RMAX, Math.max(RMIN, rowW / 2));
    { const k = 180, c = 2 * Math.sqrt(k) * 0.8; railV += (-k * (railH - wantH) - c * railV) * dt; railH += railV * dt; }
    // scroll: momentum after a flick, rubber band at the ends, or glide to the input bead
    const ms = maxScroll();
    if (drag && drag.kind === 'bead' && drag.b.state === 'drag' && drag.qx !== undefined) {
      // dragging a bead near an end scrolls the row along
      const edge = clamp((Math.abs(drag.qx) - (railH - 60)) / 50, 0, 1) * Math.sign(drag.qx);
      scroll += edge * 420 * dt;
      if (Math.sign(edge) !== lastEdge && edge !== 0) S.tick(0.4, 0.2);
      lastEdge = Math.sign(edge);
    }
    if (!(drag && drag.kind === 'pan')) {
      if (follow) scroll += (ms - scroll) * Math.min(1, dt * 7);
      else {
        scroll += scrollV * dt; scrollV *= Math.exp(-dt * 3.2);
        if (scroll < 0) { scroll += -scroll * Math.min(1, dt * 12); scrollV *= 0.5; }
        if (scroll > ms) { scroll += (ms - scroll) * Math.min(1, dt * 12); scrollV *= 0.5; }
      }
    }
    const moreL = clamp(scroll / 30, 0, 1), moreR = clamp((ms - scroll) / 30, 0, 1);

    for (const b of tasks) {
      b.flash *= Math.exp(-dt * 2.5);
      b.fill += ((b.done ? 1 : 0) - b.fill) * Math.min(1, dt * (b.done ? 3.2 : 6));
      b.strike += ((b.done ? 1 : 0) - b.strike) * Math.min(1, dt * (b.done ? 4 : 9));
      if (b.done) b.strike = Math.min(b.strike, b.fill); // the strike follows the light in
      b.lift += ((b.state === 'drag' ? 1 : hoverB === b && !drag ? 0.25 : 0) - b.lift) * Math.min(1, dt * 12);
      b.hwC += (b.hw - b.hwC) * Math.min(1, dt * 14);
      if (b.state === 'pop') { b.grow = Math.max(0, b.grow - dt * 6); b.sx = toScreen(b.x); continue; }
      if (b.state === 'drag') {
        b.sx += (b.tsx - b.sx) * Math.min(1, dt * 24);
        b.y += (b.ty - b.y) * Math.min(1, dt * 24);
        b.x = toRow(b.sx);
      } else {
        const k = 260, c = 2 * Math.sqrt(k) * 0.72;
        b.vx += (-k * (b.x - b.slot) - c * b.vx) * dt; b.x += b.vx * dt;
        b.vy += (-k * b.y - c * b.vy) * dt; b.y += b.vy * dt;
        b.sx = toScreen(b.x);
      }
      b.m.ox = b.sx; b.m.oy = b.y;
      b.m.step(dt, { ptr: st.local(b.m), shy: st.ptrOn * (drag ? 0 : 0.45), vel: b.state === 'drag' ? 0 : b.vx * 0.25 });
    }
    // reorder while a bead is lifted: it takes the place it is over, the others slide aside under it
    if (drag && drag.kind === 'bead' && drag.b.state === 'drag' && !drag.b.off) {
      const b = drag.b;
      const order = live();
      const sorted = [...order].sort((u, v) => (u === b ? b.x : u.slot) - (v === b ? b.x : v.slot));
      if (sorted.some((x, i) => x !== order[i])) {
        const popping = tasks.filter(x => x.state === 'pop');
        tasks.length = 0; tasks.push(...sorted, ...popping);
        layout(); S.tick(0.62, 0.35);
      }
    }
    // the input bead follows the row; it grows with the word, a refused word makes it shake its head
    input.grow = Math.min(1, input.grow + dt * 5);
    input.hwC += (input.hw - input.hwC) * Math.min(1, dt * 14);
    input.x += (input.slot - input.x) * Math.min(1, dt * 12);
    input.shake *= Math.exp(-dt * 5);
    const shakeX = reducedMotion ? 0 : Math.sin(t * 60) * 6 * input.shake;
    input.sx = toScreen(input.x) + shakeX;
    input.m.ox = input.sx; input.m.oy = 0;
    input.m.step(dt, { ptr: null, shy: 0 });
    caretT += dt;

    // the filament circles the input bead while you can type into it
    filOn += (((focused || thumb) && !drag ? 1 : 0.35) * edgeA(input.sx) - filOn) * Math.min(1, dt * 6);
    head = (head + dt * (reducedMotion ? 50 : 150) / (4 * (input.hwC + HH) + 2 * Math.PI * HH)) % 1;

    const l = live();
    const nDone = l.filter(b => b.done).length;
    const word = thumb ? '' : l.length ? `${nDone} OF ${l.length} DONE` : 'NOTHING TO DO';
    if (word !== shownCaption) { caption.set(word ? textCells(word, 2.8) : []); shownCaption = word; }
    caption.step(dt, { ptr: st.local(caption), shy: st.ptrOn * 0.5 });
    if (!events.length && chain === 0) st.light = mix3(st.light, OPEN, Math.min(1, dt * 3));
    if (inp) Object.assign(inp.style, { left: `${st.cx + (input.sx - input.hwC) * st.S}px`, top: `${st.cy - HH * st.S}px`, width: `${input.hwC * 2 * st.S}px`, height: `${HH * 2 * st.S}px` });

    // uniforms: only beads that can be seen (plus the lifted one), the input bead last
    bU.fill(0); fU.fill(0); tU.fill(0);
    let n = 0, dragI = -1;
    const vis = [];
    for (const b of tasks) {
      if (Math.abs(b.sx) - b.hwC > railH + 4 && b.state !== 'drag') continue;
      if (n >= NB - 1) break;
      const j = b.jelly.step(dt) * 0.035;
      const g = b.grow * b.grow * (3 - 2 * b.grow);
      bU.set([st.cx + b.sx, st.cy + b.y - b.lift * 3, b.hwC * g * (1 + j) * (1 + b.lift * 0.05), HH * g * (1 - j) * (1 + b.lift * 0.05)], n * 4);
      fU.set([b.fill, b.strike, b.flash, b.lift], n * 4);
      tU[n] = textW(b.word) / 2;
      if (b.state === 'drag') dragI = n;
      vis.push(b);
      n++;
    }
    for (const b of tasks) if (!vis.includes(b)) b.jelly.step(dt);
    const inI = n;
    const ij = input.jelly.step(dt) * 0.035;
    const ig = input.grow * input.grow * (3 - 2 * input.grow);
    bU.set([st.cx + input.sx, st.cy, input.hwC * ig * (1 + ij), HH * ig * (1 - ij)], n * 4);
    n++;

    st.drawPixels(ctx => {
      ctx_ = ctx;
      for (const b of vis) {
        const gain = (b.state === 'pop' ? 0 : 1) * (0.95 - 0.25 * b.strike);
        if (b.state === 'drag') b.m.draw(ctx, gain); else drawClipped(b.m, gain);
      }
      caption.draw(ctx, 0.6);
      if (!thumb) {
        drawClipped(input.m, 1);
        const ea = edgeA(input.sx);
        // inside the input bead: a blinking caret while typing, a quiet plus when idle
        if (focused && (caretT < 0.5 || Math.cos((caretT - 0.5) * Math.PI * 2) > 0)) {
          ctx.globalAlpha = 0.9 * ea;
          ctx.fillRect(input.sx + textW(input.text) / 2 + (input.text ? PITCH * 1.2 : 0) - PITCH * 0.35, -PITCH * 2.5, PITCH * 0.7, PITCH * 5);
          ctx.globalAlpha = 1;
        } else if (!focused && !input.text) {
          ctx.globalAlpha = 0.5 * ea;
          ctx.fillRect(input.sx - PITCH * 2.5, -PITCH / 2, PITCH * 5, PITCH);
          ctx.fillRect(input.sx - PITCH / 2, -PITCH * 2.5, PITCH, PITCH * 5);
          ctx.globalAlpha = 1;
        }
      }
    });
    st.render(t, (U, gl) => {
      gl.uniform2f(U.uRail, railH, RH);
      gl.uniform4fv(U.uBead, bU);
      gl.uniform4fv(U.uBeadF, fU);
      gl.uniform1fv(U.uBeadT, tU);
      gl.uniform1i(U.uBeadN, n);
      gl.uniform1i(U.uDrag, dragI);
      gl.uniform1i(U.uIn, inI);
      gl.uniform3f(U.uL, ...OPEN);
      gl.uniform3f(U.uLD, ...DONE);
      gl.uniform1f(U.uEnergy, 0.8 + st.kick * 0.25);
      gl.uniform1f(U.uChain, chain);
      gl.uniform1f(U.uFilOn, filOn);
      gl.uniform1f(U.uHead, head);
      gl.uniform1f(U.uFocus, focused ? 1 : 0);
      gl.uniform2f(U.uMore, moreL, moreR);
    });
  });

  return {
    dispose() {
      st.canvas.removeEventListener('click', onClick);
      st.canvas.removeEventListener('wheel', onWheel);
      inp?.remove(); st.dispose();
    },
  };
}
