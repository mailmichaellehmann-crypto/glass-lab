// DROP — a checklist where every tick is a drop of liquid glass.
// Seen from above, like everything here. Hover a task and a drop gathers in the air over its
// well, trembling. Check it: the drop falls away from you (shrinking, its shadow pulling in
// under it), lands and spreads into a round bead that wobbles back, throws a few sparks and sends
// a ripple across the floor; through its lens a pixel tick blooms, and a filament of light strikes
// the task out. Uncheck it and the drop lifts back toward you and evaporates. Check them all and
// the drops light up in turn.

import { glassStage, PixelMatrix, Spring, textCells, bitmapCells, hexRgb, mix3 } from '../glass/engine.js';
import { domeLens } from '../glass/lib.glsl.js';
import { clamp, rand } from '../kit.js';

const TASKS = ['WATER THE PLANTS', 'CALL MOM', 'SHIP THE THING'];
const ROW = 104, WELL_X = -150, WELL_R = 31, DROP_R = 23, LABEL_X = -96, PITCH = 4.0;
const rowY = i => (i - 1) * ROW;

const FRAG = /* glsl */ `
uniform vec4  uDrop[3];      // x, y, rx, ry (rx 0 = none)
uniform vec4  uDropL[3];     // glow (celebration), hover, height above the floor (0..1), unused
uniform float uRipple[3];    // ripple age (s), < 0 none
uniform vec4  uStrike[3];    // x0, y, length, alpha
uniform vec2  uWellX;        // well x, unused

float sdWell(vec2 q, float y) { return length(q - vec2(uWellX.x, y)) - ${WELL_R}.0; }

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  for (int i = 0; i < 3; i++) {
    float y = (float(i) - 1.0) * ${ROW}.0;
    float wy = uC.y + y;
    float sw = sdWell(q, wy);
    col = shadowed(col, length(q - vec2(uWellX.x, wy + 12.0)) - ${WELL_R}.0, length(q - vec2(uWellX.x, wy + 1.5)) - ${WELL_R}.0, 0.0);
    if (sw < 2.0) {
      vec3 tc = tray(col, sw, length(q - vec2(uWellX.x, wy + 6.0)) - ${WELL_R}.0, q, vec2(uWellX.x, wy), vec2(${WELL_R}.0));
      // ripple running over the floor after a drop lands
      if (uRipple[i] >= 0.0) {
        float rr = length(q - vec2(uWellX.x, wy));
        float front = uRipple[i] * 70.0;
        tc = emit(tc, exp(-pow((rr - front) / 2.2, 2.0)) * exp(-uRipple[i] * 3.0) * 0.9);
      }
      // the drop's shadow and the light it gathers onto the floor (a caustic)
      vec4 d = uDrop[i];
      if (d.z > 0.5) {
        // seen from above: the higher the drop, the further its shadow falls and the softer it is
        float hgt = uDropL[i].z;
        vec2 so = vec2(3.0, 5.0) + hgt * vec2(16.0, 24.0);
        float ds = length(q - d.xy - so) - d.z * (1.0 - hgt * 0.35);
        tc *= 1.0 - (1.0 - smoothstep(-4.0 - hgt * 8.0, 10.0 + hgt * 26.0, ds)) * mix(0.38, 0.13, uTheme) * (1.0 - hgt * 0.55);
        // the caustic it focuses onto the floor, tight when it rests
        tc = emit(tc, exp(-length(q - d.xy - vec2(5.0, 6.0) - so * 0.3) / (d.z * (0.45 + hgt))) * 0.38 * (1.0 - hgt * 0.7) * (1.0 + uDropL[i].x));
      }
      col = mix(tc, col, smoothstep(-0.6, 0.6, sw));
    }
    // condensation: a soft halo where a drop gathers out of the air
    vec4 dd = uDrop[i];
    if (dd.z > 0.5 && uDropL[i].z > 0.3) {
      float hd = length(q - dd.xy);
      col = emit(col, exp(-hd / 22.0) * 0.22 * (0.4 + uDropL[i].y));
    }
    // strike: a filament of light across the task
    vec4 s = uStrike[i];
    if (s.w > 0.001) {
      float sd = length(vec2(max(abs(q.x - (s.x + s.z * 0.5)) - s.z * 0.5, 0.0), q.y - s.y)) - 1.1;
      col = emit(col, (exp(-max(sd, 0.0) / 5.0) * 0.6 + exp(-max(sd, 0.0) / 22.0) * 0.18) * s.w);
      col = mix(col, mix(uLight, vec3(1.0), 0.6), (1.0 - smoothstep(-0.6, 0.6, sd)) * s.w);
    }
  }
  float cover;
  return ink(col, q, frost, vec2(0.0), 0.15, uLight, cover);
}
${domeLens('lens', 'scene')}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);
  for (int i = 0; i < 3; i++) {
    vec4 d = uDrop[i];
    if (d.z < 0.5) continue;
    float dd = sdEllipse(p, d.xy, d.zw);
    if (dd < 2.0) {
      vec3 kc = lens(p, sp, d.xy, d.zw, 0.06, 0.95, vec4(mix(vec3(0.75, 0.92, 1.0), uLight, 0.4), 0.18), uLight, 0.25 + uDropL[i].x * 0.9);
      col = mix(kc, col, smoothstep(-0.7, 0.7, dd));
    }
    col = emit(col, exp(-max(dd, 0.0) / 14.0) * uDropL[i].x * 0.9);
  }
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

const CHECK = ['.......##', '......##.', '.##..##..', '..####...', '...##....'];
const BASE = hexRgb('#7fe0ff'), DONE = hexRgb('#3dffa8');

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const st = glassStage(root, { frag: FRAG, box: [600, 440], thumb });
  const S = st.sfx;

  const rows = TASKS.map((label, i) => {
    const lab = new PixelMatrix({ size: 3.6, swirl: 8, shyR: 13, shyF: 5 });
    lab.ox = LABEL_X; lab.oy = rowY(i);
    lab.set(textCells(label, PITCH, 1, { align: 'left' }), { instant: true });
    const chk = new PixelMatrix({ size: 3.4, swirl: 12 });
    chk.ox = WELL_X; chk.oy = rowY(i) + 1;
    return {
      i, lab, chk, checked: false, phase: 'idle', h: 1, vh: 0, size: 0, hang: 0,
      jelly: new Spring(320, 9), ripple: -1, strike: 0, glow: 0, hover: 0,
      width: (label.length * 4 - 1) * PITCH,
    };
  });
  let celebrated = false;

  function toggle(r) {
    if (r.phase === 'fall' || r.phase === 'rise') return;
    r.checked = !r.checked;
    if (r.checked) {
      r.phase = 'form';                      // finish swelling, then let go
    } else {
      r.phase = 'rise'; r.vh = 0.6; r.h = 0;  // drawn back up and evaporating
      r.chk.set([]);
      S.drip(0.95, 0.5); S.air(0.4); setTimeout(() => S.air(0), 220);
      celebrated = false;
      st.glint();
    }
  }
  function land(r) {
    r.phase = 'rest'; r.h = 0; r.vh = 0;
    r.jelly.kick(9);
    r.ripple = 0;
    st.burst(WELL_X - 14, rowY(r.i) - 6, 4, 0.35, -Math.PI * 0.75, 0.5);
    st.burst(WELL_X + 14, rowY(r.i) - 6, 4, 0.35, -Math.PI * 0.25, 0.5);
    S.drip(0.35 + r.i * 0.1, 1); navigator.vibrate?.(9);
    st.pulse(0.6);
    setTimeout(() => { if (r.checked) r.chk.set(bitmapCells(CHECK, 3.6)); }, 90);
    if (rows.every(x => x.checked) && !celebrated) celebrate();
  }
  function celebrate() {
    celebrated = true;
    rows.forEach((r, k) => setTimeout(() => {
      r.glow = 1; r.jelly.kick(5);
      S.tick(0.55 + k * 0.2, 1.4);
      if (k === 2) { S.ping(true); st.shock(WELL_X, 0); st.glint(); st.pulse(1); }
    }, 380 + k * 170));
  }

  // ---------------------------------------------------------------- input
  const rowAt = ([x, y]) => {
    const lx = x - st.cx, ly = y - st.cy;
    if (lx < WELL_X - 50 || lx > LABEL_X + 280) return null;
    const i = Math.round(ly / ROW) + 1;
    return i >= 0 && i < 3 && Math.abs(ly - rowY(i)) < ROW / 2 ? rows[i] : null;
  };
  let hovered = null;
  st.bindPointer({
    down: (p, e, d) => { const r = rowAt(d); if (r) { S._ensure(); toggle(r); } },
    move: (p, e, d) => { hovered = rowAt(d); st.canvas.style.cursor = hovered ? 'pointer' : 'default'; },
  });
  const onKey = e => {
    if (/^[123]$/.test(e.key)) toggle(rows[+e.key - 1]);
    if (e.key === ' ' && hovered) { e.preventDefault(); toggle(hovered); }
  };
  if (!thumb) window.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- autopilot
  let demoT = 0, demoStep = 0;

  st.run((dt, t) => {
    if (demo && (demoT += dt) > 1.05) {
      demoT = 0;
      if (thumb) { if (demoStep % 2 === 0) toggle(rows[1]); else if (rows[1].checked) toggle(rows[1]); }
      else {
        const k = demoStep % 5;
        if (k < 3) toggle(rows[k]);
        else if (k === 4) rows.forEach(r => r.checked && toggle(r));
      }
      demoStep++;
    }
    if (!st.ptr?.inside) hovered = null;

    let light = BASE;
    for (const r of rows) {
      r.hover += ((hovered === r ? 1 : 0) - r.hover) * Math.min(1, dt * 8);
      r.glow *= Math.exp(-dt * 1.4);
      // drop life cycle
      if (r.phase === 'idle') {
        // anticipation: a small drop swells at the tip when you hover an unchecked task
        const want = !r.checked && hovered === r ? 0.42 : 0;
        r.hang += (want - r.hang) * Math.min(1, dt * 6);
        r.size = r.hang;
      } else if (r.phase === 'form') {
        r.size = Math.min(1, r.size + dt * 4.5);
        if (r.size >= 1) { r.phase = 'fall'; r.h = 1; r.vh = 0; r.jelly.kick(-6); S.drip(0.8, 0.4); }
      } else if (r.phase === 'fall') {
        r.vh += 9 * dt; r.h -= r.vh * dt;           // accelerating toward the floor (and away from us)
        if (r.h <= 0) land(r);
      } else if (r.phase === 'rise') {
        r.vh += 5 * dt; r.h += r.vh * dt;           // lifted back up toward us, evaporating
        r.size = Math.max(0, r.size - dt * 2.6);
        if (r.size <= 0.01) { r.phase = 'idle'; r.size = 0; r.hang = 0; r.h = 1; }
      }
      if (r.phase === 'rest' && !r.checked) r.phase = 'rise';
      r.ripple = r.ripple >= 0 ? r.ripple + dt : -1;
      if (r.ripple > 1.5) r.ripple = -1;
      const goal = r.checked && r.phase === 'rest' ? 1 : 0;
      r.strike += (goal - r.strike) * Math.min(1, dt * (goal ? 5 : 8));
      r.lab.step(dt, { ptr: st.local(r.lab), shy: st.ptrOn * 0.5 });
      r.chk.step(dt);
      if (r.checked && r.phase === 'rest') light = mix3(light, DONE, 0.34);
    }
    st.light = light;

    st.drawPixels(ctx => {
      for (const r of rows) {
        if (!thumb) r.lab.draw(ctx, r.checked ? 0.42 + 0.58 * (1 - r.strike) : 0.95);
        r.chk.draw(ctx, 1);
      }
    });
    st.render(t, (U, gl) => {
      const drops = [], dl = [], rip = [], strike = [];
      for (const r of rows) {
        const j = r.jelly.step(dt) * 0.03;
        // seen from above a drop is always round: height makes it larger (nearer the eye) and
        // drifts it a little away from the centre of view; landing spreads it into a flat bead
        const hgt = r.phase === 'rest' ? 0 : r.h;
        const x = WELL_X + WELL_X * 0.06 * hgt;
        const y = rowY(r.i) + rowY(r.i) * 0.06 * hgt - hgt * 6;
        const s = r.phase === 'rest' ? 1 : r.size;
        const trembling = r.phase === 'idle' ? Math.sin(t * 11 + r.i) * 0.03 * s : 0;
        const base = r.phase === 'rest' ? DROP_R * 1.06 : DROP_R * (1 + 0.38 * hgt);
        const rx = base * s * (1 + j + trembling), ry = rx;
        const show = rx > 0.6;
        drops.push(st.cx + x, st.cy + y, show ? rx : 0, show ? ry : 0);
        dl.push(r.glow, r.hover, r.phase === 'rest' ? 0 : r.h, 0);
        rip.push(r.ripple);
        strike.push(st.cx + LABEL_X - 4, st.cy + rowY(r.i), (r.width + 8) * r.strike, r.strike > 0.01 && !thumb ? 1 : 0);
      }
      gl.uniform4fv(U.uDrop, drops);
      gl.uniform4fv(U.uDropL, dl);
      gl.uniform1fv(U.uRipple, rip);
      gl.uniform4fv(U.uStrike, strike);
      gl.uniform2f(U.uWellX, st.cx + WELL_X, 0);
    });
  });

  return { dispose() { window.removeEventListener('keydown', onKey); st.dispose(); } };
}
