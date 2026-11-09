// TABS — a segmented control whose selector flows like a drop of glass.
// The lens is two bodies fused with a smooth minimum: the head springs ahead, the tail follows
// slower, and the drop stretches (keeping its volume) and snaps back together on arrival.
// The chosen word grows by pixel morph, the colour travels with the lens, and a light strip
// hugs the lens's lower edge, like the toggle.

import { glassStage, PixelMatrix, Spring, Orbit, textCells, sfx, hexRgb, mix3 } from '../glass/engine.js';
import { sdfNormal } from '../glass/lib.glsl.js';
import { clamp } from '../kit.js';

const TABS_ALL = [
  { label: 'DAY', color: '#ffb547' },
  { label: 'WEEK', color: '#3dffa8' },
  { label: 'MONTH', color: '#8ea0ff' },
  { label: 'YEAR', color: '#ff6f9c' },
];
const LENS = [58, 34], GAP = 136;

const FRAG = /* glsl */ `
uniform vec2  uRail;
uniform vec2  uHead, uTail;      // lens bodies (design px)
uniform vec2  uHeadH, uTailH;    // their half sizes
uniform float uPress;
uniform float uLift;
uniform float uTheta;   // filament angle around the lens (the toggle's orbit)
uniform float uNeck;            // radius of the bridge between head and tail

float sdSeg(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-3), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float sdLens(vec2 p) {
  float a = sdRoundBox(p - uHead, uHeadH, uHeadH.y);
  float b = sdRoundBox(p - uTail, uTailH, uTailH.y);
  float neck = sdSeg(p, uTail, uHead, uNeck);
  return smin(smin(a, b, 30.0), neck, 26.0);
}
${sdfNormal('sdLens')}
vec2 lensC() { return (uHead + uTail) * 0.5; }

// the toggle's filament: bottom at the first tab, top at the last, orbiting the leading side between
float stripD(vec2 p) { return filament(p, lensC(), sdLens(p), uTheta, 0.85); }

vec3 railAt(vec2 p, vec2 sp, float frost, vec2 ca, out float cover) {
  vec2 hs = uRail;
  float sdR = sdRoundBox(p - uC, hs, hs.y);
  vec3 col = tray(pageBg(sp), sdR, sdRoundBox(p - uC - vec2(0.0, 7.0), hs, hs.y), p, uC, hs);
  float dl = max(sdLens(p), 0.0);
  float sd = max(stripD(p), 0.0);
  float wash = (exp(-sd / 14.0) * 0.85 + exp(-sd / 55.0) * 0.32) + exp(-dl / 30.0) * 0.25;
  col = emit(col, wash * 0.5);
  // the lens's own soft shadow in the rail
  vec2 so = vec2(0.0, 7.0 + uLift * 6.0 - uPress * 4.0);
  float ls = smin(sdRoundBox(p - uHead - so, uHeadH, uHeadH.y), sdRoundBox(p - uTail - so, uTailH, uTailH.y), 30.0);
  col *= 1.0 - (1.0 - smoothstep(-8.0, 18.0 + uLift * 10.0, ls)) * mix(0.55, 0.2, uTheme) * step(sdR, 0.5);
  return ink(col, p, frost, ca, wash, uLight, cover);
}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = pageBg(sp);
  float sdR = sdRoundBox(p - uC, uRail, uRail.y);
  col = shadowed(col, sdRoundBox(p - uC - vec2(0.0, 14.0), uRail, uRail.y), sdRoundBox(p - uC - vec2(0.0, 1.5), uRail, uRail.y), 0.0);
  float sd = max(stripD(p), 0.0);
  col = emit(col, (exp(-sd / 18.0) * 0.5 + exp(-sd / 85.0) * 0.34) * 0.6);
  float cover;
  if (sdR < 2.0) col = mix(railAt(p, sp, 0.0, vec2(0.0), cover), col, smoothstep(-0.6, 0.6, sdR));

  float sk = sdLens(p);
  if (sk < 2.0) {
    vec2 n = sdLensNormal(p);
    float depth = max(-sk, 0.0);
    float bevel = pow(1.0 - clamp(depth / 22.0, 0.0, 1.0), 2.4);
    vec2 rel = p - lensC();
    vec2 bend = -n * bevel * 24.0 - rel * 0.16; // a strong loupe: the word swells under it
    float frost = 0.05 + 0.7 * bevel;
    vec3 g = railAt(p + bend, sp + bend * uScale, frost, n * bevel * 3.0 + rel * 0.01, cover);
    float sq = max(stripD(p), 0.0);
    float scatter = exp(-sq / 24.0) * 0.8 + exp(-sq / 64.0) * 0.2;
    vec3 kc = glass(g, n, depth, bevel, p, lensC(), max(uHeadH, uTailH), cover, scatter, uLight);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }
  col = drawFilament(col, stripD(p), uLight, 1.0 + uKick * 0.5 + uLift * 0.1);
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  // the shelf miniature shows two tabs; the full control four
  const TABS = thumb ? TABS_ALL.slice(0, 2) : TABS_ALL;
  const RAIL = [(TABS.length - 1) * GAP / 2 + 68, 50];
  const slotX = i => (i - (TABS.length - 1) / 2) * GAP;
  const st = glassStage(root, { frag: FRAG, box: [RAIL[0] * 2 + 100, RAIL[1] * 2 + 100], thumb });
  const labels = TABS.map((t, i) => { const m = new PixelMatrix({ size: 3.2, swirl: 5, shyR: 15, shyF: 6 }); m.ox = slotX(i); return m; });
  const cols = TABS.map(t => hexRgb(t.color));
  let sel = 1, head = slotX(1), headV = 0, tail = slotX(1), tailV = 0, drag = null, press = 0, lastSlot = 1;
  const layout = () => labels.forEach((m, i) => m.set(textCells(TABS[i].label, i === sel ? 4.4 : 3.5), {}));
  labels.forEach((m, i) => m.set(textCells(TABS[i].label, i === sel ? 4.4 : 3.5), { instant: true }));

  const jelly = new Spring(340, 9);   // + = wider & flatter
  let armed = false, lift = 0, prevHead = head;
  const orbit = new Orbit(sel / (TABS.length - 1));
  const choose = i => {
    i = clamp(i, 0, TABS.length - 1);
    const old = sel;
    if (i === sel) return;
    sel = i; layout(); armed = true; jelly.kick(-1.5); // it gathers itself before leaping
    st.sfx.ping(i > old); navigator.vibrate?.(8); st.pulse(0.7);
  };
  const local = d => d[0] - st.cx;
  const overRail = ([x, y]) => Math.abs(x - st.cx) < RAIL[0] && Math.abs(y - st.cy) < RAIL[1];
  st.bindPointer({
    down: (p, e, d) => {
      if (!overRail(d)) return;
      st.sfx._ensure();
      const lx = local(d);
      if (Math.abs(lx - (head + tail) / 2) < LENS[0]) drag = { off: head - lx, moved: 0, x0: lx };
      else choose(Math.round(lx / GAP + (TABS.length - 1) / 2));
    },
    move: (p, e, d) => {
      st.canvas.style.cursor = drag ? 'grabbing' : overRail(d) ? 'pointer' : 'default';
      if (!drag) return;
      const lx = local(d);
      drag.moved = Math.max(drag.moved, Math.abs(lx - drag.x0));
      const lo = slotX(0), hi = slotX(TABS.length - 1);
      let x = lx + drag.off;
      if (x < lo) x = lo - (lo - x) * 0.25; else if (x > hi) x = hi + (x - hi) * 0.25; // rubber band
      head = x;
    },
    up: (p, e, d) => {
      if (!drag) return;
      if (drag.moved < 4) { const lx = local(d); choose(Math.round(lx / GAP + (TABS.length - 1) / 2)); }
      else choose(Math.round((head + headV * 0.12) / GAP + (TABS.length - 1) / 2));
      drag = null; armed = true;
    },
  });
  const onKey = e => {
    if (e.key === 'ArrowRight') choose(sel + 1);
    if (e.key === 'ArrowLeft') choose(sel - 1);
  };
  if (!thumb) window.addEventListener('keydown', onKey);

  let demoT = 0, demoDir = 1;
  st.run((dt, t) => {
    if (demo && (demoT += dt) > 1.15) { // autopilot: the drop hops between the middle tabs
      demoT = 0;
      const lo = TABS.length > 2 ? 1 : 0, hi = TABS.length > 2 ? 2 : 1;
      if (sel + demoDir > hi || sel + demoDir < lo) demoDir = -demoDir;
      choose(sel + demoDir);
    }
    const target = slotX(sel);
    if (!drag) {
      const k = 300, c = 2 * Math.sqrt(k) * 0.5;
      headV += (-k * (head - target) - c * headV) * dt; head += headV * dt;
    } else headV = headV * 0.5 + ((head - (st.prevHead ?? head)) / dt) * 0.5;
    st.prevHead = head;
    { const k = drag ? 170 : 150, c = 2 * Math.sqrt(k) * 0.8; tailV += (-k * (tail - head) - c * tailV) * dt; tail += tailV * dt; }
    press += ((drag ? 1 : 0) - press) * Math.min(1, dt * 12);
    lift += ((st.ptrOn > 0.5 && !drag ? 1 : 0) - lift) * Math.min(1, dt * 8);
    // arrival: the drop lands on its slot, splats wide and wobbles back, throwing a little light
    if (armed && !drag && (prevHead - target) * (head - target) <= 0 && prevHead !== head) {
      armed = false;
      const s = Math.min(1, Math.abs(headV) / 1600);
      jelly.kick(3 + 9 * s);
      if (s > 0.15) {
        st.burst(head - LENS[0] * 0.6, LENS[1] + 6, Math.round(3 + 7 * s), 0.4 + 0.6 * s, Math.PI * 0.75, 0.5);
        st.burst(head + LENS[0] * 0.6, LENS[1] + 6, Math.round(3 + 7 * s), 0.4 + 0.6 * s, Math.PI * 0.25, 0.5);
      }
      if (s > 0.5) st.shock(head, 0);
      st.glint(); st.pulse(1);
      st.sfx.land(0.2 + 0.4 * s);
      navigator.vibrate?.(8);
    }
    prevHead = head;
    const jx = jelly.step(dt) * 0.03;

    // crossing a slot while dragging: a soft detent tick
    const slotNow = clamp(Math.round(head / GAP + (TABS.length - 1) / 2), 0, TABS.length - 1);
    if (slotNow !== lastSlot) { if (drag) st.sfx.tick(0.3 + slotNow * 0.15, 0.5); lastSlot = slotNow; }

    // volume-preserving stretch: the farther apart, the thinner each body
    const sep = Math.abs(head - tail);
    const thin = 1 - Math.min(0.32, sep / 260);
    const grow = 1 + lift * 0.025;
    const hh = [LENS[0] * (1 - press * 0.04) * (1 + jx) * grow, LENS[1] * thin * (1 - press * 0.05) * (1 - jx * 1.4) * grow];
    const th = [LENS[0] * 0.8 * (1 + jx), LENS[1] * thin * 0.85 * (1 - jx * 1.4)];
    const neck = LENS[1] * Math.max(0.16, 0.62 - sep / 300);

    // colour follows the lens position
    const u = clamp((head + tail) / 2 / GAP + (TABS.length - 1) / 2, 0, TABS.length - 1);
    const i0 = Math.floor(u), i1 = Math.min(TABS.length - 1, i0 + 1);
    st.light = mix3(cols[i0], cols[i1], u - i0);

    const lensV = headV * 0.5 + tailV * 0.5;
    labels.forEach(m => m.step(dt, { ptr: st.local(m), shy: st.ptrOn * (drag ? 0 : 1), vel: Math.abs(m.ox - (head + tail) / 2) < GAP * 0.6 ? lensV : 0 }));
    st.sfx.air(Math.abs(headV) / 260);
    const theta = orbit.step(dt, ((head + tail) / 2 / GAP + (TABS.length - 1) / 2) / (TABS.length - 1));
    const lensX = (head + tail) / 2;
    st.drawPixels(ctx => labels.forEach((m, i) => {
      const near = clamp(1 - Math.abs(slotX(i) - lensX) / (GAP * 0.8), 0, 1);
      m.draw(ctx, 0.38 + 0.62 * near);
    }));
    st.render(t, U => {
      const gl = st.gl;
      gl.uniform2f(U.uRail, RAIL[0], RAIL[1]);
      gl.uniform2f(U.uHead, st.cx + head, st.cy);
      gl.uniform2f(U.uTail, st.cx + tail, st.cy);
      gl.uniform2f(U.uHeadH, ...hh);
      gl.uniform2f(U.uTailH, ...th);
      gl.uniform1f(U.uPress, press);
      gl.uniform1f(U.uLift, lift);
      gl.uniform1f(U.uTheta, theta);
      gl.uniform1f(U.uNeck, neck);
    });
  });

  return { dispose() { window.removeEventListener('keydown', onKey); st.dispose(); } };
}
