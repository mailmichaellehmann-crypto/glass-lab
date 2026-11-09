// PRISM — a colour picker made of light.
// A slit lamp throws white light into a glass prism. The light is ray-traced for real (Snell's law
// at both faces, total internal reflection, Cauchy dispersion over 20 wavelengths) and opens into a
// wide, continuous sheet of spectrum that lands on a frosted arc. Pick a colour the obvious way:
// drag the glass bead along the rainbow on the arc; it reads the light that falls on it. Let go and
// a drop of that colour condenses under the bead and is tossed into a glass sphere, which fills and
// swirls to the new colour; its hex code settles in pixels. Turn the prism to sweep the rainbow.

import { glassStage, PixelMatrix, Spring, textCells, mix3 } from '../glass/engine.js';
import { domeLens } from '../glass/lib.glsl.js';
import { clamp } from '../kit.js';

// ---------------------------------------------------------------- optics (design px, y down)
const WAVES = 20, MAXSEG = 48;
const LAMBDA = Array.from({ length: WAVES }, (_, i) => 0.405 + (0.695 - 0.405) * i / (WAVES - 1));
const IOR = l => 1.44 + 0.046 / (l * l);
const PC = [-110, -50], PR = 96, ARC_R = 330;
const BEAM_A = -35 * Math.PI / 180, BEAM = [Math.cos(BEAM_A), Math.sin(BEAM_A)];
const LAMP = [PC[0] - 300 * BEAM[0], PC[1] - 300 * BEAM[1]];
const ARC_A0 = -3 * Math.PI / 180, ARC_A1 = 31 * Math.PI / 180;
const ROT_LO = -0.3, ROT_HI = -0.1; // measured: the whole fan reaches the arc in this range
const SWATCH = [300, 172], SW_R = 44;
const BEAD_R = 17;

function spectrumRGB(l) {
  const nm = l * 1000;
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = -(nm - 440) / 60 * 0.7; b = 1; }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
  else r = 1;
  return [r, g, b].map(v => Math.pow(Math.max(0, v), 0.8));
}
const RGB = LAMBDA.map(spectrumRGB);

function refract(dx, dy, nx, ny, eta) {
  const cosi = -(nx * dx + ny * dy), k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;
  const ct = Math.sqrt(k);
  return [eta * dx + (eta * cosi - ct) * nx, eta * dy + (eta * cosi - ct) * ny];
}
function trace(a) {
  const v = [0, 1, 2].map(i => [PC[0] + PR * Math.cos(a - Math.PI / 2 + i * 2 * Math.PI / 3), PC[1] + PR * Math.sin(a - Math.PI / 2 + i * 2 * Math.PI / 3)]);
  const hit = (o, d, skip) => {
    let best = Infinity, out = null;
    for (let i = 0; i < 3; i++) {
      if (i === skip) continue;
      const [ax, ay] = v[i], [bx, by] = v[(i + 1) % 3];
      const ex = bx - ax, ey = by - ay, den = d[0] * ey - d[1] * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - o[0]) * ey - (ay - o[1]) * ex) / den, s = ((ax - o[0]) * d[1] - (ay - o[1]) * d[0]) / den;
      if (t > 1e-4 && s >= 0 && s <= 1 && t < best) { const l = Math.hypot(ex, ey); best = t; out = { i, nx: ey / l, ny: -ex / l, p: [o[0] + d[0] * t, o[1] + d[1] * t] }; }
    }
    return out;
  };
  const toArc = (p, d) => {
    const ox = p[0] - PC[0], oy = p[1] - PC[1], B = ox * d[0] + oy * d[1], C = ox * ox + oy * oy - ARC_R * ARC_R;
    const t = -B + Math.sqrt(Math.max(0, B * B - C));
    return [p[0] + d[0] * t, p[1] + d[1] * t];
  };
  const entry = hit(LAMP, BEAM, -1);
  const segs = [], fan = [];
  if (!entry) { segs.push([LAMP, toArc(LAMP, BEAM), [1, 1, 1], 0]); return { v, segs, fan }; }
  segs.push([LAMP, entry.p, [1, 1, 1], 0]);
  LAMBDA.forEach((l, k) => {
    const n = IOR(l);
    let nx = entry.nx, ny = entry.ny;
    if (nx * BEAM[0] + ny * BEAM[1] > 0) { nx = -nx; ny = -ny; }
    let d = refract(BEAM[0], BEAM[1], nx, ny, 1 / n);
    if (!d) return;
    let o = entry.p, skip = entry.i;
    for (let b = 0; b < 3; b++) {
      const h = hit(o, d, skip); if (!h) return;
      segs.push([o, h.p, RGB[k], 1]);
      let mx = h.nx, my = h.ny;
      if (mx * d[0] + my * d[1] > 0) { mx = -mx; my = -my; }
      const out = refract(d[0], d[1], mx, my, n);
      if (out) {
        const end = toArc(h.p, out);
        fan.push({ k, start: h.p, end, ang: Math.atan2(end[1] - PC[1], end[0] - PC[0]) });
        return;
      }
      const cosi = -(mx * d[0] + my * d[1]);
      d = [d[0] + 2 * cosi * mx, d[1] + 2 * cosi * my]; o = h.p; skip = h.i;
    }
  });
  return { v, segs, fan };
}

