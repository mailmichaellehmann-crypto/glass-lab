// One fragment shader paints everything: page, track, glass knob (anywhere on the page),
// light strip, sparks and shockwave.

export const MAX_SPARKS = 32;

export const VERT = /* glsl */ `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const COMMON = /* glsl */ `
uniform vec2  uC;        // track centre (design px, y down)
uniform vec2  uTH;       // track half size
uniform float uTR;
uniform vec2  uK;        // knob centre
uniform vec2  uKH;       // knob half size (squash & stretch)
uniform float uKR;
uniform float uScale;
uniform float uTheme;
uniform float uLed;
uniform vec3  uLight;
uniform float uTheta, uHalfW, uMode, uStripLen;
uniform vec2  uStrip;
uniform vec3  uWave;
uniform vec4  uSpark[${MAX_SPARKS}];
uniform int   uSparkN;

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

// Tapered capsule bent around the knob (or running along the track wall).
float stripDist(vec2 p) {
  if (uMode > 0.5) {
    float rad = sdRoundBox(p - uC, uTH, uTR) + 6.5;
    float along = length(p - uStrip);
    float tang = max(along - uStripLen, 0.0);
    float w = 1.7 - 0.9 * smoothstep(0.0, uStripLen, along);
    return length(vec2(rad, tang)) - w;
  }
  vec2 q = p - uK;
  float rad = sdRoundBox(q, uKH, uKR) - 6.5;
  float a = atan(q.y, q.x);
  float da = abs(atan(sin(a - uTheta), cos(a - uTheta)));
  float tang = max(da - uHalfW, 0.0) * 100.0;
  float w = 1.8 - 0.9 * smoothstep(0.0, uHalfW, da);
  return length(vec2(rad, tang)) - w;
}

