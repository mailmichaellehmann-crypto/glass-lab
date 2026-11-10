// POOL — an upload zone made of liquid light, seen from above.
// A round pool glows softly from its depth, with slow caustics. A glass file card lies beside it; drag
// it over the pool (or drag a real file from your computer, or click the pool) and the surface already
// ripples under it. Let go: it plops in and sinks, getting smaller, softer and darker, refracted by the
// waves. Then a ring of light rises from the depth as the progress: small and blurred at first, wide
// and sharp when it reaches the surface. At 100 % it breaks the surface with a wave, a shockwave,
// sparks and a chord. Nothing is uploaded anywhere: only the file's name and size are read.

import { glassStage, PixelMatrix, Spring, textCells, bitmapCells, hexRgb, mix3 } from '../glass/engine.js';
import { clamp } from '../kit.js';

const IDLE = hexRgb('#5ad1ff'), DEEP = hexRgb('#7f8cff'), DONE = hexRgb('#3dffa8');
const DOC = ['#####..', '#...##.', '#....##', '#.....#', '#.###.#', '#.....#', '#.###.#', '#.....#', '#######'];
const MAXW = 8;
const fmtName = s => {
  let n = s.toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
  if (n.length > 14) { const dot = n.lastIndexOf('.'); const ext = dot > 0 ? n.slice(dot) : ''; n = n.slice(0, 13 - ext.length) + '-' + ext; }
  return n || 'FILE';
};

