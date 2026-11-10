// BEADS — a task list: every task is a word in a glass bead on a string of light. Seen from above.
// Type a task and press Enter: the glass grows around the pixel letters, the bead drops onto the string
// and the string twangs. Tap a bead to get it done: it fills with green light, a filament strikes the
// word through and it slides to the done end of the string, past the others. The toggle's filament
// circles the next open task; when everything is done a chain of light runs along the string. Drag
// beads to reorder; pull one off the string and it stretches until it lets go, then the task bursts.
// A task that's already there flies to its twin and melts into it. Backspace in an empty field pops
// the last open task.

import { glassStage, PixelMatrix, Spring, textCells, hasGlyph, hexRgb, mix3 } from '../glass/engine.js';
import { clamp } from '../kit.js';

const NB = 6, NS = 48, MAXC = 10;
const HUES = ['#ff9ad5', '#7fe0ff', '#ffd27f', '#9b8cff', '#ff8a5c', '#c8a2ff'].map(hexRgb);
const DONE = hexRgb('#3dffa8');
const PITCH = 2.7;
const textW = s => (s.length * 4 - 1) * PITCH;

const FRAG = /* glsl */ `
#define NB ${NB}
#define NS ${NS}
uniform vec4  uBead[NB];       // x, y (abs), half width, half height
uniform vec3  uBeadC[NB];      // colour
uniform float uBeadG[NB];      // glow (landing, merging, done flash)
uniform float uBeadD[NB];      // done (0..1)
uniform int   uBeadN;
uniform float uStr[NS];        // string displacement samples
uniform vec3  uStrA;           // string x0, x1 (abs), y (abs)
uniform vec2  uFieldC, uFieldH;
uniform float uFocus, uShowField, uEnergy, uChain;
uniform vec3  uL, uLD;
uniform vec4  uFilB;           // the next open bead: x, y (abs), half width, half height
uniform float uHead, uHalfLen, uFilOn;

float strDisp(float x) {
  float t = clamp((x - uStrA.x) / (uStrA.y - uStrA.x), 0.0, 1.0) * float(NS - 1);
  int i = int(floor(t)); int j = min(i + 1, NS - 1);
  return mix(uStr[i], uStr[j], fract(t));
}
float sdString(vec2 q) {
  float x = clamp(q.x, uStrA.x, uStrA.y);
  return length(vec2(q.x - x, q.y - (uStrA.z + strDisp(x))));
}
float sdBeadsI(vec2 p, out int idx) {
  // the two glass pins the string is tied to belong to the same glass family
  float d = min(length(p - vec2(uStrA.x, uStrA.z)) - 9.0, length(p - vec2(uStrA.y, uStrA.z)) - 9.0);
  idx = -1;
  for (int i = 0; i < NB; i++) {
    if (i >= uBeadN) break;
    vec4 b = uBead[i];
    if (b.w < 0.5) continue;
    float e = sdRoundBox(p - b.xy, b.zw, b.w);
    if (e < d) { d = e; idx = i; }
  }
  return d;
}
float sdBeads(vec2 p) { int k; return sdBeadsI(p, k); }

// arc-length position around a rounded box, so the filament runs at an even speed along the capsule
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
float fil(vec2 p) {
  vec2 q = p - uFilB.xy;
  float sd = sdRoundBox(q, uFilB.zw, uFilB.w);
  float L;
  float s = perimS(q, uFilB.zw, uFilB.w, L);
  float ds = abs(s - uHead * L); ds = min(ds, L - ds);
  float hl = max(uHalfLen, 0.5);
  return length(vec2(sd - 6.5, max(ds - hl, 0.0))) - (1.8 - 0.9 * smoothstep(0.0, hl, ds));
}

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  if (uShowField > 0.5) {
    float sdF = sdRoundBox(q - uFieldC, uFieldH, uFieldH.y);
    col = shadowed(col, sdRoundBox(q - uFieldC - vec2(0.0, 12.0), uFieldH, uFieldH.y), sdRoundBox(q - uFieldC - vec2(0.0, 1.5), uFieldH, uFieldH.y), 0.0);
    if (sdF < 2.0) {
      vec3 tc = tray(col, sdF, sdRoundBox(q - uFieldC - vec2(0.0, 6.0), uFieldH, uFieldH.y), q, uFieldC, uFieldH);
      // focused: a thread of light runs along the lower inner lip
      tc = emitC(tc, uL, exp(-abs(sdF + 1.6) / 1.5) * smoothstep(-uFieldH.y * 0.3, uFieldH.y, q.y - uFieldC.y) * 0.5 * uFocus);
      col = mix(tc, col, smoothstep(-0.6, 0.6, sdF));
    }
  }
  // the beads' shadows
  float bs = sdBeads(q - vec2(0.0, 9.0));
  col *= 1.0 - (1.0 - smoothstep(-6.0, 18.0, bs)) * mix(0.5, 0.18, uTheme);
  // the string of light: threaded through the beads, it fades inside them so the words stay readable.
  // When everything is done a chain of light runs along it in the done colour.
  float ds = sdString(q);
  float inBead = 1.0 - smoothstep(-5.0, 2.0, sdBeads(q));
  float front = mix(uStrA.x - 20.0, uStrA.y + 20.0, uChain);
  vec3 sl = mix(uL, uLD, uChain > 0.0 ? smoothstep(front + 12.0, front - 12.0, q.x) : 0.0);
  col = emitC(col, sl, (smoothstep(1.4, 0.2, ds) * 1.2 + exp(-ds / 5.0) * 0.4 + exp(-ds / 22.0) * 0.12) * uEnergy * (1.0 - 0.88 * inBead));
  for (int i = 0; i < NB; i++) {
    if (i >= uBeadN) break;
    vec4 b = uBead[i];
    if (b.w < 0.5) continue;
    vec3 bc = mix(uBeadC[i], uLD, uBeadD[i]);
    // each bead lights the page around it a little in its colour
    float e = max(sdRoundBox(q - b.xy, b.zw, b.w), 0.0);
    col = emitC(col, bc, exp(-e / 18.0) * (0.05 + 0.35 * uBeadG[i] + 0.1 * uBeadD[i]) * uEnergy);
    // a done task: a filament strikes its word through, inside the glass
    float dd = uBeadD[i];
    if (dd > 0.01) {
      float len = (b.z - b.w * 0.55) * dd;
      float x0 = b.x - (b.z - b.w * 0.55);
      float sd = length(vec2(max(abs(q.x - (x0 + len)) - len, 0.0), q.y - b.y)) - 0.9;
      col = emitC(col, uLD, (exp(-max(sd, 0.0) / 3.0) * 0.25) * dd * uEnergy);
      col = mix(col, mix(uLD, vec3(1.0), 0.5), (1.0 - smoothstep(-0.5, 0.5, sd + 0.3)) * dd * 0.85);
    }
  }
  float f = fil(q);
  col = emitC(col, uL, filamentSpill(f) * 0.5 * uFilOn * uEnergy);
  float cover;
  return ink(col, q, frost, vec2(0.0), 0.0, uL, cover);
}

vec3 beadGlass(vec2 p, vec2 sp, float sd, int idx) {
  vec2 e = vec2(0.5, 0.0);
  vec2 n = normalize(vec2(sdBeads(p + e.xy) - sdBeads(p - e.xy), sdBeads(p + e.yx) - sdBeads(p - e.yx)) + 1e-5);
  float hh = idx >= 0 ? uBead[idx].w : 9.0;
  float depth = max(-sd, 0.0);
  float u = clamp(depth / hh, 0.0, 1.0);
  float hgt = sqrt(max(1.0 - (1.0 - u) * (1.0 - u), 0.0));
  vec3 n3 = normalize(vec3(n.x * (1.0 - u), -n.y * (1.0 - u), hgt + 0.02));
  vec3 V = vec3(0.0, 0.0, -1.0);
  // thick glass: the word is magnified and fringes at the edges, like the lenses in Bridge
  float thick = 4.0 + hh * 0.85 * hgt;
  // no refraction in the outermost rim: there it would focus one bright spot nearby into a stray dot
  thick *= smoothstep(0.0, 0.35, u);
  vec3 tR = refract(V, n3, 1.0 / 1.42), tG = refract(V, n3, 1.0 / 1.5), tB = refract(V, n3, 1.0 / 1.6);
  vec2 oR = vec2(tR.x, -tR.y) / max(-tR.z, 0.3) * thick;
  vec2 oG = vec2(tG.x, -tG.y) / max(-tG.z, 0.3) * thick;
  vec2 oB = vec2(tB.x, -tB.y) / max(-tB.z, 0.3) * thick;
  float frost = 0.03 + 0.85 * pow(1.0 - u, 3.0);
  vec3 kc = vec3(scene(p + oR, sp + oR * uScale, frost).r, scene(p + oG, sp + oG * uScale, frost).g, scene(p + oB, sp + oB * uScale, frost).b);
  kc = mix(kc, kc * 0.84 + vec3(0.11), 1.0 - uTheme);
  float dn = idx >= 0 ? uBeadD[idx] : 0.0;
  vec3 lc = idx >= 0 ? mix(uBeadC[idx], uLD, dn) : uL;
  float g = idx >= 0 ? uBeadG[idx] : 0.3;
  // light inside: a tint of the bead's colour, stronger when done; it gathers along the far (lower) rim
  kc = emitC(kc, lc, (0.12 + 0.6 * g + 0.1 * dn) * (0.35 + 0.65 * (1.0 - u)) * uEnergy);
  kc = emitC(kc, lc, exp(-depth / 2.0) * (0.22 + 0.5 * g + 0.2 * dn) * uEnergy);
  if (idx >= 0) {
    vec4 bb = uBead[idx];
    float v = (p.y - bb.y) / bb.w;
    float along = smoothstep(bb.z, bb.z - bb.w * 1.4, abs(p.x - bb.x));
    kc = emitC(kc, lc, exp(-pow((v - 0.72) / 0.12, 2.0)) * along * (0.25 + 0.4 * dn) * uEnergy);
    // a capsule shows one long, thin highlight along its length, not a point (a point read like a stray pixel)
    kc += exp(-pow((v + 0.55) / 0.12, 2.0)) * mix(0.32, 0.45, uTheme) * along;
    kc += exp(-pow((v + 0.2) / 0.3, 2.0)) * 0.04 * along;
  }
  kc = emitC(kc, uL, filamentScatter(fil(p)) * 0.6 * uFilOn * uEnergy);
  vec3 Rv = reflect(V, n3);
  float fres = 0.04 + 0.96 * pow(1.0 - n3.z, 5.0);
  vec3 env = mix(vec3(0.06), vec3(0.6), smoothstep(-0.7, 0.9, Rv.y));
  env = mix(env, vec3(0.97), uTheme * 0.5);
  kc = mix(kc, env, clamp(fres, 0.0, 0.7));
  kc += smoothstep(0.08, 0.0, u) * mix(0.32, 0.42, uTheme);
  vec3 Ld = normalize(vec3(-0.4, 0.65, 0.62));
  kc += pow(max(dot(Rv, Ld), 0.0), 14.0) * mix(0.07, 0.11, uTheme) * smoothstep(0.2, 0.6, u);
  if (uSweep < 1.2) {
    float s = dot(p - uC, normalize(vec2(1.0, -0.75)));
    float pos = mix(-280.0, 280.0, clamp(uSweep / 0.8, 0.0, 1.0));
    kc += exp(-pow((s - pos) / 11.0, 2.0)) * 0.3 * (1.0 - uSweep / 1.2) * hgt;
  }
  return kc;
}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);
  int idx;
  float sk = sdBeadsI(p, idx);
  if (sk < 2.0) col = mix(beadGlass(p, sp, sk, idx), col, smoothstep(-0.7, 0.7, sk));
  if (uFilOn > 0.01) col = mix(col, drawFilament(col, fil(p), uL, uEnergy * (1.0 + uKick * 0.5)), uFilOn);
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const SX = thumb ? 118 : 272;                  // string half length
  const SY = thumb ? 0 : 46;                      // string y
  const FY = -66, FIELD = [196, 25];              // field
  const HH = 20;                                  // bead half height
  const GAP = 10, GROUP = 26;                     // gap between beads, between open and done
  const st = glassStage(root, { frag: FRAG, box: thumb ? [SX * 2 + 60, 110] : [SX * 2 + 70, 320], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => { if (!thumb && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(pat); };

  let clock = 0;
  const events = [];
  const later = (dt, fn) => events.push({ t: clock + dt, fn });

  // ---------------------------------------------------------------- the string: plucks that ring and fade
  const plucks = [];
  let pull = null;                                // { x, y } while a bead stretches it
  const env = x => Math.sin(Math.PI * clamp((x + SX) / (2 * SX), 0, 1));
  const disp = (x, t) => {
    let y = 0;
    for (const p of plucks) y += p.amp * Math.exp(-(t - p.t) * 2.6) * Math.cos((t - p.t) * 26) * Math.exp(-(((x - p.x) / 90) ** 2));
    if (pull) y += pull.y * Math.exp(-(((x - pull.x) / 85) ** 2));
    return y * env(x);
  };
  const pluck = (x, amp) => { plucks.push({ x, amp, t: clock }); if (plucks.length > 6) plucks.shift(); };

  // ---------------------------------------------------------------- beads (tasks)
  let hueI = 0;
  const beads = [];
  const makeBead = (word, x, y, state, done = false) => {
    const m = new PixelMatrix({ size: PITCH, swirl: 8, shyR: 12, shyF: 4 });
    m.set(textCells(word, PITCH), { instant: true });
    m.ox = x; m.oy = y;
    return { word, x, y, vx: 0, vy: 0, slot: x, hw: textW(word) / 2 + 17, grow: state === 'on' ? 1 : 0, state, glow: 0, jelly: new Spring(380, 10), m, col: HUES[hueI++ % HUES.length], attached: true, done, doneMix: done ? 1 : 0, hop: 0 };
  };
  const live = () => beads.filter(b => b.state !== 'pop' && b.state !== 'merge');
  const layout = () => {
    const on = live().filter(b => b.attached);
    const open = on.filter(b => !b.done), done = on.filter(b => b.done);
    const total = on.reduce((s, b) => s + b.hw * 2, 0) + GAP * Math.max(0, on.length - 1) + (open.length && done.length ? GROUP - GAP : 0);
    let x = -total / 2;
    for (const b of open) { b.slot = x + b.hw; x += b.hw * 2 + GAP; }
    if (open.length && done.length) x += GROUP - GAP;
    for (const b of done) { b.slot = x + b.hw; x += b.hw * 2 + GAP; }
  };
  const width = () => live().reduce((s, b) => s + b.hw * 2 + GAP, -GAP) + GROUP;
  let chain = 0, allDoneSeen = false;
  const checkAllDone = () => {
    const l = live();
    if (l.length && l.every(b => b.done)) {
      if (allDoneSeen) return;
      allDoneSeen = true;
      later(0.5, () => {
        if (!live().every(b => b.done)) return;
        chain = 0.001; st.light = DONE; st.shock(0, SY); st.glint();
        [0.45, 0.6, 0.75, 0.9].forEach((p, i) => later(i * 0.08, () => S.key(p)));
        live().forEach((b, i) => later(0.06 + i * 0.09, () => { b.glow = 1.2; b.jelly.kick(-4); pluck(b.x, 6); }));
        buzz([10, 40, 10, 40, 20]);
      });
    } else { allDoneSeen = false; chain = 0; }
  };
  const toggle = b => {
    b.done = !b.done;
    b.glow = 1; b.jelly.kick(-5);
    if (b.done) {
      b.m.set(textCells(b.word, PITCH, 0.78));
      st.light = DONE; S.ping(true); buzz(10); st.pulse(0.6);
      st.burst(b.x, b.y, 8, 0.45);
      // joins the front of the done group
      beads.splice(beads.indexOf(b), 1);
      const firstDone = beads.findIndex(x => x.done);
      beads.splice(firstDone < 0 ? beads.length : firstDone, 0, b);
    } else {
      b.m.set(textCells(b.word, PITCH));
      S.ping(false); st.pulse(0.3);
      beads.splice(beads.indexOf(b), 1);
      const firstDone = beads.findIndex(x => x.done);
      beads.splice(firstDone < 0 ? beads.length : firstDone, 0, b);
    }
    pluck(b.x, b.done ? 10 : -8);
    layout();
    checkAllDone();
  };
  const pop = b => {
    if (b.state === 'pop') return;
    b.state = 'pop'; b.m.set([]);
    st.light = b.done ? DONE : b.col; st.burst(b.x, b.y, 16, 0.8);
    S.drip(0.95, 0.7); S.tick(0.9, 0.5); buzz(8);
    layout();
    checkAllDone();
  };
  (thumb ? [['UI', false], ['FX', false], ['3D', true]] : [['CALL MOM', false], ['MILK', false], ['GYM', true]])
    .forEach(([w, d]) => beads.push(makeBead(w, 0, SY, 'on', d)));
  beads.filter(b => b.done).forEach(b => b.m.set(textCells(b.word, PITCH, 0.78), { instant: true }));
  layout();
  beads.forEach(b => { b.x = b.slot; });

  // ---------------------------------------------------------------- typing
  let text = '', focused = false, caretT = 0, fieldShake = 0;
  const typed = new PixelMatrix({ size: PITCH, swirl: 6, shyR: 10, shyF: 3 });
  const placeholder = new PixelMatrix({ size: PITCH, swirl: 6, shyR: 10, shyF: 3 });
  const fieldLeft = -FIELD[0] + 20;
  typed.ox = fieldLeft; typed.oy = FY;
  placeholder.ox = fieldLeft; placeholder.oy = FY;
  if (!thumb) placeholder.set(textCells('NEW TASK', PITCH, 1, { align: 'left' }), { instant: true });
  const caption = new PixelMatrix({ size: 2.8, swirl: 8, shyR: 12, shyF: 4 });
  caption.oy = SY + 58;
  let shownCaption = null;
  const setText = t => { text = t; typed.set(textCells(t, PITCH, 1, { align: 'left' })); caretT = 0; };
  const commit = () => {
    const w = text.trim();
    if (!w) { S.tick(0.2, 0.3); return; }
    const x = fieldLeft + textW(w) / 2, y = FY;
    const twin = live().find(b => b.word === w);
    // the string is full: make room by letting done tasks go; never drop an open one
    const need = textW(w) + 34 + GAP;
    while (!twin && (live().length >= NB || width() + need > SX * 2 - 30)) {
      const old = live().find(x => x.done);
      if (!old) { fieldShake = 1; S.tick(0.15, 0.8); later(0.1, () => S.tick(0.12, 0.8)); buzz([20, 30, 20]); return; }
      pop(old);
    }
    const b = makeBead(w, x, y, twin ? 'merge' : 'fall');
    if (twin) { b.col = twin.col; hueI--; b.twin = twin; }
    // a new task joins the end of the open ones
    const firstDone = beads.findIndex(x => x.done && x.state !== 'pop');
    beads.splice(firstDone < 0 ? beads.length : firstDone, 0, b);
    typed.set([], { instant: true });
    text = ''; if (input) input.value = '';
    S.drip(0.55, 0.5); st.pulse(0.3);
    layout();
    allDoneSeen = false; chain = 0;
  };
  const backspace = () => {
    if (text) { setText(text.slice(0, -1)); if (input) input.value = text; S.tick(0.3, 0.3); return; }
    const last = [...beads].reverse().find(b => b.state === 'on' && !b.done);
    if (last) pop(last);
  };

  let input = null;
  if (!thumb) {
    input = document.createElement('input');
    Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, maxLength: MAXC, ariaLabel: 'New task' });
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('enterkeyhint', 'done');
    input.style.cssText = 'position:absolute;opacity:0;border:0;padding:0;margin:0;background:transparent;color:transparent;caret-color:transparent;font-size:16px;pointer-events:none;z-index:1';
    root.appendChild(input);
    input.addEventListener('input', () => {
      const want = [...input.value.toUpperCase()].filter(c => hasGlyph(c)).join('').replace(/^ +/, '').replace(/ {2,}/g, ' ').slice(0, MAXC);
      if (want.length > text.length) S.tick(0.5 + want.length * 0.03, 0.35);
      if (want !== text) setText(want);
      if (input.value !== want) input.value = want;
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); S._ensure(); commit(); }
      else if (e.key === 'Backspace' && !input.value) { e.preventDefault(); backspace(); }
    });
    input.addEventListener('focus', () => { focused = true; });
    input.addEventListener('blur', () => { focused = false; });
    setTimeout(() => input?.focus({ preventScroll: true }), 350);
  }

  // ---------------------------------------------------------------- pointer: a tap gets a task done, a drag moves its bead
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const beadAt = ([x, y]) => beads.find(b => b.state === 'on' && Math.abs(x - b.x) < b.hw + 4 && Math.abs(y - b.y) < HH + 6);
  let drag = null;
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d);
      S._ensure();
      const b = beadAt(q);
      if (b) { drag = { b, off: [q[0] - b.x, q[1] - b.y], x0: q[0], y0: q[1], moved: 0 }; b.jelly.kick(-2.5); return; }
      if (input && Math.abs(q[0]) < FIELD[0] && Math.abs(q[1] - FY) < FIELD[1] + 6) input.focus({ preventScroll: true });
    },
    move: (p, e, d) => {
      const q = local(d);
      const over = beadAt(q);
      st.canvas.style.cursor = drag && drag.b.state === 'drag' ? 'grabbing' : over ? 'pointer' : input && Math.abs(q[0]) < FIELD[0] && Math.abs(q[1] - FY) < FIELD[1] + 6 ? 'text' : 'default';
      if (!drag) return;
      const b = drag.b;
      drag.moved = Math.max(drag.moved, Math.hypot(q[0] - drag.x0, q[1] - drag.y0));
      if (drag.moved < 6) return;
      if (b.state !== 'drag') { b.state = 'drag'; S.tick(0.55, 0.4); }
      b.tx = clamp(q[0] - drag.off[0], -SX + b.hw, SX - b.hw);
      const dy = q[1] - drag.off[1] - SY;
      if (b.attached) {
        // pulled off the string: it stretches with the bead until it lets go
        if (Math.abs(dy) > 62) {
          b.attached = false; pull = null;
          pluck(b.x, -Math.sign(dy) * 16);
          S.tick(0.95, 0.8); S.drip(0.8, 0.4); buzz(10);
          layout();
        } else pull = { x: b.x, y: dy * 0.85 };
      } else if (Math.abs(dy) < 26) { b.attached = true; S.tick(0.6, 0.4); }
      b.ty = SY + dy;
      if (!b.attached) b.tx = q[0] - drag.off[0];
      // reorder within its group (open or done): the dragged bead takes the place it is over
      if (b.attached) {
        const group = beads.filter(x => (x.state === 'on' || x === b) && x.done === b.done && x.attached);
        const sorted = [...group].sort((u, v) => (u === b ? b.tx : u.slot) - (v === b ? b.tx : v.slot));
        if (sorted.some((x, i) => x !== group[i])) {
          const idx = group.map(x => beads.indexOf(x)).sort((u, v) => u - v);
          sorted.forEach((x, i) => { beads[idx[i]] = x; });
          layout(); S.tick(0.62, 0.35);
        }
      }
    },
    up: () => {
      if (!drag) return;
      const { b, moved } = drag;
      drag = null; pull = null;
      if (b.state === 'drag') {
        if (!b.attached) { pop(b); return; }
        b.state = 'on'; b.jelly.kick(2.5);
        pluck(b.x, (b.y - SY) * 0.7 + 3);
        return;
      }
      if (moved < 6) toggle(b);
    },
  });
  const onClick = () => input?.focus({ preventScroll: true });
  st.canvas.addEventListener('click', onClick);

  // ---------------------------------------------------------------- autopilot (shelf miniature): ticks tasks off, then starts over
  let demoT = 0, filOn = 1, head = 0, filTarget = null;
  const sU = new Float32Array(NS);
  const bU = new Float32Array(NB * 4), cU = new Float32Array(NB * 3), gU = new Float32Array(NB), dU = new Float32Array(NB);
  st.run((dt, t) => {
    clock = t;
    for (let k = events.length - 1; k >= 0; k--) if (events[k].t <= clock) { const ev = events[k]; events.splice(k, 1); ev.fn(); }
    if (demo) {
      demoT += dt;
      if (demoT > 1.0) {
        demoT = 0;
        const open = live().find(b => !b.done);
        if (open) toggle(open); else live().forEach(b => toggle(b));
      }
    }

    while (plucks.length && t - plucks[0].t > 3) plucks.shift();
    for (let i = beads.length - 1; i >= 0; i--) {
      const b = beads[i];
      b.glow *= Math.exp(-dt * 3);
      b.doneMix += ((b.done ? 1 : 0) - b.doneMix) * Math.min(1, dt * 5);
      if (b.state === 'pop') {
        b.grow -= dt * 6;
        if (b.grow <= 0) beads.splice(i, 1);
        continue;
      }
      b.grow = Math.min(1, b.grow + dt * 4);
      let tx, ty, k, c;
      if (b.state === 'drag') { tx = b.tx ?? b.x; ty = b.ty ?? b.y; k = 700; c = 2 * Math.sqrt(k) * 0.8; }
      else if (b.state === 'merge') { tx = b.twin.x; ty = b.twin.y; k = 160; c = 2 * Math.sqrt(k) * 0.75; }
      else {
        // on a long way along the string a bead lifts off it and arcs over the others
        const away = clamp((Math.abs(b.x - b.slot) - b.hw * 0.6) / 80, 0, 1);
        b.hop += ((b.state === 'on' ? away : 0) - b.hop) * Math.min(1, dt * 10);
        tx = b.slot; ty = SY + disp(b.slot, t) - b.hop * HH * 2.4;
        k = b.state === 'fall' ? 120 : 200; c = 2 * Math.sqrt(k) * (b.state === 'fall' ? 0.42 : 0.68);
      }
      if (b.state === 'fall' && b.grow < 1) { tx = b.x; ty = b.y; } // the glass first forms around the word
      b.vx += (-k * (b.x - tx) - c * b.vx) * dt; b.vy += (-k * (b.y - ty) - c * b.vy) * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.state === 'fall' && b.grow >= 1 && b.y > SY - 4 && b.vy > 0) {
        // lands on the string: it twangs
        b.state = 'on';
        pluck(b.x, Math.min(16, b.vy * 0.03 + 5));
        b.jelly.kick(-4); b.glow = 1;
        S.tick(0.5 + Math.random() * 0.2, 0.6); S.land(0.25); st.pulse(0.4);
      }
      if (b.state === 'merge' && Math.hypot(b.x - b.twin.x, b.y - b.twin.y) < 8) {
        // melts into its twin
        b.twin.glow = 1.3; b.twin.jelly.kick(-6);
        st.light = b.twin.col; S.drip(0.65, 0.7); st.burst(b.twin.x, b.twin.y, 8, 0.4);
        beads.splice(i, 1);
        continue;
      }
      b.m.ox = b.x; b.m.oy = b.y;
      b.m.step(dt, { ptr: st.local(b.m), shy: st.ptrOn * (drag ? 0 : 0.5), vel: b.vx * 0.3 });
    }
    if (pull && drag) pull.x = drag.b.x;
    if (chain > 0) chain = Math.min(1, chain + dt * 1.3);

    // the filament circles the next open task
    const l = live();
    const next = l.find(b => !b.done && b.state === 'on');
    if (next) filTarget = next;
    filOn += ((next ? 1 : 0) - filOn) * Math.min(1, dt * 6);
    const fb = filTarget || l[0];
    if (fb) head = (head + dt * (reducedMotion ? 50 : 140) / (4 * (fb.hw + HH) + 2 * Math.PI * HH)) % 1;

    const glowing = l.filter(b => b.glow > 0.05).sort((a, b) => b.glow - a.glow)[0];
    const L = next ? next.col : DONE;
    if (!thumb && !events.length && chain === 0) st.light = mix3(st.light, glowing ? (glowing.done ? DONE : glowing.col) : L, Math.min(1, dt * 6));

    const nDone = l.filter(b => b.done).length;
    const word = thumb ? '' : l.length ? `${nDone} OF ${l.length} DONE` : 'ALL CLEAR';
    if (word !== shownCaption) { caption.set(word ? textCells(word, 2.8) : []); shownCaption = word; }
    caption.step(dt, { ptr: st.local(caption), shy: st.ptrOn * 0.5 });

    caretT += dt;
    // a refused task: the field shakes its head
    fieldShake *= Math.exp(-dt * 5);
    const shakeX = reducedMotion ? 0 : Math.sin(t * 60) * 7 * fieldShake;
    typed.ox = fieldLeft + shakeX;
    // keep the invisible input over the field (focus, IME and the phone keyboard)
    if (input) Object.assign(input.style, { left: `${st.cx - FIELD[0] * st.S}px`, top: `${st.cy + (FY - FIELD[1]) * st.S}px`, width: `${FIELD[0] * 2 * st.S}px`, height: `${FIELD[1] * 2 * st.S}px` });
    typed.step(dt, { ptr: null, shy: 0 });
    placeholder.step(dt, { ptr: null, shy: 0 });

    bU.fill(0); cU.fill(0); gU.fill(0); dU.fill(0);
    const vis = beads.slice(0, NB);
    let fbU = [0, 0, 1, 1];
    vis.forEach((b, i) => {
      const j = b.jelly.step(dt) * 0.035;
      const g = clamp(b.grow, 0, 1);
      const e = g * g * (3 - 2 * g);
      const hw = b.hw * e * (1 + j) + 0.001, hh = HH * e * (1 - j) * (b.state === 'drag' ? 1.06 : 1);
      bU.set([st.cx + b.x, st.cy + b.y, hw, hh], i * 4);
      cU.set(b.col, i * 3);
      gU[i] = b.glow + (b.state === 'drag' ? 0.5 : 0);
      dU[i] = b.doneMix;
      if (b === fb) fbU = [st.cx + b.x, st.cy + b.y, hw, hh];
    });
    for (let i = 0; i < NS; i++) sU[i] = disp(-SX + (2 * SX * i) / (NS - 1), t);

    st.drawPixels(ctx => {
      for (const b of vis) b.m.draw(ctx, clamp(b.grow, 0, 1) * 0.95);
      caption.draw(ctx, 0.6);
      if (!thumb) {
        typed.draw(ctx, 1);
        if (!text) placeholder.draw(ctx, focused ? 0.28 : 0.4);
        // the caret blinks after the last letter while the field has focus
        const on = focused && (caretT < 0.5 || Math.cos((caretT - 0.5) * Math.PI * 2) > 0);
        if (on) { ctx.globalAlpha = 0.9; ctx.fillRect(fieldLeft + shakeX + (text ? textW(text) + PITCH * 1.2 : 0) - PITCH / 2, FY - PITCH * 2.5, PITCH * 0.7, PITCH * 5); ctx.globalAlpha = 1; }
      }
    });
    st.render(t, (U, gl) => {
      gl.uniform4fv(U.uBead, bU);
      gl.uniform3fv(U.uBeadC, cU);
      gl.uniform1fv(U.uBeadG, gU);
      gl.uniform1fv(U.uBeadD, dU);
      gl.uniform1i(U.uBeadN, vis.length);
      gl.uniform1fv(U.uStr, sU);
      gl.uniform3f(U.uStrA, st.cx - SX, st.cx + SX, st.cy + SY);
      gl.uniform2f(U.uFieldC, st.cx + shakeX, st.cy + FY);
      gl.uniform2f(U.uFieldH, FIELD[0], FIELD[1]);
      gl.uniform1f(U.uFocus, focused ? 1 : 0);
      gl.uniform1f(U.uShowField, thumb ? 0 : 1);
      gl.uniform1f(U.uEnergy, 0.75 + st.kick * 0.25);
      gl.uniform1f(U.uChain, chain);
      gl.uniform3f(U.uL, ...(next ? next.col : DONE));
      gl.uniform3f(U.uLD, ...DONE);
      gl.uniform4f(U.uFilB, ...fbU);
      gl.uniform1f(U.uHead, head);
      gl.uniform1f(U.uHalfLen, 26);
      gl.uniform1f(U.uFilOn, filOn);
    });
  });

  return { dispose() { st.canvas.removeEventListener('click', onClick); input?.remove(); st.dispose(); } };
}
