// TIMER — a wind-up kitchen timer made of thick glass, seen from above.
// A glass disc with a knurled rim lies in a round well ringed by sixty LED minutes. Turn it clockwise to
// wind it up: every minute clicks and lights in the ring, the time stands crisp under its flat face.
// Let go and it runs: the disc turns back as time passes, minutes go out one by one, the toggle's
// filament marks where the disc stands. The last ten seconds tick louder, the last three pulse; at zero
// it rings with glass bells, the disc trembles and the ring flashes until you tap it. Tap to pause.

import { glassStage, PixelMatrix, Spring, textCells, hexRgb, mix3 } from '../glass/engine.js';
import { thickGlass } from '../glass/lib.glsl.js';
import { clamp } from '../kit.js';

const L = hexRgb('#ff8a3d'), CALM = hexRgb('#ffb36b'), RING = hexRgb('#ffe2a8');
const TAU = Math.PI * 2;
const MAX = 3600;                                       // one turn = sixty minutes
const fmt = s => { s = Math.ceil(s - 1e-6); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

const FRAG = /* glsl */ `
uniform vec3  uWell;           // well centre (abs), radius
uniform vec3  uDisk;           // disc centre (abs), radius
uniform float uAng;            // disc rotation
uniform float uFrac;           // remaining fraction of the ring (0..1)
uniform vec3  uL;
uniform float uEnergy, uRing, uTh, uFilOn, uPress, uLift;

float fil(vec2 p) { return filament(p, uDisk.xy, length(p - uDisk.xy) - uDisk.z, uTh, 0.42); }

vec3 scene(vec2 q, vec2 sp, float frost, out float cover) {
  vec3 col = pageBg(sp);
  vec2 d = q - uWell.xy;
  float sdW = length(d) - uWell.z;
  col = shadowed(col, length(d - vec2(0.0, 14.0)) - uWell.z, length(d - vec2(0.0, 1.5)) - uWell.z, 0.0);
  float wash = 0.0;
  if (sdW < 2.0) {
    vec3 tc = tray(col, sdW, length(d - vec2(0.0, 8.0)) - uWell.z, q, uWell.xy, vec2(uWell.z));
    // the lit arc of minutes glows on the floor of the well, from twelve o'clock clockwise
    float a = atan(d.x, -d.y); a = a < 0.0 ? a + 6.2831853 : a;
    float lit = smoothstep(uFrac * 6.2831853 + 0.02, uFrac * 6.2831853 - 0.02, a) * step(0.0005, uFrac);
    float ringR = (uDisk.z + uWell.z) * 0.5;
    float band = exp(-pow((length(d) - ringR) / 7.0, 2.0));
    tc = emitC(tc, uL, band * lit * (0.18 + 0.5 * uRing) * uEnergy);
    tc = emitC(tc, uL, band * uRing * 0.5 * uEnergy);
    // the disc's shadow in the well
    float ds = length(d - vec2(0.0, 9.0 + uLift * 6.0 - uPress * 4.0)) - uDisk.z;
    tc *= 1.0 - (1.0 - smoothstep(-8.0, 18.0 + uLift * 8.0, ds)) * mix(0.5, 0.18, uTheme);
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdW));
    wash = (lit * 0.9 + uRing * 0.8) * band * (1.0 - smoothstep(-0.6, 0.6, sdW));
  }
  float f = max(fil(q), 0.0);
  col = emitC(col, uL, filamentWash(f) * 0.4 * uFilOn * uEnergy);
  return ink(col, q, frost, vec2(0.0), wash, mix(uL, vec3(1.0), 0.2), cover);
}

${thickGlass('thick', 'scene')}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  float cover;
  vec3 col = scene(p, sp, 0.0, cover);
  vec2 d = p - uDisk.xy;
  float sd = length(d) - uDisk.z;
  if (sd < 2.0) {
    vec2 n = normalize(d + 1e-4);
    float depth = max(-sd, 0.0);
    // a knurled rim that turns with the disc: fine ridges bend the normal around the bevel
    float pa = atan(d.y, d.x);
    float rim = 1.0 - smoothstep(10.0, 16.0, depth);
    vec2 tg = vec2(-n.y, n.x);
    n = normalize(n + tg * sin((pa - uAng) * 56.0) * 0.35 * rim);
    vec3 kc = thick(p, sp, n, depth, uDisk.xy, vec2(uDisk.z), 18.0, 18.0, 0.08,
                    filamentScatter(max(fil(p), 0.0)) * uFilOn * 0.8 + uRing * 0.5, uL);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sd));
  }
  col = mix(col, drawFilament(col, fil(p), uL, uEnergy * (1.0 + uKick * 0.5)), uFilOn);
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const WR = thumb ? 82 : 112, DR = thumb ? 60 : 80;     // well and disc radius
  const RR = (WR + DR) / 2;                              // LED ring radius
  const st = glassStage(root, { frag: FRAG, box: [WR * 2 + 60, WR * 2 + (thumb ? 50 : 140)], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => st.buzz(pat);

  // ---------------------------------------------------------------- state
  let secs = 0, state = 'idle';                         // idle · set · wind · run · pause · ring
  let ang = 0, angShow = 0, drag = null, ringT = 0, bellT = 0, lastMin = 0, lastSec = -1, press = 0, lift = 0, shake = 0;
  const disc = new Spring(380, 10);
  const time = new PixelMatrix({ size: thumb ? 3.2 : 4.1, swirl: 6, shyR: 14, shyF: 4 });
  const word = new PixelMatrix({ size: 2.4, swirl: 8, shyR: 12, shyF: 4 });
  word.oy = thumb ? 0 : 26;
  time.oy = thumb ? 0 : -6;
  let shownTime = null, shownWord = null;
  const angFor = s => (s / MAX) * TAU;

  const startRun = () => { if (secs > 0.5) { state = 'run'; S.ping(true); st.glint(); st.pulse(0.5); buzz(8); } else { state = 'idle'; secs = 0; } };
  const stopRing = () => { state = 'idle'; secs = 0; ringT = 0; S.drip(0.4, 0.5); disc.kick(3); st.light = CALM; };

  // ---------------------------------------------------------------- input: turn the disc
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const onDisc = ([x, y]) => Math.hypot(x, y) < DR + 8;
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d);
      if (!onDisc(q)) return;
      S._ensure();
      if (state === 'ring') { stopRing(); return; }
      drag = { a: Math.atan2(q[1], q[0]), turned: 0, was: state };
      if (state === 'run') state = 'wind';
      press = 1; disc.kick(-2);
    },
    move: (p, e, d) => {
      const q = local(d);
      st.canvas.style.cursor = drag ? 'grabbing' : onDisc(q) ? 'grab' : 'default';
      if (!drag) return;
      const a = Math.atan2(q[1], q[0]);
      let da = a - drag.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      drag.a = a; drag.turned += Math.abs(da);
      if (drag.turned < 0.06) return;
      state = 'wind';
      // clockwise winds it up; past sixty minutes it resists like a spring
      let s = secs + (da / TAU) * MAX;
      if (s > MAX) s = MAX + (s - MAX) * 0.15;
      secs = clamp(s, 0, MAX + 40);
    },
    up: () => {
      if (!drag) return;
      const { turned, was } = drag;
      drag = null; press = 0;
      secs = Math.min(secs, MAX);
      if (turned < 0.06) {
        // a tap: pause / resume
        if (was === 'run') { state = 'pause'; S.tick(0.35, 0.6); disc.kick(2); }
        else if (was === 'pause') startRun();
        else if (secs > 0.5) startRun();
        return;
      }
      disc.kick(2.5);
      startRun();
    },
  });
  const onKey = e => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault(); S._ensure();
      if (state === 'ring') stopRing(); else if (state === 'run') { state = 'pause'; S.tick(0.35, 0.6); } else startRun();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); S._ensure();
      if (state === 'ring') stopRing();
      secs = clamp(Math.round(secs / 60) * 60 + (e.key === 'ArrowUp' ? 60 : -60), 0, MAX);
      disc.kick(-2);
      if (state === 'idle' && secs > 0) state = 'set';
      if (state === 'set' && secs <= 0) state = 'idle';
    }
  };
  if (!thumb) window.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- autopilot (shelf miniature): wind three minutes, run fast, ring
  let demoT = 0;

  st.run((dt, t) => {
    if (demo) {
      demoT += dt;
      if (state === 'idle' && demoT > 0.3) { state = 'wind'; }
      if (state === 'wind' && !drag) { secs = Math.min(180, secs + dt * 260); if (secs >= 180) startRun(); }
      if (state === 'ring' && ringT > 1.2) { stopRing(); demoT = 0; }
    }

    // time passes (the miniature runs a hundred times faster)
    if (state === 'run') {
      secs -= dt * (demo ? 90 : 1);
      if (secs <= 0) { secs = 0; state = 'ring'; ringT = 0; bellT = 0; st.light = RING; st.shock(0, 0); st.burst(0, 0, 20, 0.9); buzz([30, 60, 30, 60, 30]); }
    }
    if (state === 'ring') {
      ringT += dt; bellT -= dt;
      if (bellT <= 0 && ringT < 8) { bellT = 0.42; S.note(1046.5, 0.9, 0.5); S.note(1318.5, 0.6, 0.4); disc.kick(-3); st.pulse(0.6); }
      if (ringT > 8 && !demo) stopRing();
    }

    // clicks: one per minute while winding, seconds in the last ten while running
    const mins = Math.ceil(secs / 60 - 1e-6);
    if (state === 'wind' && mins !== lastMin) { S.tick(0.35 + Math.min(1, mins / 60) * 0.6, 0.6); disc.kick(mins > lastMin ? -1.2 : 1.2); }
    lastMin = mins;
    const sec = Math.ceil(secs - 1e-6);
    if (state === 'run' && sec !== lastSec && sec <= 10 && sec > 0) {
      const urgent = sec <= 3;
      S.tick(0.6 + (10 - sec) * 0.03, urgent ? 1 : 0.55);
      if (urgent) { st.pulse(0.5); disc.kick(-2.5); buzz(6); }
    }
    lastSec = sec;

    // the disc shows the wound time; it eases toward it, so winding and unwinding feel heavy and smooth
    ang = angFor(Math.min(secs, MAX + 40));
    angShow += (ang - angShow) * Math.min(1, dt * (drag ? 18 : 10));
    shake = state === 'ring' && !reducedMotion ? Math.sin(t * 70) * 2.2 * Math.max(0, 1 - ringT / 8) : 0;
    press += ((drag ? 1 : 0) - press) * Math.min(1, dt * 12);
    lift += ((st.ptrOn > 0.5 && !drag ? 1 : 0) - lift) * Math.min(1, dt * 8);
    const dj = disc.step(dt) * 0.03;
    const ringing = state === 'ring' ? 0.5 + 0.5 * Math.cos(ringT * Math.PI * 2 / 0.42) : 0;
    if (state !== 'ring') st.light = mix3(st.light, state === 'pause' ? CALM : L, Math.min(1, dt * 4));

    const tw = fmt(secs);
    if (tw !== shownTime) { time.set(textCells(tw, thumb ? 3.8 : 4.8), { instant: shownTime !== null }); shownTime = tw; }
    const ww = thumb ? '' : state === 'ring' ? 'TIME!' : state === 'pause' ? 'PAUSED' : state === 'set' ? 'READY' : state === 'run' ? 'RUNNING' : secs > 0 ? 'LET GO' : 'TURN ME'; // short: the word must stay on the flat face
    if (ww !== shownWord) { word.set(ww ? textCells(ww, 2.8) : []); shownWord = ww; }
    time.ox = shake; word.ox = shake;
    time.step(dt, { ptr: st.local(time), shy: 0 });
    word.step(dt, { ptr: st.local(word), shy: st.ptrOn * 0.4 });

    const frac = Math.min(1, secs / MAX);
    const DOT = thumb ? 2.8 : 3.4;
    st.drawPixels(ctx => {
      // sixty LED minutes around the disc; the running minute dims as its seconds go
      for (let i = 0; i < 60; i++) {
        const a = -Math.PI / 2 + (i + 0.5) / 60 * TAU;
        const on = clamp(secs / 60 - i, 0, 1);
        const blink = state === 'ring' ? ringing : 0;
        ctx.globalAlpha = Math.min(1, 0.18 + on * 0.8 + blink * 0.8);
        const big = i % 5 === 0 ? 1.25 : 1;
        ctx.fillRect(Math.cos(a) * RR + shake - (DOT * big) / 2, Math.sin(a) * RR - (DOT * big) / 2, DOT * big, DOT * big);
      }
      ctx.globalAlpha = 1;
      time.draw(ctx, state === 'pause' ? 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(t * 4)) : 1);
      word.draw(ctx, 0.6);
    });
    st.render(t, (U, gl) => {
      gl.uniform3f(U.uWell, st.cx, st.cy, WR);
      gl.uniform3f(U.uDisk, st.cx + shake, st.cy - lift * 1.5 + press * 1.5, DR * (1 + dj) * (1 - press * 0.03));
      gl.uniform1f(U.uAng, angShow);
      gl.uniform1f(U.uFrac, state === 'ring' ? 1 : frac);
      gl.uniform3f(U.uL, ...st.light);
      gl.uniform1f(U.uEnergy, 0.8 + st.kick * 0.25);
      gl.uniform1f(U.uRing, ringing);
      gl.uniform1f(U.uTh, -Math.PI / 2 + angShow + (state === 'ring' ? ringT * 9 : 0));
      gl.uniform1f(U.uFilOn, secs > 0.5 || state === 'ring' ? 1 : 0.3);
      gl.uniform1f(U.uPress, press);
      gl.uniform1f(U.uLift, lift);
    });
  });

  return { dispose() { window.removeEventListener('keydown', onKey); st.dispose(); } };
}