const FRAG = /* glsl */ `
#define NW ${MAXW}
uniform vec2  uPool;           // pool centre (abs)
uniform float uR;              // pool radius
uniform vec4  uRip[NW];       // x, y (abs), age, amplitude
uniform int   uRipN;
uniform vec4  uCard;           // x, y (abs), scale, height above the surface (0..1)
uniform vec4  uCardS;          // sink depth (0..1), rotation, visibility, 1 = above the surface
uniform vec4  uRingP;          // x, y (abs), radius, strength
uniform float uRingSharp;
uniform vec3  uL;
uniform float uHover, uEnergy, uDone;

vec2 slope(vec2 q) {
  vec2 g = vec2(0.0);
  for (int i = 0; i < NW; i++) {
    if (i >= uRipN) break;
    vec4 w = uRip[i];
    vec2 d = q - w.xy; float r = length(d) + 1e-3;
    float front = w.z * 140.0;
    float env = exp(-pow((r - front) / (12.0 + w.z * 26.0), 2.0)) * exp(-w.z * 1.5) * w.w;
    g += d / r * env * cos((r - front) * 0.24) * 0.24;
  }
  // the surface breathes a little even when nothing happens
  g += vec2(sin(q.y * 0.05 + uTime * 1.3), cos(q.x * 0.047 - uTime * 1.1)) * 0.01;
  return g;
}
// two drifting layers of fine caustic lines (light focused by the moving surface onto the floor)
float causticLayer(vec2 p, float t) {
  float v = sin(p.x * 3.1 + t) + sin(p.y * 2.7 - t * 1.3) + sin((p.x + p.y) * 2.2 + t * 0.7) + sin((p.x - p.y) * 1.7 - t * 0.5);
  return pow(0.5 + 0.5 * sin(v * 1.6), 6.0);
}
float caustic(vec2 p) {
  float t = uTime * 0.3;
  return causticLayer(p * 0.055, t) * 0.6 + causticLayer(p * 0.083 + 3.7, -t * 1.2) * 0.4;
}
float sdCard(vec2 p, float sc, float rot) {
  vec2 d = p - uCard.xy; float c = cos(rot), s = sin(rot);
  d = mat2(c, -s, s, c) * d;
  return sdRoundBox(d, vec2(22.0, 28.0) * sc, 6.0 * sc);
}

vec3 scene(vec2 q, vec2 sp, float frost) {
  vec3 col = pageBg(sp);
  float sdP = length(q - uPool) - uR;
  col = shadowed(col, length(q - uPool - vec2(0.0, 14.0)) - uR, length(q - uPool - vec2(0.0, 1.5)) - uR, 0.0);
  col = emitC(col, uL, exp(-max(sdP, 0.0) / 40.0) * 0.06 * uEnergy);
  float inP = 1.0 - smoothstep(-1.0, 1.0, sdP);
  vec2 g = slope(q) * inP;
  vec2 qr = q + g * 26.0;                      // what lies in the deep, seen through the moving surface
  float fr = frost;
  if (sdP < 2.0) {
    vec3 tc = tray(col, sdP, length(q - uPool - vec2(0.0, 8.0)) - uR, q, uPool, vec2(uR));
    float rr = length(q - uPool) / uR;
    // liquid light glowing from below, brighter in the middle, with slow caustics
    float deep = (0.11 + 0.07 * caustic(qr) + uHover * 0.1) * (1.0 - rr * rr * 0.55);
    tc = emitC(tc, uL, deep * uEnergy);
    // the sunken card: smaller, softer and darker the deeper it is
    if (uCardS.w < 0.5 && uCardS.z > 0.01) {
      float dpt = uCardS.x;
      float sc = 1.0 - 0.45 * dpt;
      float sd = sdCard(qr, sc, uCardS.y);
      float bl = 1.0 + dpt * 8.0;
      float m = (1.0 - smoothstep(-bl, bl, sd)) * uCardS.z * (1.0 - 0.55 * dpt);
      vec3 cc = mix(mix(vec3(0.62), vec3(0.95), uTheme), uL, 0.25 + 0.55 * dpt) * (1.0 - 0.6 * dpt * (1.0 - uTheme * 0.5));
      tc = mix(tc, cc, m * (0.7 - 0.45 * dpt));
      fr = max(fr, dpt * 0.85 * m);
    }
    // the ring of light rising from the depth: blurred and small first, sharp and wide at the surface
    float rd = abs(length(qr - uRingP.xy) - uRingP.z);
    float rw = mix(16.0, 2.0, uRingSharp);
    tc = emitC(tc, uL, (exp(-rd / rw) * 0.9 + exp(-rd / (rw * 4.0)) * 0.25) * uRingP.w * uEnergy);
    // the surface: glints where the waves tilt toward the light
    vec3 n3 = normalize(vec3(-g * 3.2, 1.0));
    float spec = pow(max(dot(n3, normalize(vec3(-0.35, 0.45, 0.82))), 0.0), 90.0);
    tc += spec * 0.55 * inP * mix(1.0, 0.6, uTheme);
    tc = emitC(tc, uL, length(g) * 2.5 * inP * uEnergy);
    col = mix(tc, col, smoothstep(-0.6, 0.6, sdP));
  }
  float cover;
  return ink(col, mix(q, qr, inP), fr, g * 3.0, 0.0, uL, cover);
}

// the glass file card while it is above the surface (resting beside the pool or carried)
vec3 cardGlass(vec2 p, vec2 sp, float sd) {
  vec2 e = vec2(0.5, 0.0);
  float sc = uCard.z, rot = uCardS.y;
  vec2 n = normalize(vec2(sdCard(p + e.xy, sc, rot) - sdCard(p - e.xy, sc, rot), sdCard(p + e.yx, sc, rot) - sdCard(p - e.yx, sc, rot)) + 1e-5);
  float depth = max(-sd, 0.0);
  float u = clamp(depth / 6.0, 0.0, 1.0);
  float hgt = sqrt(max(1.0 - (1.0 - u) * (1.0 - u), 0.0));
  vec3 n3 = normalize(vec3(n.x * (1.0 - u), -n.y * (1.0 - u), hgt + 0.05));
  vec3 V = vec3(0.0, 0.0, -1.0);
  float thick = 5.0 + 6.0 * hgt;
  vec3 tR = refract(V, n3, 1.0 / 1.45), tG = refract(V, n3, 1.0 / 1.5), tB = refract(V, n3, 1.0 / 1.56);
  vec2 oR = vec2(tR.x, -tR.y) / max(-tR.z, 0.3) * thick;
  vec2 oG = vec2(tG.x, -tG.y) / max(-tG.z, 0.3) * thick;
  vec2 oB = vec2(tB.x, -tB.y) / max(-tB.z, 0.3) * thick;
  vec3 kc = vec3(scene(p + oR, sp + oR * uScale, 0.12).r, scene(p + oG, sp + oG * uScale, 0.12).g, scene(p + oB, sp + oB * uScale, 0.12).b);
  kc = mix(kc * 0.82 + vec3(0.16), mix(kc, vec3(0.99), 0.45), uTheme);
  vec3 Rv = reflect(V, n3);
  float fres = 0.04 + 0.96 * pow(1.0 - n3.z, 5.0);
  vec3 env = mix(vec3(0.06), vec3(0.6), smoothstep(-0.7, 0.9, Rv.y));
  kc = mix(kc, mix(env, vec3(0.97), uTheme * 0.5), clamp(fres, 0.0, 0.6));
  kc += smoothstep(0.12, 0.0, u) * mix(0.3, 0.4, uTheme);
  vec2 tp = (uPtr - uCard.xy) / 40.0;
  vec3 Ld = normalize(mix(vec3(-0.4, 0.65, 0.62), vec3(tp.x, -tp.y, 0.8), uPtrOn * 0.8));
  kc += pow(max(dot(Rv, Ld), 0.0), 120.0) * 1.2;
  kc = emitC(kc, uL, uHover * 0.2 * uEnergy);
  return kc;
}

void main() {
  vec2 sp; vec2 p = designPos(sp);
  vec3 col = scene(p, sp, 0.0);
  if (uCardS.w > 0.5 && uCardS.z > 0.01) {
    float sc = uCard.z, h = uCard.w;
    // its shadow: further and softer the higher it is carried
    vec2 so = vec2(4.0, 6.0) + h * vec2(16.0, 26.0);
    float ds = sdCard(p - so, sc, uCardS.y);
    col *= 1.0 - (1.0 - smoothstep(-4.0 - h * 8.0, 8.0 + h * 24.0, ds)) * mix(0.5, 0.18, uTheme) * (1.0 - h * 0.4) * uCardS.z;
    float sd = sdCard(p, sc, uCardS.y);
    if (sd < 2.0) col = mix(cardGlass(p, sp, sd), col, mix(1.0, smoothstep(-0.7, 0.7, sd), uCardS.z));
  }
  fragColor = vec4(finishAt(col, p), 1.0);
}`;