// ---------------------------------------------------------------- shader
const FRAG = /* glsl */ `
uniform vec4  uSeg[${MAXSEG}];
uniform vec4  uSegC[${MAXSEG}];    // rgb, kind (0 white beam, 1 inside the glass)
uniform int   uSegN;
uniform vec4  uFan[${WAVES}];      // exit ray per wavelength: start xy, end xy (on the arc)
uniform vec4  uFanC[${WAVES}];     // rgb
uniform int   uFanN;
uniform vec2  uPV[3];
uniform vec2  uPC;
uniform vec2  uArcA;
uniform vec2  uLamp, uBeamDir;
uniform vec3  uBead;               // x, y, radius
uniform vec4  uRead;               // colour, strength
uniform float uBeadHover, uPrismHover, uCue;
uniform vec2  uSwatch;
uniform vec4  uLiquid;
uniform vec3  uWobble;
uniform vec4  uDrop;
uniform vec3  uDropC;
uniform float uSpin, uPress;

const float ARC_R = ${ARC_R}.0;

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * h);
}
float cross2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
float sdTri(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
float sdPrism(vec2 p) { return sdTri(p, mix(uPV[0], uPC, 0.1), mix(uPV[1], uPC, 0.1), mix(uPV[2], uPC, 0.1)) - 8.0; }
float sdArcBand(vec2 p) {
  vec2 q = p - uPC;
  float a = atan(q.y, q.x), ac = clamp(a, uArcA.x, uArcA.y);
  return (a >= uArcA.x && a <= uArcA.y ? abs(length(q) - ARC_R) : length(q - ARC_R * vec2(cos(ac), sin(ac)))) - 8.0;
}
float sdLamp(vec2 p) {
  vec2 q = p - uLamp;
  vec2 d = vec2(dot(q, uBeamDir), dot(q, vec2(-uBeamDir.y, uBeamDir.x)));
  return sdRoundBox(d + vec2(28.0, 0.0), vec2(36.0, 16.0), 8.0);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}

// the continuous light sheet between neighbouring wavelengths: colour + brightness at p
vec4 fanAt(vec2 p) {
  if (length(p - uPC) > ARC_R + 1.0) return vec4(0.0);
  for (int k = 0; k < ${WAVES - 1}; k++) {
    if (k + 1 >= uFanN) break;
    vec4 A = uFan[k], B = uFan[k + 1];
    vec2 dA = normalize(A.zw - A.xy), dB = normalize(B.zw - B.xy);
    float sA = cross2(dA, p - A.xy), sB = cross2(dB, p - B.xy);
    if (sA * sB > 0.0) continue;
    if (dot(p - A.xy, dA) < 0.0 && dot(p - B.xy, dB) < 0.0) continue;
    float w = sA / (sA - sB + 1e-5);
    vec3 c = mix(uFanC[k].rgb, uFanC[k + 1].rgb, w);
    float spread = abs(sA - sB);
    float I = clamp(9.0 / (spread + 3.0), 0.0, 1.0) * 0.55 + 0.12;
    return vec4(c, I);
  }
  return vec4(0.0);
}

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  // frosted arc: the rainbow is projected onto it and glows through
  float sa = sdArcBand(q);
  col *= 1.0 - (1.0 - smoothstep(-4.0, 20.0, sdArcBand(q - vec2(0.0, 8.0)))) * mix(0.45, 0.14, uTheme);
  vec4 onArc = fanAt(uPC + normalize(q - uPC) * (ARC_R - 0.5));
  float arcGlow = exp(-max(sa, 0.0) / 26.0);
  col = emitC(col, onArc.rgb, onArc.a * arcGlow * 0.55);
  if (sa < 2.0) {
    vec3 sc = mix(vec3(0.05, 0.05, 0.06), vec3(0.86), uTheme);
    sc = emitC(sc, onArc.rgb, onArc.a * 2.4);
    sc += (1.0 - smoothstep(0.0, 1.4, abs(sa + 1.0))) * mix(0.09, 0.1, uTheme);
    col = mix(sc, col, smoothstep(-0.6, 0.6, sa));
  }
  // the slit lamp
  float sl = sdLamp(q);
  col *= 1.0 - (1.0 - smoothstep(-4.0, 16.0, sdLamp(q - vec2(0.0, 8.0)))) * mix(0.5, 0.15, uTheme);
  if (sl < 2.0) {
    vec2 d = q - uLamp;
    float along = dot(d, uBeamDir), across = dot(d, vec2(-uBeamDir.y, uBeamDir.x));
    vec3 lc = mix(vec3(0.17, 0.17, 0.19), vec3(0.06, 0.06, 0.07), smoothstep(-16.0, 16.0, across));
    lc += exp(-abs(sl + 1.0) / 0.8) * 0.2;
    float slit = smoothstep(2.8, 0.0, abs(across)) * smoothstep(-6.0, 0.0, along) * smoothstep(9.0, 4.0, along);
    lc = mix(lc, vec3(1.0, 0.98, 0.94), slit);
    col = mix(lc, col, smoothstep(-0.6, 0.6, sl));
  }
  // swatch: shadow and the liquid inside
  vec2 sq = q - uSwatch;
  col *= 1.0 - (1.0 - smoothstep(-6.0, 22.0, length(sq - vec2(0.0, 14.0)) - ${SW_R}.0)) * mix(0.5, 0.18, uTheme);
  col = emitC(col, uLiquid.rgb, exp(-max(length(sq) - ${SW_R}.0, 0.0) / 34.0) * 0.3);
  float inS = length(sq) - (${SW_R}.0 - 3.0);
  if (inS < 1.0) {
    float lvl = uSwatch.y + ${SW_R}.0 - uLiquid.a * ${SW_R * 2}.0;
    float sy = lvl + uWobble.x * sq.x / ${SW_R}.0 + uWobble.y * sin((q.x - uWobble.z) * 0.2 - uTime * 14.0) * exp(-abs(q.x - uWobble.z) / 30.0);
    float below = q.y - sy;
    vec3 lq = uLiquid.rgb;
    float deep = clamp(below / (${SW_R * 2}.0 * max(uLiquid.a, 0.2)), 0.0, 1.0);
    vec3 lcol = mix(mix(lq, vec3(1.0), 0.22), lq * 0.5, deep);
    lcol += mix(lq, vec3(1.0), 0.6) * exp(-abs(below) / 1.6) * 0.8;
    lcol *= 0.9 + 0.1 * sin(q.x * 0.08 + uTime * 1.5 + q.y * 0.05);
    col = mix(col, lcol, smoothstep(-1.0, 1.0, below) * (1.0 - smoothstep(-1.0, 1.0, inS)));
  }
  // bead shadow on the arc
  col *= 1.0 - (1.0 - smoothstep(-3.0, 12.0, length(q - uBead.xy - vec2(2.0, 7.0)) - uBead.z)) * mix(0.4, 0.15, uTheme);
  float cover;
  return ink(col, q, frost, vec2(0.0), 0.2, uLight, cover);
}
${domeLens('lens', 'scene')}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);

  // ---- the light sheet: a continuous fan, misted by slowly drifting haze and dust
  vec4 fan = fanAt(p);
  if (fan.a > 0.0) {
    float haze = 0.75 + 0.35 * noise(p * 0.02 + vec2(uTime * 0.05, 0.0)) + 0.15 * noise(p * 0.07 - uTime * 0.1);
    col = emitC(col, fan.rgb, fan.a * haze * 0.55 * (1.0 + uSpin * 0.25));
    vec2 g = p / 6.0; vec2 id = floor(g); float h = hash12(id + 3.0);
    col += fan.rgb * smoothstep(0.13, 0.0, length(fract(g) - 0.5 - (hash22(id) - 0.5) * 0.6)) * step(0.88, h) * (0.5 + 0.5 * sin(uTime * (1.0 + h * 3.0) + h * 30.0)) * 0.6;
  }

  // ---- the prism
  float ph = 1.0 - smoothstep(-8.0, 26.0, sdPrism(p - vec2(0.0, 12.0 - uPress * 4.0)));
  col *= 1.0 - ph * mix(0.45, 0.16, uTheme);
  // rotation guide: a faint dashed ring appears when you hover or turn the prism
  float ringR = ${PR}.0 + 34.0;
  float rd = abs(length(p - uPC) - ringR);
  float ang = atan(p.y - uPC.y, p.x - uPC.x);
  float dash = step(0.5, fract(ang * 18.0 / 6.2831853 + uTime * 0.15));
  col = emit(col, smoothstep(1.2, 0.2, rd) * uPrismHover * 0.35 * mix(0.35, 1.0, dash));
  float sk = sdPrism(p);
  if (sk < 2.0) {
    vec2 e = vec2(0.5, 0.0);
    vec2 n = normalize(vec2(sdPrism(p + e.xy) - sdPrism(p - e.xy), sdPrism(p + e.yx) - sdPrism(p - e.yx)) + 1e-5);
    float depth = max(-sk, 0.0);
    float bevel = pow(1.0 - clamp(depth / 15.0, 0.0, 1.0), 2.0);
    vec2 rel = p - uPC;
    vec2 base = -n * bevel * 26.0 - rel * 0.035;
    vec2 oR = base * 0.9, oG = base, oB = base * 1.12;
    float fr = 0.1 + bevel * 0.3;
    vec3 g = vec3(scene(p + oR, sp + oR * uScale, fr).r, scene(p + oG, sp + oG * uScale, fr).g, scene(p + oB, sp + oB * uScale, fr).b);
    vec3 kc = g * 0.95 + mix(vec3(0.04, 0.045, 0.06), vec3(0.03), uTheme);
    float inner = 0.0; vec3 innerC = vec3(0.0);
    for (int i = 0; i < ${MAXSEG}; i++) {
      if (i >= uSegN) break;
      if (uSegC[i].w < 0.5) continue;
      float w = exp(-sdSeg(p, uSeg[i].xy, uSeg[i].zw) / 22.0);
      inner += w; innerC += uSegC[i].rgb * w;
    }
    kc = emitC(kc, innerC / max(inner, 1e-3), inner * 0.018);
    vec2 toPtr = uPtr - uPC;
    vec2 Ld = normalize(mix(vec2(-0.35, -1.0), toPtr / max(length(toPtr), 1.0), uPtrOn * 0.85) + 1e-4);
    float ndl = dot(n, Ld);
    kc += pow(max(ndl, 0.0), 2.0) * exp(-depth / 1.2) * mix(0.55, 0.7, uTheme);
    kc += max(ndl, 0.0) * bevel * mix(0.1, 0.16, uTheme);
    kc *= 1.0 - max(-ndl, 0.0) * bevel * mix(0.25, 0.07, uTheme);
    kc += exp(-abs(depth - 5.0) / 1.4) * max(-ndl, 0.0) * 0.24;
    kc += exp(-abs(depth - 1.2) / 0.9) * 0.18;
    // rainbow glints in the cut edges, strongest where the light leaves
    vec4 rim = fanAt(p + n * 40.0);
    kc = emitC(kc, rim.rgb, exp(-depth / 3.0) * 0.5 * smoothstep(0.0, 0.3, rim.a));
    kc += exp(-depth / 0.7) * 0.08 + uPrismHover * exp(-depth / 2.0) * 0.08;
    if (uSweep < 1.2) {
      float s = dot(rel, normalize(vec2(1.0, -0.75)));
      kc += exp(-pow((s - mix(-150.0, 150.0, clamp(uSweep / 0.8, 0.0, 1.0))) / 10.0, 2.0)) * 0.28 * (1.0 - uSweep / 1.2);
    }
    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }

  // ---- the white beam (with dust) and the light inside the glass
  for (int i = 0; i < ${MAXSEG}; i++) {
    if (i >= uSegN) break;
    vec4 s = uSeg[i]; vec4 c = uSegC[i];
    float d = sdSeg(p, s.xy, s.zw);
    if (d > 60.0) continue;
    bool white = c.w < 0.5;
    float w = white ? 1.8 : 0.9;
    float k = white ? 1.0 : 0.13;
    col = emitC(col, c.rgb, (smoothstep(w + 0.8, w - 0.6, d) * 1.4 + exp(-d / 5.0) * 0.35 + exp(-d / 22.0) * 0.12) * k);
    if (white && d < 10.0) {
      vec2 g = p / 7.0; vec2 id = floor(g); float h = hash12(id);
      col += smoothstep(0.12, 0.0, length(fract(g) - 0.5 - (hash22(id) - 0.5) * 0.6)) * step(0.82, h) * (0.5 + 0.5 * sin(uTime * (1.0 + h * 3.0) + h * 30.0)) * 0.5 * (1.0 - d / 10.0);
    }
  }

  // ---- the reading bead on the arc, the drop in flight, the swatch sphere
  float bd = length(p - uBead.xy) - uBead.z;
  col = emitC(col, uRead.rgb, exp(-max(bd, 0.0) / 16.0) * (uRead.a * 0.8 + uCue * 0.4));
  col = emit(col, smoothstep(1.2, 0.2, abs(bd - 9.0)) * (uBeadHover * 0.5 + uCue * 0.35));
  if (bd < 2.0) {
    vec3 kc = lens(p, sp, uBead.xy, vec2(uBead.z), 0.07, 0.9, vec4(uRead.rgb, 0.3 * uRead.a), uRead.rgb, uRead.a * 0.9);
    col = mix(kc, col, smoothstep(-0.7, 0.7, bd));
  }
  if (uDrop.z > 0.5) {
    float dd = sdEllipse(p, uDrop.xy, uDrop.zw);
    col = emitC(col, uDropC, exp(-max(dd, 0.0) / 10.0) * 0.45);
    if (dd < 2.0) {
      vec3 kc = lens(p, sp, uDrop.xy, uDrop.zw, 0.06, 0.8, vec4(uDropC, 0.85), uDropC, 0.6);
      col = mix(kc, col, smoothstep(-0.7, 0.7, dd));
    }
  }
  float sw = length(p - uSwatch) - ${SW_R}.0;
  if (sw < 2.0) {
    vec3 kc = lens(p, sp, uSwatch, vec2(${SW_R}.0), 0.05, 0.75, vec4(0.0), uLiquid.rgb, 0.35);
    col = mix(kc, col, smoothstep(-0.7, 0.7, sw));
  }
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

const toHex = c => c.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const st = glassStage(root, { frag: FRAG, box: [800, 600], thumb });
  const S = st.sfx;
  const hex = new PixelMatrix({ size: 3.6, swirl: 10, shyR: 14, shyF: 5 });
  hex.ox = SWATCH[0]; hex.oy = SWATCH[1] + SW_R + 32;

  let a = -0.2, av = 0, turning = false, lastAng = 0, press = 0;
  let beadA = 14 * Math.PI / 180, beadDrag = false, beadHover = 0, prismHover = 0, cue = 1, touched = false;
  let liquid = [1, 0.42, 0.17], liquidTo = [...liquid], fill = 0.45;
  let read = [1, 1, 1], readA = 0, lastK = -1, shownHex = '', settle = 0, pending = false;
  let drop = null;
  const tilt = new Spring(140, 5), ripple = { a: 0, x: SWATCH[0] }, beadJ = new Spring(400, 12);
  const segBuf = new Float32Array(MAXSEG * 4), colBuf = new Float32Array(MAXSEG * 4);
  const fanBuf = new Float32Array(WAVES * 4), fanCBuf = new Float32Array(WAVES * 4);

  const beadPos = () => [PC[0] + ARC_R * Math.cos(beadA), PC[1] + ARC_R * Math.sin(beadA)];
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const overBead = d => { const [x, y] = local(d), b = beadPos(); return Math.hypot(x - b[0], y - b[1]) < BEAD_R + 14; };
  const overPrism = d => { const [x, y] = local(d); return Math.hypot(x - PC[0], y - PC[1]) < PR + 40; };
  const angOnArc = d => { const [x, y] = local(d); return Math.atan2(y - PC[1], x - PC[0]); };
  const nudge = () => { pending = true; settle = 0; };

  st.bindPointer({
    down: (p, e, d) => {
      S._ensure();
      if (overBead(d)) { beadDrag = true; touched = true; beadJ.kick(-30); return; }
      if (overPrism(d)) { turning = true; touched = true; lastAng = Math.atan2(local(d)[1] - PC[1], local(d)[0] - PC[0]); av = 0; press = 1; }
    },
    move: (p, e, d) => {
      st.canvas.style.cursor = beadDrag || turning ? 'grabbing' : overBead(d) || overPrism(d) ? 'grab' : 'default';
      if (beadDrag) {
        beadA = clamp(angOnArc(d), ARC_A0 + 0.02, ARC_A1 - 0.02);
      } else if (turning) {
        const an = Math.atan2(local(d)[1] - PC[1], local(d)[0] - PC[0]);
        const da = Math.atan2(Math.sin(an - lastAng), Math.cos(an - lastAng));
        lastAng = an; a += da;
        const now = performance.now();
        av = av * 0.5 + (da / Math.max(0.008, (now - (st.lm || now)) / 1000)) * 0.5; st.lm = now;
      }
    },
    up: () => {
      if (beadDrag) { beadDrag = false; beadJ.kick(40); nudge(); }
      if (turning) { turning = false; st.glint(); nudge(); }
    },
  });
  const onWheel = e => { e.preventDefault(); av += -e.deltaY * 0.003; nudge(); };
  const onKey = e => {
    if (e.key === 'ArrowUp') { beadA = clamp(beadA - 0.03, ARC_A0 + 0.02, ARC_A1 - 0.02); nudge(); }
    if (e.key === 'ArrowDown') { beadA = clamp(beadA + 0.03, ARC_A0 + 0.02, ARC_A1 - 0.02); nudge(); }
    if (e.key === 'ArrowLeft') { av -= 0.5; nudge(); }
    if (e.key === 'ArrowRight') { av += 0.5; nudge(); }
  };
  st.canvas.addEventListener('wheel', onWheel, { passive: false });
  if (!thumb) window.addEventListener('keydown', onKey);

  let demoT = 0;
  st.run((dt, t) => {
    if (demo) { // autopilot: slide the bead to a few colours; each stop tosses a drop
      demoT += dt;
      const stops = [6, 20, 12, 26].map(x => x * Math.PI / 180);
      const want = stops[Math.floor(demoT / 2.2) % stops.length];
      const prev = beadA; beadA += (want - beadA) * Math.min(1, dt * 5);
      if (Math.abs(beadA - prev) > 0.0005) nudge();
    }
    // prism: momentum, folded by its 120° symmetry, gliding back to where its light hits the arc
    if (!turning) {
      a += av * dt;
      av *= Math.exp(-dt * (Math.abs(av) > 0.5 ? 1.3 : 3.2));
      const P3 = Math.PI * 2 / 3, mid = (ROT_LO + ROT_HI) / 2;
      a = mid + ((((a - mid) + P3 / 2) % P3 + P3) % P3 - P3 / 2);
      if (Math.abs(av) < 1.5) av += (clamp(a, ROT_LO, ROT_HI) - a) * 20 * dt;
    } else if (performance.now() - (st.lm || 0) > 60) av *= Math.exp(-dt * 12);
    press += ((turning ? 1 : 0) - press) * Math.min(1, dt * 10);
    const spin = Math.min(1, Math.abs(av) / 4);
    S.air(Math.abs(av) * 0.6);

    // hover affordances, and a gentle breathing cue on the bead until it is first touched
    const dp = st.dp;
    beadHover += (((st.ptrOn > 0.3 && overBead(dp)) || beadDrag ? 1 : 0) - beadHover) * Math.min(1, dt * 10);
    prismHover += (((st.ptrOn > 0.3 && overPrism(dp) && !overBead(dp)) || turning ? 1 : 0) - prismHover) * Math.min(1, dt * 8);
    cue = touched || demo || thumb ? Math.max(0, cue - dt * 2) : 0.5 + 0.5 * Math.sin(t * 3.2);

    // trace the light, then read the colour under the bead (between the two nearest wavelengths)
    const tr = trace(a);
    const fan = tr.fan.slice().sort((p, q) => p.ang - q.ang);
    let col = null, k = -1;
    for (let i = 0; i + 1 < fan.length; i++) {
      const A = fan[i], B = fan[i + 1];
      if ((beadA - A.ang) * (beadA - B.ang) <= 0) {
        const w = (beadA - A.ang) / (B.ang - A.ang || 1e-6);
        col = mix3(RGB[A.k], RGB[B.k], w); k = w < 0.5 ? A.k : B.k;
        break;
      }
    }
    if (col) { const m = Math.max(...col, 1e-4); read = mix3(read, col.map(v => v / m), Math.min(1, dt * 16)); }
    readA += ((col ? 1 : 0) - readA) * Math.min(1, dt * 10);
    if (k >= 0 && k !== lastK) { S.tick(k / WAVES, 0.5); lastK = k; beadJ.kick(8); }
    st.light = mix3([0.85, 0.88, 1], read, readA * 0.9);

    // settle → a drop condenses under the bead and is tossed into the sphere
    const moving = beadDrag || turning || Math.abs(av) > 0.05;
    settle = moving ? 0 : settle + dt;
    const diff = Math.abs(read[0] - liquidTo[0]) + Math.abs(read[1] - liquidTo[1]) + Math.abs(read[2] - liquidTo[2]);
    if (pending && !drop && settle > 0.25 && readA > 0.6 && diff > 0.08) {
      const b = beadPos();
      drop = { x: b[0], y: b[1] + BEAD_R, vx: 0, vy: 0, grow: 0, phase: 'form', color: [...read] };
      pending = false;
    }
    if (pending && settle > 0.25 && (readA <= 0.6 || diff <= 0.08)) pending = false;

    let dropU = [0, 0, 0, 0];
    if (drop) {
      if (drop.phase === 'form') {
        const b = beadPos();
        drop.x = b[0]; drop.y = b[1] + BEAD_R;
        drop.grow = Math.min(1, drop.grow + dt * 3.4);
        drop.color = mix3(drop.color, read, Math.min(1, dt * 8));
        const r = 8.5 * drop.grow;
        dropU = [drop.x, drop.y + r * 0.8, r, r * (1 + 0.28 * drop.grow)];
        if (drop.grow >= 1) {
          // aim a little hop that lands in the sphere
          const g = 1800, vy0 = -170, dx = SWATCH[0] - drop.x, dy = (SWATCH[1] - SW_R * 0.2) - drop.y;
          const tt = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * g * Math.max(dy, 10))) / g;
          drop.vx = dx / tt; drop.vy = vy0; drop.g = g; drop.phase = 'fly';
          S.drip(0.85, 0.45);
        }
      } else {
        drop.vy += drop.g * dt; drop.x += drop.vx * dt; drop.y += drop.vy * dt;
        const sp = Math.hypot(drop.vx, drop.vy), st2 = Math.min(0.45, sp / 1600);
        const ang = Math.atan2(drop.vy, drop.vx), ax = Math.abs(Math.cos(ang)), ay = Math.abs(Math.sin(ang));
        dropU = [drop.x, drop.y, 8.5 * (1 + st2 * ax - st2 * 0.4 * ay), 8.5 * (1 + st2 * ay - st2 * 0.4 * ax)];
        const surf = SWATCH[1] + SW_R - fill * SW_R * 2;
        if (drop.vy > 0 && drop.y >= surf && Math.abs(drop.x - SWATCH[0]) < SW_R) {
          liquidTo = [...drop.color];
          fill = Math.min(0.78, fill + 0.035);
          ripple.a = 5; ripple.x = drop.x;
          tilt.kick(clamp(drop.vx * 0.2, -40, 40));
          st.burst(drop.x, surf, 9, 0.55, -Math.PI / 2, 1.0);
          st.glint(); st.pulse(0.9);
          S.drip(0.3 + 0.5 * (1 - lastK / WAVES), 1);
          navigator.vibrate?.(8);
          drop = null;
        }
      }
    }
    liquid = mix3(liquid, liquidTo, Math.min(1, dt * 2.4));
    ripple.a *= Math.exp(-dt * 3);
    const tiltX = tilt.step(dt);
    const hx = toHex(liquidTo);
    if (hx !== shownHex) { hex.set(textCells(hx, 4.2)); shownHex = hx; }
    hex.step(dt, { ptr: st.local(hex), shy: st.ptrOn * 0.6 });

    // pack the light for the shader
    const segs = tr.segs.slice(0, MAXSEG);
    segs.forEach((s, i) => {
      segBuf.set([st.cx + s[0][0], st.cy + s[0][1], st.cx + s[1][0], st.cy + s[1][1]], i * 4);
      colBuf.set([s[2][0], s[2][1], s[2][2], s[3]], i * 4);
    });
    const byK = tr.fan.slice().sort((p, q) => p.k - q.k);
    byK.forEach((f, i) => {
      fanBuf.set([st.cx + f.start[0], st.cy + f.start[1], st.cx + f.end[0], st.cy + f.end[1]], i * 4);
      fanCBuf.set([...RGB[f.k], 1], i * 4);
    });

    const bj = beadJ.step(dt) * 0.004;
    const bp = beadPos();
    st.drawPixels(ctx => hex.draw(ctx, 0.95));
    st.render(t, U => {
      const gl = st.gl, X = st.cx, Y = st.cy;
      gl.uniform4fv(U.uSeg, segBuf); gl.uniform4fv(U.uSegC, colBuf); gl.uniform1i(U.uSegN, segs.length);
      gl.uniform4fv(U.uFan, fanBuf); gl.uniform4fv(U.uFanC, fanCBuf); gl.uniform1i(U.uFanN, byK.length);
      gl.uniform2fv(U.uPV, tr.v.flatMap(([x, y]) => [X + x, Y + y]));
      gl.uniform2f(U.uPC, X + PC[0], Y + PC[1]);
      gl.uniform2f(U.uArcA, ARC_A0, ARC_A1);
      gl.uniform2f(U.uLamp, X + LAMP[0], Y + LAMP[1]);
      gl.uniform2f(U.uBeamDir, BEAM[0], BEAM[1]);
      gl.uniform3f(U.uBead, X + bp[0], Y + bp[1], BEAD_R * (1 + beadHover * 0.15 + bj));
      gl.uniform4f(U.uRead, ...read, readA);
      gl.uniform1f(U.uBeadHover, beadHover);
      gl.uniform1f(U.uPrismHover, prismHover);
      gl.uniform1f(U.uCue, cue);
      gl.uniform2f(U.uSwatch, X + SWATCH[0], Y + SWATCH[1]);
      gl.uniform4f(U.uLiquid, ...liquid, fill);
      gl.uniform3f(U.uWobble, tiltX * 0.25, ripple.a, X + ripple.x);
      gl.uniform4f(U.uDrop, X + dropU[0], Y + dropU[1], dropU[2], dropU[3]);
      gl.uniform3f(U.uDropC, ...(drop ? drop.color : liquid));
      gl.uniform1f(U.uSpin, spin);
      gl.uniform1f(U.uPress, press);
    });
  });

  return {
    dispose() {
      st.canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      st.dispose();
    },
  };
}
