// The lab shelf: glass beads under the toggle. Each bead shows the real control, rendered by its
// own shader in miniature: a still taken at load, and on hover the live control performing on
// autopilot (silent). Clicking floods the screen from that bead into the full control. Only one
// live miniature and one full control ever run at a time.

import { EXPERIMENTS } from './registry.js';
import { PREVIEWS } from './previews.js';
import { reducedMotion } from './kit.js';

const BEAD = 38, RENDER = 160; // miniatures render at 160px and are scaled into the 38px bead
// Stills are cached across visits. Bump when a control's look changes so the cache is retaken.
const STILLS_VERSION = 'v42';
const wait = ms => new Promise(r => setTimeout(r, ms));

export function createShelf() {
  const shelf = document.createElement('nav');
  shelf.className = 'shelf';
  shelf.setAttribute('aria-label', 'Lab experiments');
  shelf.innerHTML = `<div class="shelf-caption" aria-hidden="true"><span class="n"></span><b></b><i></i></div><ul></ul>`;
  const list = shelf.querySelector('ul');
  const cap = shelf.querySelector('.shelf-caption');
  const beads = [];
  const calm = reducedMotion();

  EXPERIMENTS.forEach((exp, i) => {
    const li = document.createElement('li');
    li.style.setProperty('--i', i);
    const b = document.createElement('button');
    b.className = 'bead';
    b.style.setProperty('--accent', exp.accent);
    b.style.setProperty('--live-scale', BEAD / RENDER);
    b.setAttribute('aria-label', `${exp.name}: ${exp.line}`);
    // two stills of the real control, one per theme, cross-faded live with the toggle's theme
    const dpr = Math.min(devicePixelRatio || 1, 3);
    const mk = cls => { const c = document.createElement('canvas'); c.className = cls; c.width = c.height = BEAD * dpr; b.appendChild(c); return c; };
    const cvDark = mk('still-dark'), cvLight = mk('still-light');
    li.appendChild(b);
    list.appendChild(li);
    const bead = { exp, i, b, li, cx: 0, cy: 0, s: BEAD * dpr, dark: cvDark.getContext('2d'), light: cvLight.getContext('2d'), lightEl: cvLight };
    beads.push(bead);
    const placeholder = PREVIEWS[exp.id] || PREVIEWS.blank; // until the real stills are ready
    placeholder(bead.dark, i * 1.7, bead.s);
    placeholder(bead.light, i * 1.7, bead.s);

    const show = () => {
      cap.querySelector('.n').textContent = String(i + 1).padStart(2, '0');
      cap.querySelector('b').textContent = exp.name;
      cap.querySelector('i').textContent = exp.line;
      shelf.classList.add('captioned');
      if (!calm) startLive(bead);
    };
    const hide = () => { shelf.classList.remove('captioned'); stopLive(bead); };
    b.addEventListener('pointerenter', show);
    b.addEventListener('focus', () => { if (b.matches(':focus-visible')) show(); });
    b.addEventListener('pointerleave', hide);
    b.addEventListener('blur', hide);
    b.addEventListener('click', () => { stopLive(); stage.open(i, b); });
  });

  // ---- live miniature on hover: the real control, on autopilot, inside the bead
  let live = null;
  async function startLive(bead) {
    if (live?.bead === bead) return;
    stopLive();
    const me = live = { bead, inst: null, host: document.createElement('div') };
    me.host.className = 'bead-live';
    bead.b.appendChild(me.host);
    try {
      const mod = await bead.exp.load();
      if (live !== me) { me.host.remove(); return; }
      me.inst = await mod.mount(me.host, { reducedMotion: false, thumb: bead.exp.thumb, demo: true });
      if (live !== me) { me.inst.dispose(); me.host.remove(); return; }
      requestAnimationFrame(() => me.host.classList.add('in'));
    } catch { me.host.remove(); }
  }
  function stopLive(bead) {
    if (!live || (bead && live.bead !== bead)) return;
    const me = live; live = null;
    me.host.classList.remove('in');
    setTimeout(() => { me.inst?.dispose(); me.host.remove(); }, 260);
  }

  // ---- stills: one offscreen render per control; dark and light are taken from the very same
  // frame (so cross-fading them never ghosts), then cached so later visits need no rendering
  const dpr = Math.min(devicePixelRatio || 1, 3);
  const cacheKey = id => `glass-lab:still:${STILLS_VERSION}:${id}:${dpr}`;
  const drawURL = (ctx, url) => new Promise(res => {
    const img = new Image();
    img.onload = () => { ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height); res(true); };
    img.onerror = () => res(false);
    img.src = url;
  });
  async function loadCached(bead) {
    try {
      const c = JSON.parse(localStorage.getItem(cacheKey(bead.exp.id)) || 'null');
      if (!c) return false;
      return (await drawURL(bead.dark, c.dark)) && (await drawURL(bead.light, c.light));
    } catch { return false; }
  }
  const idle = () => new Promise(r => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 1200 }) : setTimeout(r, 200)));
  async function shoot(bead) {
    const host = document.createElement('div');
    host.className = 'bead-render';
    document.body.appendChild(host);
    try {
      const mod = await bead.exp.load();
      // stills show the calm, legible resting state, unless a control asks to be caught mid-action
      const still = bead.exp.thumb.still || {};
      const inst = await mod.mount(host, { reducedMotion: false, thumb: { ...bead.exp.thumb }, demo: !!still.demo });
      await wait(still.wait || 700);
      const c = host.querySelector('canvas');
      if (c?.glassCapture?.(0, bead.dark, bead.s) && c.glassCapture(1, bead.light, bead.s)) {
        try { localStorage.setItem(cacheKey(bead.exp.id), JSON.stringify({ dark: bead.dark.canvas.toDataURL('image/png'), light: bead.light.canvas.toDataURL('image/png') })); } catch { /* storage full */ }
      }
      inst.dispose();
    } catch { /* keep the placeholder */ }
    host.remove();
  }
  (async () => {
    const missing = [];
    for (const bead of beads) if (!(await loadCached(bead))) missing.push(bead);
    for (const bead of missing) {
      await idle();
      while (document.body.classList.contains('lab-open') || document.hidden) await wait(500); // never compete with a running control
      await shoot(bead);
    }
  })();

  // follow the toggle's theme frame by frame (it is continuous while the knob travels)
  let shownTheme = -1;
  const followTheme = () => {
    const th = window.glassTheme ?? (document.body.classList.contains('light') ? 1 : 0);
    if (Math.abs(th - shownTheme) > 0.002) {
      shownTheme = th;
      for (const b of beads) b.lightEl.style.opacity = th.toFixed(3);
      stage?.theme(th);
    }
    requestAnimationFrame(followTheme);
  };
  let stage = null;
  requestAnimationFrame(followTheme);

  // ---- one light: the toggle's strip lights the beads. Each bead catches it on the side facing the
  // strip, stronger the nearer it is, in the strip's colour; it follows the light as the knob travels.
  const measure = () => { for (const bd of beads) { const r = bd.b.getBoundingClientRect(); bd.cx = r.left + r.width / 2; bd.cy = r.top + r.height / 2; } litSig = ''; };
  let litSig = '';
  const followLight = () => {
    const L = window.glassLight;
    if (L && !document.body.classList.contains('lab-open')) {
      const sig = `${L.x | 0}:${L.y | 0}:${(L.led * 40) | 0}:${L.c.map(v => (v * 64) | 0)}`;
      if (sig !== litSig) {
        litSig = sig;
        const rgb = L.c.map(v => Math.round(Math.min(1, v) * 255)).join(',');
        for (const bd of beads) {
          const dx = L.x - bd.cx, dy = L.y - bd.cy, d = Math.hypot(dx, dy) || 1;
          const lit = Math.min(1, L.led * Math.exp(-d / 210) * 1.5);
          bd.b.style.setProperty('--lit-c', `rgba(${rgb},${(lit * 0.85).toFixed(3)})`);
          bd.b.style.setProperty('--lit-g', `rgba(${rgb},${(lit * 0.5).toFixed(3)})`);
          bd.b.style.setProperty('--lx', `${(50 + (dx / d) * 46).toFixed(1)}%`);
          bd.b.style.setProperty('--ly', `${(50 + (dy / d) * 46).toFixed(1)}%`);
        }
      }
    }
    requestAnimationFrame(followLight);
  };
  requestAnimationFrame(followLight);

  // ---- the shockwave reaches the shelf: every bead is pushed outward and flares as the front passes it,
  // timed to the ring the shader draws (same origin, same speed)
  const ripple = (x, y, speed, strength = 1) => {
    if (calm) return;
    for (const bd of beads) {
      const dx = bd.cx - x, dy = bd.cy - y, d = Math.hypot(dx, dy) || 1;
      const a = Math.min(1, strength) * Math.exp(-d / 520);
      if (a < 0.04) continue;
      const ux = (dx / d) * a, uy = (dy / d) * a;
      bd.li.animate([
        { transform: 'none', filter: 'brightness(1)' },
        { transform: `translate(${ux * 7}px, ${uy * 7}px) scale(${1 + 0.12 * a})`, filter: `brightness(${1 + 1.1 * a})`, offset: 0.22 },
        { transform: `translate(${-ux * 2.5}px, ${-uy * 2.5}px) scale(${1 - 0.03 * a})`, filter: 'brightness(1)', offset: 0.58 },
        { transform: 'none', filter: 'brightness(1)' },
      ], { duration: 640, delay: (d / speed) * 1000, easing: 'cubic-bezier(.3,.6,.3,1)' });
    }
  };
  window.addEventListener('glass:wave', e => { measure(); ripple(e.detail.x, e.detail.y, e.detail.speed, 0.45 + e.detail.strength); });

  document.body.appendChild(shelf);
  // as many even rows as the width needs: one long row on a wide screen, two or three on narrow ones
  const fitRows = () => {
    const n = beads.length, avail = Math.max(200, innerWidth - 36);
    const rows = Math.max(1, Math.ceil((n * 50 - 12) / avail));
    const cols = Math.ceil(n / rows);
    document.documentElement.style.setProperty('--cols', cols);
    document.documentElement.style.setProperty('--rows', Math.ceil(n / cols));
  };
  fitRows();
  addEventListener('resize', () => { fitRows(); requestAnimationFrame(measure); });
  requestAnimationFrame(measure); setTimeout(measure, 1400); // again once the entrance has settled
  stage = createStage(beads, { ripple, measure });
  return { shelf, stage };
}