export async function mount(root, { reducedMotion, thumb = null, demo = false }) {
  thumb = thumb && { ...thumb };
  const R = thumb ? 78 : 118;
  const PX = thumb ? 0 : -52;                        // pool centre x
  const HOME = thumb ? [R + 70, -R - 40] : [PX + R + 92, 34];
  const st = glassStage(root, { frag: FRAG, box: [thumb ? R * 2 + 70 : R * 2 + 250, R * 2 + (thumb ? 60 : 130)], thumb });
  await st.ready;
  const S = st.sfx;
  const buzz = pat => { if (!thumb && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(pat); };

  // ---------------------------------------------------------------- state
  // card modes: home · drag · sink · gone · appear
  const card = { x: HOME[0], y: HOME[1], tx: HOME[0], ty: HOME[1], vx: 0, vy: 0, h: 0, depth: 0, rot: 0, vis: 1, mode: 'home', sc: 1, os: false };
  const pop = new Spring(260, 9);
  const waves = [];
  let waveT = 0, hover = 0, prog = 0, upl = false, speed = 0.4, doneT = -1, doneMix = 0, ring = 0, lastTenth = 0;
  let file = null, grab = [0, 0], press = 0;
  const center = new PixelMatrix({ size: 3.6, swirl: 2, shyR: 18, shyF: 6 }); // low swirl: a counting number must stay readable
  center.ox = PX;
  const nameL = new PixelMatrix({ size: 2.6, swirl: 8, shyR: 14, shyF: 5 });
  nameL.ox = PX; nameL.oy = R + 30;
  const icon = new PixelMatrix({ size: 2.6, swirl: 8, shyR: 8, shyF: 2 });
  icon.set(bitmapCells(DOC, 2.6), { instant: true });
  let shownCenter = null, shownName = null;
  const wv = new Float32Array(MAXW * 4);
  const events = [];
  let clock = 0;
  const later = (dt, fn) => events.push({ t: clock + dt, fn });

  const wave = (x, y, amp) => { waves.push({ x, y, t: 0, amp }); if (waves.length > MAXW) waves.shift(); };
  const inPool = (x, y) => Math.hypot(x - PX, y) < R - 6;

  const drop = f => {
    file = f;
    card.mode = 'sink'; card.depth = 0; card.vx *= 0.3; card.vy *= 0.3;
    wave(card.x, card.y, 1.4); later(0.12, () => wave(card.x, card.y, 0.8));
    S.drip(0.35, 1); S.land(0.35); st.burst(card.x, card.y, 10, 0.45, -Math.PI / 2, 1.4); st.pulse(0.6); buzz(12);
    prog = 0; lastTenth = 0; upl = false; ring = 0;
    // a rough speed from the size: big files take longer (only ever simulated)
    const mb = (f.size || 2.4e6) / 1e6;
    speed = clamp(1 / (1.6 + Math.log2(1 + mb) * 0.55), 0.18, 0.55);
  };
  const finish = () => {
    upl = false; doneT = 0;
    st.light = DONE;
    wave(PX, 0, 1.8); later(0.15, () => wave(PX, 0, 1));
    st.shock(PX, 0); st.burst(PX, 0, 24, 1.05); st.glint(); st.pulse(1);
    S.ping(true); [0.5, 0.63, 0.8].forEach((p, i) => later(0.06 + i * 0.07, () => S.key(p)));
    buzz([10, 40, 20]);
  };
  const reset = () => {
    doneT = -1; file = null; prog = 0; ring = 0;
    Object.assign(card, { x: HOME[0], y: HOME[1], tx: HOME[0], ty: HOME[1], vx: 0, vy: 0, h: 0, depth: 0, rot: 0, vis: 0, mode: 'appear', os: false });
    pop.v = 0; pop.x = 0;
  };

  // ---------------------------------------------------------------- input
  const local = d => [d[0] - st.cx, d[1] - st.cy];
  const onCard = ([x, y]) => card.mode === 'home' && Math.abs(x - card.x) < 30 && Math.abs(y - card.y) < 36;
  const busy = () => card.mode === 'sink' || doneT >= 0;
  const picker = document.createElement('input');
  picker.type = 'file'; picker.style.display = 'none';
  root.appendChild(picker);
  picker.addEventListener('change', () => {
    const f = picker.files?.[0]; picker.value = '';
    if (!f || busy()) return;
    // the chosen file drops in from above the middle of the pool
    Object.assign(card, { x: PX + 10, y: -14, h: 1, vis: 1, mode: 'drag', os: true });
    later(0.28, () => drop({ name: f.name, size: f.size }));
  });
  st.bindPointer({
    down: (p, e, d) => {
      const q = local(d);
      if (busy()) return;
      S._ensure();
      if (onCard(q)) { card.mode = 'drag'; grab = [q[0] - card.x, q[1] - card.y]; press = 1; pop.kick(-1.5); S.tick(0.6, 0.4); }
      else if (inPool(q[0], q[1])) { wave(q[0], q[1], 0.9); S.drip(0.6, 0.4); picker.click(); }
    },
    move: (p, e, d) => {
      const q = local(d);
      st.canvas.style.cursor = card.mode === 'drag' ? 'grabbing' : onCard(q) ? 'grab' : inPool(q[0], q[1]) && !busy() ? 'pointer' : 'default';
      if (card.mode === 'drag' && !card.os) { card.tx = q[0] - grab[0]; card.ty = q[1] - grab[1]; }
      if (!busy() && card.mode !== 'drag' && inPool(q[0], q[1]) && Math.random() < 0.05) wave(q[0], q[1], 0.25); // fingers trail through the light
    },
    up: () => {
      if (card.mode !== 'drag' || card.os) return;
      press = 0;
      // where the hand let go counts, not where the lagging card happens to be
      if (inPool(card.tx, card.ty)) { card.x += (card.tx - card.x) * 0.7; card.y += (card.ty - card.y) * 0.7; drop({ name: 'photo.jpg', size: 2.4e6 }); }
      else { card.mode = 'home'; card.tx = HOME[0]; card.ty = HOME[1]; pop.kick(2); S.tick(0.45, 0.4); }
    },
  });
  // real files dragged in from the desktop
  const evLocal = e => { const r = st.canvas.getBoundingClientRect(); return local(st.toDesign(e.clientX - r.left, e.clientY - r.top)); };
  const onOver = e => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    if (busy()) return;
    const [x, y] = evLocal(e);
    if (!card.os) { S._ensure(); Object.assign(card, { mode: 'drag', os: true, vis: 1, x, y }); }
    card.tx = x; card.ty = y;
  };
  const onLeave = e => {
    if (!card.os || card.mode !== 'drag') return;
    const r = st.canvas.getBoundingClientRect();
    if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) return;
    reset();
  };
  const onDrop = e => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f || busy()) return;
    const [x, y] = evLocal(e);
    card.x = x; card.y = y;
    if (inPool(x, y)) drop({ name: f.name, size: f.size }); else reset();
  };
  st.canvas.addEventListener('dragover', onOver);
  st.canvas.addEventListener('dragleave', onLeave);
  st.canvas.addEventListener('drop', onDrop);
  const onKey = e => { if ((e.key === 'Enter' || e.key === ' ') && !busy()) { e.preventDefault(); S._ensure(); picker.click(); } };
  if (!thumb) window.addEventListener('keydown', onKey);

  // ---------------------------------------------------------------- autopilot (shelf miniature): the card is carried in and dropped
  let demoT = 0;

  st.run((dt, t) => {
    clock += dt;
    for (let k = events.length - 1; k >= 0; k--) if (events[k].t <= clock) { const ev = events[k]; events.splice(k, 1); ev.fn(); }
    if (demo && card.mode === 'home') {
      demoT += dt;
      if (demoT > 0.15) { demoT = 0; card.mode = 'drag'; card.os = true; card.tx = PX + 14; card.ty = -10; }
    }
    if (demo && card.mode === 'drag' && card.os && Math.hypot(card.x - card.tx, card.y - card.ty) < 6 && !events.length) later(0.25, () => card.mode === 'drag' && drop({ name: 'photo.jpg', size: 1e6 }));

    // the card: follows the hand with a little lag and leans into the motion
    if (card.mode === 'drag' || card.mode === 'home' || card.mode === 'appear') {
      const k = card.mode === 'drag' ? 320 : 160, c = 2 * Math.sqrt(k) * 0.8;
      card.vx += (-k * (card.x - card.tx) - c * card.vx) * dt; card.vy += (-k * (card.y - card.ty) - c * card.vy) * dt;
      card.x += card.vx * dt; card.y += card.vy * dt;
    }
    card.h += ((card.mode === 'drag' ? 1 : 0) - card.h) * Math.min(1, dt * 9);
    card.rot += ((card.mode === 'drag' ? clamp(card.vx * 0.0006, -0.25, 0.25) : 0) - card.rot) * Math.min(1, dt * 8);
    if (card.mode === 'appear') { card.vis = Math.min(1, card.vis + dt * 3); if (card.vis >= 1) { card.mode = 'home'; pop.kick(-3); } }
    const over = card.mode === 'drag' && inPool(card.x, card.y);
    hover += ((over ? 1 : 0) - hover) * Math.min(1, dt * 6);
    // the surface ripples under the card before it even touches
    waveT += dt;
    if (over && waveT > 0.17) { waveT = 0; wave(card.x + 4, card.y + 6, 0.35 + Math.min(0.9, Math.hypot(card.vx, card.vy) / 600)); }
    if (card.mode === 'sink') {
      card.depth = Math.min(1, card.depth + dt * 1.2 * (1 - card.depth * 0.6));
      card.x += card.vx * dt; card.y += card.vy * dt; card.vx *= Math.exp(-dt * 4); card.vy *= Math.exp(-dt * 4);
      // it drifts toward the middle as it settles
      card.x += (PX - card.x) * dt * 0.6; card.y += (R * 0.38 - card.y) * dt * 0.6; // settles below the number
      card.rot += dt * 0.25;
      if (card.depth > 0.45 && !upl && doneT < 0 && prog === 0) upl = true;
    }
    for (const w of waves) w.t += dt;
    while (waves.length && waves[0].t > 2.6) waves.shift();

    // progress: the ring of light rises from the depth
    if (upl) {
      const wob = 0.65 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1));
      prog = Math.min(1, prog + dt * speed * wob);
      const tenth = Math.floor(prog * 10);
      if (tenth > lastTenth) { lastTenth = tenth; S.tick(0.35 + prog * 0.5, 0.35); st.pulse(0.12); }
      if (prog >= 1) { card.vis = 0; finish(); }
    }
    ring += ((upl || doneT >= 0 ? prog : 0) - ring) * Math.min(1, dt * 7);
    if (doneT >= 0) { doneT += dt; if (doneT > (thumb ? 1.3 : 2.8)) reset(); }
    doneMix += ((doneT >= 0 ? 1 : 0) - doneMix) * Math.min(1, dt * 5);
    if (card.mode === 'sink' && doneT >= 0) card.mode = 'gone';

    const L = mix3(mix3(IDLE, DEEP, ring), DONE, doneMix);
    if (!events.length) st.light = L;

    // pixels: what the pool says, the file's name, the icon on the card
    const pct = Math.floor(prog * 100);
    const word = thumb ? (upl ? '' : '') : doneT >= 0 ? 'SAVED' : upl || card.mode === 'sink' ? `${pct}%` : hover > 0.5 ? 'LET GO' : 'DROP';
    if (word !== shownCenter) {
      // number to number snaps like a display (springs would never settle while it counts)
      const snap = word.endsWith('%') && shownCenter?.endsWith('%');
      center.set(word ? textCells(word, word.endsWith('%') ? 4 : 3.6) : [], { instant: snap });
      shownCenter = word;
    }
    const nm = thumb || !file ? '' : fmtName(file.name);
    if (nm !== shownName) { nameL.set(nm ? textCells(nm, 2.8) : []); shownName = nm; }
    center.oy += ((hover > 0.5 ? R * 0.55 : 0) - center.oy) * Math.min(1, dt * 8); // makes room under the card
    center.step(dt, { ptr: st.local(center), shy: st.ptrOn * 0.5 });
    nameL.step(dt, { ptr: st.local(nameL), shy: st.ptrOn * 0.5 });
    const sc = card.mode === 'sink' || card.mode === 'gone' ? 1 - 0.45 * card.depth : (1 + pop.step(dt) * 0.04) * (1 + card.h * 0.08) * (card.mode === 'appear' ? 0.6 + 0.4 * card.vis : 1);
    icon.ox = card.x; icon.oy = card.y;
    icon.step(dt, { ptr: st.local(icon), shy: 0 });

    st.drawPixels(ctx => {
      center.draw(ctx, word.endsWith('%') ? 0.95 : 0.8);
      nameL.draw(ctx, 0.75);
      const vis = card.mode === 'gone' ? 0 : card.vis;
      if (vis > 0.01) {
        // the icon shrinks with the card as it sinks
        ctx.save(); ctx.translate(card.x, card.y); ctx.scale(sc, sc); ctx.translate(-card.x, -card.y);
        icon.draw(ctx, vis * (card.mode === 'sink' ? Math.pow(1 - card.depth, 2) : 0.9)); // the icon fades into the deep
        ctx.restore();
      }
    });
    st.render(t, (U, gl) => {
      const X = st.cx, Y = st.cy;
      gl.uniform2f(U.uPool, X + PX, Y);
      gl.uniform1f(U.uR, R);
      wv.fill(0);
      waves.forEach((w, i) => wv.set([X + w.x, Y + w.y, w.t, w.amp], i * 4));
      gl.uniform4fv(U.uRip, wv);
      gl.uniform1i(U.uRipN, waves.length);
      gl.uniform4f(U.uCard, X + card.x, Y + card.y, sc, card.h);
      const above = card.mode === 'sink' || card.mode === 'gone' ? 0 : 1;
      gl.uniform4f(U.uCardS, card.depth, card.rot, card.mode === 'gone' ? 0 : card.vis, above);
      const rc = [PX + (card.x - PX) * (1 - ring), card.y * (1 - ring)]; // the ring rises from the file toward the middle
      gl.uniform4f(U.uRingP, X + rc[0], Y + rc[1], R * (0.14 + 0.8 * ring), (upl || doneT >= 0 ? 0.25 + 0.75 * ring : 0) * (1 - doneMix * 0.6));
      gl.uniform1f(U.uRingSharp, ring);
      gl.uniform3f(U.uL, ...L);
      gl.uniform1f(U.uHover, hover);
      gl.uniform1f(U.uEnergy, 0.75 + st.kick * 0.25);
      gl.uniform1f(U.uDone, doneMix);
    });
  });

  return {
    dispose() {
      window.removeEventListener('keydown', onKey);
      st.canvas.removeEventListener('dragover', onOver);
      st.canvas.removeEventListener('dragleave', onLeave);
      st.canvas.removeEventListener('drop', onDrop);
      picker.remove();
      st.dispose();
    },
  };
}
