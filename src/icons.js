// Pixel-matrix icons on a 17×17 grid, plus the pairing that turns one icon into another.
//
// Every icon is a list of cells { x, y, b, kind, ang }:
//   b     brightness 0..1
//   kind  drives idle animation ('star' twinkles, 'ray' pulses around the sun, 'wave' ripples, …)
//   ang   optional angle used by animated kinds

export const GRID = 17;
export const CENTER = 8;

function canvasSet() {
  const cells = new Map();
  const api = {
    add(x, y, b = 1, kind = 'body', ang = 0) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) return api;
      const k = x + ',' + y;
      const c = cells.get(k);
      if (!c) cells.set(k, { x, y, b, kind, ang });
      else if (b > c.b) Object.assign(c, { b, kind, ang });
      return api;
    },
    remove(x, y) { cells.delete(x + ',' + y); return api; },
    has(x, y) { return cells.has(x + ',' + y); },
    each(fn) { for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) fn(x, y); return api; },
    line(x0, y0, x1, y1, b = 1, kind = 'body') {
      const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) || 1;
      for (let i = 0; i <= n; i++) api.add(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, b, kind);
      return api;
    },
    list: () => [...cells.values()],
  };
  return api;
}

const inDisc = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ------------------------------------------------------------------ celestial
function moon() {
  const s = canvasSet();
  s.each((x, y) => {
    const lit = inDisc(x, y, CENTER, CENTER, 6.6);
    const bite = inDisc(x, y, 11.4, 5.4, 5.3);
    if (lit && !bite) s.add(x, y, 1, 'lit');
    else if (lit && bite && (x + y) % 2 === 0) s.add(x, y, 0.18, 'earthshine');
  });
  // craters
  for (const [x, y] of [[3, 9], [5, 12], [4, 7]]) if (s.has(x, y)) s.add(x, y, 0.55, 'lit');
  // a cross-shaped star and two specks
  s.add(14, 2, 1, 'star').add(13, 2, 0.45, 'star').add(15, 2, 0.45, 'star').add(14, 1, 0.45, 'star').add(14, 3, 0.45, 'star');
  s.add(10, 0, 0.7, 'star').add(16, 6, 0.6, 'star');
  return s.list();
}

function sun() {
  const s = canvasSet();
  s.each((x, y) => { if (inDisc(x, y, CENTER, CENTER, 3.7)) s.add(x, y, 1, 'core'); });
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const radii = i % 2 ? [5.9, 7.1] : [5.6, 6.6, 7.6];
    for (const r of radii) s.add(CENTER + Math.cos(a) * r, CENTER + Math.sin(a) * r, 1, 'ray', a);
  }
  return s.list();
}

// ------------------------------------------------------------------ power
function powerOff() {
  const s = canvasSet();
  s.each((x, y) => {
    const d = Math.hypot(x - CENTER, y - CENTER);
    const a = Math.atan2(x - CENTER, -(y - CENTER)); // 0 = straight up
    if (d >= 5.0 && d <= 6.6 && Math.abs(a) > 0.62) s.add(x, y, 0.9, 'body');
  });
  s.line(CENTER, 1, CENTER, 8, 1, 'body');
  return s.list();
}

function bolt() {
  const s = canvasSet();
  const P = [[10.5, 0], [3.5, 9.5], [8, 9.5], [6, 16.5], [13.5, 6.5], [9, 6.5], [11.5, 0]];
  s.each((x, y) => { if (inPoly(x + 0.5, y + 0.5, P)) s.add(x, y, 1, 'core'); });
  s.add(2, 2, 0.8, 'spark').add(15, 12, 0.8, 'spark').add(14, 2, 0.6, 'spark').add(2, 14, 0.5, 'spark');
  return s.list();
}

// ------------------------------------------------------------------ sound
function speakerBody(s) {
  for (let y = 6; y <= 10; y++) for (let x = 1; x <= 3; x++) s.add(x, y, 1, 'body');
  for (let x = 4; x <= 7; x++) {
    const spread = x - 3;
    for (let y = 6 - spread; y <= 10 + spread; y++) s.add(x, y, 1, 'body');
  }
  return s;
}

function muted() {
  const s = speakerBody(canvasSet());
  s.line(10.5, 5.5, 15, 11, 1, 'x').line(15, 5.5, 10.5, 11, 1, 'x');
  return s.list();
}

