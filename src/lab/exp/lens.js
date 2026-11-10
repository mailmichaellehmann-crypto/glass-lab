// LENS — a search field with a glass loupe riding the caret.
// Every key you type spins out of the loupe as pixels and settles into place; the loupe jiggles,
// clicks at the letter's own pitch and magnifies the last letters with colour fringes. Backspace
// drops the letter's pixels out of the field, × or Escape blows the whole query apart. It really
// searches the lab: the best match ghosts in as dim pixels, Tab or → takes it, Enter opens it.
// No match: the loupe shakes its head and the light turns amber. Its filament orbits with the
// length of the query, like the toggle's. A real (invisible) <input> brings the phone keyboard.

import { glassStage, PixelMatrix, Spring, Orbit, textCells, bitmapCells, hasGlyph, hexRgb, mix3 } from '../glass/engine.js';
import { compact } from '../glass/engine.js';
import { domeLens } from '../glass/lib.glsl.js';
import { EXPERIMENTS } from '../registry.js';
import { clamp, rand } from '../kit.js';

const FIELD_FULL = [292, 40], FIELD_ICON = [150, 40];
const PITCH = 4.6, ADV = PITCH * 4;
const LENS_R = 47;
const CLEAR_R = 15;

const FRAG = /* glsl */ `
uniform vec2  uField;
uniform vec2  uLensC, uLensR;
uniform float uTheta;
uniform vec3  uCaret;    // x (design), alpha
uniform vec3  uClear;    // x, y, radius (0 = hidden)
uniform float uEnergy, uLift, uPress;

float sdField(vec2 p) { return sdRoundBox(p - uC, uField, uField.y); }
float sdLensS(vec2 p) { return sdEllipse(p, uLensC, uLensR); }
float lensFil(vec2 p) { return filament(p, uLensC, sdLensS(p), uTheta, 0.75); }
float caretD(vec2 p) { vec2 d = p - vec2(uCaret.x, uC.y); return length(vec2(d.x, max(abs(d.y) - 11.0, 0.0))) - 1.1; }

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  float sdF = sdField(q);
  col = shadowed(col, sdRoundBox(q - uC - vec2(0.0, 14.0), uField, uField.y), sdRoundBox(q - uC - vec2(0.0, 1.5), uField, uField.y), 0.0);
  float fd = lensFil(q);
  col = emit(col, filamentSpill(fd) * uEnergy * 0.6);
  if (sdF < 2.0) {
    vec3 tc = tray(col, sdF, sdRoundBox(q - uC - vec2(0.0, 7.0), uField, uField.y), q, uC, uField);
    tc = emit(tc, filamentWash(fd) * uEnergy * 0.45);
    tc = emit(tc, exp(-max(caretD(q), 0.0) / 7.0) * 0.3 * uCaret.y);
    float ls = sdEllipse(q, uLensC + vec2(0.0, 9.0 + uLift * 6.0 - uPress * 5.0), uLensR);
    tc *= 1.0 - (1.0 - smoothstep(-8.0, 22.0 + uLift * 10.0, ls)) * mix(0.5, 0.18, uTheme);
    if (uClear.z > 0.5) {
      float cs = length(q - uClear.xy - vec2(0.0, 5.0)) - uClear.z;
      tc *= 1.0 - (1.0 - smoothstep(-4.0, 10.0, cs)) * mix(0.4, 0.15, uTheme);
    }
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdF));
  }
  float cover;
  col = ink(col, q, frost, vec2(0.0), filamentWash(fd) * uEnergy * 0.4, uLight, cover);
  float cd = caretD(q);
  col = mix(col, mix(uLight, vec3(1.0), 0.6), (1.0 - smoothstep(-0.6, 0.6, cd)) * uCaret.y);
  return col;
}
${domeLens('lensDome', 'scene')}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);
  if (uClear.z > 0.5) {
    float cd = length(p - uClear.xy) - uClear.z;
    if (cd < 2.0) {
      vec3 kc = lensDome(p, sp, uClear.xy, vec2(uClear.z), 0.05, 0.7, vec4(0.0), uLight, 0.25);
      col = mix(kc, col, smoothstep(-0.7, 0.7, cd));
    }
  }
  float sk = sdLensS(p);
  if (sk < 2.0) {
    vec3 kc = lensDome(p, sp, uLensC, uLensR, 0.07, 1.05, vec4(0.0), uLight, filamentScatter(lensFil(p)) * uEnergy * 0.9);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }
  col = drawFilament(col, lensFil(p), uLight, uEnergy * (1.0 + uKick * 0.5));
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

const LOUPE = ['..###....', '.#...#...', '#.....#..', '#.....#..', '#.....#..', '.#...#...', '..###.#..', '.......#.', '........#'];
const IDLE = hexRgb('#a9b8ff'), MISS = hexRgb('#ffb347');
const TARGETS = [...EXPERIMENTS.map(e => ({ id: e.id, name: e.name.toUpperCase(), color: hexRgb(e.accent) })), { id: 'toggle', name: 'TOGGLE', color: hexRgb('#ffa630') }];

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  // the shelf miniature is a short field; the full control is long
  const C = !thumb && compact();
  const FIELD = thumb ? FIELD_ICON : C ? [176, 40] : FIELD_FULL;
  const TEXT_X0 = -FIELD[0] + 68, CLEAR_X = FIELD[0] - 34;
  const MAX = Math.floor((FIELD[0] * 2 - 68 - 70) / ADV);
  const st = glassStage(root, { frag: FRAG, box: [FIELD[0] * 2 + (C ? 40 : 200), FIELD[1] * 2 + 260], thumb });
  await st.ready; // the shader compiles off the main thread; show nothing half-made
  const S = st.sfx;

  // ---------------------------------------------------------------- pixel layers
  const chars = [];           // { ch, m }
  let falling = [];           // loose pixels dropping out / blown away
  const ghost = new PixelMatrix({ size: 3.6, swirl: 6, shyR: 12, shyF: 4 });
  const placeholder = new PixelMatrix({ size: 3.4, swirl: 10, shyR: 12, shyF: 4 });
  const icon = new PixelMatrix({ size: 3.3, swirl: 6, shyR: 12, shyF: 4 });
  const xIcon = new PixelMatrix({ size: 2.6, swirl: 4 });
  placeholder.ox = TEXT_X0; ghost.ox = TEXT_X0;
  icon.ox = -FIELD[0] + 36; xIcon.ox = CLEAR_X;
  icon.set(bitmapCells(LOUPE, 3.9), { instant: true });
  xIcon.set(textCells('×', 3.0), { instant: true });
  const PLACEHOLDER = textCells(thumb ? 'SEARCH' : 'SEARCH THE LAB', PITCH, 0.32, { align: 'left' });
  placeholder.set(PLACEHOLDER, { instant: true });

  // ---------------------------------------------------------------- state
  let lx = TEXT_X0 + 30, lv = 0, shake = 0, press = 0, lift = 0, flash = 0, idleT = 9, clearS = 0, clearV = 0;
  let suggestion = null, lightNow = [...IDLE], goTimer = 0;
  const jelly = new Spring(420, 12);
  const orbit = new Orbit(0);
  const text = () => chars.map(c => c.ch).join('');

  function bestMatch(t) {
    if (!t) return null;
    return TARGETS.find(x => x.name.startsWith(t)) || null;
  }
  function refreshSuggestion() {
    const t = text();
    suggestion = bestMatch(t);
    const rest = suggestion ? suggestion.name.slice(t.length) : '';
    ghost.ox = TEXT_X0 + chars.length * ADV;
    ghost.set(rest ? textCells(rest, PITCH, 0.26, { align: 'left' }) : []);
    placeholder.set(chars.length ? [] : PLACEHOLDER);
  }

  function addChar(ch, quiet = false) {
    ch = ch.toUpperCase();
    if (chars.length >= MAX || !hasGlyph(ch)) { refuse(); return false; }
    const k = chars.length;
    const m = new PixelMatrix({ size: 3.9, swirl: 16, shyR: 13, shyF: 5 });
    m.ox = TEXT_X0 + k * ADV;
    m.set(textCells(ch, PITCH, 1, { align: 'left' }), { instant: true });
    // the letter is born inside the loupe and spins out to its place
    for (const p of m.px) {
      const a = rand(0, Math.PI * 2), r = rand(3, 18);
      p.x = (lx - m.ox) + Math.cos(a) * r; p.y = Math.sin(a) * r * 0.8;
      p.vx = rand(-180, 120); p.vy = rand(-220, 80); p.delay = rand(0, 0.07);
    }
    chars.push({ ch, m });
    jelly.kick(-2.2 - Math.random());
    idleT = 0;
    if (!quiet) { S.key((ch.charCodeAt(0) % 26) / 26); st.buzz(3); }
    refreshSuggestion();
    return true;
  }
  function backspace() {
    const c = chars.pop();
    if (!c) { refuse(0.3); return; }
    for (const p of c.m.px) falling.push({ x: c.m.ox + p.x, y: p.y, vx: rand(-50, 50), vy: rand(-110, 10), b: p.b, life: rand(0.55, 0.95), g: 1100 });
    jelly.kick(1.6); idleT = 0;
    S.tick(0.15, 0.7);
    refreshSuggestion();
  }
  function clearAll(silent = false) {
    if (!chars.length) return;
    for (const c of chars) for (const p of c.m.px) {
      const x = c.m.ox + p.x, y = p.y, dx = x - lx, d = Math.hypot(dx, y) || 1, sp = rand(220, 560);
      falling.push({ x, y, vx: dx / d * sp + rand(-60, 60), vy: y / d * sp + rand(-120, 60), b: p.b, life: rand(0.5, 0.9), g: 500 });
    }
    chars.length = 0;
    st.burst(lx, 0, 14, 0.9);
    jelly.kick(5); st.pulse(0.8);
    if (!silent) { S.land(0.35); st.buzz(10); }
    refreshSuggestion();
  }
  function refuse(amount = 1) { shake = Math.max(shake, amount); S.tick(0.03, 0.9); st.buzz([10, 40, 10]); }
  // letters that arrive in a burst (paste, accepted suggestion) are queued and spun in one by one
  let queue = [], queueT = 0;
  const pendingText = () => text() + queue.map(q => q.ch).join('');
  function enqueue(str, quietFirst = false) { [...str].forEach((ch, i) => queue.push({ ch, quiet: i > 0 || quietFirst })); }
  function accept() {
    if (!suggestion) return false;
    const rest = suggestion.name.slice(pendingText().length);
    enqueue(rest);
    syncInput();
    return rest.length > 0;
  }
  function submit() {
    if (!chars.length) { refuse(0.6); return; }
    const t = text();
    const hit = TARGETS.find(x => x.name === t) || suggestion;
    if (!hit) { refuse(); return; }
    if (hit.name !== t) accept();
    flash = 1; st.glint(); st.pulse(1); jelly.kick(-6);
    st.burst(lx, -LENS_R, 10, 0.8, -Math.PI / 2, 1.0);
    S.ping(true);
    if (!demo && !thumb) goTimer = 0.55 + Math.max(0, hit.name.length - t.length) * 0.045;
    st.goto = hit.id;
  }

  // ---------------------------------------------------------------- the real input
  let input = null;
  const syncInput = () => { if (input) input.value = pendingText(); };
  if (!thumb) {
    input = document.createElement('input');
    Object.assign(input, { type: 'text', autocomplete: 'off', spellcheck: false, maxLength: MAX, ariaLabel: 'Search the lab' });
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('enterkeyhint', 'search');
    input.className = 'lens-input';
    input.style.cssText = 'position:absolute;opacity:0;border:0;padding:0;margin:0;background:transparent;color:transparent;caret-color:transparent;font-size:16px;pointer-events:none;z-index:1';
    root.appendChild(input);
    input.addEventListener('input', () => {
      const want = [...input.value.toUpperCase()].filter(hasGlyph).join('').slice(0, MAX);
      const have = pendingText(); // what is shown plus what is still queued
      if (want.startsWith(have)) enqueue(want.slice(have.length));
      else if (have.startsWith(want)) {
        let drop = have.length - want.length;
        while (drop > 0 && queue.length) { queue.pop(); drop--; }
        while (drop-- > 0) backspace();
      } else { queue = []; clearAll(); enqueue(want, true); queueT = -0.12; }
      if (input.value !== want) input.value = want;
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { if (chars.length) { e.preventDefault(); e.stopPropagation(); clearAll(); syncInput(); } }
      else if ((e.key === 'Tab' || (e.key === 'ArrowRight' && input.selectionStart === input.value.length)) && suggestion && suggestion.name.length > chars.length) {
        e.preventDefault(); accept();
      }
      e.stopPropagation(); // typing must not drive the stage ([ ] navigation)
      if (e.key === 'Escape' && !chars.length) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    setTimeout(() => input.focus({ preventScroll: true }), 300);
  }

  // ---------------------------------------------------------------- pointer
  const overField = ([x, y]) => Math.abs(x - st.cx) < FIELD[0] + 4 && Math.abs(y - st.cy) < FIELD[1] + 8;
  const overClear = ([x, y]) => clearS > 0.5 && Math.hypot(x - st.cx - CLEAR_X, y - st.cy) < CLEAR_R + 6;
  st.bindPointer({
    down: (p, e, d) => {
      if (overClear(d)) { clearAll(); syncInput(); press = 1; }
      else if (overField(d)) press = 1;
      input?.focus({ preventScroll: true });
    },
    up: () => { press = 0; },
    move: (p, e, d) => { st.canvas.style.cursor = overClear(d) ? 'pointer' : overField(d) ? 'text' : 'default'; },
  });
  const onClick = () => input?.focus({ preventScroll: true });
  st.canvas.addEventListener('click', onClick);

  // ---------------------------------------------------------------- autopilot (shelf preview)
  const script = [];
  let demoT = 0;
  const demoRound = () => {
    const b = demoT, w = 'DIAL', e = b + 0.5 + w.length * 0.17;
    [...w].forEach((ch, i) => script.push([b + 0.5 + i * 0.17, () => addChar(ch)]));
    script.push([e + 0.6, submit], [e + 1.8, () => clearAll()], [e + 2.7, demoRound]);
  };
  if (demo) demoRound();

  let lastLayout = '';
  st.run((dt, t) => {
    if (demo) {
      demoT += dt;
      while (script.length && script[0][0] <= demoT) script.shift()[1]();
    }
    if (goTimer > 0 && (goTimer -= dt) <= 0) window.dispatchEvent(new CustomEvent('lab:goto', { detail: { id: st.goto } }));
    // spin queued letters in, one every 40 ms (the first one right away)
    queueT += dt;
    if (queue.length && queueT >= 0.04) { const q = queue.shift(); addChar(q.ch, q.quiet); queueT = 0; }

    // keep the invisible input over the field (for focus, IME and the phone keyboard)
    if (input) {
      const L = `${st.cx - FIELD[0] * st.S}|${st.cy - FIELD[1] * st.S}|${st.S}`;
      if (L !== lastLayout) {
        lastLayout = L;
        Object.assign(input.style, { left: `${st.cx - FIELD[0] * st.S}px`, top: `${st.cy - FIELD[1] * st.S}px`, width: `${FIELD[0] * 2 * st.S}px`, height: `${FIELD[1] * 2 * st.S}px` });
      }
    }

    // loupe: follows the caret, stretches with speed, jiggles on keys, shakes on a miss
    const n = chars.length;
    const caretX = TEXT_X0 + n * ADV - 2.3;
    // in the shelf miniature the loupe parks just past the word, so the word stays legible
    const target = clamp(n ? (thumb ? caretX + LENS_R - 4 : caretX - 10) : TEXT_X0 + 48, -FIELD[0] + LENS_R - 6, FIELD[0] - (thumb ? 30 : 70));
    const k = 170, c = 2 * Math.sqrt(k) * 0.62;
    lv += (-k * (lx - target) - c * lv) * dt; lx += lv * dt;
    shake *= Math.exp(-dt * 4.5);
    const shx = Math.sin(t * 42) * shake * 9 * (reducedMotion ? 0.2 : 1);
    const j = jelly.step(dt) * 0.03;
    const stretch = Math.min(Math.abs(lv) * 0.008, 0.14);
    press += (0 - press) * Math.min(1, dt * 6);
    lift += ((st.ptrOn > 0.5 ? 1 : 0) - lift) * Math.min(1, dt * 8);
    const rx = LENS_R * (1 + j + stretch) * (1 - press * 0.03);
    const ry = LENS_R * (1 - j - stretch * 0.5) * (1 - press * 0.03);

    // clear bead pops in when there is text
    clearV += (-260 * (clearS - (n ? 1 : 0)) - 16 * clearV) * dt; clearS = clamp(clearS + clearV * dt, 0, 1.3);

    // light: idle cool, the match's colour, amber on a miss or a shake
    const t2 = text();
    const want = shake > 0.25 || (t2 && !suggestion) ? MISS : suggestion ? suggestion.color : IDLE;
    lightNow = mix3(lightNow, want, Math.min(1, dt * 6));
    st.light = lightNow;
    flash *= Math.exp(-dt * 3);
    idleT += dt;
    const focused = !input || document.activeElement === input;
    const caretA = (focused ? (idleT < 0.6 ? 1 : 0.55 + 0.45 * Math.cos((idleT - 0.6) * Math.PI * 1.6)) : 0.25);
    const theta = orbit.step(dt, n / MAX);
    const energy = (n ? 0.6 : 0.4) * (1 + lift * 0.1) + flash * 0.8;

    // pixels
    const shy = st.ptrOn * 0.7;
    for (const ch of chars) ch.m.step(dt, { ptr: st.local(ch.m), shy });
    ghost.step(dt); placeholder.step(dt, { ptr: st.local(placeholder), shy }); icon.step(dt); xIcon.step(dt);
    for (const f of falling) { f.vy += f.g * dt; f.vx *= Math.exp(-dt * 1.5); f.x += f.vx * dt; f.y += f.vy * dt; f.life -= dt; }
    falling = falling.filter(f => f.life > 0);

    st.drawPixels(ctx => {
      icon.draw(ctx, n ? 0.9 : 0.55);
      placeholder.draw(ctx);
      ghost.draw(ctx, 1);
      for (const ch of chars) ch.m.draw(ctx);
      for (const f of falling) { ctx.globalAlpha = Math.min(1, f.b * f.life * 1.6); ctx.fillRect(f.x - 1.8, f.y - 1.8, 3.6, 3.6); }
      ctx.globalAlpha = 1;
      if (clearS > 0.05) { ctx.save(); ctx.translate(CLEAR_X, 0); ctx.scale(clearS, clearS); ctx.translate(-CLEAR_X, 0); xIcon.draw(ctx, 0.9); ctx.restore(); }
    });
    st.render(t, U => {
      const gl = st.gl;
      gl.uniform2f(U.uField, FIELD[0], FIELD[1]);
      gl.uniform2f(U.uLensC, st.cx + lx + shx, st.cy - lift * 2 + press * 2);
      gl.uniform2f(U.uLensR, rx, ry);
      gl.uniform1f(U.uTheta, theta);
      gl.uniform3f(U.uCaret, st.cx + caretX, caretA, 0);
      gl.uniform3f(U.uClear, st.cx + CLEAR_X, st.cy, CLEAR_R * clearS);
      gl.uniform1f(U.uEnergy, energy);
      gl.uniform1f(U.uLift, lift);
      gl.uniform1f(U.uPress, press);
    });
  });

  return {
    dispose() { st.canvas.removeEventListener('click', onClick); input?.remove(); st.dispose(); },
  };
}
