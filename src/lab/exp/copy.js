// COPY — a copy button whose drop divides like a cell. Seen from above.
// A link lies in a tray as pixels; a glass drop with a copy icon sits at its end. Click: a band of light
// sweeps the text like a selection, the drop divides (a liquid neck pinches and tears with a pop), a
// pixel copy of the text lifts out of the tray and streams into the new drop, which rises away with it
// and evaporates (off to the clipboard). The text really is copied. The drop shows a check, COPIED.

import { glassStage, PixelMatrix, Spring, textCells, bitmapCells, hexRgb, mix3 } from '../glass/engine.js';
import { clamp } from '../kit.js';

const TEXT = 'GLASS-LAB.APP/7F3K';
const IDLE = hexRgb('#8fb8ff'), OK = hexRgb('#3dffa8');
const COPY = ['..#####', '..#...#', '####..#', '#.#...#', '#.#####', '#...#..', '#####..'];
const CHECK = ['.......##', '......##.', '.##..##..', '..####...', '...##....'];
const DOC = ['####.', '#..##', '#...#', '#...#', '#####'];

const FRAG = /* glsl */ `
uniform vec2  uTrayC, uTrayH;
uniform vec3  uD1, uD2;        // drops: x, y (abs), radius
uniform float uNeck;           // neck radius (< 0: torn)
uniform float uBand, uSel;     // selection band x (abs), selection glow
uniform vec3  uL;
uniform float uEnergy, uLift, uPress, uTh, uFilOn;

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-3), 0.0, 1.0));
}
float sdDrops(vec2 p) {
  float d1 = length(p - uD1.xy) - uD1.z;
  if (uD2.z < 0.5) return d1;
  float d2 = length(p - uD2.xy) - uD2.z;
  if (uNeck > 0.0) return smin(d1, smin(d2, sdSeg(p, uD1.xy, uD2.xy) - uNeck, 7.0), 9.0);
  return min(d1, d2);
}
float fil(vec2 p) { return filament(p, uD1.xy, length(p - uD1.xy) - uD1.z, uTh, 0.6); }

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  vec2 hs = uTrayH;
  float sdT = sdRoundBox(q - uTrayC, hs, hs.y);
  col = shadowed(col, sdRoundBox(q - uTrayC - vec2(0.0, 12.0), hs, hs.y), sdRoundBox(q - uTrayC - vec2(0.0, 1.5), hs, hs.y), 0.0);
  float f = fil(q);
  col = emitC(col, uL, filamentSpill(f) * 0.5 * uFilOn * uEnergy);
  float band = exp(-pow((q.x - uBand) / 24.0, 2.0));
  if (sdT < 2.0) {
    vec3 tc = tray(col, sdT, sdRoundBox(q - uTrayC - vec2(0.0, 6.0), hs, hs.y), q, uTrayC, hs);
    // the selection: a band of light runs over the text, then the whole line glows for a moment
    float rowM = exp(-pow((q.y - uTrayC.y) / 13.0, 2.0));
    tc = emitC(tc, uL, (band * 0.55 + uSel * 0.22) * rowM * uEnergy);
    tc = emitC(tc, uL, filamentWash(f) * 0.4 * uFilOn * uEnergy);
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdT));
  }
  float ls = sdDrops(q - vec2(0.0, 8.0 + uLift * 5.0 - uPress * 4.0));
  col *= 1.0 - (1.0 - smoothstep(-8.0, 18.0 + uLift * 10.0, ls)) * mix(0.5, 0.18, uTheme);
  float cover;
  return ink(col, q, frost, vec2(0.0), band * 0.9 + uSel * 0.3, mix(uL, vec3(1.0), 0.4), cover);
}

vec3 dropGlass(vec2 p, vec2 sp, float sd) {
  vec2 e = vec2(0.5, 0.0);
  vec2 n = normalize(vec2(sdDrops(p + e.xy) - sdDrops(p - e.xy), sdDrops(p + e.yx) - sdDrops(p - e.yx)) + 1e-5);
  float depth = max(-sd, 0.0);
  float u = clamp(depth / 18.0, 0.0, 1.0);
  float hgt = sqrt(max(1.0 - (1.0 - u) * (1.0 - u), 0.0));
  vec3 n3 = normalize(vec3(n.x * (1.0 - u), -n.y * (1.0 - u), hgt + 0.02));
  vec3 V = vec3(0.0, 0.0, -1.0);
  float thick = (5.0 + 18.0 * hgt) * smoothstep(0.0, 0.3, u);
  vec3 tR = refract(V, n3, 1.0 / 1.44), tG = refract(V, n3, 1.0 / 1.5), tB = refract(V, n3, 1.0 / 1.58);
  vec2 oR = vec2(tR.x, -tR.y) / max(-tR.z, 0.3) * thick;
  vec2 oG = vec2(tG.x, -tG.y) / max(-tG.z, 0.3) * thick;
  vec2 oB = vec2(tB.x, -tB.y) / max(-tB.z, 0.3) * thick;
  float frost = 0.04 + 0.6 * pow(1.0 - u, 3.0);
  vec3 kc = vec3(scene(p + oR, sp + oR * uScale, frost).r, scene(p + oG, sp + oG * uScale, frost).g, scene(p + oB, sp + oB * uScale, frost).b);
  kc = mix(kc, kc * 0.86 + vec3(0.1), 1.0 - uTheme);
  kc = emitC(kc, uL, (0.12 + filamentScatter(fil(p)) * 0.7 * uFilOn + uSel * 0.3) * (0.35 + 0.65 * (1.0 - u)) * uEnergy);
  kc = emitC(kc, uL, exp(-depth / 2.2) * 0.25 * uEnergy);
  vec3 Rv = reflect(V, n3);
  float fres = 0.04 + 0.96 * pow(1.0 - n3.z, 5.0);
  vec3 env = mix(vec3(0.06), vec3(0.55), smoothstep(-0.7, 0.9, Rv.y));
  env = mix(env, vec3(0.97), uTheme * 0.5);
  kc = mix(kc, env, clamp(fres, 0.0, 0.65));
  kc += smoothstep(0.06, 0.0, u) * mix(0.3, 0.4, uTheme);
  vec2 tp = (uPtr - uD1.xy) / 60.0;
  vec3 Ld = normalize(mix(vec3(-0.4, 0.65, 0.62), vec3(tp.x, -tp.y, 0.8), uPtrOn * 0.6));
  float s1 = max(dot(Rv, Ld), 0.0);
  kc += (pow(s1, 120.0) * 1.2 + pow(s1, 18.0) * mix(0.07, 0.11, uTheme)) * smoothstep(0.3, 0.7, u);
  float win = smoothstep(0.2, 0.13, abs(Rv.x + 0.3)) * smoothstep(0.15, 0.09, abs(Rv.y - 0.5)) * smoothstep(0.1, 0.4, Rv.z);
  kc += win * mix(0.18, 0.32, uTheme);
  if (uSweep < 1.2) {
    float s = dot(p - uD1.xy, normalize(vec2(1.0, -0.75)));
    float pos = mix(-60.0, 60.0, clamp(uSweep / 0.8, 0.0, 1.0));
    kc += exp(-pow((s - pos) / 10.0, 2.0)) * 0.3 * (1.0 - uSweep / 1.2) * hgt;
  }
  return kc;
}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);
  float sk = sdDrops(p);
  if (sk < 2.0) col = mix(dropGlass(p, sp, sk), col, smoothstep(-0.7, 0.7, sk));
  col = drawFilament(col, fil(p), uL, uEnergy * uFilOn * (1.0 + uKick * 0.5));
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const text = thumb ? '7F3K' : TEXT;
  const PITCH = thumb ? 3.4 : 3.0;
  const TRAY = thumb ? [96, 26] : [218, 30];
  const R = thumb ? 23 : 27;
  const D1 = [TRAY[0] - R - 4, 0];
  const TX = (-TRAY[0] + D1[0] - R) / 2;            // text centre, between the tray start and the drop
  const st = glassStage(root, { frag: FRAG, box: [TRAY[0] * 2 + 90, TRAY[1] * 2 + (thumb ? 150 : 210)], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => { if (!thumb && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(pat); };

  // ---------------------------------------------------------------- state
  const label = new PixelMatrix({ size: PITCH, swirl: 6, shyR: 14, shyF: 5 });
  label.set(textCells(text, PITCH), { instant: true });
  label.ox = TX;
  const ghost = new PixelMatrix({ size: PITCH, swirl: 14, shyR: 8, shyF: 2 });
  const icon = new PixelMatrix({ size: 2.6, swirl: 10, shyR: 10, shyF: 3 });
  icon.set(bitmapCells(COPY, 2.6), { instant: true });
  icon.ox = D1[0];
  const caption = new PixelMatrix({ size: 3, swirl: 9, shyR: 14, shyF: 5 });
  caption.oy = TRAY[1] + 40;
  const j1 = new Spring(380, 10), j2 = new Spring(380, 10);
  let phase = 'idle', T = 0, band = -1e4, sel = 0, done = 0, press = 0, lift = 0, th = Math.PI / 2;
  const d2 = { x: D1[0], y: 0, vx: 0, vy: 0, r: 0 };
  let torn = false, ghostOn = 0;
  const events = [];
  let clock = 0;
  const later = (dt, fn) => events.push({ t: clock + dt, fn });

  const doCopy = real => {
    if (phase !== 'idle') return;
    phase = 'copy'; T = 0; torn = false;
    Object.assign(d2, { x: D1[0], y: 0, vx: 0, vy: 0, r: R * 0.98 });
    j1.kick(-4);
    S.tick(0.6, 0.5); st.pulse(0.3);
    if (real && !thumb) {
      try { navigator.clipboard?.writeText(TEXT).catch(() => {}); } catch { /* the animation still tells the story */ }
    }
    // the text's pixel twin lifts out of the tray
    later(0.1, () => {
      ghost.set(textCells(text, PITCH), { instant: true });
      ghost.ox = TX; ghost.oy = 0; ghostOn = 1;
      ghost.set(bitmapCells(DOC, 2.4));
    });
  };

  // ---------------------------------------------------------------- input
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const onDrop = ([x, y]) => Math.hypot(x - D1[0], y) < R + 8;
  const onText = ([x, y]) => Math.abs(x - TX) < (D1[0] - R - -TRAY[0]) / 2 && Math.abs(y) < TRAY[1];
  st.bindPointer({
    down: (p, e, d) => { const q = local(d); if (onDrop(q) || onText(q)) { S._ensure(); press = 1; } },
    move: (p, e, d) => { const q = local(d); st.canvas.style.cursor = onDrop(q) || onText(q) ? 'pointer' : 'default'; },
    up: (p, e, d) => {
      if (!press) return;
      press = 0;
      const q = d ? local(d) : null;
      if (q && (onDrop(q) || onText(q))) doCopy(true);
    },
  });
  const onKey = e => {
    if (e.key === 'Enter' || e.key === ' ' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c')) { e.preventDefault(); S._ensure(); doCopy(true); }
  };
  if (!thumb) window.addEventListener('keydown', onKey);

  let demoT = 0;
  let shownCaption = null;

  st.run((dt, t) => {
    clock += dt;
    for (let k = events.length - 1; k >= 0; k--) if (events[k].t <= clock) { const ev = events[k]; events.splice(k, 1); ev.fn(); }
    if (demo && phase === 'idle') { demoT += dt; if (demoT > 0.5) { demoT = 0; doCopy(false); } }

    // the selection band runs over the text first
    if (phase === 'copy') {
      T += dt;
      band = -TRAY[0] + (T / 0.4) * (D1[0] - R + TRAY[0] + 40);
      if (T > 0.45) band = -1e4;
      sel = T < 0.5 ? Math.min(1, T * 4) : Math.max(0, sel - dt * 2);
    } else { band = -1e4; sel = Math.max(0, sel - dt * 2); }

    // the division: the copy drop moves out, the neck pinches and tears
    const OUT = [D1[0] - (thumb ? 34 : 46), thumb ? -56 : -72];
    let neck = -1;
    if (phase === 'copy' && T > 0.12) {
      const rise = T > 0.62;
      const tx = rise ? OUT[0] - 30 * (T - 0.62) : OUT[0], ty = rise ? OUT[1] - 160 * (T - 0.62) ** 1.4 : OUT[1];
      const k = rise ? 80 : 95, c = 2 * Math.sqrt(k) * (rise ? 0.9 : 0.55); // a slow bud: the copy streams in before it tears
      d2.vx += (-k * (d2.x - tx) - c * d2.vx) * dt; d2.vy += (-k * (d2.y - ty) - c * d2.vy) * dt;
      d2.x += d2.vx * dt; d2.y += d2.vy * dt;
      const sep = Math.hypot(d2.x - D1[0], d2.y);
      if (!torn) {
        neck = R * 0.62 * clamp(1 - sep / (R * 2.2), 0, 1) + 1.2;
        if (sep > R * 2.15) {
          torn = true;
          j1.kick(5); j2.kick(5);
          S.tick(0.95, 0.8); S.drip(0.8, 0.6); buzz(8);
          st.burst((D1[0] + d2.x) / 2, d2.y / 2, 8, 0.4);
          icon.set(bitmapCells(CHECK, 2.4));
          st.light = OK;
          later(0.05, () => { S.ping(true); st.glint(); st.pulse(0.8); done = 1; });
        }
      }
      // volume: both are a little smaller while they share one body; the copy evaporates as it rises
      d2.r = R * (torn ? 0.8 : 0.82 + 0.1 * clamp(sep / (R * 2.2), 0, 1)) * (rise ? Math.max(0, 1 - (T - 0.62) * 1.1) : 1);
      if (rise && d2.r < 1) { d2.r = 0; }
      if (T > 2.3) {
        phase = 'idle'; ghostOn = 0; ghost.set([]); d2.r = 0;
        icon.set(bitmapCells(COPY, 2.6)); done = 0;
        S.drip(0.5, 0.35);
      }
    }
    if (phase === 'idle') d2.r = 0;

    // the pixel copy streams into the new drop and rides it away
    if (ghostOn) { const g = Math.min(1, dt * (torn ? 16 : 8)); ghost.ox += (d2.x - ghost.ox) * g; ghost.oy += (d2.y - ghost.oy) * g; }
    const ghostGain = ghostOn ? Math.pow(clamp(d2.r / (R * 0.8), 0, 1), 1.5) : 0;

    const L = mix3(IDLE, OK, done);
    if (!events.length && !torn) st.light = IDLE;
    const word = thumb ? '' : done ? 'COPIED' : '';
    if (word !== shownCaption) { caption.set(word ? textCells(word, 3.2) : []); shownCaption = word; }

    press = Math.max(0, press - (press > 0 && phase !== 'idle' ? dt * 6 : 0));
    lift += ((st.ptrOn > 0.5 && onDrop(st.local()) ? 1 : 0) - lift) * Math.min(1, dt * 8);
    th += dt * (reducedMotion ? 0.3 : 0.9);
    const k1 = j1.step(dt) * 0.035, k2 = j2.step(dt) * 0.035;
    const shrink1 = phase === 'copy' && !torn ? 0.9 : 1;

    label.step(dt, { ptr: st.local(label), shy: st.ptrOn * 0.5 });
    ghost.step(dt, { ptr: null, shy: 0 });
    icon.ox = D1[0]; icon.step(dt, { ptr: st.local(icon), shy: 0 });
    caption.step(dt, { ptr: st.local(caption), shy: st.ptrOn * 0.5 });

    st.drawPixels(ctx => {
      label.draw(ctx, 0.85);
      if (ghostGain > 0.01) ghost.draw(ctx, ghostGain);
      icon.draw(ctx, 0.9);
      caption.draw(ctx, 0.8);
    });
    st.render(t, (U, gl) => {
      const X = st.cx, Y = st.cy;
      gl.uniform2f(U.uTrayC, X, Y);
      gl.uniform2f(U.uTrayH, TRAY[0], TRAY[1]);
      gl.uniform3f(U.uD1, X + D1[0], Y - lift * 1.5 + press * 1.5, R * shrink1 * (1 + k1) * (1 - press * 0.04));
      gl.uniform3f(U.uD2, X + d2.x, Y + d2.y, d2.r * (1 + k2));
      gl.uniform1f(U.uNeck, neck);
      gl.uniform1f(U.uBand, X + band);
      gl.uniform1f(U.uSel, sel);
      gl.uniform3f(U.uL, ...L);
      gl.uniform1f(U.uEnergy, 0.75 + lift * 0.1 + st.kick * 0.25);
      gl.uniform1f(U.uLift, lift);
      gl.uniform1f(U.uPress, press);
      gl.uniform1f(U.uTh, th);
      gl.uniform1f(U.uFilOn, 0.7 + done * 0.3);
    });
  });

  return { dispose() { window.removeEventListener('keydown', onKey); st.dispose(); } };
}
