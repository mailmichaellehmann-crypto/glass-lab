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
