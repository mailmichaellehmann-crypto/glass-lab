// BEADS — a tag input: every word becomes a glass bead on a string of light. Seen from above.
// Type into the field and press Enter: the glass grows around the pixel letters, the bead drops onto
// the string and the string twangs. Drag a bead along the string to reorder (the others make room);
// pull it away and the string stretches with it until it lets go, then let go yourself and the bead
// bursts into sparks. A word that's already there flies to its twin and melts into it.
// Backspace in an empty field pops the last bead.

import { glassStage, PixelMatrix, Spring, textCells, hasGlyph, hexRgb } from '../glass/engine.js';
import { clamp } from '../kit.js';

const NB = 6, NS = 48, MAXC = 9;
const HUES = ['#ff9ad5', '#7fe0ff', '#ffd27f', '#9b8cff', '#7affc4', '#ff8a5c'].map(hexRgb);
const PITCH = 3.0;
const textW = s => (s.length * 4 - 1) * PITCH;

const FRAG = /* glsl */ `
#define NB ${NB}
#define NS ${NS}
uniform vec4  uBead[NB];       // x, y (abs), half width, half height
uniform vec3  uBeadC[NB];      // colour
uniform float uBeadG[NB];      // glow (landing, merging, hot)
uniform int   uBeadN;
uniform float uStr[NS];        // string displacement samples
uniform vec3  uStrA;           // string x0, x1 (abs), y (abs)
uniform vec2  uFieldC, uFieldH;
uniform float uFocus, uShowField, uEnergy;
uniform vec3  uL;

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

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  // the field
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
  float bs = sdBeads(q - vec2(0.0, 8.0));
  col *= 1.0 - (1.0 - smoothstep(-6.0, 16.0, bs)) * mix(0.48, 0.17, uTheme);
  // the string of light
  // the string of light: threaded through the beads, it fades inside them so the words stay readable
  float ds = sdString(q);
  float inBead = 1.0 - smoothstep(-5.0, 2.0, sdBeads(q));
  col = emitC(col, uL, (smoothstep(1.4, 0.2, ds) * 1.2 + exp(-ds / 5.0) * 0.4 + exp(-ds / 22.0) * 0.12) * uEnergy * (1.0 - 0.88 * inBead));
  // each bead lights the page around it a little in its colour
  for (int i = 0; i < NB; i++) {
    if (i >= uBeadN) break;
    vec4 b = uBead[i];
    if (b.w < 0.5) continue;
    float e = max(sdRoundBox(q - b.xy, b.zw, b.w), 0.0);
    col = emitC(col, uBeadC[i], exp(-e / 18.0) * (0.05 + 0.35 * uBeadG[i]) * uEnergy);
  }
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
  float thick = 3.0 + hh * 0.45 * hgt;     // a flatter bead: the word inside stays calm
  // no refraction in the outermost rim: there it focuses one bright spot nearby (the string, the tray's lit
  // lip) into a dot that reads like a stray pixel; the rim keeps its reflections and edge light
  thick *= smoothstep(0.0, 0.35, u);
  vec3 tR = refract(V, n3, 1.0 / 1.44), tG = refract(V, n3, 1.0 / 1.5), tB = refract(V, n3, 1.0 / 1.58);
  vec2 oR = vec2(tR.x, -tR.y) / max(-tR.z, 0.3) * thick;
  vec2 oG = vec2(tG.x, -tG.y) / max(-tG.z, 0.3) * thick;
  vec2 oB = vec2(tB.x, -tB.y) / max(-tB.z, 0.3) * thick;
  // the tight rim focuses single letter pixels into bright ghost dots: let it scatter them instead
  float frost = 0.04 + 0.85 * pow(1.0 - u, 3.0);
  vec3 kc = vec3(scene(p + oR, sp + oR * uScale, frost).r, scene(p + oG, sp + oG * uScale, frost).g, scene(p + oB, sp + oB * uScale, frost).b);
  kc = mix(kc, kc * 0.86 + vec3(0.1), 1.0 - uTheme);
  vec3 lc = idx >= 0 ? uBeadC[idx] : uL;
  float g = idx >= 0 ? uBeadG[idx] : 0.3;
  kc = emitC(kc, lc, (0.14 + 0.6 * g) * (0.35 + 0.65 * (1.0 - u)) * uEnergy);
  kc = emitC(kc, lc, exp(-depth / 2.0) * (0.2 + 0.5 * g) * uEnergy);
  vec3 Rv = reflect(V, n3);
  float fres = 0.04 + 0.96 * pow(1.0 - n3.z, 5.0);
  vec3 env = mix(vec3(0.06), vec3(0.55), smoothstep(-0.7, 0.9, Rv.y));
  env = mix(env, vec3(0.97), uTheme * 0.5);
  kc = mix(kc, env, clamp(fres, 0.0, 0.65));
  kc += smoothstep(0.08, 0.0, u) * mix(0.3, 0.4, uTheme);
  vec3 Ld = normalize(vec3(-0.4, 0.65, 0.62));
  float s1 = max(dot(Rv, Ld), 0.0);
  // a capsule shows one long, thin highlight along its length, not a point (a point read like a stray pixel)
  if (idx >= 0) {
    vec4 bb = uBead[idx];
    float v = (p.y - bb.y) / bb.w;
    float along = smoothstep(bb.z, bb.z - bb.w * 1.4, abs(p.x - bb.x));
    kc += exp(-pow((v + 0.52) / 0.13, 2.0)) * mix(0.26, 0.4, uTheme) * along;
  }
  kc += pow(s1, 14.0) * mix(0.07, 0.11, uTheme) * smoothstep(0.2, 0.6, u);
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
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const SX = thumb ? 118 : 238;                  // string half length
  const SY = thumb ? 0 : 46;                      // string y
  const FY = -66, FIELD = [196, 25];              // field
  const HH = 18;                                  // bead half height
  const GAP = 10;
  const st = glassStage(root, { frag: FRAG, box: thumb ? [SX * 2 + 60, 110] : [SX * 2 + 70, 300], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => { if (!thumb && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(pat); };

  // ---------------------------------------------------------------- the string: plucks that ring and fade
  const plucks = [];
  let pull = null;                                // { x, y } while a bead stretches it
  const env = x => Math.sin(Math.PI * clamp((x + SX) / (2 * SX), 0, 1));
  const disp = (x, t) => {
    let y = 0;
    for (const p of plucks) {
      const a = p.amp * Math.exp(-(t - p.t) * 2.6) * Math.cos((t - p.t) * 26);
      y += a * Math.exp(-(((x - p.x) / 90) ** 2));
    }
    if (pull) y += pull.y * Math.exp(-(((x - pull.x) / 85) ** 2));
    return y * env(x);
  };
  const pluck = (x, amp) => { plucks.push({ x, amp, t: clock }); if (plucks.length > 6) plucks.shift(); };

  // ---------------------------------------------------------------- beads
  let hueI = 0;
  const beads = [];
  const makeBead = (word, x, y, state) => {
    const m = new PixelMatrix({ size: PITCH, swirl: 8, shyR: 12, shyF: 4 });
    m.set(textCells(word, PITCH), { instant: true });
    m.ox = x; m.oy = y;
    const b = { word, x, y, vx: 0, vy: 0, slot: x, hw: textW(word) / 2 + 19, grow: state === 'on' ? 1 : 0, state, glow: 0, jelly: new Spring(380, 10), m, col: HUES[hueI++ % HUES.length], attached: true };
    return b;
  };
  const layout = () => {
    const live = beads.filter(b => b.state !== 'pop' && b.state !== 'merge' && b.attached);
    const total = live.reduce((s, b) => s + b.hw * 2, 0) + GAP * Math.max(0, live.length - 1);
    let x = -total / 2;
    for (const b of live) { b.slot = x + b.hw; x += b.hw * 2 + GAP; }
  };
  const width = () => beads.filter(b => b.state !== 'pop' && b.state !== 'merge').reduce((s, b) => s + b.hw * 2 + GAP, -GAP);
  const pop = b => {
    if (b.state === 'pop') return;
    b.state = 'pop'; b.m.set([]);
    st.light = b.col; st.burst(b.x, b.y, 16, 0.8);
    S.drip(0.95, 0.7); S.tick(0.9, 0.5); buzz(8);
    layout();
  };
  (thumb ? ['UI', 'FX', '3D'] : ['GLASS', 'LIGHT', 'PIXEL']).forEach(w => beads.push(makeBead(w, 0, SY, 'on')));
  layout();
  beads.forEach(b => { b.x = b.slot; });

  // ---------------------------------------------------------------- typing
  let text = '', focused = false, caretT = 0;
  const typed = new PixelMatrix({ size: PITCH, swirl: 6, shyR: 10, shyF: 3 });
  const placeholder = new PixelMatrix({ size: PITCH, swirl: 6, shyR: 10, shyF: 3 });
  const fieldLeft = -FIELD[0] + 20;
  typed.ox = fieldLeft; typed.oy = FY;
  placeholder.ox = fieldLeft; placeholder.oy = FY;
  if (!thumb) placeholder.set(textCells('ADD A TAG', PITCH, 1, { align: 'left' }), { instant: true });
  const setText = t => {
    text = t;
    typed.set(textCells(t, PITCH, 1, { align: 'left' }));
    caretT = 0;
  };
  const commit = () => {
    const w = text.trim();
    if (!w) { S.tick(0.2, 0.3); return; }
    const x = fieldLeft + textW(w) / 2, y = FY;
    const twin = beads.find(b => b.word === w && b.state !== 'pop' && b.state !== 'merge');
    const b = makeBead(w, x, y, twin ? 'merge' : 'fall');
    if (twin) { b.col = twin.col; hueI--; b.twin = twin; }
    beads.push(b);
    typed.set([], { instant: true });
    text = ''; if (input) input.value = '';
    S.drip(0.55, 0.5); st.pulse(0.3);
    // too many for the string: the oldest drops off
    while (beads.filter(x => x.state !== 'pop').length > NB || width() > SX * 2 - 30) {
      const old = beads.find(x => x.state === 'on' || x.state === 'fall');
      if (!old) break;
      pop(old);
    }
    layout();
  };
  const backspace = () => {
    if (text) { setText(text.slice(0, -1)); if (input) input.value = text; S.tick(0.3, 0.3); return; }
    const last = [...beads].reverse().find(b => b.state === 'on');
    if (last) pop(last);
  };

  let input = null;
  if (!thumb) {
    input = document.createElement('input');
    Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, maxLength: MAXC, ariaLabel: 'Add a tag' });
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('enterkeyhint', 'done');
    input.style.cssText = 'position:absolute;opacity:0;border:0;padding:0;margin:0;background:transparent;color:transparent;caret-color:transparent;font-size:16px;pointer-events:none;z-index:1';
    root.appendChild(input);
    input.addEventListener('input', () => {
      const want = [...input.value.toUpperCase()].filter(c => c !== ' ' && c !== ',' && hasGlyph(c)).join('').slice(0, MAXC);
      if (want.length > text.length) { S.tick(0.5 + want.length * 0.03, 0.35); }
      if (want !== text) setText(want);
      if (input.value !== want) input.value = want;
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',' || e.key === ' ') { e.preventDefault(); S._ensure(); commit(); }
      else if (e.key === 'Backspace' && !input.value) { e.preventDefault(); backspace(); }
    });
    input.addEventListener('focus', () => { focused = true; });
    input.addEventListener('blur', () => { focused = false; });
    setTimeout(() => input?.focus({ preventScroll: true }), 350);
  }

  // ---------------------------------------------------------------- pointer: drag beads
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const beadAt = ([x, y]) => beads.find(b => b.state === 'on' && Math.abs(x - b.x) < b.hw + 4 && Math.abs(y - b.y) < HH + 6);
  let drag = null;
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d);
      S._ensure();
      const b = beadAt(q);
      if (b) { drag = { b, off: [q[0] - b.x, q[1] - b.y], x0: q[0], y0: q[1], moved: 0 }; b.state = 'drag'; b.attached = true; b.jelly.kick(-2.5); S.tick(0.55, 0.4); return; }
      if (input && Math.abs(q[0]) < FIELD[0] && Math.abs(q[1] - FY) < FIELD[1] + 6) input.focus({ preventScroll: true });
    },
    move: (p, e, d) => {
      const q = local(d);
      const over = beadAt(q);
      st.canvas.style.cursor = drag ? 'grabbing' : over ? 'grab' : input && Math.abs(q[0]) < FIELD[0] && Math.abs(q[1] - FY) < FIELD[1] + 6 ? 'text' : 'default';
      if (!drag) return;
      const b = drag.b;
      drag.moved = Math.max(drag.moved, Math.hypot(q[0] - drag.x0, q[1] - drag.y0));
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
      // reorder live: the dragged bead takes the place it is over
      if (b.attached) {
        const live = beads.filter(x => x.state === 'on' || x === b);
        const before = live.map(x => x.word).join();
        live.sort((u, v) => (u === b ? b.tx : u.slot) - (v === b ? b.tx : v.slot));
        const after = live.map(x => x.word).join();
        if (before !== after) {
          const others = beads.filter(x => !live.includes(x));
          beads.length = 0; beads.push(...live, ...others);
          layout(); S.tick(0.62, 0.35);
        }
      }
    },
    up: () => {
      if (!drag) return;
      const b = drag.b;
      drag = null; pull = null;
      if (!b.attached) { pop(b); return; }
      b.state = 'on'; b.jelly.kick(2.5);
      pluck(b.x, (b.y - SY) * 0.7 + 3);
      if (Math.abs(b.y - SY) < 4) st.glint();
    },
  });
  const onClick = () => input?.focus({ preventScroll: true });
  st.canvas.addEventListener('click', onClick);

  // ---------------------------------------------------------------- autopilot (shelf miniature): beads drop on, the oldest pops
  let demoT = 0;
  const DEMO = ['UX', 'GO', 'HI', 'OK'];
  let demoK = 0;

  let clock = 0;
  const sU = new Float32Array(NS);
  st.run((dt, t) => {
    clock = t;
    if (demo) {
      demoT += dt;
      if (demoT > 1.1) {
        demoT = 0;
        const w = DEMO[demoK++ % DEMO.length];
        const b = makeBead(w, (Math.random() - 0.5) * 60, SY - 70, 'fall');
        beads.push(b);
        const live = beads.filter(x => x.state !== 'pop');
        if (live.length > 3) pop(live[0]);
        layout();
      }
    }

    while (plucks.length && t - plucks[0].t > 3) plucks.shift();
    for (let i = beads.length - 1; i >= 0; i--) {
      const b = beads[i];
      b.glow *= Math.exp(-dt * 3);
      if (b.state === 'pop') {
        b.grow -= dt * 6;
        if (b.grow <= 0) beads.splice(i, 1);
        continue;
      }
      b.grow = Math.min(1, b.grow + dt * 4);
      let tx, ty, k, c;
      if (b.state === 'drag') { tx = b.tx ?? b.x; ty = b.ty ?? b.y; k = 700; c = 2 * Math.sqrt(k) * 0.8; }
      else if (b.state === 'merge') { tx = b.twin.x; ty = b.twin.y; k = 160; c = 2 * Math.sqrt(k) * 0.75; }
      else { tx = b.slot; ty = SY + disp(b.slot, t); k = b.state === 'fall' ? 120 : 260; c = 2 * Math.sqrt(k) * (b.state === 'fall' ? 0.42 : 0.7); }
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

    // the light: the colour of the newest glowing bead, or the last one
    const glowing = beads.filter(b => b.state !== 'pop').sort((a, b) => b.glow - a.glow)[0];
    const L = glowing ? glowing.col : HUES[0];
    if (!thumb) st.light = L;

    caretT += dt;
    // keep the invisible input over the field (focus, IME and the phone keyboard)
    if (input) Object.assign(input.style, { left: `${st.cx - FIELD[0] * st.S}px`, top: `${st.cy + (FY - FIELD[1]) * st.S}px`, width: `${FIELD[0] * 2 * st.S}px`, height: `${FIELD[1] * 2 * st.S}px` });
    typed.step(dt, { ptr: st.local(typed), shy: 0 });
    placeholder.step(dt, { ptr: st.local(placeholder), shy: 0 });

    const bU = [], cU = [], gU = [];
    const vis = beads.slice(0, NB);
    for (const b of vis) {
      const j = b.jelly.step(dt) * 0.035;
      const g = clamp(b.grow, 0, 1);
      const e = g * g * (3 - 2 * g);
      bU.push(st.cx + b.x, st.cy + b.y, b.hw * e * (1 + j) + 0.001, HH * e * (1 - j) * (b.state === 'drag' ? 1.06 : 1));
      cU.push(...b.col);
      gU.push(b.glow + (b.state === 'drag' ? 0.5 : 0));
    }
    while (bU.length < NB * 4) bU.push(0, 0, 0, 0);
    while (cU.length < NB * 3) cU.push(0, 0, 0);
    while (gU.length < NB) gU.push(0);
    for (let i = 0; i < NS; i++) sU[i] = disp(-SX + (2 * SX * i) / (NS - 1), t);

    st.drawPixels(ctx => {
      for (const b of vis) b.m.draw(ctx, clamp(b.grow, 0, 1) * 0.95);
      if (!thumb) {
        typed.draw(ctx, 1);
        if (!text) placeholder.draw(ctx, focused ? 0.28 : 0.4);
        // the caret blinks after the last letter while the field has focus
        const on = focused && (caretT < 0.5 || Math.cos((caretT - 0.5) * Math.PI * 2) > 0);
        if (on) { ctx.globalAlpha = 0.9; ctx.fillRect(fieldLeft + (text ? textW(text) + PITCH * 1.2 : 0) - PITCH / 2, FY - PITCH * 2.5, PITCH * 0.7, PITCH * 5); ctx.globalAlpha = 1; }
      }
    });
    st.render(t, (U, gl) => {
      gl.uniform4fv(U.uBead, bU);
      gl.uniform3fv(U.uBeadC, cU);
      gl.uniform1fv(U.uBeadG, gU);
      gl.uniform1i(U.uBeadN, vis.length);
      gl.uniform1fv(U.uStr, sU);
      gl.uniform3f(U.uStrA, st.cx - SX, st.cx + SX, st.cy + SY);
      gl.uniform2f(U.uFieldC, st.cx, st.cy + FY);
      gl.uniform2f(U.uFieldH, FIELD[0], FIELD[1]);
      gl.uniform1f(U.uFocus, focused ? 1 : 0);
      gl.uniform1f(U.uShowField, thumb ? 0 : 1);
      gl.uniform1f(U.uEnergy, 0.75 + st.kick * 0.25);
      gl.uniform3f(U.uL, ...L);
    });
  });

  return { dispose() { st.canvas.removeEventListener('click', onClick); input?.remove(); st.dispose(); } };
}
