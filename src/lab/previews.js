// Miniatures for the shelf beads: each control drawn small, in the toggle's glass language.
// (ctx, t, s): s = canvas size in px. Only the hovered bead animates.

const TAU = Math.PI * 2;

function base(c, s) {
  const g = c.createRadialGradient(s * 0.5, s * 0.35, 0, s * 0.5, s * 0.5, s * 0.75);
  g.addColorStop(0, '#1d1d22'); g.addColorStop(1, '#08080a');
  c.fillStyle = g; c.fillRect(0, 0, s, s);
}
function glow(c, x, y, r, col, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0));
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}
function pill(c, x, y, w, h) {
  const r = h / 2;
  c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, r);
}

export const PREVIEWS = {
  blank(c, t, s) { base(c, s); },
  bloom(c, t, s) {
    base(c, s);
    const cols = ['255,181,71', '255,122,69', '255,95,138', '197,139,255', '127,178,255', '61,255,168'];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 3, x = s / 2 + Math.cos(a) * s * 0.3, y = s / 2 + Math.sin(a) * s * 0.3;
      c.strokeStyle = 'rgba(255,255,255,0.25)'; c.lineWidth = s * 0.02; c.beginPath(); c.moveTo(s / 2, s / 2); c.lineTo(x, y); c.stroke();
      c.fillStyle = `rgba(${cols[i]},0.45)`; c.beginPath(); c.arc(x, y, s * 0.08, 0, TAU); c.fill();
    }
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = s * 0.014; c.beginPath(); c.arc(s / 2, s / 2, s * 0.12, 0, TAU); c.stroke();
  },
  beads(c, t, s) {
    base(c, s);
    c.strokeStyle = 'rgba(255,154,213,0.7)'; c.lineWidth = s * 0.012; c.beginPath(); c.moveTo(s * 0.08, s / 2); c.lineTo(s * 0.92, s / 2); c.stroke();
    [0.3, 0.5, 0.7].forEach(x => { pill(c, s * x, s / 2, s * 0.17, s * 0.1); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.5)'; c.stroke(); });
  },
  copy(c, t, s) {
    base(c, s);
    pill(c, s / 2, s * 0.58, s * 0.8, s * 0.18); c.fillStyle = '#060607'; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(s * 0.18, s * 0.565, s * 0.36, s * 0.03);
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = s * 0.014;
    c.beginPath(); c.arc(s * 0.74, s * 0.58, s * 0.1, 0, TAU); c.stroke();
    c.beginPath(); c.arc(s * 0.62, s * 0.36, s * 0.08, 0, TAU); c.stroke();
    glow(c, s * 0.62, s * 0.36, s * 0.15, 'rgba(143,184,255,A)', 0.4);
  },
  pin(c, t, s) {
    base(c, s);
    pill(c, s / 2, s / 2, s * 0.8, s * 0.26); c.fillStyle = '#060607'; c.fill();
    for (let i = 0; i < 4; i++) {
      const x = s * (0.23 + i * 0.18);
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = s * 0.012; c.beginPath(); c.roundRect(x - s * 0.07, s * 0.41, s * 0.14, s * 0.18, s * 0.04); c.stroke();
      if (i < 3) { c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(x - s * 0.02, s * 0.48, s * 0.04, s * 0.04); }
    }
    glow(c, s * 0.77, s / 2, s * 0.15, 'rgba(155,140,255,A)', 0.4);
  },

  picker(c, t, s) {
    base(c, s);
    c.fillStyle = '#060607'; c.beginPath(); c.roundRect(s * 0.18, s * 0.22, s * 0.64, s * 0.56, s * 0.1); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.75)';
    for (const [y, a] of [[0.33, 0.25], [0.5, 1], [0.67, 0.25]]) { c.globalAlpha = a; c.fillRect(s * 0.3, s * y - s * 0.02, s * 0.14, s * 0.04); c.fillRect(s * 0.56, s * y - s * 0.02, s * 0.14, s * 0.04); }
    c.globalAlpha = 1;
    glow(c, s * 0.5, s * 0.5, s * 0.4, 'rgba(255,179,107,A)', 0.25);
    pill(c, s / 2, s / 2, s * 0.76, s * 0.16); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = s * 0.014; c.stroke();
  },
  commit(c, t, s) {
    base(c, s);
    pill(c, s / 2, s / 2, s * 0.84, s * 0.22); c.fillStyle = '#060607'; c.fill();
    glow(c, s * 0.3, s / 2, s * 0.3, 'rgba(255,106,136,A)', 0.35);
    c.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = 0; i < 3; i++) { const x = s * (0.5 + i * 0.08); c.fillRect(x, s * 0.47, s * 0.03, s * 0.06); }
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = s * 0.014; c.beginPath(); c.arc(s * 0.27, s / 2, s * 0.13, 0, TAU); c.stroke();
  },
  lens(c, t, s) {
    base(c, s);
    pill(c, s / 2, s / 2, s * 0.86, s * 0.26); c.fillStyle = '#060607'; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 4; i++) c.fillRect(s * (0.2 + i * 0.09), s * 0.48, s * 0.05, s * 0.04);
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = s * 0.015;
    c.beginPath(); c.arc(s * 0.56, s * 0.5, s * 0.17, 0, TAU); c.stroke();
  },
  bridge(c, t, s) {
    base(c, s);
    pill(c, s / 2, s / 2, s * 0.84, s * 0.16); c.fillStyle = '#060607'; c.fill();
    const g = c.createLinearGradient(s * 0.3, 0, s * 0.7, 0);
    g.addColorStop(0, '#5b7bff'); g.addColorStop(1, '#ffa630');
    c.fillStyle = g; c.fillRect(s * 0.3, s * 0.485, s * 0.4, s * 0.03);
    for (const x of [0.3, 0.7]) { c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = s * 0.015; c.beginPath(); c.arc(s * x, s / 2, s * 0.12, 0, TAU); c.stroke(); }
  },
  stars(c, t, s) {
    base(c, s);
    const star = (x, y, r) => { c.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.48 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); };
    [0.27, 0.5, 0.73].forEach((x, i) => {
      star(s * x, s / 2, s * 0.12);
      if (i < 2) { glow(c, s * x, s / 2, s * 0.2, 'rgba(255,190,60,A)', 0.4); star(s * x, s / 2, s * 0.12); c.fillStyle = '#ffc23a'; c.fill(); }
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = s * 0.012; c.stroke();
    });
  },
  drop(c, t, s) {
    base(c, s);
    c.fillStyle = '#060607'; c.beginPath(); c.arc(s * 0.5, s * 0.58, s * 0.2, 0, TAU); c.fill();
    const g = c.createRadialGradient(s * 0.45, s * 0.5, 0, s * 0.5, s * 0.56, s * 0.17);
    g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(140,220,255,0.15)');
    c.fillStyle = g; c.beginPath(); c.ellipse(s * 0.5, s * 0.58, s * 0.17, s * 0.13, 0, 0, TAU); c.fill();
  },
  pour(c, t, s) {
    base(c, s);
    const lv = 0.55 + 0.25 * Math.sin(t * 1.2);
    const w = s * 0.74, h = s * 0.2, x0 = s / 2 - w / 2;
    glow(c, x0 + w * lv, s / 2, s * 0.4, 'rgba(255,166,48,A)', 0.35);
    pill(c, s / 2, s / 2, w, h); c.fillStyle = '#060607'; c.fill();
    c.save(); pill(c, s / 2, s / 2, w - 4, h - 4); c.clip();
    const lg = c.createLinearGradient(x0, 0, x0 + w * lv, 0);
    lg.addColorStop(0, '#7a5cff'); lg.addColorStop(1, '#ffc27a');
    c.fillStyle = lg;
    c.beginPath(); c.moveTo(x0, s / 2 - h); c.lineTo(x0 + w * lv + Math.sin(t * 5) * 3, s / 2 - h); c.lineTo(x0 + w * lv - Math.sin(t * 5) * 3, s / 2 + h); c.lineTo(x0, s / 2 + h); c.fill();
    c.restore();
    pill(c, s / 2, s / 2, w, h); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = s * 0.012; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(x0 + h * 0.4, s / 2 - h * 0.32, w - h * 0.8, s * 0.012);
  },
  hold(c, t, s) {
    base(c, s);
    const k = (t * 0.45) % 1.3, prog = Math.min(1, k);
    const w = s * 0.66, h = s * 0.3;
    pill(c, s / 2, s / 2, w, h); c.fillStyle = 'rgba(255,255,255,0.07)'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = s * 0.012; c.stroke();
    c.save(); pill(c, s / 2, s / 2, w + s * 0.06, h + s * 0.06); c.clip();
    c.strokeStyle = '#3dffa8'; c.lineWidth = s * 0.03; c.lineCap = 'round';
    c.beginPath(); c.ellipse(s / 2, s / 2, w * 0.52, h * 0.56, -Math.PI / 2, 0, TAU * prog); c.stroke();
    c.restore();
    glow(c, s / 2, s / 2, s * 0.45, 'rgba(61,255,168,A)', 0.25 * prog);
    c.fillStyle = prog >= 1 ? '#3dffa8' : 'rgba(255,255,255,0.8)';
    const p = s * 0.03;
    if (prog >= 1) { c.fillRect(s * 0.42, s * 0.5, p, p); c.fillRect(s * 0.45, s * 0.53, p, p); c.fillRect(s * 0.48, s * 0.5, p, p); c.fillRect(s * 0.51, s * 0.47, p, p); c.fillRect(s * 0.54, s * 0.44, p, p); }
    else for (let i = 0; i < 4; i++) c.fillRect(s * (0.4 + i * 0.06), s * 0.485, p, p);
  },
  dial(c, t, s) {
    base(c, s);
    const v = 0.5 + 0.35 * Math.sin(t * 0.8);
    const R = s * 0.36;
    for (let i = 0; i < 28; i++) {
      const a = Math.PI * 0.75 + i / 27 * Math.PI * 1.5;
      const on = i / 27 <= v;
      c.fillStyle = on ? `hsl(${210 - i / 27 * 190},95%,62%)` : 'rgba(255,255,255,0.12)';
      c.fillRect(s / 2 + Math.cos(a) * R - s * 0.012, s / 2 + Math.sin(a) * R - s * 0.012, s * 0.025, s * 0.025);
    }
    const g = c.createRadialGradient(s * 0.44, s * 0.4, 0, s / 2, s / 2, s * 0.26);
    g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0.04)');
    c.fillStyle = g; c.beginPath(); c.arc(s / 2, s / 2, s * 0.25, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = s * 0.012; c.stroke();
    const a = Math.PI * 0.75 + v * Math.PI * 1.5;
    c.fillStyle = '#fff'; c.beginPath(); c.arc(s / 2 + Math.cos(a) * s * 0.18, s / 2 + Math.sin(a) * s * 0.18, s * 0.022, 0, TAU); c.fill();
  },
  tabs(c, t, s) {
    base(c, s);
    const w = s * 0.78, h = s * 0.24, x0 = s / 2 - w / 2;
    pill(c, s / 2, s / 2, w, h); c.fillStyle = '#060607'; c.fill();
    const k = (Math.sin(t * 1.1) + 1) / 2;
    const cx = x0 + w * (0.2 + 0.6 * k), stretch = Math.abs(Math.cos(t * 1.1)) * s * 0.08;
    glow(c, cx, s / 2, s * 0.3, 'rgba(142,160,255,A)', 0.3);
    pill(c, cx, s / 2, w * 0.3 + stretch, h * 0.8 - stretch * 0.3);
    c.fillStyle = 'rgba(200,210,255,0.16)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = s * 0.012; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 3; i++) c.fillRect(x0 + w * (0.2 + i * 0.3) - s * 0.03, s / 2 - s * 0.01, s * 0.06, s * 0.02);
  },
};
