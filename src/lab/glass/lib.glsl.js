// Shared GLSL for every glass control: the same optics and light model as the toggle.
// Each control writes its own main() and uses these building blocks.

export const LIB = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  uRes;     // drawing buffer px
uniform float uDpr;
uniform float uTime;
uniform float uTheme;   // 0 dark … 1 light (follows the toggle)
uniform vec2  uC;       // design centre (css px)
uniform float uScale;   // css px per design px
uniform vec2  uPtr;     // pointer, design px
uniform float uPtrOn;
uniform vec4  uBox;     // pixel-layer rect, design px
uniform sampler2D uPix, uGlow;
uniform vec3  uLight;   // the control's light colour
// shared effects, driven by the engine
uniform vec4  uSpark[28];  // xy design px, z energy, w radius
uniform int   uSparkN;
uniform vec3  uWave;       // shockwave: xy design px, z age s (<0 off)
uniform float uSweep;      // age of the glint sweep, s
uniform vec3  uFxLight;    // colour of sparks/waves (the light at the moment of impact)
uniform float uKick;       // momentary light surge after an interaction (like the toggle's LED kick)
float gRing = 0.0;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float sdEllipse(vec2 p, vec2 c, vec2 rad) { return (length((p - c) / rad) - 1.0) * min(rad.x, rad.y); }
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Light that reads equally strong on black and on white (the toggle's glow model).
vec3 emitC(vec3 c, vec3 light, float a) {
  vec3 additive = c + light * a;
  vec3 tinted = mix(c, light * 1.04 + 0.03, clamp(1.0 - exp(-a * 1.3), 0.0, 0.88));
  return mix(additive, tinted, uTheme);
}
vec3 emit(vec3 c, float a) { return emitC(c, uLight, a); }

float icon(sampler2D s, vec2 p) {
  vec2 uv = (p - uBox.xy) / uBox.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  return texture(s, uv).a;
}

// design-space position of this fragment; a running shockwave refracts space around it
vec2 designPos(out vec2 sp) {
  sp = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 p = uC + (sp - uC) / uScale;
  if (uWave.z >= 0.0) {
    vec2 wd = p - uWave.xy; float wr = length(wd);
    float front = uWave.z * 640.0;
    gRing = exp(-pow((wr - front) / 26.0, 2.0)) * exp(-uWave.z * 2.3);
    p += wd / max(wr, 1.0) * gRing * 9.0 * sin((wr - front) * 0.12);
  }
  return p;
}

// the toggle page's starfield: two twinkling layers with pointer parallax
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 starfield(vec2 sp) {
  vec3 acc = vec3(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float cell = layer == 0 ? 46.0 : 23.0;
    float depth = layer == 0 ? 0.035 : 0.015;
    vec2 g = (sp + (uPtr - uC) * depth) / cell;
    vec2 id = floor(g);
    vec2 o = hash22(id + float(layer) * 13.7) * 0.8 + 0.1;
    float r = hash12(id + 7.1 + float(layer) * 3.3);
    float d = length(fract(g) - o) * cell;
    float tw = 0.55 + 0.45 * sin(uTime * (0.8 + r * 3.0) + r * 40.0);
    float size = layer == 0 ? 1.35 : 0.9;
    float on = step(layer == 0 ? 0.80 : 0.88, r);
    acc += smoothstep(size, 0.0, d) * on * tw * (layer == 0 ? 0.55 : 0.3) * vec3(0.82, 0.88, 1.0);
  }
  return acc;
}

// The page itself: the same sky and stars as the toggle page.
vec3 pageBg(vec2 sp) {
  vec2 uv = sp / (uRes / uDpr);
  float sky = smoothstep(1.5, 0.0, length((uv - vec2(0.9, -0.1)) * vec2(1.0, 1.25)));
  // a faint pool of the control's own light on the floor around it: the object sits in its light
  float pool = exp(-length((sp - uC) * vec2(1.0, 1.6)) / (230.0 * uScale));
  vec3 dark = mix(vec3(0.036), vec3(0.11), sky) + uLight * (0.025 * sky + 0.045 * pool) + starfield(sp);
  vec3 light = mix(vec3(0.80, 0.795, 0.79), vec3(0.935, 0.93, 0.92), sky) + (uLight - 0.5) * 0.025 * pool;
  return mix(dark, light, uTheme);
}

// A recessed tray carved into the page. sd: shape SDF, sdIn: same shape shifted 7px down
// (gives the inner shadow under the top lip), hs: half size for the vertical shading.
vec3 tray(vec3 page, float sd, float sdIn, vec2 p, vec2 c, vec2 hs) {
  float th = uTheme;
  vec3 base = mix(vec3(0.032), vec3(0.895), th);
  base *= 1.0 + (p.y - c.y) / hs.y * mix(0.05, 0.014, th);
  float inner = smoothstep(-14.0, 3.0, sdIn);
  base = mix(base * (1.0 - inner * 0.6), base - inner * 0.085, th);
  float rim = 1.0 - smoothstep(0.0, 1.3, abs(sd + 0.75));
  float low = smoothstep(-hs.y * 0.6, hs.y, p.y - c.y);
  base += rim * mix(mix(0.035, 0.09, low), mix(-0.07, 0.07, low), th);
  return mix(base, page, smoothstep(-0.6, 0.6, sd));
}

// The toggle's light filament: a tapered strip 6.5px outside a glass body (sd = the body's SDF
// at p), centred at angle theta around c, with angular half-length halfW. Returns its SDF.
float filament(vec2 p, vec2 c, float sd, float theta, float halfW) {
  vec2 q = p - c;
  float a = atan(q.y, q.x);
  float da = abs(atan(sin(a - theta), cos(a - theta)));
  float tang = max(da - halfW, 0.0) * 100.0;
  float w = 1.8 - 0.9 * smoothstep(0.0, halfW, da);
  return length(vec2(sd - 6.5, tang)) - w;
}
// how the filament lights its surroundings (spill on page/tray, scatter in glass) and draws itself
float filamentSpill(float d) { d = max(d, 0.0); return exp(-d / 18.0) * 0.5 + exp(-d / 85.0) * 0.34; }
float filamentWash(float d)  { d = max(d, 0.0); return exp(-d / 14.0) * 0.85 + exp(-d / 55.0) * 0.32; }
float filamentScatter(float d) { d = max(d, 0.0); return exp(-d / 24.0) * 0.8 + exp(-d / 64.0) * 0.2; }
vec3 drawFilament(vec3 col, float d, vec3 light, float energy) {
  float body = 1.0 - smoothstep(-0.6, 0.6, d);
  vec3 lc = mix(light * 1.05, mix(light, vec3(1.0), 0.65), smoothstep(-0.2, -1.4, d));
  col = mix(col, lc * (0.8 + 0.35 * energy), body);
  return emitC(col, light, exp(-max(d, 0.0) / 4.5) * 0.55 * energy * (1.0 - body));
}

// Soft drop shadow + contact shadow of any shape onto whatever is below.
vec3 shadowed(vec3 col, float sdOffsetDrop, float sdContact, float lift) {
  float th = uTheme;
  col *= 1.0 - (1.0 - smoothstep(-10.0, 30.0 + lift * 14.0, sdOffsetDrop)) * mix(0.5, 0.17, th);
  col *= 1.0 - (1.0 - smoothstep(-2.0, 4.0, sdContact)) * mix(0.3, 0.08, th);
  return col;
}

// Pixel ink composited over a base (sharp → blurred by frost, chromatic offset ca).
vec3 ink(vec3 base, vec2 p, float frost, vec2 ca, float wash, vec3 light, out float cover) {
  vec3 a;
  a.r = mix(icon(uPix, p - ca), icon(uGlow, p - ca) * 1.35, frost);
  a.g = mix(icon(uPix, p),      icon(uGlow, p)      * 1.35, frost);
  a.b = mix(icon(uPix, p + ca), icon(uGlow, p + ca) * 1.35, frost);
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  vec3 inkc = mix(mix(vec3(1.0, 0.965, 0.93), light, 0.12), vec3(0.11, 0.105, 0.10), smoothstep(0.40, 0.56, lum));
  inkc = mix(inkc + light * wash * 0.9, inkc + vec3(0.25, 0.08, 0.0) * wash, uTheme);
  cover = clamp(a.g, 0.0, 1.0);
  vec3 col = mix(base, inkc, clamp(a, 0.0, 1.0));
  col += mix(vec3(1.0, 0.8, 0.6), light, 0.35) * icon(uGlow, p) * 0.62 * (1.0 - uTheme);
  return col;
}

// Glass body shading, given what is seen through it (g) and the local geometry.
//   n: outward 2D normal, depth: distance inside the edge, bevel: 0 flat face … 1 edge
vec3 glass(vec3 g, vec2 n, float depth, float bevel, vec2 p, vec2 c, vec2 hs, float cover, float scatter, vec3 light) {
  float th = uTheme;
  float vy = clamp((p.y - (c.y - hs.y)) / (2.0 * hs.y), 0.0, 1.0);
  vec3 darkGlass = g * 0.84 + vec3(0.135) * (1.0 - vy * 0.55);
  vec3 lightGlass = mix(g, vec3(0.99), 0.5 * (1.0 - cover * 0.8));
  vec3 kc = mix(darkGlass, lightGlass, th);
  kc = emitC(kc, light, scatter * 0.8);
  kc = emitC(kc, light, exp(-depth / 2.2) * scatter * 1.1);
  vec2 toPtr = uPtr - c;
  vec2 Ld = normalize(mix(vec2(-0.35, -1.0), toPtr / max(length(toPtr), 1.0), uPtrOn * 0.85) + vec2(1e-4));
  float ndl = dot(n, Ld);
  kc += pow(max(ndl, 0.0), 2.0) * exp(-depth / 1.25) * mix(0.42, 0.7, th);
  kc += max(ndl, 0.0) * bevel * mix(0.07, 0.16, th);
  kc *= 1.0 - max(-ndl, 0.0) * bevel * mix(0.28, 0.07, th);
  kc += exp(-depth / 0.7) * mix(0.07, 0.12, th);
  kc += exp(-length(p - uPtr) / 34.0) * uPtrOn * (1.0 - bevel) * mix(0.07, 0.06, th);
  // light focused through the body: a thin bright line inside the far (shadowed) rim
  kc += exp(-abs(depth - 5.5) / 1.4) * max(-ndl, 0.0) * mix(0.16, 0.22, th);
  kc = emitC(kc, light, exp(-abs(depth - 5.5) / 2.0) * max(-ndl, 0.0) * scatter * 0.6);
  // a second, softer reflection band set into the lit bevel: reads as thickness
  kc += exp(-pow((depth - 11.0) / 3.5, 2.0)) * max(ndl, 0.0) * mix(0.07, 0.1, th);
  // the glint that wipes across after an interaction
  if (uSweep < 1.2) {
    vec2 rel = p - c;
    float s = dot(rel, normalize(vec2(1.0, -0.75)));
    float span = max(hs.x, hs.y) + 70.0;
    float pos = mix(-span, span, clamp(uSweep / 0.8, 0.0, 1.0));
    kc += exp(-pow((s - pos) / 11.0, 2.0)) * 0.28 * (1.0 - uSweep / 1.2) * (1.0 - bevel * 0.4);
  }
  return kc;
}

// tone: white-hot highlights, soft roll-off, vignette, grain
vec3 finish(vec3 col) {
  // overexposed light turns white-hot instead of clipping to a flat saturated colour
  float peak = max(col.r, max(col.g, col.b));
  col += max(peak - 1.0, 0.0) * 0.3;
  // soft shoulder above the knee: highlights roll off like film, everything below is untouched
  const float K = 0.78;
  vec3 over = max(col - K, 0.0);
  vec3 rolled = min(col, K) + (1.0 - K) * (1.0 - exp(-over / (1.0 - K)));
  col = mix(rolled, col, uTheme); // the light page is paper, not light: leave it bright
  // a quiet vignette: the edges fall back so the eye lands on the control
  vec2 v = (gl_FragCoord.xy / uRes - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float vig = smoothstep(0.35, 1.1, length(v));
  col *= 1.0 - vig * mix(0.32, 0.07, uTheme);
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * 0.02;
  return clamp(col, 0.0, 1.0);
}
// sparks + shockwave rim light, then the tone finish
vec3 finishAt(vec3 col, vec2 p) {
  for (int i = 0; i < 28; i++) {
    if (i >= uSparkN) break;
    vec4 s = uSpark[i]; float d = length(p - s.xy);
    col = emitC(col, uFxLight, s.z * (exp(-d / (s.w * 2.6)) * 0.55 + smoothstep(s.w, 0.0, d) * 1.4));
  }
  col = emitC(col, uFxLight, gRing * 0.3);
  return finish(col);
}
`;

// Normal of a 2D SDF by central differences. SDF must be a function name taking vec2.
export const sdfNormal = name => /* glsl */ `
vec2 ${name}Normal(vec2 p) {
  vec2 e = vec2(0.5, 0.0);
  vec2 n = vec2(${name}(p + e.xy) - ${name}(p - e.xy), ${name}(p + e.yx) - ${name}(p - e.yx));
  return n / max(length(n), 1e-4);
}`;

// A clear glass lens / drop (an ellipsoid cap) seen from above, refracting a scene separately for
// red, green and blue. `scene` must be `vec3 scene(vec2 q, vec2 sp, float frost)` in the caller.
//   c, rad   centre and radii (design px); the cap's height equals the smaller radius
//   spread   dispersion: IOR = 1.5 ∓ spread for red/blue (0.02 faint … 0.12 strong)
//   depthK   how far rays travel through the glass (refraction strength)
//   body     rgb tint of the glass/liquid and its amount (a)
//   light    colour of light scattering inside; scatter its amount
export const domeLens = (fn, scene) => /* glsl */ `
vec3 ${fn}(vec2 p, vec2 sp, vec2 c, vec2 rad, float spread, float depthK, vec4 body, vec3 light, float scatter) {
  vec2 qk = (p - c) / rad;
  float x = clamp(length(qk), 0.0, 1.0);
  float h = sqrt(max(1.0 - x * x, 0.0));
  float cz = min(rad.x, rad.y);
  vec3 n3 = normalize(vec3(qk.x * cz / rad.x, -qk.y * cz / rad.y, h + 0.015));
  vec3 V = vec3(0.0, 0.0, -1.0);
  float thick = h * cz * depthK + 6.0;
  vec3 tR = refract(V, n3, 1.0 / (1.5 - spread));
  vec3 tG = refract(V, n3, 1.0 / 1.5);
  vec3 tB = refract(V, n3, 1.0 / (1.5 + spread));
  vec2 oR = vec2(tR.x, -tR.y) / max(-tR.z, 0.3) * thick;
  vec2 oG = vec2(tG.x, -tG.y) / max(-tG.z, 0.3) * thick;
  vec2 oB = vec2(tB.x, -tB.y) / max(-tB.z, 0.3) * thick;
  float frost = 0.04 + 0.35 * pow(x, 5.0);
  vec3 g = vec3(${scene}(p + oR, sp + oR * uScale, frost).r,
                ${scene}(p + oG, sp + oG * uScale, frost).g,
                ${scene}(p + oB, sp + oB * uScale, frost).b);
  // body: coloured glass or liquid, deeper where it is thicker
  vec3 kc = mix(g, g * body.rgb * 1.15 + body.rgb * 0.18 * (0.4 + 0.6 * h), body.a * (0.55 + 0.45 * h));
  kc = emitC(kc, light, scatter * (0.35 + 0.65 * x));
  // Fresnel: flanks mirror a bright room and the light around
  vec3 R = reflect(V, n3);
  float fres = 0.03 + 0.97 * pow(1.0 - n3.z, 5.0);
  vec3 env = mix(vec3(0.07), vec3(0.5), smoothstep(-0.7, 0.9, R.y));
  env = mix(env, vec3(0.97), uTheme * 0.5);
  env = emitC(env, light, scatter * 0.9);
  kc = mix(kc, env, clamp(fres, 0.0, 0.75));
  // total internal reflection just inside the rim, then the bright edge
  kc *= 1.0 - smoothstep(0.8, 0.95, x) * smoothstep(1.0, 0.975, x) * mix(0.3, 0.12, uTheme);
  kc += smoothstep(0.965, 0.995, x) * smoothstep(1.01, 0.99, x) * mix(0.3, 0.4, uTheme);
  // key light that follows the pointer, a sharp glint and a soft sheen
  vec2 tp = (uPtr - c) / max(rad.x, rad.y);
  vec3 L = normalize(mix(vec3(-0.4, 0.65, 0.62), vec3(tp.x, -tp.y, 0.8), uPtrOn * 0.8));
  float s1 = max(dot(R, L), 0.0);
  kc += pow(s1, 240.0) * 1.8 + pow(s1, 22.0) * mix(0.08, 0.12, uTheme);
  // a window reflected in the upper flank
  float win = smoothstep(0.2, 0.13, abs(R.x + 0.3)) * smoothstep(0.15, 0.09, abs(R.y - 0.5)) * smoothstep(0.1, 0.4, R.z);
  kc += win * mix(0.22, 0.38, uTheme);
  // light gathered on the far side inside the lens
  vec2 away = -normalize(L.xy + 1e-4);
  kc = emitC(kc, mix(vec3(1.0), light, 0.5), smoothstep(0.55, 0.85, x) * smoothstep(1.0, 0.87, x) * max(dot(normalize(vec2(qk.x, -qk.y) + 1e-4), away), 0.0) * 0.25);
  if (uSweep < 1.2) {
    float s = dot(p - c, normalize(vec2(1.0, -0.75)));
    float pos = mix(-cz - 60.0, cz + 60.0, clamp(uSweep / 0.8, 0.0, 1.0));
    kc += exp(-pow((s - pos) / 10.0, 2.0)) * 0.28 * (1.0 - uSweep / 1.2) * h;
  }
  return kc;
}
`;
