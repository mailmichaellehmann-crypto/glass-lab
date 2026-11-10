// SECRET — a password field with a decoding lens and a strength tube, seen from above.
// Typed characters show for a blink as crisp pixels, then fold into dots. A thick glass lens with an eye
// parks at the end of the field: slide it over the dots and exactly the characters beneath it decode,
// morphing back to dots as it passes; let go and it glides home. Tap it and it stretches like liquid
// over the whole word and reveals everything; tap again and it pulls back. Below, a glass tube fills
// with liquid light as the password grows stronger: it sloshes with every key and turns from red
// through amber to green. Enter with a strong password: saved. A weak one: the field shakes its head.

import { glassStage, PixelMatrix, Spring, textCells, bitmapCells, hasGlyph, hexRgb, mix3 } from '../glass/engine.js';
import { thickGlass } from '../glass/lib.glsl.js';
import { clamp } from '../kit.js';

const RED = hexRgb('#ff4d5e'), AMBER = hexRgb('#ffb547'), GREEN = hexRgb('#3dffa8'), LENS = hexRgb('#b38bff');
const liquid = s => (s < 0.5 ? mix3(RED, AMBER, s * 2) : mix3(AMBER, GREEN, (s - 0.5) * 2));
const DOTB = ['.##.', '####', '####', '.##.'];
const EYE = ['..###..', '.#...#.', '#..#..#', '.#...#.', '..###..'];
const SHUT = ['.......', '.......', '#.....#', '.#####.', '..#.#..'];
const MAXC = 16;
const COMMON = ['PASSWORD', '123456', '12345678', 'QWERTY', 'LETMEIN', 'ADMIN', 'WELCOME', '111111', 'ABC123'];

function strength(s) {
  if (!s) return 0;
  let v = Math.min(s.length, 14) / 14 * 0.5;
  if (/[a-z]/.test(s)) v += 0.12;
  if (/[A-Z]/.test(s)) v += 0.12;
  if (/[0-9]/.test(s)) v += 0.12;
  if (/[^a-zA-Z0-9]/.test(s)) v += 0.14;
  if (s.length < 6) v = Math.min(v, 0.28);
  if (COMMON.includes(s.toUpperCase()) || /^(.)\1+$/.test(s)) v = 0.08;
  return clamp(v, 0, 1);
}
const verdict = v => (v <= 0 ? '' : v < 0.3 ? 'WEAK' : v < 0.55 ? 'FAIR' : v < 0.8 ? 'GOOD' : 'STRONG');

