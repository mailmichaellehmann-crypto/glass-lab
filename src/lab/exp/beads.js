// BEADS — a task list strung like an abacus: every task is a glass bead on a thread of light, seen from
// above. Type a task and press Enter: its bead drops down the thread to its place and the thread twangs.
// Tap a task to get it done: its bead fills with light, a pixel check blooms in it, it slides down into
// the stack of done things and a filament strikes its text through. Drag beads along the thread to
// reorder; pull one off sideways and the thread stretches with it until it lets go, then it bursts. The
// toggle's filament circles the next open task; when everything is done a chain of light runs up the
// thread. Beads are real glass: round domes with per-channel refraction, like the lenses in Bridge.

import { glassStage, PixelMatrix, Spring, textCells, bitmapCells, hasGlyph, hexRgb, mix3 } from '../glass/engine.js';
import { domeLens } from '../glass/lib.glsl.js';
import { clamp } from '../kit.js';

const NB = 6, NS = 40, MAXC = 16;
const OPEN = hexRgb('#ff9ad5'), DONE = hexRgb('#3dffa8');
const CHECK = ['.......##', '......##.', '.##..##..', '..####...', '...##....'];
const PITCH = 3.0;
const textW = s => (s.length * 4 - 1) * PITCH;

const FRAG = /* glsl */ `
#define NB ${NB}
#define NS ${NS}
uniform vec4  uBead[NB];       // x, y (abs), radius, done (0..1)
uniform float uBeadG[NB];      // flash
uniform vec4  uStrike[NB];     // x0, y (abs), length, alpha
uniform int   uBeadN;
uniform float uStr[NS];        // sideways displacement of the thread, sampled along it
uniform vec3  uStrA;           // y0, y1 (abs), x (abs)
uniform vec2  uFieldC, uFieldH;
uniform float uFocus, uShowField, uEnergy, uTh, uFilOn, uChain;
uniform vec3  uFil;            // filament: centre (abs) and radius
uniform vec3  uL, uLD;         // open light, done light

float strDisp(float y) {
  float t = clamp((y - uStrA.x) / (uStrA.y - uStrA.x), 0.0, 1.0) * float(NS - 1);
  int i = int(floor(t)); int j = min(i + 1, NS - 1);
  return mix(uStr[i], uStr[j], fract(t));
}
float sdThread(vec2 q) {
  float y = clamp(q.y, uStrA.x, uStrA.y);
  return length(vec2(q.x - (uStrA.z + strDisp(y)), q.y - y));
}
float sdBeads(vec2 p, out int idx) {
  float d = 1e5; idx = -1;
  for (int i = 0; i < NB; i++) {
    if (i >= uBeadN) break;
    vec4 b = uBead[i];
    if (b.z < 0.5) continue;
    float e = length(p - b.xy) - b.z;
    if (e < d) { d = e; idx = i; }
  }
  return d;
}
float fil(vec2 p) { return filament(p, uFil.xy, length(p - uFil.xy) - uFil.z, uTh, 0.55); }

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  if (uShowField > 0.5) {
    float sdF = sdRoundBox(q - uFieldC, uFieldH, uFieldH.y);
    col = shadowed(col, sdRoundBox(q - uFieldC - vec2(0.0, 12.0), uFieldH, uFieldH.y), sdRoundBox(q - uFieldC - vec2(0.0, 1.5), uFieldH, uFieldH.y), 0.0);
    if (sdF < 2.0) {
      vec3 tc = tray(col, sdF, sdRoundBox(q - uFieldC - vec2(0.0, 6.0), uFieldH, uFieldH.y), q, uFieldC, uFieldH);
      tc = emitC(tc, uL, exp(-abs(sdF + 1.6) / 1.5) * smoothstep(-uFieldH.y * 0.3, uFieldH.y, q.y - uFieldC.y) * 0.5 * uFocus);
      col = mix(tc, col, smoothstep(-0.6, 0.6, sdF));
    }
  }
  // the two glass pins the thread hangs from
  float pin = min(length(q - vec2(uStrA.z, uStrA.x - 6.0)), length(q - vec2(uStrA.z, uStrA.y + 6.0))) - 6.0;
  col *= 1.0 - (1.0 - smoothstep(-3.0, 8.0, pin - 3.0)) * mix(0.4, 0.15, uTheme);
  col = mix(col, mix(vec3(0.62), vec3(0.98), uTheme), (1.0 - smoothstep(-0.7, 0.7, pin)) * 0.5);
  // the beads' shadows
  int k;
  float bs = sdBeads(q - vec2(0.0, 8.0), k);
  col *= 1.0 - (1.0 - smoothstep(-6.0, 16.0, bs)) * mix(0.5, 0.18, uTheme);
  // the thread of light; when everything is done a chain of light runs up it in the done colour
  float ds = sdThread(q);
  float front = uStrA.y - (uStrA.y - uStrA.x) * uChain;
  vec3 tl = mix(uL, uLD, uChain > 0.0 ? smoothstep(front - 10.0, front + 10.0, q.y) : 0.0);
  col = emitC(col, tl, (smoothstep(1.3, 0.2, ds) * 1.1 + exp(-ds / 5.0) * 0.4 + exp(-ds / 22.0) * 0.12) * uEnergy);
  // strike-throughs: a filament of light across each done task
  for (int i = 0; i < NB; i++) {
    if (i >= uBeadN) break;
    vec4 s = uStrike[i];
    if (s.w < 0.001) continue;
    float sd = length(vec2(max(abs(q.x - (s.x + s.z * 0.5)) - s.z * 0.5, 0.0), q.y - s.y)) - 1.0;
    col = emitC(col, uLD, (exp(-max(sd, 0.0) / 5.0) * 0.5 + exp(-max(sd, 0.0) / 20.0) * 0.15) * s.w * uEnergy);
    col = mix(col, mix(uLD, vec3(1.0), 0.6), (1.0 - smoothstep(-0.6, 0.6, sd)) * s.w);
  }
  float f = fil(q);
  col = emitC(col, uL, filamentSpill(f) * 0.5 * uFilOn * uEnergy);
  float cover;
  return ink(col, q, frost, vec2(0.0), 0.0, uL, cover);
}

${domeLens('beadDome', 'scene')}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);
  int idx;
  float sk = sdBeads(p, idx);
  if (sk < 2.0 && idx >= 0) {
    vec4 b = uBead[idx];
    vec3 lc = mix(uL, uLD, b.w);
    vec3 kc = beadDome(p, sp, b.xy, vec2(b.z), 0.08, 1.05, vec4(lc, 0.1 + 0.3 * b.w), lc,
                       0.12 + 0.55 * b.w + uBeadG[idx] * 0.9 + filamentScatter(fil(p)) * 0.7 * uFilOn);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }
  // fades as a whole (drawFilament draws its body at any energy)
  if (uFilOn > 0.01) col = mix(col, drawFilament(col, fil(p), uL, uEnergy * (1.0 + uKick * 0.5)), uFilOn);
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const R = thumb ? 16 : 20;
  const SX = thumb ? 0 : -150;                     // thread x
  const Y0 = thumb ? -66 : -118, Y1 = thumb ? 66 : 172;
  const STEP = thumb ? 40 : 48;
  const FY = -168, FIELD = [210, 24];
  const TX = SX + 38;                                // task text x
  const st = glassStage(root, { frag: FRAG, box: thumb ? [120, Y1 - Y0 + 50] : [480, Y1 - FY + 80], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => { if (!thumb && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(pat); };

  let clock = 0;
  // ---------------------------------------------------------------- the thread: plucks that ring and fade
  const plucks = [];
  let pull = null;                                   // { y, x } while a bead stretches it sideways
  const env = y => Math.sin(Math.PI * clamp((y - Y0) / (Y1 - Y0), 0, 1));
  const disp = (y, t) => {
    let x = 0;
    for (const p of plucks) x += p.amp * Math.exp(-(t - p.t) * 2.6) * Math.cos((t - p.t) * 24) * Math.exp(-(((y - p.y) / 80) ** 2));
    if (pull) x += pull.x * Math.exp(-(((y - pull.y) / 80) ** 2));
    return x * env(y);
  };
  const pluck = (y, amp) => { plucks.push({ y, amp, t: clock }); if (plucks.length > 6) plucks.shift(); };

  // ---------------------------------------------------------------- tasks
  const tasks = [];
  const makeTask = (text, done, y) => {
    const lab = new PixelMatrix({ size: PITCH, swirl: 7, shyR: 12, shyF: 4 });
    if (!thumb) lab.set(textCells(text, PITCH, 1, { align: 'left' }), { instant: true });
    lab.ox = TX;
    const icon = new PixelMatrix({ size: 2.2, swirl: 8, shyR: 6, shyF: 2 });
    if (done) icon.set(bitmapCells(CHECK, 2.2), { instant: true });
    return { text, done, y, vy: 0, x: SX, slot: y, strike: done ? 1 : 0, doneMix: done ? 1 : 0, flash: 0, grow: 1, state: 'on', jelly: new Spring(380, 10), lab, icon, attached: true, labY: y };
  };
  const live = () => tasks.filter(t => t.state !== 'pop');
  const layout = () => {
    const open = live().filter(t => !t.done && t.attached), done = live().filter(t => t.done && t.attached);
    open.forEach((t, i) => { t.slot = Y0 + 26 + i * STEP; });
    done.forEach((t, i) => { t.slot = Y1 - 26 - (done.length - 1 - i) * STEP; });
  };
  (thumb ? [['', false], ['', false], ['', true]] : [['WATER THE PLANTS', false], ['WRITE TO MOM', false], ['SHIP THE LAB', true]])
    .forEach(([s, d]) => tasks.push(makeTask(s, d, 0)));
  layout();
  tasks.forEach(t => { t.y = t.slot; t.labY = t.slot; });

  const caption = new PixelMatrix({ size: 2.8, swirl: 8, shyR: 12, shyF: 4 });
  caption.ox = TX; caption.oy = Y1 + 30;
  let shownCaption = null, chain = 0, allDoneSeen = false, filOn = 1;
  const events = [];
  const later = (dt, fn) => events.push({ t: clock + dt, fn });

  const toggle = t => {
    t.done = !t.done;
    t.flash = 1; t.jelly.kick(-5);
    tasks.splice(tasks.indexOf(t), 1);
    if (t.done) {
      t.icon.set(bitmapCells(CHECK, 2.2));
      st.light = DONE; S.ping(true); buzz(10); st.pulse(0.6);
      st.burst(t.x, t.y, 8, 0.45);
      const firstDone = tasks.findIndex(x => x.done && x.state !== 'pop');
      tasks.splice(firstDone < 0 ? tasks.length : firstDone, 0, t); // a done task joins the top of the done stack
    } else {
      t.icon.set([]);
      S.ping(false); st.pulse(0.3);
      const firstDone = tasks.findIndex(x => x.done);
      tasks.splice(firstDone < 0 ? tasks.length : firstDone, 0, t);
    }
    pluck(t.y, t.done ? 10 : -8);
    layout();
    const l = live();
    if (l.length && l.every(x => x.done)) {
      if (!allDoneSeen) {
        allDoneSeen = true;
        later(0.45, () => {
          if (!live().every(x => x.done)) return;
          chain = 0.001; st.light = DONE; st.shock(SX, (Y0 + Y1) / 2); st.glint();
          [0.45, 0.6, 0.75, 0.9].forEach((p, i) => later(i * 0.08, () => S.key(p)));
          live().forEach((x, i, a) => later(0.08 * (a.length - 1 - i), () => { x.flash = 1.2; x.jelly.kick(-4); }));
          buzz([10, 40, 10, 40, 20]);
        });
      }
    } else { allDoneSeen = false; chain = 0; }
  };
  const pop = t => {
    if (t.state === 'pop') return;
    t.state = 'pop'; t.lab.set([]); t.icon.set([]);
    st.light = t.done ? DONE : OPEN;
    st.burst(t.x, t.y, 16, 0.8);
    S.drip(0.95, 0.7); S.tick(0.9, 0.5); buzz(8);
    layout();
  };

  // ---------------------------------------------------------------- typing
  let text = '', focused = false, caretT = 0;
  const typed = new PixelMatrix({ size: PITCH, swirl: 6, shyR: 10, shyF: 3 });
  const placeholder = new PixelMatrix({ size: PITCH, swirl: 6, shyR: 10, shyF: 3 });
  const fieldLeft = -FIELD[0] + 20;
  typed.ox = fieldLeft; typed.oy = FY; placeholder.ox = fieldLeft; placeholder.oy = FY;
  if (!thumb) placeholder.set(textCells('NEW TASK', PITCH, 1, { align: 'left' }), { instant: true });
  const setText = s => { text = s; typed.set(textCells(s, PITCH, 1, { align: 'left' })); caretT = 0; };
  const commit = () => {
    const s = text.trim();
    if (!s) { S.tick(0.2, 0.3); return; }
    if (live().length >= NB) { S.tick(0.15, 0.8); later(0.1, () => S.tick(0.12, 0.8)); return; } // the thread is full
    const t = makeTask(s, false, Y0 - 10);
    t.vy = 60; t.labY = Y0 - 10;
    tasks.unshift(t); // it drops onto the top of the thread and nudges the others down (beads can't pass each other)
    t.lab.set([], { instant: true });
    later(0.2, () => t.lab.set(textCells(s, PITCH, 1, { align: 'left' })));
    typed.set([], { instant: true });
    text = ''; if (input) input.value = '';
    S.drip(0.55, 0.5); st.pulse(0.3);
    layout();
    allDoneSeen = false; chain = 0;
  };
  let input = null;
  if (!thumb) {
    input = document.createElement('input');
    Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, maxLength: MAXC, ariaLabel: 'New task' });
    input.setAttribute('enterkeyhint', 'done');
    input.style.cssText = 'position:absolute;opacity:0;border:0;padding:0;margin:0;background:transparent;color:transparent;caret-color:transparent;font-size:16px;pointer-events:none;z-index:1';
    root.appendChild(input);
    input.addEventListener('input', () => {
      const want = [...input.value.toUpperCase()].filter(c => hasGlyph(c)).join('').replace(/^ +/, '').replace(/ {2,}/g, ' ').slice(0, MAXC);
      if (want.length > text.length) S.tick(0.5 + want.length * 0.02, 0.3);
      if (want !== text) setText(want);
      if (input.value !== want) input.value = want;
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); S._ensure(); commit(); }
      else if (e.key === 'Backspace' && !input.value) {
        e.preventDefault();
        const last = [...tasks].reverse().find(x => !x.done && x.state !== 'pop');
        if (last) pop(last);
      }
    });
    input.addEventListener('focus', () => { focused = true; });
    input.addEventListener('blur', () => { focused = false; });
    setTimeout(() => input?.focus({ preventScroll: true }), 350);
  }

  // ---------------------------------------------------------------- pointer: a row is a button, its bead also drags
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const taskAt = ([x, y]) => live().find(t => Math.abs(y - t.y) < STEP / 2 && x > t.x - R - 8 && x < (thumb ? t.x + R + 8 : TX + Math.max(textW(t.text), 40) + 10));
  const onBead = (t, [x, y]) => Math.hypot(x - t.x, y - t.y) < R + 8;
  let drag = null;
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d);
      S._ensure();
      const t = taskAt(q);
      if (t) { drag = { t, y0: q[1], x0: q[0], off: q[1] - t.y, moved: 0, onBead: onBead(t, q) }; t.jelly.kick(-2); return; }
      if (input && Math.abs(q[0]) < FIELD[0] && Math.abs(q[1] - FY) < FIELD[1] + 6) input.focus({ preventScroll: true });
    },
    move: (p, e, d) => {
      const q = local(d);
      const over = taskAt(q);
      st.canvas.style.cursor = drag && drag.t.state === 'drag' ? 'grabbing' : over ? 'pointer' : input && Math.abs(q[0]) < FIELD[0] && Math.abs(q[1] - FY) < FIELD[1] + 6 ? 'text' : 'default';
      if (!drag) return;
      const t = drag.t;
      drag.moved = Math.max(drag.moved, Math.hypot(q[0] - drag.x0, q[1] - drag.y0));
      if (drag.moved < 6 || !drag.onBead) return;
      t.state = 'drag';
      const dx = q[0] - SX;
      if (t.attached) {
        // pulled off the thread: it stretches with the bead until it lets go
        if (Math.abs(dx) > 64) {
          t.attached = false; pull = null;
          pluck(t.y, -Math.sign(dx) * 16);
          S.tick(0.95, 0.8); S.drip(0.8, 0.4); buzz(10);
          layout();
        } else pull = { y: t.y, x: dx * 0.85 };
      } else if (Math.abs(dx) < 26) { t.attached = true; S.tick(0.6, 0.4); }
      t.ty = t.attached ? clamp(q[1] - drag.off, Y0 + 16, Y1 - 16) : q[1] - drag.off;
      t.tx = t.attached ? SX + dx * 0.85 : q[0];
      // reorder within its group (open or done)
      if (t.attached) {
        const group = live().filter(x => x.done === t.done && x.attached);
        const sorted = [...group].sort((a, b) => (a === t ? t.ty : a.slot) - (b === t ? t.ty : b.slot));
        if (sorted.some((x, i) => x !== group[i])) {
          const idx = group.map(x => tasks.indexOf(x)).sort((a, b) => a - b);
          sorted.forEach((x, i) => { tasks[idx[i]] = x; });
          layout(); S.tick(0.62, 0.35);
        }
      }
    },
    up: () => {
      if (!drag) return;
      const { t, moved } = drag;
      drag = null; pull = null;
      if (t.state === 'drag') {
        if (!t.attached) { pop(t); return; }
        t.state = 'on'; t.vy = 0; t.jelly.kick(2.5); pluck(t.y, (t.x - SX) * 0.6 + 3);
        return;
      }
      if (moved < 6) toggle(t);
    },
  });
  const onClick = () => { if (!drag) input?.focus({ preventScroll: true }); };
  st.canvas.addEventListener('click', onClick);

  // ---------------------------------------------------------------- autopilot (shelf miniature): ticks tasks off, then starts over
  let demoT = 0, lastNext = null;
  const sU = new Float32Array(NS);
  const bU = new Float32Array(NB * 4), gU = new Float32Array(NB), sk = new Float32Array(NB * 4);

  st.run((dt, t) => {
    clock = t;
    for (let k = events.length - 1; k >= 0; k--) if (events[k].t <= clock) { const ev = events[k]; events.splice(k, 1); ev.fn(); }
    if (demo) {
      demoT += dt;
      if (demoT > 1.0) {
        demoT = 0;
        const open = live().find(x => !x.done);
        if (open) toggle(open); else live().forEach(x => { if (x.done) toggle(x); });
      }
    }

    while (plucks.length && t - plucks[0].t > 3) plucks.shift();
    for (let i = tasks.length - 1; i >= 0; i--) {
      const b = tasks[i];
      b.flash *= Math.exp(-dt * 2.6);
      b.doneMix += ((b.done ? 1 : 0) - b.doneMix) * Math.min(1, dt * 6);
      b.strike += ((b.done ? 1 : 0) - b.strike) * Math.min(1, dt * (b.done ? 4 : 8));
      if (b.state === 'pop') { b.grow -= dt * 6; if (b.grow <= 0) tasks.splice(i, 1); continue; }
      if (b.state === 'drag') {
        b.y += ((b.ty ?? b.y) - b.y) * Math.min(1, dt * 20);
        b.x += ((b.tx ?? b.x) - b.x) * Math.min(1, dt * 20);
      } else {
        // it falls and slides along the thread, with a little bounce when it arrives
        const k = 150, c = 2 * Math.sqrt(k) * 0.45;
        const before = b.y;
        b.vy += (-k * (b.y - b.slot) - c * b.vy) * dt; b.y += b.vy * dt;
        if (Math.sign(before - b.slot) !== Math.sign(b.y - b.slot) && Math.abs(b.vy) > 90) {
          pluck(b.y, Math.min(14, Math.abs(b.vy) * 0.03)); b.jelly.kick(-3);
          S.tick(0.45 + Math.random() * 0.2, Math.min(0.6, Math.abs(b.vy) / 600));
        }
        // on a long way it hops off the thread to the side and swings round the other beads
        const away = clamp((Math.abs(b.y - b.slot) - STEP * 0.35) / STEP, 0, 1);
        b.hop = (b.hop || 0) + ((Math.abs(b.vy) > 40 ? away : 0) - (b.hop || 0)) * Math.min(1, dt * 10);
        b.x = SX + disp(b.y, t) - b.hop * (R * 1.6);
      }
      b.labY += (b.y - b.labY) * Math.min(1, dt * 10);
      b.lab.oy = b.labY; b.lab.ox = TX;
      b.lab.step(dt, { ptr: st.local(b.lab), shy: st.ptrOn * (drag ? 0 : 0.5) });
      b.icon.ox = b.x; b.icon.oy = b.y;
      b.icon.step(dt, { ptr: null, shy: 0 });
    }
    if (pull && drag) pull.y = drag.t.y;
    if (chain > 0) chain = Math.min(1, chain + dt * 1.6);

    const l = live();
    const nDone = l.filter(x => x.done).length;
    const word = thumb ? '' : l.length ? `${nDone} OF ${l.length} DONE` : 'ALL CLEAR';
    if (word !== shownCaption) { caption.set(word ? textCells(word, 2.8, 1, { align: 'left' }) : []); shownCaption = word; }
    caption.step(dt, { ptr: st.local(caption), shy: st.ptrOn * 0.5 });

    // the filament circles the next open task
    const next = l.find(x => !x.done && x.state !== 'drag');
    filOn += ((next ? 1 : 0) - filOn) * Math.min(1, dt * 6);
    if (next) lastNext = next;
    if (!events.length && chain === 0) st.light = mix3(st.light, next ? OPEN : DONE, Math.min(1, dt * 4));
    caretT += dt;
    typed.step(dt, { ptr: null, shy: 0 });
    placeholder.step(dt, { ptr: null, shy: 0 });
    if (input) Object.assign(input.style, { left: `${st.cx - FIELD[0] * st.S}px`, top: `${st.cy + (FY - FIELD[1]) * st.S}px`, width: `${FIELD[0] * 2 * st.S}px`, height: `${FIELD[1] * 2 * st.S}px` });

    bU.fill(0); gU.fill(0); sk.fill(0);
    const vis = tasks.slice(0, NB);
    vis.forEach((b, i) => {
      const j = b.jelly.step(dt) * 0.04;
      const g = clamp(b.grow, 0, 1);
      bU.set([st.cx + b.x, st.cy + b.y, R * g * (1 + j) * (b.state === 'drag' ? 1.08 : 1), b.doneMix], i * 4);
      gU[i] = b.flash;
      if (!thumb) sk.set([st.cx + TX - 6, st.cy + b.labY, (textW(b.text) + 12) * b.strike, b.strike > 0.01 && b.state !== 'pop' ? b.strike : 0], i * 4);
    });
    for (let i = 0; i < NS; i++) sU[i] = disp(Y0 + ((Y1 - Y0) * i) / (NS - 1), t);

    st.drawPixels(ctx => {
      for (const b of vis) {
        if (!thumb) b.lab.draw(ctx, 0.92 - 0.5 * b.strike);
        b.icon.draw(ctx, clamp(b.grow, 0, 1));
      }
      caption.draw(ctx, 0.6);
      if (!thumb) {
        typed.draw(ctx, 1);
        if (!text) placeholder.draw(ctx, focused ? 0.28 : 0.4);
        const on = focused && (caretT < 0.5 || Math.cos((caretT - 0.5) * Math.PI * 2) > 0);
        if (on) { ctx.globalAlpha = 0.9; ctx.fillRect(fieldLeft + (text ? textW(text) + PITCH * 1.2 : 0) - PITCH / 2, FY - PITCH * 2.5, PITCH * 0.7, PITCH * 5); ctx.globalAlpha = 1; }
      }
    });
    st.render(t, (U, gl) => {
      gl.uniform4fv(U.uBead, bU);
      gl.uniform1fv(U.uBeadG, gU);
      gl.uniform4fv(U.uStrike, sk);
      gl.uniform1i(U.uBeadN, vis.length);
      gl.uniform1fv(U.uStr, sU);
      gl.uniform3f(U.uStrA, st.cy + Y0, st.cy + Y1, st.cx + SX);
      gl.uniform2f(U.uFieldC, st.cx, st.cy + FY);
      gl.uniform2f(U.uFieldH, FIELD[0], FIELD[1]);
      gl.uniform1f(U.uFocus, focused ? 1 : 0);
      gl.uniform1f(U.uShowField, thumb ? 0 : 1);
      gl.uniform1f(U.uEnergy, 0.75 + st.kick * 0.25);
      gl.uniform1f(U.uTh, t * (reducedMotion ? 0.6 : 2.2));
      gl.uniform1f(U.uFilOn, filOn);
      const fn = next || lastNext;
      gl.uniform3f(U.uFil, st.cx + (fn ? fn.x : SX), st.cy + (fn ? fn.y : Y0), R);
      gl.uniform1f(U.uChain, chain);
      gl.uniform3f(U.uL, ...OPEN);
      gl.uniform3f(U.uLD, ...DONE);
    });
  });

  return { dispose() { st.canvas.removeEventListener('click', onClick); input?.remove(); st.dispose(); } };
}
