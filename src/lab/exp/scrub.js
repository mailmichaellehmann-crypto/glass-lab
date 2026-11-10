// SCRUB — an audio player: a little melody drawn as a waveform of LED pixel columns in a rail, a thick
// glass play button and a glass playhead. Seen from above. Every column is a note; when it sounds, its
// column flashes. Drag the playhead and you hear the notes pass like tape: the faster you scrub, the
// higher they ring, with a rush of air. At the end the tape rewinds, audibly. Columns that have played
// glow in the light; the rest wait, dim. The toggle's filament circles the button while it plays.

import { glassStage, PixelMatrix, Spring, textCells, bitmapCells, hexRgb, mix3 } from '../glass/engine.js';
import { thickGlass } from '../glass/lib.glsl.js';
import { clamp } from '../kit.js';

const L = hexRgb('#7ab8ff'), HOT = hexRgb('#c8e4ff');
const PLAY = ['#...', '##..', '###.', '####', '###.', '##..', '#...'];
const PAUSE = ['##.##', '##.##', '##.##', '##.##', '##.##', '##.##', '##.##'];
// a small tune on a pentatonic scale; -1 is a rest
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
const TUNE = [0, 2, 4, 3, 2, 1, 0, -1, 1, 2, 4, 5, 4, 2, 3, -1, 0, 2, 4, 3, 2, 1, 0, 1, 2, 4, 5, 4, 3, 2, 1, -1,
  4, 5, 4, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, -1, -1];