const FRAG = /* glsl */ `
uniform vec4  uField;          // field centre (abs), half size
uniform vec4  uLens;           // lens centre (abs), half width, half height
uniform vec4  uTube;           // tube centre (abs), half size
uniform float uLevel, uSlosh, uFlash, uShake, uEnergy, uTh, uFilOn, uLift, uPress;
uniform vec3  uLiq, uL;

float sdLens(vec2 p) { return sdRoundBox(p - uLens.xy, uLens.zw, uLens.w); }
float sdTube(vec2 p) { return sdRoundBox(p - uTube.xy, uTube.zw, uTube.w); }
float fil(vec2 p) { return filament(p, uLens.xy, sdLens(p), uTh, 0.5); }

vec3 scene(vec2 q, vec2 sp, float frost, out float cover) {
  vec3 col = pageBg(sp);
  // the field
  vec2 fc = uField.xy, fh = uField.zw;
  float sdF = sdRoundBox(q - fc, fh, fh.y);
  col = shadowed(col, sdRoundBox(q - fc - vec2(0.0, 12.0), fh, fh.y), sdRoundBox(q - fc - vec2(0.0, 1.5), fh, fh.y), 0.0);
  if (sdF < 2.0) {
    vec3 tc = tray(col, sdF, sdRoundBox(q - fc - vec2(0.0, 6.0), fh, fh.y), q, fc, fh);
    tc = emitC(tc, uLiq, exp(-abs(sdF + 1.6) / 1.5) * smoothstep(-fh.y * 0.3, fh.y, q.y - fc.y) * (0.3 + 0.7 * uFlash) * uEnergy);
    tc = emitC(tc, GREENC, uFlash * 0.25 * (1.0 - smoothstep(-0.6, 0.6, sdF)));
    // the lens's shadow in the field
    float ls = sdLens(q - vec2(0.0, 8.0 + uLift * 6.0 - uPress * 4.0));
    tc *= 1.0 - (1.0 - smoothstep(-6.0, 16.0 + uLift * 8.0, ls)) * mix(0.45, 0.16, uTheme);
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdF));
  }
  // the tube: a hollow glass rod; liquid light lies inside it, up to the level, with a sloshing meniscus
  float st = sdTube(q);
  col *= 1.0 - (1.0 - smoothstep(-4.0, 12.0, sdTube(q - vec2(0.0, 6.0)))) * mix(0.45, 0.16, uTheme);
  if (st < 0.0) {
    float x0 = uTube.x - uTube.z + uTube.w, x1 = uTube.x + uTube.z - uTube.w;
    float lx = mix(x0 - uTube.w, x1 + uTube.w, uLevel) + sin((q.y - uTube.y) * 0.45 + uTime * 9.0) * uSlosh * 3.0;
    float inL = smoothstep(lx + 1.5, lx - 1.5, q.x) * step(0.001, uLevel);
    float depth = -st / uTube.w;
    vec3 floor_ = mix(vec3(0.03), vec3(0.8), uTheme);
    col = mix(col, floor_, 0.55);
    col = emitC(col, uLiq, inL * (0.65 + 0.35 * depth) * uEnergy);
    col = mix(col, uLiq * mix(0.9, 0.78, depth), inL * 0.7 * uTheme);   // on the light page the liquid needs body, not just glow
    col = emitC(col, mix(uLiq, vec3(1.0), 0.5), smoothstep(2.5, 0.0, abs(q.x - lx)) * step(0.001, uLevel) * step(uLevel, 0.995) * 0.7);
  }
  col = emitC(col, uLiq, exp(-max(st, 0.0) / 10.0) * uLevel * 0.25 * uEnergy);
  float f = max(fil(q), 0.0);
  col = emitC(col, uL, filamentSpill(f) * 0.5 * uFilOn * uEnergy);
  return ink(col, q, frost, vec2(0.0), 0.0, uL, cover);
}

${thickGlass('thick', 'scene')}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  float cover;
  vec3 col = scene(p, sp, 0.0, cover);
  vec2 e = vec2(0.5, 0.0);
  float sd = sdTube(p);
  if (sd < 2.0) {
    vec2 n = normalize(vec2(sdTube(p + e.xy) - sdTube(p - e.xy), sdTube(p + e.yx) - sdTube(p - e.yx)) + 1e-5);
    vec3 kc = thick(p, sp, n, max(-sd, 0.0), uTube.xy, uTube.zw, uTube.w, 7.0, 0.08, uLevel * 0.3, uLiq);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sd));
  }
  sd = sdLens(p);
  if (sd < 2.0) {
    vec2 n = normalize(vec2(sdLens(p + e.xy) - sdLens(p - e.xy), sdLens(p + e.yx) - sdLens(p - e.yx)) + 1e-5);
    vec3 kc = thick(p, sp, n, max(-sd, 0.0), uLens.xy, uLens.zw, 13.0, 14.0, 0.09, filamentScatter(max(fil(p), 0.0)) * uFilOn * 0.8 + 0.08, uL);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sd));
  }
  col = mix(col, drawFilament(col, fil(p), uL, uEnergy * (1.0 + uKick * 0.5)), uFilOn);
  fragColor = vec4(finishAt(col, p), 1.0);
}`.replace('GREENC', 'vec3(0.24, 1.0, 0.66)');

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const FIELD = thumb ? [118, 26] : [214, 30];
  const FY = thumb ? -14 : -24;
  const LR = thumb ? 22 : 27;                            // lens radius
  const PARK = FIELD[0] - LR - 6;                        // lens home (x)
  const PITCH = thumb ? 3.0 : 3.6, DOT = PITCH * 0.84;
  const CW = PITCH * 4;                                  // one character cell
  const X0 = -FIELD[0] + 22 + PITCH;                     // first character
  const TUBE = thumb ? [96, 7] : [170, 8];
  const TY = thumb ? 30 : 42, TX = thumb ? -18 : -40;
  const st = glassStage(root, { frag: FRAG, box: [FIELD[0] * 2 + 70, (TY + 60) * 2], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => st.buzz(pat);

  // ---------------------------------------------------------------- characters: each a little pixel matrix
  let pass = '';
  const cells = [];
  const glyphOf = ch => { const u = ch.toUpperCase(); return hasGlyph(u) && u !== ' ' ? u : '#'; };
  const cellX = i => X0 + i * CW;
  const makeCell = (ch, i) => {
    const m = new PixelMatrix({ size: DOT, swirl: 9, shyR: 10, shyF: 3 });
    m.ox = cellX(i); m.oy = FY;
    return { ch, m, shown: null, peek: 0.7 };            // peek: a just-typed character shows for a moment
  };
  let lensX = PARK, lensV = 0, lensHW = LR, open = false, lensDrag = null, press = 0, lift = 0;
  let level = 0, levelV = 0, slosh = 0, flash = 0, shake = 0, filOn = 0.4, th = 0;
  const lensJ = new Spring(380, 10);
  const eye = new PixelMatrix({ size: 2.5, swirl: 8, shyR: 8, shyF: 2 });
  eye.set(bitmapCells(SHUT, 3.0), { instant: true });
  const word = new PixelMatrix({ size: 2.4, swirl: 8, shyR: 12, shyF: 4 });
  word.ox = TX + TUBE[0] + 16; word.oy = TY;
  const hint = new PixelMatrix({ size: DOT, swirl: 6, shyR: 10, shyF: 3 });
  hint.ox = X0 - PITCH; hint.oy = FY;
  if (!thumb) hint.set(textCells('PASSWORD', PITCH, 1, { align: 'left' }), { instant: true });
  let shownWord = null, lastVerdict = '';

  const setPass = s => {
    const grew = s.length > pass.length;
    pass = s;
    while (cells.length > s.length) { const c = cells.pop(); c.m.set([]); dying.push(c); }
    for (let i = 0; i < s.length; i++) {
      if (!cells[i]) cells[i] = makeCell(s[i], i);
      else if (cells[i].ch !== s[i]) { cells[i].ch = s[i]; cells[i].peek = 0.7; cells[i].shown = null; }
    }
    if (grew) { S.key((s.charCodeAt(s.length - 1) % 26) / 26); levelV += 1.2; slosh = 1; }
    else { S.tick(0.3, 0.3); slosh = 0.6; }
    const v = verdict(strength(s));
    if (v !== lastVerdict) {
      if (v === 'STRONG') { S.ping(true); st.burst(TX + TUBE[0] - 10, TY, 10, 0.5); st.glint(); buzz(10); }
      else if (v) S.tick(0.5 + ['WEAK', 'FAIR', 'GOOD'].indexOf(v) * 0.15, 0.5);
      lastVerdict = v;
    }
  };
  const dying = [];
  const submit = () => {
    const v = strength(pass);
    if (!pass) { S.tick(0.2, 0.3); return; }
    if (v >= 0.8) { flash = 1; S.ping(true); later(() => S.note(1318.5, 0.6, 0.6), 0.09); st.shock(0, FY); st.glint(); buzz([10, 40, 20]); }
    else { shake = 1; S.tick(0.12, 0.9); later(() => S.tick(0.1, 0.9), 0.12); buzz([20, 30, 20]); }
  };
  const events = [];
  let clock = 0;
  const later = (fn, dt) => events.push({ t: clock + dt, fn });
  const toggleOpen = () => {
    open = !open;
    eye.set(bitmapCells(open ? EYE : SHUT, 3.0));
    lensJ.kick(-4); S.drip(open ? 0.7 : 0.45, 0.5); st.pulse(0.4);
  };

  // ---------------------------------------------------------------- the real input (invisible)
  let inp = null, focused = false;
  if (!thumb) {
    inp = document.createElement('input');
    Object.assign(inp, { type: 'text', autocomplete: 'off', spellcheck: false, maxLength: MAXC, ariaLabel: 'Password' });
    inp.setAttribute('autocapitalize', 'off');
    inp.setAttribute('autocorrect', 'off');
    inp.setAttribute('enterkeyhint', 'done');
    inp.style.cssText = 'position:absolute;opacity:0;border:0;padding:0;margin:0;background:transparent;color:transparent;caret-color:transparent;font-size:16px;pointer-events:none;z-index:1';
    root.appendChild(inp);
    inp.addEventListener('input', () => { const s = inp.value.slice(0, MAXC); if (s !== pass) setPass(s); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); S._ensure(); submit(); } });
    inp.addEventListener('focus', () => { focused = true; });
    inp.addEventListener('blur', () => { focused = false; });
    setTimeout(() => inp?.focus({ preventScroll: true }), 350);
  }

  // ---------------------------------------------------------------- pointer: slide the lens, tap it to reveal all
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const onLens = ([x, y]) => Math.abs(x - lensX) < lensHW + 6 && Math.abs(y - FY) < LR + 6;
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d);
      S._ensure();
      if (onLens(q)) { lensDrag = { off: lensX - q[0], x0: q[0], moved: 0 }; press = 1; lensJ.kick(-2); return; }
      if (inp) inp.focus({ preventScroll: true });
    },
    move: (p, e, d) => {
      const q = local(d);
      st.canvas.style.cursor = lensDrag ? 'grabbing' : onLens(q) ? 'grab' : Math.abs(q[1] - FY) < FIELD[1] + 4 && Math.abs(q[0]) < FIELD[0] ? 'text' : 'default';
      if (!lensDrag) return;
      lensDrag.moved = Math.max(lensDrag.moved, Math.abs(q[0] - lensDrag.x0));
      if (lensDrag.moved > 5 && open) toggleOpen();
      lensDrag.x = clamp(q[0] + lensDrag.off, -FIELD[0] + LR + 4, PARK);
    },
    up: () => {
      if (!lensDrag) return;
      const { moved } = lensDrag;
      lensDrag = null; press = 0;
      if (moved <= 5) toggleOpen(); else { lensJ.kick(2.5); S.tick(0.45, 0.4); }
    },
  });
  const onClick = () => inp?.focus({ preventScroll: true });
  st.canvas.addEventListener('click', onClick);

  // ---------------------------------------------------------------- autopilot (shelf miniature)
  let demoT = 0, demoK = 0;
  const DEMO = 'Gl4ss!Lab';

  st.run((dt, t) => {
    clock += dt;
    for (let k = events.length - 1; k >= 0; k--) if (events[k].t <= clock) { const ev = events[k]; events.splice(k, 1); ev.fn(); }
    if (demo) {
      demoT += dt;
      if (demoK < DEMO.length && demoT > 0.12) { demoT = 0; setPass(DEMO.slice(0, ++demoK)); }
      else if (demoK >= DEMO.length && demoT > 2.6) { demoT = 0; demoK = 0; setPass(''); }
    }

    // the lens: follows the hand, or glides home; stretched over the word when open
    const textW = Math.max(CW, pass.length * CW);
    const wantHW = open ? Math.max(LR, textW / 2 + 16) : LR;
    const wantX = open ? X0 - PITCH + textW / 2 - CW / 2 + PITCH : lensDrag?.x ?? PARK;
    { const k = lensDrag ? 900 : 170, c = 2 * Math.sqrt(k) * (lensDrag ? 0.9 : 0.62); lensV += (-k * (lensX - wantX) - c * lensV) * dt; lensX += lensV * dt; }
    lensHW += (wantHW - lensHW) * Math.min(1, dt * 9);
    S.air(Math.abs(lensV) / 400);

    // each character: dot, or its glyph while it peeks or sits under the lens
    for (const [i, c] of cells.entries()) {
      c.peek = Math.max(0, c.peek - dt);
      const under = Math.abs(cellX(i) - lensX) < lensHW - 8 && (lensDrag || open || lensX < PARK - 4);
      const show = c.peek > 0 || under ? 'ch' : 'dot';
      if (show !== c.shown) {
        c.m.set(show === 'ch' ? textCells(glyphOf(c.ch), PITCH) : bitmapCells(DOTB, DOT * 0.9));
        if (show === 'ch' && under && c.shown === 'dot') S.tick(0.75 + (i % 5) * 0.04, 0.12);
        c.shown = show;
      }
      c.m.ox = cellX(i) + (shake ? Math.sin(t * 60) * 6 * shake : 0);
      c.m.step(dt, { ptr: null, shy: 0 });
    }
    for (let k = dying.length - 1; k >= 0; k--) { dying[k].m.step(dt, {}); if (!dying[k].m.px.length) dying.splice(k, 1); }

    // the liquid: a sloshing spring toward the strength
    const sv = strength(pass);
    { const k = 60, c = 2 * Math.sqrt(k) * 0.35; levelV += (-k * (level - sv) - c * levelV) * dt; level = clamp(level + levelV * dt, 0, 1); }
    slosh *= Math.exp(-dt * 2.5);
    flash *= Math.exp(-dt * 2); shake *= Math.exp(-dt * 6);
    const liq = liquid(level);
    const vw = thumb ? '' : verdict(sv);
    if (vw !== shownWord) { word.set(vw ? textCells(vw, 2.8, 1, { align: 'left' }) : []); shownWord = vw; }
    word.step(dt, { ptr: st.local(word), shy: st.ptrOn * 0.4 });
    hint.step(dt, { ptr: null, shy: 0 });
    eye.ox = lensX; eye.oy = FY + (open ? 0 : 0);
    eye.step(dt, { ptr: null, shy: 0 });

    press += ((lensDrag ? 1 : 0) - press) * Math.min(1, dt * 12);
    lift += ((lensDrag ? 1 : 0) - lift) * Math.min(1, dt * 10);
    filOn += ((open || lensDrag ? 1 : 0.4) - filOn) * Math.min(1, dt * 5);
    th += dt * (reducedMotion ? 0.4 : 1.6);
    st.light = mix3(LENS, liq, 0.25 + flash * 0.6);
    const lj = lensJ.step(dt) * 0.035;
    if (inp) Object.assign(inp.style, { left: `${st.cx - FIELD[0] * st.S}px`, top: `${st.cy + (FY - FIELD[1]) * st.S}px`, width: `${FIELD[0] * 2 * st.S}px`, height: `${FIELD[1] * 2 * st.S}px` });

    st.drawPixels(ctx => {
      if (!pass && !thumb) hint.draw(ctx, focused ? 0.25 : 0.38);
      for (const c of cells) c.m.draw(ctx, 0.95);
      for (const c of dying) c.m.draw(ctx, 0.95);
      // the eye sits under the lens while it is at home or open
      const home = clamp(1 - Math.abs(lensX - PARK) / 20, 0, 1);
      eye.draw(ctx, home * 0.8);                     // only at home: when open, the lens covers the word
      word.draw(ctx, 0.7);
    });
    st.render(t, (U, gl) => {
      gl.uniform4f(U.uField, st.cx + (shake ? Math.sin(t * 60) * 6 * shake : 0), st.cy + FY, FIELD[0], FIELD[1]);
      gl.uniform4f(U.uLens, st.cx + lensX, st.cy + FY - lift * 2, lensHW * (1 + lj), LR * (1 - lj) * (1 - press * 0.03));
      gl.uniform4f(U.uTube, st.cx + TX, st.cy + TY, TUBE[0], TUBE[1]);
      gl.uniform1f(U.uLevel, level);
      gl.uniform1f(U.uSlosh, slosh + Math.min(1, Math.abs(levelV) * 0.6));
      gl.uniform1f(U.uFlash, flash);
      gl.uniform1f(U.uShake, shake);
      gl.uniform3f(U.uLiq, ...liq);
      gl.uniform3f(U.uL, ...LENS);
      gl.uniform1f(U.uEnergy, 0.8 + st.kick * 0.25);
      gl.uniform1f(U.uTh, th);
      gl.uniform1f(U.uFilOn, filOn);
      gl.uniform1f(U.uLift, lift);
      gl.uniform1f(U.uPress, press);
    });
  });

  return { dispose() { st.canvas.removeEventListener('click', onClick); inp?.remove(); S.air(0); st.dispose(); } };
}
