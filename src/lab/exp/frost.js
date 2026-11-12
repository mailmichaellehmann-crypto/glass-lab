// FROST — wipe to reveal. Seen from above.
// A thick pane of glass lies over a code, and it is fogged over: you can only guess at the pixels
// beneath. Wipe it with your finger and the mist gives way. The stroke is wet and catches the light,
// fine streaks stay behind like on a real window, beads of water gather along its margins and each
// one is a tiny lens. Rest your finger and its warmth clears a growing circle. The filament round the
// pane shows how much you have uncovered. Uncover the code and the rest of the mist flees in a wave;
// later it creeps back in from the edges and hides a new code.
// The mist is a small field simulated on the CPU (clear / wet per cell) and sampled by the shader.

import { glassStage, PixelMatrix, textCells, hexRgb, mix3 } from '../glass/engine.js';
import { compact } from '../glass/engine.js';
import { thickGlass } from '../glass/lib.glsl.js';
import { clamp, rand } from '../kit.js';

const MIST = hexRgb('#9fd8ff'), GOLD = hexRgb('#ffcf6b');
const ALPHA = 'ABCDEFGHKLMNPRSTUVWXYZ23456789';
const word = n => Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

const FRAG = /* glsl */ `
uniform vec4  uPane;           // pane centre (abs), half size
uniform float uPR;             // its corner radius
uniform vec2  uTrayH;          // tray half size
uniform sampler2D uFog;        // r: clear (0 fogged … 1 wiped), g: wet (a fresh stroke)
uniform vec3  uL;
uniform float uPress, uEnergy, uProg, uOpen;

float sdPane(vec2 p) { return sdRoundBox(p - uPane.xy, uPane.zw, uPR); }
vec2 fogRaw(vec2 q) {
  vec2 uv = (q - (uPane.xy - uPane.zw)) / (2.0 * uPane.zw);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec2(0.0);
  return texture(uFog, uv).rg;
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + 1.0), f.x), f.y);
}
float fil(vec2 p) { return filament(p, uPane.xy, sdPane(p), 1.5707963, 0.1 + uProg * 3.05); }

// everything under the top face of the pane: page, tray, the code, and the mist lying on the glass
vec3 scene(vec2 q, vec2 sp, float frost, out float cover) {
  vec3 col = pageBg(sp);
  vec2 tc0 = uPane.xy; float tr = uPR + 8.0;
  float sdT = sdRoundBox(q - tc0, uTrayH, tr);
  col = shadowed(col, sdRoundBox(q - tc0 - vec2(0.0, 13.0), uTrayH, tr), sdRoundBox(q - tc0 - vec2(0.0, 1.5), uTrayH, tr), 0.0);
  float f = fil(q);
  col = emitC(col, uL, filamentSpill(f) * 0.5 * uEnergy);

  float sdP = sdPane(q);
  float inside = 1.0 - smoothstep(-11.0, -3.0, sdP);        // the mist lies on the flat face and thins out toward the bevel
  vec2 fr = fogRaw(q);
  // the edge of a wipe is never a clean curve: the mist frays
  float c = fr.r + (vnoise(q * 0.21) - 0.5) * 0.9 * fr.r * (1.0 - fr.r);
  c = smoothstep(0.1, 0.8, clamp(c, 0.0, 1.0));
  float fog = (1.0 - c) * inside;

  // beads of water gather along the margins of a wipe; each is a tiny lens with a glint and a dark rim
  vec2 dq = q; float dSpec = 0.0, dRim = 0.0;
  if (inside > 0.01) {
    const float G = 8.0;
    vec2 gid = floor(q / G);
    float pick = hash12(gid + 5.3);
    vec2 ctr = (gid + 0.28 + 0.44 * hash22(gid + 17.0)) * G;
    float cm = fogRaw(ctr).r;
    float life = smoothstep(0.22, 0.5, cm) * smoothstep(0.99, 0.7, cm);
    float r = (0.7 + 2.3 * pick * pick) * life * step(0.3, pick);
    float d = length(q - ctr);
    if (r > 0.55 && d < r) {
      float h = sqrt(max(1.0 - d * d / (r * r), 0.0));
      dq = q - (q - ctr) * 0.55 * h;
      fog *= mix(1.0, 0.5, smoothstep(r, r - 0.8, d));
      dSpec = smoothstep(0.42 * r, 0.0, length(q - ctr + vec2(0.3, 0.36) * r)) * 0.75 + smoothstep(r - 1.0, r - 0.2, d) * max(dot(normalize(q - ctr + 1e-4), vec2(0.6, 0.8)), 0.0) * 0.22;
      dRim = smoothstep(r - 1.1, r, d) * max(dot(normalize(q - ctr + 1e-4), vec2(-0.6, -0.8)), 0.0);
    }
  }

  if (sdT < 2.0) {
    vec3 tc = tray(col, sdT, sdRoundBox(q - tc0 - vec2(0.0, 7.0), uTrayH, tr), q, tc0, uTrayH);
    tc = emitC(tc, uL, exp(-abs(sdT + 1.6) / 1.5) * smoothstep(-uTrayH.y * 0.3, uTrayH.y, q.y - tc0.y) * (0.16 + 0.5 * uOpen) * uEnergy);
    tc = emitC(tc, uL, filamentWash(f) * 0.35 * uEnergy);
    float ps = sdPane(q - vec2(0.0, 7.0 - uPress * 3.0));
    tc *= 1.0 - (1.0 - smoothstep(-6.0, 15.0, ps)) * mix(0.45, 0.16, uTheme);
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdT));
  }
  // the code: blurred to a ghost under the mist, razor sharp and glowing where the glass is clear
  col = ink(col, dq, max(frost, fog * 0.97), vec2(0.0), c * inside * (0.25 + 0.75 * uOpen), uL, cover);

  // the mist itself: a milky veil with a fine sparkle of condensation, lit by the warmth of the finger
  vec3 fogc = mix(mix(vec3(0.165, 0.185, 0.215), vec3(0.935, 0.94, 0.95), uTheme), uL, 0.1);
  fogc += (hash12(floor(q * 1.9)) - 0.5) * mix(0.055, 0.03, uTheme) + (vnoise(q * 0.05) - 0.5) * 0.05;
  fogc += exp(-length(q - uPtr) / 58.0) * uPtrOn * mix(0.11, 0.03, uTheme);
  col = mix(col, fogc, fog * mix(0.945, 0.9, uTheme));
  // water pushed aside piles up at the margin of the stroke: a denser, lighter seam
  float seam = smoothstep(0.08, 0.3, c) * smoothstep(0.66, 0.4, c) * inside;
  col += seam * mix(0.06, 0.035, uTheme);
  // a fresh stroke is wet: it shines and carries the light for a moment
  col = emitC(col, uL, fr.g * inside * 0.16 * uEnergy);
  col += fr.g * inside * mix(0.045, 0.02, uTheme);
  col *= 1.0 - dRim * mix(0.34, 0.16, uTheme);
  col += dSpec;
  return col;
}

${thickGlass('thick', 'scene')}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  float cover;
  vec3 col = scene(p, sp, 0.0, cover);
  float sd = sdPane(p);
  if (sd < 2.0) {
    vec2 e = vec2(0.5, 0.0);
    vec2 n = normalize(vec2(sdPane(p + e.xy) - sdPane(p - e.xy), sdPane(p + e.yx) - sdPane(p - e.yx)) + 1e-5);
    vec3 kc = thick(p, sp, n, max(-sd, 0.0), uPane.xy, uPane.zw, 15.0, 12.0, 0.08, filamentScatter(fil(p)) * uEnergy * 0.7 + 0.05 + uOpen * 0.12, uL);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sd));
  }
  col = drawFilament(col, fil(p), uL, uEnergy * (1.0 + uKick * 0.5));
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const C = !thumb && compact();
  const PANE = thumb ? [112, 62] : C ? [164, 78] : [196, 82];
  const PR = thumb ? 22 : 26;
  const TRAY = [PANE[0] + 9, PANE[1] + 9];
  const LABEL_Y = PANE[1] + 46;
  const st = glassStage(root, { frag: FRAG, box: [TRAY[0] * 2 + (C ? 22 : 80), thumb ? TRAY[1] * 2 + 60 : (LABEL_Y + 34) * 2], thumb });
  await st.ready;
  const S = st.sfx, gl = st.gl;
  const buzz = pat => st.buzz(pat);

  // ---------------------------------------------------------------- the mist field
  const CELL = 2;                                             // design px per cell
  const GW = Math.round((PANE[0] * 2) / CELL), GH = Math.round((PANE[1] * 2) / CELL);
  let clear = new Float32Array(GW * GH), next = new Float32Array(GW * GH);
  const wet = new Float32Array(GW * GH);
  const bytes = new Uint8Array(GW * GH * 2);
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  let dirty = true;
  // the mist does not return evenly: a soft random field makes it creep back in tongues, not as a frame
  const grain = new Float32Array(GW * GH);
  { const N = 9, gx = Math.ceil(GW / N) + 2, gy = Math.ceil(GH / N) + 2, lat = Array.from({ length: gx * gy }, () => Math.random());
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const fx = x / N, fy = y / N, ix = Math.floor(fx), iy = Math.floor(fy); let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = lat[iy * gx + ix], b = lat[iy * gx + ix + 1], c = lat[(iy + 1) * gx + ix], d = lat[(iy + 1) * gx + ix + 1];
      grain[y * GW + x] = 0.35 + 1.3 * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
    } }
  const upload = () => {
    for (let i = 0, j = 0; i < clear.length; i++) { bytes[j++] = clear[i] * 255; bytes[j++] = wet[i] * 255; }
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, GW, GH, 0, gl.RG, gl.UNSIGNED_BYTE, bytes);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    dirty = false;
  };
  // wipe along a segment (pane-local design px, origin = pane centre). A finger leaves fine streaks:
  // thin lines of mist that survive along the direction of the stroke until you pass over them again.
  const stamp = (ax, ay, bx, by, r, phase) => {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy), ux = len > 0.01 ? dx / len : 1, uy = len > 0.01 ? dy / len : 0;
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - r + PANE[0]) / CELL)), x1 = Math.min(GW - 1, Math.ceil((Math.max(ax, bx) + r + PANE[0]) / CELL));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by) - r + PANE[1]) / CELL)), y1 = Math.min(GH - 1, Math.ceil((Math.max(ay, by) + r + PANE[1]) / CELL));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = (x + 0.5) * CELL - PANE[0] - ax, py = (y + 0.5) * CELL - PANE[1] - ay;
      const t = clamp((px * ux + py * uy) / (len || 1), 0, 1) * len;
      const d = Math.hypot(px - ux * t, py - uy * t);
      if (d >= r) continue;
      const k = 1 - d / r, soft = k * k * (3 - 2 * k) * 1.5;
      const side = px * -uy + py * ux;                         // across the stroke
      const streak = len > 0.5 ? 0.8 + 0.2 * Math.sin(side * 1.9 + phase) * Math.sin(side * 0.71 + phase * 1.7) : 1;
      const v = Math.min(1, soft) * streak, i = y * GW + x;
      if (v > clear[i]) clear[i] = v;
      const w = Math.min(1, soft);
      if (w > wet[i]) wet[i] = w;
    }
    dirty = true;
  };
  // the mist returns by creeping in from wherever it still is (and from the rim of the pane)
  const refog = (dt, rate) => {
    let sum = 0;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const i = y * GW + x, c = clear[i];
      let v = c;
      if (c > 0.002) {
        const l = x > 0 ? clear[i - 1] : 0, r = x < GW - 1 ? clear[i + 1] : 0, u = y > 0 ? clear[i - GW] : 0, d = y < GH - 1 ? clear[i + GW] : 0;
        const m = Math.min(l, r, u, d);
        v = Math.max(0, c - dt * (rate * grain[i] * (c - m + 0.02) + 0.004));
      }
      next[i] = v; sum += v;
      if (wet[i] > 0.003) wet[i] *= Math.exp(-dt * 2.4); else wet[i] = 0;
    }
    [clear, next] = [next, clear];
    dirty = true;
    return sum / clear.length;
  };

  // ---------------------------------------------------------------- state
  const code = new PixelMatrix({ size: 4.4, swirl: 14, shyR: 0, shyF: 0 });
  const tag = new PixelMatrix({ size: 2.4, swirl: 6, shyR: 0, shyF: 0 });
  const label = new PixelMatrix({ size: 2.8, swirl: 8, shyR: 16, shyF: 5 });
  const PITCH = thumb ? 5.2 : C ? 5.0 : 5.6;
  let codeW = 0;
  const newCode = instant => {
    const s = thumb ? word(4) : `${word(4)}-${word(4)}`;
    codeW = (s.length * 4 - 1) * PITCH;
    code.set(textCells(s, PITCH), { instant });
    if (!thumb) tag.set(textCells('YOUR CODE', 2.8), { instant });
  };
  code.oy = thumb ? 0 : 8; tag.oy = -PANE[1] + 26; label.oy = LABEL_Y;
  newCode(true);
  let shownLabel = '';
  const say = (s, instant) => { if (thumb || s === shownLabel) return; shownLabel = s; label.set(textCells(s, 3.2), { instant }); };
  say('WIPE THE GLASS', true);

  let last = null, travel = 0, holdT = 0, press = 0, phase = rand(0, 6), prevDir = [0, 0], speedS = 0;
  let prog = 0, unlocked = false, wave = null, restT = 0, closing = false, open = 0, auto = null;
  const events = [];
  let clock = 0;
  const later = (dt, fn) => events.push({ t: clock + dt, fn });

  // how much of the code itself is uncovered
  const coverage = () => {
    const hw = codeW / 2 + 6, hh = PITCH * 2.5 + 5;
    const x0 = clamp(Math.floor((-hw + PANE[0]) / CELL), 0, GW - 1), x1 = clamp(Math.ceil((hw + PANE[0]) / CELL), 0, GW - 1);
    const y0 = clamp(Math.floor((code.oy - hh + PANE[1]) / CELL), 0, GH - 1), y1 = clamp(Math.ceil((code.oy + hh + PANE[1]) / CELL), 0, GH - 1);
    let s = 0, n = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { s += Math.min(1, clear[y * GW + x] * 1.25); n++; }
    return n ? s / n : 0;
  };
  const reveal = (x, y) => {
    unlocked = true; wave = { x, y, r: 0 }; restT = 0; closing = false;
    st.light = [...GOLD];
    st.shock(x, y); st.glint(); st.pulse(1);
    for (const sx of [-1, 1]) st.burst(sx * (PANE[0] - 14), 0, 9, 0.9, sx > 0 ? 0 : Math.PI, 1.1);
    S.ping(true); [0.5, 0.66, 0.84, 1].forEach((p, i) => later(0.07 + i * 0.07, () => S.key(p)));
    buzz([10, 30, 10, 30, 22]);
    say('REVEALED');
  };

  // ---------------------------------------------------------------- input
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const onPane = ([x, y]) => Math.abs(x) < PANE[0] + 4 && Math.abs(y) < PANE[1] + 4;
  const brush = () => (thumb ? 15 : 25) + Math.min(30, holdT * 30);   // a resting finger warms a growing circle
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d);
      if (!onPane(q) || unlocked) return;
      S._ensure();
      auto = null; last = q; travel = 0; holdT = 0; phase = rand(0, 6);
      stamp(q[0], q[1], q[0], q[1], brush(), phase);
      S.tick(0.5, 0.35);
    },
    move: (p, e, d) => {
      const q = local(d);
      st.canvas.style.cursor = onPane(q) && !unlocked ? (last ? 'grabbing' : 'grab') : 'default';
      if (!last) return;
      const dx = q[0] - last[0], dy = q[1] - last[1], len = Math.hypot(dx, dy);
      if (len < 0.6) return;
      stamp(last[0], last[1], q[0], q[1], brush(), phase);
      // a squeak when the finger turns round at speed, a fine tick of resistance every few millimetres
      const dir = [dx / len, dy / len];
      if (dir[0] * prevDir[0] + dir[1] * prevDir[1] < -0.3 && speedS > 260) { S.tick(rand(0.86, 1), 0.22); phase = rand(0, 6); }
      prevDir = dir;
      travel += len; holdT = Math.max(0, holdT - len * 0.02);
      if (travel > 26) { travel = 0; buzz(3); }
      last = q;
    },
    up: () => { last = null; holdT = 0; S.air(0); },
  });
  // keyboard / autopilot: a hand wipes the pane in a zigzag
  const wipeAuto = () => { if (!unlocked && !auto) auto = { t: 0, last: null, phase: rand(0, 6) }; };
  const onKey = e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); S._ensure(); wipeAuto(); }
    if ((e.key === 'r' || e.key === 'R') && !unlocked) { clear.fill(0); wet.fill(0); dirty = true; }
  };
  if (!thumb) window.addEventListener('keydown', onKey);

  let demoT = 0.9;
  st.run((dt, t) => {
    clock += dt;
    for (let k = events.length - 1; k >= 0; k--) if (events[k].t <= clock) { const ev = events[k]; events.splice(k, 1); ev.fn(); }
    if (demo && !auto && !unlocked) { demoT += dt; if (demoT > 1.1) { demoT = 0; wipeAuto(); } }

    // a resting finger keeps warming the glass
    if (last) {
      holdT += dt;
      if (holdT > 0.12) stamp(last[0], last[1], last[0], last[1], brush(), phase);
    }
    if (auto) {
      auto.t += dt / (thumb ? 1.5 : 2.0);
      const u = Math.min(1, auto.t), z = Math.abs(((u * 4.5) % 2) - 1);
      const q = [(z * 2 - 1) * (PANE[0] - 30), (u * 2 - 1) * (PANE[1] - 26)];
      if (auto.last) stamp(auto.last[0], auto.last[1], q[0], q[1], thumb ? 17 : 30, auto.phase);
      auto.last = q;
      if (u >= 1) auto = null;
    }
    const lp = st.ptr; const sp = last && lp ? Math.hypot(lp.vx, lp.vy) : auto ? 420 : 0;
    speedS += (sp - speedS) * Math.min(1, dt * 12);
    S.air(Math.min(1, speedS / 520) * 0.9);
    press += ((last ? 1 : 0) - press) * Math.min(1, dt * 14);

    // the mist: slow to return while you work, fleeing in a wave once the code is out, then creeping back
    let mean = 0;
    if (wave) {
      wave.r += dt * 560;
      const cx = wave.x + PANE[0], cy = wave.y + PANE[1], r = wave.r;
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const d = Math.hypot((x + 0.5) * CELL - cx, (y + 0.5) * CELL - cy), i = y * GW + x;
        if (d < r) { if (clear[i] < 1) { clear[i] = Math.min(1, clear[i] + dt * 9); if (d > r - 26) wet[i] = 1; } }
        if (wet[i] > 0.003) wet[i] *= Math.exp(-dt * 2.4);
      }
      dirty = true; mean = 1;
      if (wave.r > Math.hypot(PANE[0], PANE[1]) * 2 + 40) wave = null;
    } else if (unlocked && !closing) {
      restT += dt; mean = 1;
      for (let i = 0; i < wet.length; i++) if (wet[i] > 0.003) { wet[i] *= Math.exp(-dt * 2.4); dirty = true; }
      if (restT > (thumb ? 1.6 : 4.2)) closing = true;
    } else {
      mean = refog(dt, closing ? 11 : last || auto ? 0.1 : 0.32);
      if (closing && mean < 0.004) { // hidden again: a new code takes its place under the mist
        closing = false; unlocked = false; clear.fill(0); newCode(false); say('WIPE THE GLASS'); st.pulse(0.3); S.drip(0.4, 0.4);
      }
    }
    const cov = unlocked ? 1 : coverage();
    prog += ((unlocked && !closing ? 1 : closing ? mean : cov) - prog) * Math.min(1, dt * 8);
    if (!unlocked && cov > 0.8) reveal(last ? last[0] : auto?.last ? auto.last[0] : 0, last ? last[1] : auto?.last ? auto.last[1] : 0), (last = null, auto = null, S.air(0));
    if (!unlocked) { const pct = /%$/.test(shownLabel); if (cov > (pct ? 0.02 : 0.07)) say(`${Math.round(cov / 0.8 * 100)}%`, pct); else say('WIPE THE GLASS'); }
    open += ((unlocked && !closing ? 1 : 0) - open) * Math.min(1, dt * 5);
    st.light = mix3(st.light, unlocked && !closing ? GOLD : MIST, Math.min(1, dt * 4));

    code.step(dt); tag.step(dt);
    label.step(dt, { ptr: st.local(label), shy: st.ptrOn * 0.5 });
    st.drawPixels(ctx => { code.draw(ctx, 1); tag.draw(ctx, 0.5); label.draw(ctx, 0.85); });
    if (dirty) upload();

    st.render(t, U => {
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(U.uFog, 2);
      gl.uniform4f(U.uPane, st.cx, st.cy + press * 1.5, PANE[0] * (1 - press * 0.006), PANE[1] * (1 - press * 0.006));
      gl.uniform1f(U.uPR, PR);
      gl.uniform2f(U.uTrayH, TRAY[0], TRAY[1]);
      gl.uniform3f(U.uL, ...st.light);
      gl.uniform1f(U.uPress, press);
      gl.uniform1f(U.uEnergy, 0.75 + st.kick * 0.3);
      gl.uniform1f(U.uProg, clamp(prog, 0, 1));
      gl.uniform1f(U.uOpen, open);
    });
  });

  return {
    dispose() {
      window.removeEventListener('keydown', onKey);
      gl.deleteTexture(tex);
      st.dispose();
    },
  };
}