const STEP_T = 0.3;
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const FRAG = /* glsl */ `
uniform vec2  uRailC, uRail;   // rail centre (abs) and half size
uniform vec4  uHead;           // playhead: x, y (abs), half width, half height
uniform vec3  uBtn;            // play button: x, y (abs), radius
uniform float uPlayX;          // x (abs) up to which the tune has played
uniform vec3  uL;
uniform float uEnergy, uTh, uFilOn, uBeat, uLift, uPress;

float sdHead(vec2 p) { return sdRoundBox(p - uHead.xy, uHead.zw, uHead.z); }
float fil(vec2 p) { return filament(p, uBtn.xy, length(p - uBtn.xy) - uBtn.z, uTh, 0.6); }

vec3 scene(vec2 q, vec2 sp, float frost, out float cover) {
  vec3 col = pageBg(sp);
  vec2 hs = uRail;
  float sdR = sdRoundBox(q - uRailC, hs, hs.y);
  col = shadowed(col, sdRoundBox(q - uRailC - vec2(0.0, 12.0), hs, hs.y), sdRoundBox(q - uRailC - vec2(0.0, 1.5), hs, hs.y), 0.0);
  float f = max(fil(q), 0.0);
  col = emitC(col, uL, filamentSpill(f) * 0.6 * uFilOn * uEnergy);
  // shadows of the glass: the button on the page, the playhead in the rail
  col *= 1.0 - (1.0 - smoothstep(-8.0, 18.0 + uLift * 8.0, length(q - uBtn.xy - vec2(0.0, 9.0 - uPress * 4.0)) - uBtn.z)) * mix(0.5, 0.18, uTheme);
  float wash = 0.0;
  if (sdR < 2.0) {
    vec3 tc = tray(col, sdR, sdRoundBox(q - uRailC - vec2(0.0, 7.0), hs, hs.y), q, uRailC, hs);
    // what has played is lit: a soft floor light behind the columns, brightest at the head
    float played = smoothstep(uPlayX + 2.0, uPlayX - 2.0, q.x);
    tc = emitC(tc, uL, played * mix(0.07, 0.22, uTheme) * uEnergy);   // on the light page the played part needs a clearer tint
    tc = emitC(tc, uL, exp(-abs(q.x - uHead.x) / 18.0) * (0.12 + 0.25 * uBeat) * uEnergy);
    float hsd = sdRoundBox(q - uHead.xy - vec2(0.0, 8.0 + uLift * 6.0), uHead.zw, uHead.z);
    tc *= 1.0 - (1.0 - smoothstep(-6.0, 14.0 + uLift * 10.0, hsd)) * mix(0.45, 0.15, uTheme);
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdR));
    wash = played * 0.85 * (1.0 - smoothstep(-0.6, 0.6, sdR));
  }
  return ink(col, q, frost, vec2(0.0), wash, mix(uL, vec3(1.0), 0.25), cover);
}

${thickGlass('thick', 'scene')}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  float cover;
  vec3 col = scene(p, sp, 0.0, cover);
  // the play button: a thick glass disc
  float sb = length(p - uBtn.xy) - uBtn.z;
  if (sb < 2.0) {
    vec3 kc = thick(p, sp, normalize(p - uBtn.xy + 1e-4), max(-sb, 0.0), uBtn.xy, vec2(uBtn.z), 13.0, 14.0, 0.08,
                    filamentScatter(max(fil(p), 0.0)) * uFilOn * 0.8 + uBeat * 0.2, uL);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sb));
  }
  col = mix(col, drawFilament(col, fil(p), uL, uEnergy * (1.0 + uKick * 0.5)), uFilOn);
  // the playhead: a thick glass capsule standing over the rail
  float sh = sdHead(p);
  if (sh < 2.0) {
    vec2 e = vec2(0.5, 0.0);
    vec2 n = normalize(vec2(sdHead(p + e.xy) - sdHead(p - e.xy), sdHead(p + e.yx) - sdHead(p - e.yx)) + 1e-5);
    vec3 kc = thick(p, sp, n, max(-sh, 0.0), uHead.xy, uHead.zw, 9.0, 11.0, 0.08, 0.15 + uBeat * 0.4, uL);
    // a hairline of light down its middle marks the exact position
    kc = emitC(kc, mix(uL, vec3(1.0), 0.5), (1.0 - smoothstep(0.4, 1.4, abs(p.x - uHead.x))) * smoothstep(-uHead.w + 8.0, -uHead.w + 16.0, -abs(p.y - uHead.y)) * 0.6);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sh));
  }
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const NBAR = thumb ? 20 : TUNE.length;
  const RAIL = thumb ? [96, 30] : [256, 38];
  const BR = thumb ? 24 : 30;                           // play button radius
  const GX = thumb ? (BR + 26) / 2 : (BR + 30) / 2;     // centre the whole group
  const RX = GX, BX = GX - RAIL[0] - BR - (thumb ? 22 : 26);
  const PADX = 16;
  const colX = i => RX - RAIL[0] + PADX + ((i + 0.5) * (RAIL[0] * 2 - PADX * 2)) / NBAR;
  const posX = pos => RX - RAIL[0] + PADX + (clamp(pos, 0, NBAR) * (RAIL[0] * 2 - PADX * 2)) / NBAR;
  const xPos = x => ((x - (RX - RAIL[0] + PADX)) / (RAIL[0] * 2 - PADX * 2)) * NBAR;
  const st = glassStage(root, { frag: FRAG, box: [RAIL[0] * 2 + BR * 2 + 90, RAIL[1] * 2 + (thumb ? 70 : 150)], thumb });
  await st.ready;
  const S = st.sfx;
  const PIX = thumb ? 3.4 : 4.2, DOT = PIX * 0.82;      // LED columns: pixels with a small gap
  const HALFN = Math.floor((RAIL[1] - 10) / PIX);       // pixels per half column

  // the waveform: each column's height from its note and a little life
  const tune = Array.from({ length: NBAR }, (_, i) => TUNE[i % TUNE.length]);
  const amp = tune.map((n, i) => (n < 0 ? 0.12 : 0.35 + 0.1 * n + 0.18 * Math.abs(Math.sin(i * 2.3))));
  const flash = new Float32Array(NBAR);

  // ---------------------------------------------------------------- state
  let pos = 0, posV = 0, target = 0, playing = false, drag = null, rewinding = false, lastI = -1;
  let filOn = 0, th = Math.PI / 2, beat = 0, press = 0, lift = 0;
  const btnJ = new Spring(380, 10), headJ = new Spring(420, 12);
  const icon = new PixelMatrix({ size: thumb ? 2.6 : 3.0, swirl: 10, shyR: 10, shyF: 3 });
  icon.set(bitmapCells(PLAY, thumb ? 3.1 : 3.6), { instant: true });
  icon.ox = BX + 2;
  const clock = new PixelMatrix({ size: 2.5, swirl: 4, shyR: 12, shyF: 4 });
  clock.oy = -RAIL[1] - 22;
  let shownClock = '';
  const total = NBAR * STEP_T;

  const playNote = (i, gain = 1, pitch = 1) => {
    const n = tune[i];
    flash[i] = 1;
    if (n < 0) return;
    S.note(SCALE[n] * pitch, 0.8 * gain, 0.7);
    if (i % 4 === 0) S.note((SCALE[0] / 2) * pitch, 0.5 * gain, 0.9);  // a soft bass on the beat
    beat = Math.max(beat, 0.6 * gain); headJ.kick(-1.2 * gain); st.pulse(0.12 * gain);
  };
  const setPlaying = on => {
    playing = on;
    icon.set(bitmapCells(on ? PAUSE : PLAY, thumb ? 3.1 : 3.6));
    icon.ox = BX + (on ? 0 : 2);
    btnJ.kick(-4); S.tick(on ? 0.7 : 0.45, 0.6); st.pulse(0.4);
    if (on && pos >= NBAR - 0.01) { pos = 0; target = 0; }
  };

  // ---------------------------------------------------------------- input
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const onBtn = ([x, y]) => Math.hypot(x - BX, y) < BR + 6;
  const onHead = ([x, y]) => Math.abs(x - posX(pos)) < 20 && Math.abs(y) < RAIL[1] + 14;
  const onRail = ([x, y]) => Math.abs(x - RX) < RAIL[0] + 6 && Math.abs(y) < RAIL[1] + 10;
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d);
      S._ensure();
      if (onBtn(q)) { press = 1; setPlaying(!playing); return; }
      if (onRail(q)) {
        rewinding = false;
        drag = { off: onHead(q) ? posX(pos) - q[0] : 0, wasPlaying: playing };
        target = clamp(xPos(q[0] + drag.off), 0, NBAR);
        headJ.kick(-2); S.tick(0.6, 0.4);
      }
    },
    move: (p, e, d) => {
      const q = local(d);
      st.canvas.style.cursor = drag ? 'grabbing' : onBtn(q) ? 'pointer' : onHead(q) ? 'grab' : onRail(q) ? 'pointer' : 'default';
      if (drag) target = clamp(xPos(q[0] + drag.off), 0, NBAR);
    },
    up: () => { press = 0; if (drag) { drag = null; headJ.kick(2); st.glint(); } },
  });
  const onKey = e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); S._ensure(); setPlaying(!playing); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault(); S._ensure();
      target = clamp(pos + (e.key === 'ArrowRight' ? 4 : -4), 0, NBAR); pos = target; headJ.kick(-2); S.tick(0.55, 0.4);
    }
  };
  if (!thumb) window.addEventListener('keydown', onKey);

  let demoT = 0;
  st.run((dt, t) => {
    if (demo && !playing && !rewinding) { demoT += dt; if (demoT > 0.4) { demoT = 0; setPlaying(true); } }

    // the playhead: while dragged it follows the hand through a spring (tape inertia); otherwise the tune moves it
    const prev = pos;
    if (drag) {
      const k = 520, c = 2 * Math.sqrt(k) * 0.8;
      posV += (-k * (pos - target) - c * posV) * dt; pos += posV * dt;
    } else if (rewinding) {
      pos = Math.max(0, pos - dt * NBAR * 1.6); posV = -NBAR * 1.6;
      if (pos <= 0) { pos = 0; posV = 0; rewinding = false; headJ.kick(3); S.tick(0.4, 0.5); }
    } else if (playing) {
      pos += dt / STEP_T; posV = 1 / STEP_T;
      if (pos >= NBAR) { pos = NBAR; setPlaying(false); rewinding = true; S.drip(0.4, 0.4); }
    } else {
      // a jump by keyboard or click glides
      const k = 300, c = 2 * Math.sqrt(k) * 0.85;
      posV += (-k * (pos - target) - c * posV) * dt; pos += posV * dt;
      if (Math.abs(pos - target) < 0.002) posV = 0;
    }
    if (!drag && !rewinding && playing) target = pos;
    pos = clamp(pos, 0, NBAR);

    // notes ring as the head crosses columns: played at tempo, or scrubbed like tape
    const i = Math.min(NBAR - 1, Math.floor(pos));
    if (i !== lastI && lastI >= 0) {
      const v = (pos - prev) / Math.max(dt, 1e-3);           // columns per second
      const n = Math.min(4, Math.abs(i - lastI));
      for (let k = 1; k <= n; k++) {
        const j = lastI + Math.sign(i - lastI) * k;
        if (rewinding) { flash[j] = 0.6; if (k === n) S.tick(0.3 + (j / NBAR) * 0.5, 0.25); continue; }
        if (drag) playNote(j, clamp(0.35 + Math.abs(v) / 14, 0.35, 1), clamp(1 + v * 0.025, 0.6, 1.8));
        else if (playing) playNote(j, 1, 1);
      }
    }
    lastI = i;
    S.air(drag ? Math.abs(posV) / 6 : rewinding ? 3 : 0);

    for (let k = 0; k < NBAR; k++) flash[k] *= Math.exp(-dt * 5);
    beat *= Math.exp(-dt * 5);
    filOn += ((playing ? 1 : 0.25) - filOn) * Math.min(1, dt * 5);
    th += dt * (playing ? 2.6 : 0.4) * (reducedMotion ? 0.4 : 1);
    lift += ((drag ? 1 : 0) - lift) * Math.min(1, dt * 12);
    const bj = btnJ.step(dt) * 0.04, hj = headJ.step(dt) * 0.04;
    st.light = mix3(L, HOT, beat * 0.6);

    const word = thumb ? '' : `${fmt(Math.min(pos, NBAR) * STEP_T)} / ${fmt(total)}`;
    if (word !== shownClock) { clock.set(word ? textCells(word, 3.0, 1, { align: 'left' }) : [], { instant: true }); shownClock = word; }
    clock.ox = RX + RAIL[0] - (word.length * 4 - 1) * 3.0;
    icon.step(dt, { ptr: st.local(icon), shy: 0 });

    const hx = posX(pos);
    st.drawPixels(ctx => {
      // the waveform: LED columns, played ones bright, the ones under the head a touch taller
      for (let c = 0; c < NBAR; c++) {
        const x = colX(c);
        const under = Math.max(0, 1 - Math.abs(x - hx) / 16);
        const n = clamp(Math.round(amp[c] * HALFN + under * 1.2 + flash[c] * 1.4), 1, HALFN + 1);
        const played = x <= hx ? 1 : 0;
        ctx.globalAlpha = Math.min(1, (played ? 0.95 : 0.36) + flash[c] * 0.5 + under * 0.25);
        // a mirrored column: pixel pairs above and below a parting line
        for (let k = 1; k <= n; k++) {
          const y = (k - 0.5) * PIX;
          ctx.fillRect(x - DOT / 2, y - DOT / 2, DOT, DOT);
          ctx.fillRect(x - DOT / 2, -y - DOT / 2, DOT, DOT);
        }
      }
      ctx.globalAlpha = 1;
      icon.draw(ctx, 0.95);
      clock.draw(ctx, 0.7);
    });
    st.render(t, (U, gl) => {
      gl.uniform2f(U.uRailC, st.cx + RX, st.cy);
      gl.uniform2f(U.uRail, RAIL[0], RAIL[1]);
      gl.uniform4f(U.uHead, st.cx + hx, st.cy - lift * 3, 13 * (1 + hj) * (1 + lift * 0.06), (RAIL[1] + 10) * (1 - hj) * (1 + lift * 0.04));
      gl.uniform3f(U.uBtn, st.cx + BX, st.cy - (press ? -1.5 : 0), BR * (1 + bj) * (1 - press * 0.04));
      gl.uniform1f(U.uPlayX, st.cx + hx);
      gl.uniform3f(U.uL, ...st.light);
      gl.uniform1f(U.uEnergy, 0.8 + st.kick * 0.25);
      gl.uniform1f(U.uTh, th);
      gl.uniform1f(U.uFilOn, filOn);
      gl.uniform1f(U.uBeat, beat);
      gl.uniform1f(U.uLift, lift);
      gl.uniform1f(U.uPress, press);
    });
  });

  return { dispose() { window.removeEventListener('keydown', onKey); S.air(0); st.dispose(); } };
}