// ------------------------------------------------------------------ the stage
function createStage(beads, { ripple, measure }) {
  const el = document.createElement('section');
  el.className = 'lab-stage';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="lab-root"></div>
    <button class="lab-back" aria-label="Back to the toggle"><span>←</span></button>
    <header class="lab-title"><span class="n"></span><h2></h2><p></p></header>
    <nav class="lab-nav">
      <button class="prev" aria-label="Previous experiment">‹</button>
      <div class="dots"></div>
      <button class="next" aria-label="Next experiment">›</button>
    </nav>
    <div class="lab-hint" aria-hidden="true"></div>
    <div class="lab-loading"></div>`;
  document.body.appendChild(el);
  // the flood has a wavefront: a white-hot line with the control's light trailing behind it, riding the
  // edge of the opening circle (same origin, radius and timing as the clip-path)
  const wave = document.createElement('div');
  wave.className = 'lab-wave';
  document.body.appendChild(wave);
  const canWave = !!window.CSS?.registerProperty && !reducedMotion();
  const flood = opening => {
    if (!canWave) return;
    const R = 1.5 * Math.max(innerWidth, innerHeight);
    wave.style.setProperty('--ox', origin[0] + 'px'); wave.style.setProperty('--oy', origin[1] + 'px');
    wave.style.setProperty('--accent', el.style.getPropertyValue('--accent'));
    wave.getAnimations().forEach(a => a.cancel());
    wave.animate([{ '--wave-r': opening ? '0px' : R + 'px', opacity: 1 }, { '--wave-r': opening ? R + 'px' : '0px', opacity: 1 }],
      { duration: opening ? 900 : 800, easing: 'cubic-bezier(.7, 0, .2, 1)' });
  };
  const root = el.querySelector('.lab-root');
  const title = el.querySelector('.lab-title');
  const dots = el.querySelector('.dots');
  beads.forEach((bead, i) => {
    const d = document.createElement('button');
    d.style.setProperty('--accent', bead.exp.accent);
    d.setAttribute('aria-label', bead.exp.name);
    d.addEventListener('click', () => go(i));
    dots.appendChild(d);
  });

  let current = -1, inst = null, origin = null, token = 0, titleTimer = 0;

  // the chrome (title, back, nav, hint) and the stage colour follow the theme continuously
  const mixc = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
  const rgba = (c, a) => `rgba(${c.map(Math.round).join(',')},${a.toFixed(3)})`;
  function theme(t) {
    const ink = mixc([255, 255, 255], [20, 16, 12], t);
    el.style.setProperty('--chrome', rgba(ink, 0.88 - 0.03 * t));
    el.style.setProperty('--chrome-dim', rgba(ink, 0.45));
    el.style.setProperty('--chrome-bg', rgba(ink, 0.08 - 0.02 * t));
    el.style.setProperty('--bg', rgba(mixc([11, 11, 11], [222, 220, 217], t), 1));
    el.style.color = rgba(ink, 0.9);
  }
  theme(window.glassTheme ?? (document.body.classList.contains('light') ? 1 : 0));

  function setOrigin(btn) {
    const r = btn.getBoundingClientRect();
    origin = [r.left + r.width / 2, r.top + r.height / 2];
    el.style.setProperty('--ox', origin[0] + 'px');
    el.style.setProperty('--oy', origin[1] + 'px');
  }

  async function mount(i) {
    const my = ++token;
    const exp = beads[i].exp;
    current = i;
    el.style.setProperty('--accent', exp.accent);
    title.querySelector('.n').textContent = `${String(i + 1).padStart(2, '0')} / ${String(beads.length).padStart(2, '0')}`;
    title.querySelector('h2').textContent = exp.name;
    history.replaceState(null, '', `#lab/${exp.id}`);
    title.querySelector('p').textContent = exp.how;
    if (!reducedMotion()) title.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.2,.7,.2,1)' });
    el.querySelector('.lab-hint').textContent = (matchMedia('(hover: none)').matches ? exp.hint.replace(/^Click/, 'Tap').replace('click', 'tap') : exp.hint);
    title.classList.remove('faded');
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => title.classList.add('faded'), 5200);
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    el.classList.add('loading');
    try {
      const mod = await exp.load();
      if (my !== token) return;
      root.querySelector('.lab-error')?.remove();
      const host = document.createElement('div');
      host.className = 'lab-host';
      root.appendChild(host);
      inst = await mod.mount(host, { reducedMotion: reducedMotion() });
      if (my !== token) { inst?.dispose(); host.remove(); return; }
      requestAnimationFrame(() => host.classList.add('in'));
    } catch (err) {
      console.error(err);
      root.insertAdjacentHTML('beforeend', `<p class="lab-error">This experiment couldn’t start here (it needs WebGL2 or a newer browser).</p>`);
    } finally {
      if (my === token) el.classList.remove('loading');
    }
  }

  function unmount(fade = false) {
    token++;
    const old = inst, hosts = [...root.children];
    inst = null;
    if (fade && !reducedMotion()) {
      // the outgoing control keeps running while it fades, so the switch is a dissolve, not a cut
      hosts.forEach(h => { h.classList.remove('in'); h.classList.add('out'); });
      setTimeout(() => { old?.dispose(); hosts.forEach(h => h.remove()); }, 420);
    } else { old?.dispose(); hosts.forEach(h => h.remove()); }
  }

  function open(i, btn) {
    if (current >= 0) return go(i);
    setOrigin(btn);
    window.dispatchEvent(new Event('lab:open'));
    document.body.classList.add('lab-open');
    el.classList.add('open');
    root.style.setProperty('--dir', 0);
    mount(i);
    flood(true);
    el.querySelector('.lab-back').focus({ preventScroll: true });
  }

  function go(i) {
    const dir = Math.sign(i - current); // before wrapping: "next" from the last one still moves forward
    i = (i + beads.length) % beads.length;
    if (i === current) return;
    root.style.setProperty('--dir', dir); // the old control leaves to one side, the new one arrives from the other
    unmount(true);
    setOrigin(beads[i].b);
    mount(i);
  }

  function close() {
    if (current < 0) return;
    const was = current;
    root.style.setProperty('--dir', 0);
    unmount(true); // the control keeps living inside the closing circle instead of vanishing first
    current = -1;
    setOrigin(beads[was].b);
    flood(false);
    // the light returns into its bead: it catches it, and the neighbours feel it
    setTimeout(() => {
      if (current >= 0 || reducedMotion()) return;
      measure();
      beads[was].li.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.32)', filter: 'brightness(2)', offset: 0.3 }, { transform: 'scale(0.96)', filter: 'brightness(1)', offset: 0.65 }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 620, easing: 'cubic-bezier(.3,.6,.3,1)' });
      ripple(beads[was].cx, beads[was].cy, 520, 0.55);
    }, 640);
    el.classList.remove('open');
    document.body.classList.remove('lab-open');
    window.dispatchEvent(new Event('lab:close'));
    history.replaceState(null, '', location.pathname + location.search);
    beads[was].b.focus({ preventScroll: true });
  }

  el.querySelector('.lab-back').addEventListener('click', close);
  // a control asked to open another one (Lens searches the lab)
  window.addEventListener('lab:goto', e => {
    if (current < 0) return;
    const id = e.detail?.id;
    if (id === 'toggle') return close();
    const i = beads.findIndex(b => b.exp.id === id);
    if (i >= 0) go(i);
  });
  el.querySelector('.prev').addEventListener('click', () => go(current - 1));
  el.querySelector('.next').addEventListener('click', () => go(current + 1));
  window.addEventListener('keydown', e => {
    if (current < 0) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'PageDown' || (e.key === ']')) go(current + 1);
    if (e.key === 'PageUp' || (e.key === '[')) go(current - 1);
  });
  // deep link: #lab/silk
  const fromHash = () => {
    const m = location.hash.match(/^#lab\/(\w+)/);
    const i = m ? beads.findIndex(b => b.exp.id === m[1]) : -1;
    if (i >= 0) open(i, beads[i].b);
  };
  setTimeout(fromHash, 50);

  return { open, close, go, theme };
}
