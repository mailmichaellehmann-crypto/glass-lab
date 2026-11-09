// HOLD — a hold-to-confirm button you have to mean.
// A floating glass pill. Press and hold: a light strip travels clockwise around its rim (exact
// arc-length parameterisation of the stadium), a heartbeat squeezes the glass faster and faster,
// the pixel label fills from the left. Close the loop and it confirms: flash, shockwave, sparks,
// HOLD becomes a check. Let go early and the light drains back while the glass shakes its head.

import { glassStage, PixelMatrix, Spring, textCells, bitmapCells, hexRgb, mix3 } from '../glass/engine.js';
import { clamp } from '../kit.js';

const HALF = [176, 58];

const FRAG = /* glsl */ `
uniform vec2  uHalf;     // pill half size (with squash)
uniform vec2  uK;        // pill centre
uniform float uProg;     // 0..1 of the loop
uniform float uPress;
uniform float uFlash;
uniform float uLift;

float sdPill(vec2 p) { return sdRoundBox(p - uK, uHalf, uHalf.y); }

// arc length along the stadium outline, clockwise from top-centre
float perim() { float a = uHalf.x - uHalf.y; return 4.0 * a + 6.2831853 * uHalf.y; }
float arcU(vec2 p) {
  vec2 q = p - uK; float r = uHalf.y, a = uHalf.x - r;
  if (abs(q.x) <= a) return q.y < 0.0 ? (q.x >= 0.0 ? q.x : 3.0 * a + 6.2831853 * r + q.x + a) : a + 3.14159265 * r + (a - q.x);
  if (q.x > a) return a + r * (atan(q.y, q.x - a) + 1.5707963);
  float ang = atan(q.y, q.x + a); if (ang < 0.0) ang += 6.2831853;
  return 3.0 * a + 3.14159265 * r + r * (ang - 1.5707963);
}
// the strip: a ring 7px outside the glass, from u = 0 to u = prog·P, with a round start cap
// soft > 0: far from the rim the end caps spread out as a cone, so glow falls off radially
float stripDS(vec2 p, float soft) {
  float P = perim(), L = uProg * P, u = arcU(p);
  float rad = sdPill(p) - 7.0;
  float tang = u <= L ? 0.0 : min(u - L, P - u);
  tang = max(tang - max(rad, 0.0) * soft, 0.0);
  float w = 1.5 + 0.9 * exp(-max(L - u, 0.0) / 30.0); // the head is thicker
  return length(vec2(rad, tang)) - w;
}
float stripD(vec2 p) { return stripDS(p, 0.0); }
float headGlow(vec2 p) {
  float P = perim(), L = uProg * P, u = arcU(p);
  float d = abs(u - L); d = min(d, P - d);
  return exp(-d / 40.0) * exp(-abs(sdPill(p) - 7.0) / 14.0);
}
vec2 pillNormal(vec2 p) {
  vec2 e = vec2(0.5, 0.0);
  vec2 n = vec2(sdPill(p + e.xy) - sdPill(p - e.xy), sdPill(p + e.yx) - sdPill(p - e.yx));
  return n / max(length(n), 1e-4);
}

// what lies behind the slab at q: the page, washed by the strip, then the pixel label
vec3 behind(vec2 q, vec2 sq2, float frost, float energy, out float cover) {
  vec3 under = pageBg(sq2);
  float sq = max(stripDS(q, 1.1), 0.0);
  float wash = (exp(-sq / 14.0) * 0.85 + exp(-sq / 55.0) * 0.32) * energy;
  under = emit(under, wash * 0.5);
  return ink(under, q, frost, vec2(0.0), wash, uLight, cover);
}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = pageBg(sp);
  float on = step(0.002, uProg);
  float sd = max(stripDS(p, 1.1), 0.0);
  float energy = on * (0.55 + 0.6 * uProg) * (1.0 + uKick * 0.35) + uFlash * 1.5;
  // the floating pill casts a soft shadow that tightens as it is pressed down
  col = shadowed(col, sdRoundBox(p - uK - vec2(0.0, 16.0 + uLift * 8.0 - uPress * 9.0), uHalf, uHalf.y) - 4.0 + uPress * 6.0,
                 sdRoundBox(p - uK - vec2(0.0, 3.0), uHalf, uHalf.y) + 3.0 - uPress * 3.0, uLift - uPress);
  col = emit(col, (exp(-sd / 18.0) * 0.5 + exp(-sd / 85.0) * 0.34) * energy * 0.6);
  col = emit(col, uFlash * exp(-max(sdPill(p), 0.0) / 60.0) * 0.8);

  float sk = sdPill(p);
  if (sk < 2.0) {
    // ---- a thick slab of glass with fully rounded edges (a capsule cross-section of radius R)
    vec2 n = pillNormal(p);
    float depth = max(-sk, 0.0);
    float R = uHalf.y;
    float u = clamp(depth / R, 0.0, 1.0); // a full semicircular cross-section: rounded all the way over
    float hgt = sqrt(max(1.0 - (1.0 - u) * (1.0 - u), 0.0));       // 0 at the edge … 1 on the flat top
    vec3 n3 = normalize(vec3(n.x * (1.0 - u), -n.y * (1.0 - u), hgt + 0.02));
    vec3 V = vec3(0.0, 0.0, -1.0);
    float thick = hgt * R * 0.42 + 8.0; // gentle enough that the label bends but stays legible
    // refraction per channel: gentle dispersion, visible as fine colour fringes on edges
    vec3 tR = refract(V, n3, 1.0 / 1.45);
    vec3 tG = refract(V, n3, 1.0 / 1.50);
    vec3 tB = refract(V, n3, 1.0 / 1.555);
    vec2 rel = p - uK;
    // the flat top magnifies slightly, a little differently per channel (lateral colour, like a lens)
    vec2 oR = vec2(tR.x, -tR.y) / max(-tR.z, 0.3) * thick - rel * 0.037;
    vec2 oG = vec2(tG.x, -tG.y) / max(-tG.z, 0.3) * thick - rel * 0.045;
    vec2 oB = vec2(tB.x, -tB.y) / max(-tB.z, 0.3) * thick - rel * 0.054;
    float frost = 0.06 + 0.45 * pow(1.0 - u, 3.0);
    float cR, cG, cB;
    vec3 gR = behind(p + oR, sp + oR * uScale, frost, energy, cR);
    vec3 gG = behind(p + oG, sp + oG * uScale, frost, energy, cG);
    vec3 gB = behind(p + oB, sp + oB * uScale, frost, energy, cB);
    vec3 g = vec3(gR.r, gG.g, gB.b);
    float scatter = (exp(-max(stripDS(p, 1.1), 0.0) / 24.0) * 0.8 + exp(-max(stripDS(p, 1.1), 0.0) / 64.0) * 0.2) * energy;
    float bevel = 1.0 - u;
    // clear glass: what is behind shows through almost untouched, no grey body
    vec3 kc = g * mix(0.97, 1.0, uTheme);
    kc = emit(kc, scatter * 0.45 + exp(-depth / 2.2) * scatter * 0.8);
    // Fresnel: the rounded flanks mirror a bright room and the strip's light
    vec3 Rr = reflect(V, n3);
    float fres = 0.03 + 0.97 * pow(1.0 - n3.z, 5.0);
    vec3 env = mix(vec3(0.08), vec3(0.55), smoothstep(-0.7, 0.9, Rr.y));
    env = mix(env, vec3(0.97), uTheme * 0.5);
    env = emit(env, (headGlow(p) * 1.4 + scatter * 0.6) * on);
    kc = mix(kc, env, clamp(fres, 0.0, 0.7));
    // the edge where the glass turns away: a thin dark line, then a bright rim
    kc *= 1.0 - smoothstep(0.18, 0.05, u) * smoothstep(0.0, 0.03, u) * mix(0.28, 0.12, uTheme);
    kc += smoothstep(0.035, 0.0, u) * mix(0.35, 0.4, uTheme);
    // key light (follows the pointer): a sharp glint on the rounded rim and a soft sheen
    vec2 toPtr = (uPtr - uK) / max(uHalf.x, 1.0);
    vec3 L = normalize(mix(vec3(-0.3, 0.75, 0.6), vec3(toPtr.x, -toPtr.y * 2.0, 0.7), uPtrOn * 0.8));
    float spk = max(dot(Rr, L), 0.0);
    kc += pow(spk, 220.0) * 1.6 + pow(spk, 20.0) * mix(0.06, 0.1, uTheme);
    // a long soft window reflection along the top of the slab
    float win = exp(-pow((rel.y + R * 0.52) / 6.0, 2.0)) * smoothstep(uHalf.x, uHalf.x - 50.0, abs(rel.x)) * hgt;
    kc += win * mix(0.22, 0.3, uTheme);
    kc = emit(kc, headGlow(p) * on * 0.6);
    kc = emit(kc, uFlash * 0.9);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }

  // the strip itself
  if (on > 0.0) {
    float ld = stripD(p);
    float body = 1.0 - smoothstep(-0.6, 0.6, ld);
    vec3 lc = mix(uLight * 1.05, mix(uLight, vec3(1.0), 0.65), smoothstep(-0.2, -1.4, ld));
    col = mix(col, lc * (0.85 + 0.35 * energy), body);
    col = emit(col, exp(-max(ld, 0.0) / 4.5) * 0.55 * energy * (1.0 - body));
    col = emit(col, headGlow(p) * 0.9 * energy);
  }
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

const CHECK = ['..........##', '.........##.', '........##..', '.##....##...', '..##..##....', '...####.....', '....##......'];
const IDLE = hexRgb('#cfd8ff'), GO = hexRgb('#3dffa8'), WARN = hexRgb('#ffb347');

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const st = glassStage(root, { frag: FRAG, box: [HALF[0] * 2 + 140, HALF[1] * 2 + 140], thumb });
  await st.ready; // the shader compiles off the main thread; show nothing half-made
  const label = new PixelMatrix({ size: 5.0, swirl: 12, shyR: 22, shyF: 9 });
  const PITCH = 6.2;
  label.set(textCells('HOLD', PITCH), { instant: true });

  let holding = false, prog = 0, progV = 0, press = 0, beatT = 0, pulse = 0;
  let state = 'idle', doneT = 0, flash = 0, shake = 0, lift = 0;
  let light = [...IDLE];
  // jelly: sx widens/flattens the pill, sy is the vertical bounce
  const jelly = new Spring(360, 10), bounce = new Spring(300, 12);

  const over = ([x, y]) => Math.abs(x - st.cx) < HALF[0] + 6 && Math.abs(y - st.cy) < HALF[1] + 6;
  const begin = () => { if (state !== 'idle') return; holding = true; beatT = 0.6; /* first beat comes quickly */ st.sfx._ensure(); st.sfx.tick(0.1, 0.6); jelly.kick(2.2); bounce.kick(60); };
  const end = () => {
    if (!holding) return;
    holding = false;
    jelly.kick(-2.6); bounce.kick(-90); // springs back up like jelly
    if (state === 'idle' && prog > 0.04) { shake = 1; st.sfx.tick(0.05, 0.8); navigator.vibrate?.([12, 40, 12]); }
  };
  st.bindPointer({
    down: (p, e, d) => { if (over(d)) begin(); },
    up: () => end(),
    move: (p, e, d) => { st.canvas.style.cursor = over(d) ? 'pointer' : 'default'; if (holding && !over(d)) end(); },
  });
  const onKey = e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault(); // never let the focused back button take the key
    if (!e.repeat) begin();
  };
  const onKeyUp = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); end(); } };
  if (!thumb) window.addEventListener('keydown', onKey);
  if (!thumb) window.addEventListener('keyup', onKeyUp);

  function confirm() {
    state = 'done'; doneT = 0; holding = false; flash = 1;
    st.light = [...GO];
    st.shock(0, 0); st.glint(); st.pulse(1);
    for (const side of [-1, 1]) st.burst(side * (HALF[0] - 20), 0, 12, 1.1, side > 0 ? 0 : Math.PI, 1.3);
    st.burst(0, -HALF[1], 6, 0.9, -Math.PI / 2, 0.8);
    jelly.kick(-6); bounce.kick(-160); // it pops up and wobbles
    label.set(bitmapCells(CHECK, PITCH * 0.9));
    st.sfx.ping(true); st.sfx.land(0.7);
    navigator.vibrate?.([20, 30, 60]);
  }

  let demoT = 0;
  st.run((dt, t) => {
    if (demo) { // autopilot: press, hold through the heartbeat, confirm, rest, repeat
      demoT += dt;
      if (state === 'idle' && !holding && prog < 0.02 && demoT > 0.6) { begin(); demoT = 0; }
      if (state === 'done') demoT = 0;
    }
    // progress: accelerating while held, springy drain when released
    if (state === 'idle') {
      if (holding) { progV = Math.min(progV + dt * 1.1, 0.95); prog += progV * dt; }
      else { progV += (-60 * prog - 12 * progV) * dt; prog += progV * dt; if (prog < 0) { prog = 0; progV = 0; } }
      if (prog >= 1) { prog = 1; confirm(); }
    } else {
      doneT += dt;
      if (doneT > 2.4) { state = 'idle'; prog = 0; progV = 0; label.set(textCells('HOLD', PITCH)); }
    }
    // heartbeat: faster as the loop closes
    if (holding) {
      beatT += dt * (1.6 + prog * 5);
      if (beatT >= 1) { beatT -= 1; pulse = 1; st.pulse(0.3 + prog * 0.4); jelly.kick(1.2 + prog * 1.6); st.sfx.tick(0.2 + prog * 0.8, 0.5 + prog * 0.6); navigator.vibrate?.(6); }
    }
    pulse *= Math.exp(-dt * 9);
    press += ((holding ? 1 : 0) - press) * Math.min(1, dt * 14);
    lift += ((st.ptrOn > 0.5 && !holding ? 1 : 0) - lift) * Math.min(1, dt * 8);
    flash *= Math.exp(-dt * 3.2);
    shake *= Math.exp(-dt * 4);

    const target = state === 'done' ? GO : holding || prog > 0.02 ? mix3(IDLE, GO, Math.min(1, prog * 1.2)) : IDLE;
    const tgt = shake > 0.3 ? WARN : target;
    light = mix3(light, tgt, Math.min(1, dt * 6));
    st.light = light;

    // jelly squash: pressed it sinks and flattens, each heartbeat bulges it, release rebounds
    const jx = jelly.step(dt) * 0.035 * (reducedMotion ? 0.3 : 1);
    const by = bounce.step(dt) * 0.04 * (reducedMotion ? 0.3 : 1);
    const squeeze = 1 - press * 0.035;
    const hx = HALF[0] * squeeze * (1 + jx), hy = HALF[1] * squeeze * (1 - jx * 1.6);
    const kx = st.cx + Math.sin(t * 40) * shake * 9 * (reducedMotion ? 0 : 1);
    const ky = st.cy + press * 3 + by;

    // label: pixels left of the sweep are lit
    const sweepX = -HALF[0] * 0.5 + prog * HALF[0];
    label.ox = kx - st.cx;
    label.step(dt, { ptr: st.local(label), shy: holding ? 0 : st.ptrOn });

    st.drawPixels(ctx => {
      for (const p of label.px) {
        const b = p.b * (state === 'done' ? 1 : p.x < sweepX ? 1 : 0.42); if (b < 0.004) continue;
        ctx.globalAlpha = b;
        const travel = Math.min(1, Math.hypot(p.tx - p.x, p.ty - p.y) / 25), sz = label.size * (1 - 0.4 * travel);
        const jit = holding ? (Math.sin(p.k + t * 30) * 0.4 * prog) : 0;
        ctx.fillRect(label.ox + (p.x + p.sx) * (1 + jx) - sz / 2 + jit, (ky - st.cy) + (p.y + p.sy) * (1 - jx * 1.6) - sz / 2, sz, sz);
      }
      ctx.globalAlpha = 1;
    });
    st.render(t, U => {
      const gl = st.gl;
      gl.uniform2f(U.uHalf, hx, hy);
      gl.uniform2f(U.uK, kx, ky);
      gl.uniform1f(U.uProg, state === 'done' ? 1 : clamp(prog, 0, 1));
      gl.uniform1f(U.uPress, press);
      gl.uniform1f(U.uFlash, flash);
      gl.uniform1f(U.uLift, lift);
    });
  });

  return {
    dispose() {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      st.dispose();
    },
  };
}