function loud() {
  const s = speakerBody(canvasSet());
  for (const r of [3.8, 6.4, 9.0]) {
    for (let a = -0.85; a <= 0.85; a += 0.12) {
      s.add(7 + Math.cos(a) * r, 8.5 + Math.sin(a) * r, r > 8 ? 0.6 : 1, 'wave', r);
    }
  }
  return s.list();
}

// ------------------------------------------------------------------ heart
const heartF = (x, y) => {
  const u = (x - CENTER) / 6.1, v = (CENTER + 1.0 - y) / 6.1;
  return (u * u + v * v - 1) ** 3 - u * u * v * v * v;
};

function heartOutline() {
  const s = canvasSet();
  const inside = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID && heartF(x, y) <= 0;
  s.each((x, y) => {
    if (!inside(x, y)) return;
    const edge = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
    if (edge) s.add(x, y, 0.85, 'body');
  });
  // a crack down the middle
  s.line(8, 4, 7, 7, 0.5, 'crack').line(7, 7, 9, 10, 0.5, 'crack').line(9, 10, 8, 13, 0.5, 'crack');
  return s.list();
}

function heartFull() {
  const s = canvasSet();
  s.each((x, y) => { if (heartF(x, y) <= 0) s.add(x, y, 1, 'core'); });
  s.remove(5, 5).add(5, 5, 0.5, 'core'); // highlight
  s.add(15, 0, 0.8, 'spark').add(1, 0, 0.6, 'spark').add(16, 12, 0.5, 'spark');
  return s.list();
}

// ------------------------------------------------------------------ sets
export const ICON_SETS = {
  celestial: { label: 'Moon → Sun', off: moon, on: sun, offColor: '#6d84ff', onColor: '#ffa630', aria: 'Light mode' },
  power:     { label: 'Power → Bolt', off: powerOff, on: bolt, offColor: '#ff4d6d', onColor: '#2ff0a0', aria: 'Power' },
  sound:     { label: 'Mute → Sound', off: muted, on: loud, offColor: '#a07bff', onColor: '#2fd0ff', aria: 'Sound' },
  heart:     { label: 'Broken → Love', off: heartOutline, on: heartFull, offColor: '#7f8bff', onColor: '#ff4f8b', aria: 'Love' },
};

// ------------------------------------------------------------------ pairing
// Sort both icons by a sweep angle around the centre and zip them proportionally. Neighbours
// in angle travel together, so the morph reads as one coherent swirl rather than noise.
// Surplus pixels in the bigger icon share a partner on the other side that fades to 0.
const sweepKey = c => {
  const a = Math.atan2(c.y - CENTER, c.x - CENTER);
  const wrapped = (a + Math.PI * 0.75 + Math.PI * 4) % (Math.PI * 2);
  return wrapped + Math.hypot(c.x - CENTER, c.y - CENTER) * 1e-3;
};
const rand = (a, b) => a + Math.random() * (b - a);

export function buildPairs(offIcon, onIcon) {
  const A = [...offIcon].sort((p, q) => sweepKey(p) - sweepKey(q));
  const B = [...onIcon].sort((p, q) => sweepKey(p) - sweepKey(q));
  const aBig = A.length >= B.length;
  const big = aBig ? A : B, small = aBig ? B : A;
  const out = [];
  let prev = -1;
  for (let i = 0; i < big.length; i++) {
    const j = Math.floor(i * small.length / big.length);
    const partner = { ...small[j], b: j === prev ? 0 : small[j].b };
    prev = j;
    const [a, b] = aBig ? [big[i], partner] : [partner, big[i]];
    out.push({
      a, b,
      // pixels on the leading (right) edge depart first when the knob travels right
      delay: 0.04 + (1 - a.x / (GRID - 1)) * 0.26 + rand(0, 0.06),
      curl: rand(-1, 1) * 15 + (a.y - CENTER) * 0.9,
      lift: rand(2, 12),
      k: rand(250, 470),
      drag: rand(0.004, 0.016),
      phase: rand(0, Math.PI * 2),
      rate: rand(1.4, 3.3),
      x: 0, y: 0, vx: 0, vy: 0, ready: false,
    });
  }
  return out;
}