float waveRing(vec2 p) {
  if (uWave.z < 0.0) return 0.0;
  float wr = length(p - uWave.xy);
  return exp(-pow((wr - uWave.z * 620.0) / 24.0, 2.0)) * exp(-uWave.z * 2.4);
}
`;

// ------------------------------------------------------------------ main picture
export const FRAG = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;
${COMMON}
uniform vec2  uRes;
uniform float uDpr;
uniform float uTime;
uniform float uLift;     // hover lift
uniform float uHeight;   // 0 = seated in the track, 1 = flying above the page
uniform vec4  uBox;      // icon texture rect (design px), centred on the knob
uniform sampler2D uPix, uGlow;
uniform float uRefract, uFrost, uDisp, uGlowAmt;
uniform vec2  uPtr;
uniform float uPtrOn;
uniform float uSweep;
uniform float uStars;
uniform float uSlot;     // empty-slot glow when the knob is out of the track

float gCover = 0.0;

vec3 emit(vec3 c, float a) {
  vec3 additive = c + uLight * a;
  vec3 tinted   = mix(c, uLight * 1.04 + 0.03, clamp(1.0 - exp(-a * 1.3), 0.0, 0.88));
  return mix(additive, tinted, uTheme);
}

float icon(sampler2D s, vec2 p) {
  vec2 uv = (p - uBox.xy) / uBox.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  return texture(s, uv).a;
}

vec2 toScreen(vec2 p) { return uC + (p - uC) * uScale; }

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

float knobShadow(vec2 p, float spread) {
  vec2 off = vec2(0.0, 7.0 + uLift * 5.0 + uHeight * 34.0);
  float ks = sdRoundBox(p - uK - off, uKH, uKR);
  return 1.0 - smoothstep(-8.0 - uHeight * 10.0, 20.0 + uLift * 8.0 + uHeight * 50.0 + spread, ks);
}

// The page: background, stars, shadows, strip spill.
vec3 pageColor(vec2 p, float sd) {
  vec2 sp = toScreen(p);
  vec2 vp = uRes / uDpr;
  vec2 uv = sp / vp;
  float th = uTheme;

  float sky = smoothstep(1.5, 0.0, length((uv - vec2(0.9, -0.1)) * vec2(1.0, 1.25)));
  vec3 dark = mix(vec3(0.036), vec3(0.11), sky) + uLight * 0.025 * sky;
  dark += starfield(sp) * uStars * (1.0 - smoothstep(0.2, 0.8, th));
  vec3 light = mix(vec3(0.80, 0.795, 0.79), vec3(0.935, 0.93, 0.92), sky);
  vec3 col = mix(dark, light, th);

  float drop = 1.0 - smoothstep(-10.0, 34.0, sdRoundBox(p - uC - vec2(0.0, 14.0), uTH, uTR));
  col *= 1.0 - drop * mix(0.5, 0.17, th);
  float contact = 1.0 - smoothstep(-2.0, 4.0, sdRoundBox(p - uC - vec2(0.0, 1.5), uTH, uTR));
  col *= 1.0 - contact * mix(0.3, 0.08, th);

  col *= 1.0 - knobShadow(p, 0.0) * mix(0.45, 0.16, th) * clamp(uHeight * 3.0, 0.0, 1.0);
  col = emit(col, (exp(-sd / 18.0) * 0.5 + exp(-sd / 85.0) * 0.34) * uLed * 0.6);
  return col;
}

vec3 trackColor(vec2 p, float st, float wash) {
  float th = uTheme;
  vec3 base = mix(vec3(0.032), vec3(0.895), th);
  base *= 1.0 + (p.y - uC.y) / uTH.y * mix(0.05, 0.014, th);
  float inset = smoothstep(-14.0, 3.0, sdRoundBox(p - uC - vec2(0.0, 7.0), uTH, uTR));
  base = mix(base * (1.0 - inset * 0.6), base - inset * 0.085, th);
  base = emit(base, wash * 0.55);
  // the empty slot glows faintly while the knob is away
  if (uSlot > 0.0) {
    float home = sdRoundBox(p - vec2(uC.x, uC.y), vec2(uTH.x - 18.0, uTH.y - 18.0), uTR - 14.0);
    base = emit(base, uSlot * exp(-abs(home) / 6.0) * 0.5 * (0.7 + 0.3 * sin(uTime * 3.0)));
  }
  base *= 1.0 - knobShadow(p, 0.0) * mix(0.6, 0.2, th) * (1.0 - uHeight * 0.6);
  float rim = 1.0 - smoothstep(0.0, 1.3, abs(st + 0.75));
  float low = smoothstep(-uTH.y * 0.6, uTH.y, p.y - uC.y);
  base += rim * mix(mix(0.035, 0.09, low), mix(-0.07, 0.07, low), th);
  return base;
}

// Whatever lies beneath a point: page or track, then the pixel icon on top.
vec3 below(vec2 p, float frost, vec2 ca) {
  float sd = max(stripDist(p), 0.0);
  float wash = (exp(-sd / 14.0) * 0.85 + exp(-sd / 55.0) * 0.32) * uLed;
  vec3 col = pageColor(p, sd);
  float st = sdRoundBox(p - uC, uTH, uTR);
  if (st < 2.0) col = mix(trackColor(p, st, wash), col, smoothstep(-0.6, 0.6, st));

  vec3 a;
  a.r = mix(icon(uPix, p - ca), icon(uGlow, p - ca) * 1.35, frost);
  a.g = mix(icon(uPix, p),      icon(uGlow, p)      * 1.35, frost);
  a.b = mix(icon(uPix, p + ca), icon(uGlow, p + ca) * 1.35, frost);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 ink = mix(mix(vec3(1.0, 0.965, 0.93), uLight, 0.12), vec3(0.11, 0.105, 0.10), smoothstep(0.40, 0.56, lum));
  ink = mix(ink + uLight * wash * 0.9, ink + vec3(0.25, 0.08, 0.0) * wash, uTheme);
  gCover = clamp(a.g, 0.0, 1.0);
  col = mix(col, ink, clamp(a, 0.0, 1.0));
  col += mix(vec3(1.0, 0.8, 0.6), uLight, 0.35) * icon(uGlow, p) * uGlowAmt * (1.0 - uTheme);
  return col;
}

void main() {
  vec2 sp = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 p  = uC + (sp - uC) / uScale;
  float th = uTheme;

  // shockwave displacement
  float ring = waveRing(p);
  if (ring > 0.0005) {
    vec2 wd = p - uWave.xy;
    float wr = length(wd);
    p += wd / max(wr, 1.0) * ring * 8.0 * sin((wr - uWave.z * 620.0) * 0.12);
  }

  vec3 col = below(p, 0.0, vec2(0.0));

  // ---- glass knob
  float sk = sdRoundBox(p - uK, uKH, uKR);
  if (sk < 2.0) {
    vec2 e = vec2(0.5, 0.0);
    vec2 n = vec2(
      sdRoundBox(p + e.xy - uK, uKH, uKR) - sdRoundBox(p - e.xy - uK, uKH, uKR),
      sdRoundBox(p + e.yx - uK, uKH, uKR) - sdRoundBox(p - e.yx - uK, uKH, uKR));
    n /= max(length(n), 1e-4);
    float depth = max(-sk, 0.0);
    float bevel = pow(1.0 - clamp(depth / 26.0, 0.0, 1.0), 2.6);
    vec2 rel = p - uK;

    vec2 bend = -n * bevel * uRefract - rel * 0.055;
    float frost = 0.06 + uFrost * bevel;
    vec3 g = below(p + bend, frost, (n * bevel * 3.2 + rel * 0.006) * uDisp);

    float vy = clamp((p.y - (uK.y - uKH.y)) / (2.0 * uKH.y), 0.0, 1.0);
    vec3 darkGlass  = g * 0.84 + vec3(0.135) * (1.0 - vy * 0.55);
    vec3 lightGlass = mix(g, vec3(0.99), 0.5 * (1.0 - gCover * 0.8));
    vec3 kc = mix(darkGlass, lightGlass, th);

    float sq = max(stripDist(p), 0.0);
    float scatter = (exp(-sq / 24.0) * 0.8 + exp(-sq / 64.0) * 0.2) * uLed;
    kc = emit(kc, scatter * 0.8);
    kc = emit(kc, exp(-depth / 2.2) * exp(-sq / 40.0) * uLed * 1.3);

    vec2 toPtr = uPtr - uK;
    vec2 Ld = normalize(mix(vec2(-0.35, -1.0), toPtr / max(length(toPtr), 1.0), uPtrOn * 0.85) + vec2(1e-4));
    float ndl = dot(n, Ld);
    kc += pow(max(ndl, 0.0), 2.0) * exp(-depth / 1.25) * mix(0.42, 0.7, th);
    kc += max(ndl, 0.0) * bevel * mix(0.07, 0.16, th);
    kc *= 1.0 - max(-ndl, 0.0) * bevel * mix(0.28, 0.07, th);
    kc += exp(-depth / 0.7) * mix(0.07, 0.12, th);
    kc += exp(-length(p - uPtr) / 34.0) * uPtrOn * (1.0 - bevel) * mix(0.07, 0.06, th);

    if (uSweep < 1.2) {
      float s = dot(rel, normalize(vec2(1.0, -0.75)));
      float pos = mix(-180.0, 180.0, clamp(uSweep / 0.85, 0.0, 1.0));
      kc += exp(-pow((s - pos) / 10.0, 2.0)) * 0.24 * (1.0 - uSweep / 1.2) * (1.0 - bevel * 0.4);
    }

    col = mix(kc, col, smoothstep(-0.7, 0.7, sk));
  }

  // ---- the light strip
  float ld = stripDist(p);
  float body = 1.0 - smoothstep(-0.6, 0.6, ld);
  vec3 lc = mix(uLight * 1.05, mix(uLight, vec3(1.0), 0.65), smoothstep(-0.2, -1.4, ld));
  col = mix(col, lc * (0.8 + 0.35 * uLed), body);
  col = emit(col, exp(-max(ld, 0.0) / 4.5) * 0.55 * uLed * (1.0 - body));

  for (int i = 0; i < ${MAX_SPARKS}; i++) {
    if (i >= uSparkN) break;
    vec4 s = uSpark[i];
    float d = length(p - s.xy);
    col = emit(col, s.z * (exp(-d / (s.w * 2.6)) * 0.55 + smoothstep(s.w, 0.0, d) * 1.4));
  }
  col = emit(col, ring * 0.22 * uLed);

  col += (hash12(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * 0.022;
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
