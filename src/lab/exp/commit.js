// COMMIT — slide to confirm, for things you can't take back. Seen from above.
// A glass lens sits at the start of a tray; behind its path the words shimmer like slide-to-unlock.
// Dragging it is work: the track resists more and more toward the end, a trail of liquid light builds up
// behind the lens, brighter and hotter, the ticks climb in pitch and the lens starts to tremble. Let go
// early and it springs back while the light drains. Reach the end and all that tension discharges:
// shockwave, sparks, a chord, the arrow in the lens turns into a check and the words into SENT.
// The letters are shy: they scatter out of the lens's way. Enter or Space slides it for you.

import { glassStage, PixelMatrix, Spring, Orbit, textCells, bitmapCells, hexRgb, mix3 } from '../glass/engine.js';
import { domeLens } from '../glass/lib.glsl.js';
import { clamp } from '../kit.js';

const COOL = hexRgb('#7d8cff'), MID = hexRgb('#c77dff'), HOT = hexRgb('#ff6a88'), DONE = hexRgb('#3dffa8');
const heat = t => (t < 0.5 ? mix3(COOL, MID, t * 2) : mix3(MID, HOT, (t - 0.5) * 2));
const ARROW = ['..#..', '...#.', '#####', '...#.', '..#..'];
const CHECK = ['.......##', '......##.', '.##..##..', '..####...', '...##....'];
const CHEVRONS = ['#...#...#..', '.#...#...#.', '..#...#...#', '.#...#...#.', '#...#...#..'];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const FRAG = /* glsl */ `
uniform vec2  uTrack;          // tray half size
uniform vec2  uKnob;           // lens centre
uniform vec2  uKR;             // lens radii
uniform vec2  uTrail;          // x of the trail start, x of its end (design, absolute)
uniform vec3  uL, uL0;         // current light colour, colour at the start of the trail
uniform float uProg, uTension, uDone, uFlood, uEnergy, uLift, uPress, uTh, uShim;

float sdSeg(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a, ba = b - a;
  h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-3), 0.0, 1.0);
  return length(pa - ba * h);
}
float fil(vec2 p) { return filament(p, uKnob, sdEllipse(p, uKnob, uKR), uTh, 0.7); }

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  vec2 hs = uTrack;
  float sdT = sdRoundBox(q - uC, hs, hs.y);
  col = shadowed(col, sdRoundBox(q - uC - vec2(0.0, 12.0), hs, hs.y), sdRoundBox(q - uC - vec2(0.0, 1.5), hs, hs.y), 0.0);
  float f = fil(q);
  col = emitC(col, uL, filamentSpill(f) * 0.5 * uEnergy);
  // liquid light fills the tray behind the lens, its front tucked under the lens: a level, not a line.
  // It grows brighter, hotter and flows faster with tension; after the discharge it floods the rest.
  float h;
  float r = hs.y + 3.0;
  float front = mix(max(uTrail.y - r + uKR.x * 0.55, uTrail.x), uTrail.y, uFlood);
  float len = max(uTrail.y - uTrail.x, 1.0);
  float d = sdSeg(q, vec2(uTrail.x, uC.y), vec2(front, uC.y), h) - r;
  float flow = 0.88 + 0.12 * sin((q.x - uC.x - uTime * (60.0 + 240.0 * uTension)) / 22.0);
  // nothing at rest; builds with progress; after the discharge one flash (the kick), then a calm glow
  float amp = smoothstep(30.0, 70.0, len) * ((0.16 + 0.8 * uProg) * (1.0 - 0.5 * uDone) + uKick * 0.5 * uDone);
  vec3 tcol = mix(uL0, uL, clamp((q.x - uTrail.x) / len, 0.0, 1.0));
  float core = 1.0 - smoothstep(-0.8, 0.8, d);
  float glow = exp(-max(d, 0.0) / 8.0) * 0.55 + exp(-max(d, 0.0) / 30.0) * 0.25;
  col = emitC(col, tcol, glow * amp * 0.2 * uEnergy);
  if (sdT < 2.0) {
    vec3 tc = tray(col, sdT, sdRoundBox(q - uC - vec2(0.0, 6.0), hs, hs.y), q, uC, hs);
    // calmer in the middle, brighter where the liquid meets the rim and at its front (the meniscus)
    float fieldShade = 0.6 + 0.55 * smoothstep(-hs.y * 0.9, -1.0, d);
    tc = emitC(tc, tcol, (core * 0.95 * fieldShade + glow * 0.6) * mix(flow, 1.0, uFlood * 0.6) * amp * uEnergy);
    tc = emitC(tc, uL, filamentWash(f) * 0.4 * uEnergy);
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdT));
  }
  // the lens's shadow: longer when lifted, tight when pressed
  float ls = sdEllipse(q - vec2(0.0, 8.0 + uLift * 5.0 - uPress * 4.0), uKnob, uKR);
  col *= 1.0 - (1.0 - smoothstep(-8.0, 20.0 + uLift * 10.0, ls)) * mix(0.5, 0.18, uTheme);
  // the words shimmer: a band of light sweeps through them while nothing happens
  float shim = exp(-pow((q.x - uC.x - uShim) / 24.0, 2.0)) * (1.0 - uProg) * (1.0 - uDone);
  float cover;
  return ink(col, q, frost, vec2(0.0), shim * 1.1, mix(uL, vec3(1.0), 0.4), cover);
}

${domeLens('knobDome', 'scene')}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);
  float sk = sdEllipse(p, uKnob, uKR);
  if (sk < 2.0) {
    vec3 kc = knobDome(p, sp, uKnob, uKR, 0.08, 1.0, vec4(0.0), uL, filamentScatter(fil(p)) * uEnergy * 0.9 + uTension * 0.35 + uDone * 0.4);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }
  col = drawFilament(col, fil(p), uL, uEnergy * (1.0 + uKick * 0.5));
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const TRACK = thumb ? [112, 28] : [262, 34];
  const R = thumb ? 25 : 31;
  const X0 = -TRACK[0] + R + 3, X1 = TRACK[0] - R - 3, MAX = X1 - X0;
  const st = glassStage(root, { frag: FRAG, box: [TRACK[0] * 2 + 120, TRACK[1] * 2 + 150], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => st.buzz(pat);

  // ---------------------------------------------------------------- state
  let phase = 'idle';             // idle · drag · auto · done · return
  let kx = X0, kv = 0, target = X0, autoT = 0, doneT = 0, doneMix = 0, tension = 0, lastTenth = 0;
  let press = 0, lift = 0, grab = 0, flood = 0, floodV = 0;
  const jelly = new Spring(360, 10);
  const orbit = new Orbit(0);
  const label = new PixelMatrix({ size: 3.3, swirl: 10, shyR: 30, shyF: 16 });
  const icon = new PixelMatrix({ size: 3.6, swirl: 12, shyR: 10, shyF: 3 });
  const IDLE_TEXT = thumb ? null : 'SLIDE TO SEND';
  const xIdle = (X0 + R * 0.7 + TRACK[0]) / 2, xDone = (-TRACK[0] + X1 - R * 0.7) / 2;
  const showIdle = instant => {
    label.set(IDLE_TEXT ? textCells(IDLE_TEXT, 3.4) : bitmapCells(CHEVRONS, 3.2, 0.8), { instant });
    icon.set(bitmapCells(ARROW, 3.6), { instant });
  };
  showIdle(true);
  label.ox = xIdle;
  const events = [];
  let clock = 0;
  const later = (dt, fn) => events.push({ t: clock + dt, fn });

  const resist = raw => (raw < 0 ? raw * 0.22 : (MAX * (1 - Math.exp(-raw * 1.7 / MAX))) / (1 - Math.exp(-1.7)));

  const confirm = () => {
    phase = 'done'; doneT = 0; target = X1;
    jelly.kick(-6);
    st.light = DONE;
    st.shock(X1, 0); st.burst(X1, 0, 22, 1.1); st.glint(); st.pulse(1);
    S.ping(true); buzz([10, 40, 20]);
    [0.5, 0.66, 0.84].forEach((p, i) => later(0.08 + i * 0.07, () => S.key(p)));
    label.set(thumb ? [] : textCells('SENT', 3.8)); icon.set(bitmapCells(CHECK, 3.2));
  };
  const release = () => {
    if (tension > 0.15) S.drip(0.3, 0.7);
    phase = 'return'; target = X0;
    jelly.kick(2.5); st.pulse(0.3);
  };

  // ---------------------------------------------------------------- input
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const onKnob = ([x, y]) => Math.hypot(x - kx, y) < R + 8;
  const overTrack = ([x, y]) => Math.abs(x) < TRACK[0] + 10 && Math.abs(y) < TRACK[1] + 12;
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d);
      if (phase !== 'idle' && phase !== 'return') return;
      if (!onKnob(q)) { if (overTrack(q)) { jelly.kick(-2); S.tick(0.4, 0.4); st.burst(kx + R, 0, 4, 0.3, 0, 0.6); } return; } // a nudge: the lens wants to be dragged
      S._ensure();
      phase = 'drag'; grab = q[0] - kx;
      jelly.kick(-1.5);
    },
    move: (p, e, d) => {
      const q = local(d);
      st.canvas.style.cursor = phase === 'drag' ? 'grabbing' : onKnob(q) && phase !== 'done' ? 'grab' : 'default';
      if (phase !== 'drag') return;
      target = X0 + Math.min(MAX, resist(q[0] - grab - X0));
      if (target >= X1 - MAX * 0.012) confirm();
    },
    up: () => { if (phase === 'drag') release(); },
  });
  const onKey = e => {
    if ((e.key === 'Enter' || e.key === ' ') && (phase === 'idle' || phase === 'return')) { e.preventDefault(); S._ensure(); phase = 'auto'; autoT = 0; }
  };
  if (!thumb) window.addEventListener('keydown', onKey);

  let demoT = 0;
  let shim = -TRACK[0];

  st.run((dt, t) => {
    clock += dt;
    for (let k = events.length - 1; k >= 0; k--) if (events[k].t <= clock) { const ev = events[k]; events.splice(k, 1); ev.fn(); }
    if (demo && phase === 'idle') { demoT += dt; if (demoT > 0.6) { demoT = 0; phase = 'auto'; autoT = 0; } }

    if (phase === 'auto') {
      // slides by itself, slowly at first and then giving in (the tension still builds)
      autoT += dt / (thumb ? 0.9 : 1.05);
      target = X0 + MAX * Math.pow(Math.min(1, autoT), 2.2);
      if (autoT >= 1) confirm();
    }
    if (phase === 'done') {
      doneT += dt;
      if (doneT > (thumb ? 1.4 : 2.8)) {
        phase = 'return'; target = X0;
        showIdle(false); S.drip(0.45, 0.5); jelly.kick(2);
      }
    }

    // the lens follows its target: tight while held, springy on the way back
    const k = phase === 'drag' || phase === 'auto' ? 900 : phase === 'done' ? 520 : 170;
    const c = 2 * Math.sqrt(k) * (phase === 'return' ? 0.5 : 0.85);
    kv += (-k * (kx - target) - c * kv) * dt; kx += kv * dt;
    if (phase === 'return' && Math.abs(kx - X0) < 0.5 && Math.abs(kv) < 5) { phase = 'idle'; kx = X0; kv = 0; }

    const prog = clamp((kx - X0) / MAX, 0, 1);
    const building = phase === 'drag' || phase === 'auto';
    tension += ((building ? prog : 0) - tension) * Math.min(1, dt * (building ? 10 : 4));
    doneMix += ((phase === 'done' ? 1 : 0) - doneMix) * Math.min(1, dt * 6);
    // the flood: rises like liquid after the discharge, drains first when it resets
    { const k = 70, c = 2 * Math.sqrt(k) * 0.9; floodV += (-k * (flood - (phase === 'done' ? 1 : 0)) - c * floodV) * dt; flood = clamp(flood + floodV * dt, 0, 1); }
    // rising ticks while the tension builds
    const tenth = Math.floor(prog * 10);
    if (building && tenth > lastTenth) { S.tick(0.3 + prog * 0.7, 0.35 + prog * 0.5); st.pulse(0.1 + prog * 0.3); jelly.kick(-0.5 - prog); }
    lastTenth = building ? tenth : 0;
    S.air(Math.abs(kv) / 500);

    const L = mix3(heat(prog), DONE, doneMix);
    if (!events.length && phase !== 'done') st.light = L;
    const L0 = mix3(COOL, DONE, doneMix);
    const th = orbit.step(dt, prog);

    // trembling under tension
    const tr = reducedMotion ? 0 : Math.pow(tension, 3) * (thumb ? 1.2 : 2.2);
    const jx = tr * (Math.sin(t * 71) * 0.6 + Math.sin(t * 113) * 0.4);
    const jy = tr * (Math.sin(t * 83 + 1) * 0.6 + Math.sin(t * 59) * 0.4);

    press += ((phase === 'drag' ? 1 : 0) - press) * Math.min(1, dt * 12);
    lift += ((st.ptrOn > 0.5 && phase === 'idle' && onKnob(st.local()) ? 1 : 0) - lift) * Math.min(1, dt * 8);
    const j = jelly.step(dt) * 0.03;
    const stretch = Math.min(Math.abs(kv) * 0.00022, 0.14);

    // pixels: the words make way for the lens; the icon rides inside it
    label.ox += ((phase === 'done' ? xDone : xIdle) - label.ox) * Math.min(1, dt * 8);
    label.step(dt, { ptr: [kx - label.ox, 0], shy: phase === 'done' ? 0 : 1, vel: kv * 0.3 });
    icon.ox = kx + jx; icon.oy = jy;
    icon.step(dt, { ptr: st.local(icon), shy: 0, vel: kv * 0.12 });
    if (!building && phase !== 'done') shim += dt * 150;
    if (shim > TRACK[0] + 90) shim = X0 - 40; // the shimmer starts again just past the lens

    st.drawPixels(ctx => {
      const mask = 1 - doneMix;
      for (const p of label.px) {
        const [x, y] = label.at(p);
        const b = p.b * (mask * smooth(kx + R * 0.1, kx + R + 18, x) + (1 - mask)) * 0.85;
        if (b < 0.01) continue;
        ctx.globalAlpha = Math.min(1, b);
        ctx.fillRect(x - label.size / 2, y - label.size / 2, label.size, label.size);
      }
      ctx.globalAlpha = 1;
      icon.draw(ctx, 1);
    });
    st.render(t, (U, gl) => {
      const X = st.cx, Y = st.cy;
      gl.uniform2f(U.uTrack, TRACK[0], TRACK[1]);
      gl.uniform2f(U.uKnob, X + kx + jx, Y + jy - lift * 2 + press * 2);
      gl.uniform2f(U.uKR, R * (1 + j + stretch) * (1 - press * 0.03), R * (1 - j - stretch * 0.5) * (1 - press * 0.03));
      gl.uniform2f(U.uTrail, X - TRACK[0] + 12, X + kx);
      gl.uniform3f(U.uL, ...L);
      gl.uniform3f(U.uL0, ...L0);
      gl.uniform1f(U.uProg, prog);
      gl.uniform1f(U.uTension, tension);
      gl.uniform1f(U.uDone, doneMix);
      gl.uniform1f(U.uFlood, flood);
      gl.uniform1f(U.uEnergy, 0.7 + lift * 0.1 + st.kick * 0.25);
      gl.uniform1f(U.uLift, lift);
      gl.uniform1f(U.uPress, press);
      gl.uniform1f(U.uTh, th);
      gl.uniform1f(U.uShim, shim);
    });
  });

  return { dispose() { window.removeEventListener('keydown', onKey); st.dispose(); } };
}
