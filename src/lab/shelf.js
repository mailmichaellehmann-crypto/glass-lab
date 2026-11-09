// The lab shelf: glass beads under the toggle. Each bead shows the real control, rendered by its
// own shader in miniature: a still taken at load, and on hover the live control performing on
// autopilot (silent). Clicking floods the screen from that bead into the full control. Only one
// live miniature and one full control ever run at a time.

import { EXPERIMENTS } from './registry.js';
import { PREVIEWS } from './previews.js';
import { reducedMotion } from './kit.js';

const BEAD = 38, RENDER = 160; // miniatures render at 160px and are scaled into the 38px bead
// Stills are cached across visits. Bump when a control's look changes so the cache is retaken.
const STILLS_VERSION = 'v12';
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
    const b = document.createElement('button');
    b.className = 'bead';
    b.style.setProperty('--accent', exp.accent);
    b.style.setProperty('--live-scale', BEAD / RENDER);
    b.setAttribute('aria-label', `${exp.name}: ${exp.line}`);
    // two stills of the real control, one per theme, cross-faded live with the toggle's theme
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const mk = cls => { const c = document.createElement('canvas'); c.className = cls; c.width = c.height = BEAD * dpr; b.appendChild(c); return c; };
    const cvDark = mk('still-dark'), cvLight = mk('still-light');
    li.appendChild(b);
    list.appendChild(li);
    const bead = { exp, i, b, s: BEAD * dpr, dark: cvDark.getContext('2d'), light: cvLight.getContext('2d'), lightEl: cvLight };
    beads.push(bead);
    PREVIEWS[exp.id](bead.dark, i * 1.7, bead.s); // placeholder until the real stills are ready
    PREVIEWS[exp.id](bead.light, i * 1.7, bead.s);

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
  const dpr = Math.min(devicePixelRatio || 1, 2);
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
    }
    requestAnimationFrame(followTheme);
  };
  requestAnimationFrame(followTheme);

  document.body.appendChild(shelf);
  const stage = createStage(beads);
  return { shelf, stage };
}

// ------------------------------------------------------------------ the stage
function createStage(beads) {
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
    el.style.setProperty('--bg', exp.bg);
    el.style.setProperty('--accent', exp.accent);
    el.classList.toggle('bright', isBright(exp.bg));
    title.querySelector('.n').textContent = `${String(i + 1).padStart(2, '0')} / ${String(beads.length).padStart(2, '0')}`;
    title.querySelector('h2').textContent = exp.name;
    history.replaceState(null, '', `#lab/${exp.id}`);
    title.querySelector('p').textContent = exp.how;
    el.querySelector('.lab-hint').textContent = (matchMedia('(hover: none)').matches ? exp.hint.replace(/^Click/, 'Tap').replace('click', 'tap') : exp.hint);
    title.classList.remove('faded');
    clearTimeout(titleTimer);
    titleTimer = setTimeout(() => title.classList.add('faded'), 5200);
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    el.classList.add('loading');
    try {
      const mod = await exp.load();
      if (my !== token) return;
      const host = document.createElement('div');
      host.className = 'lab-host';
      root.appendChild(host);
      inst = await mod.mount(host, { reducedMotion: reducedMotion() });
      if (my !== token) { inst?.dispose(); host.remove(); return; }
      requestAnimationFrame(() => host.classList.add('in'));
    } catch (err) {
      console.error(err);
      root.innerHTML = `<p class="lab-error">This experiment couldn’t start here (it needs WebGL2 or a newer browser).</p>`;
    } finally {
      if (my === token) el.classList.remove('loading');
    }
  }

  function unmount() {
    token++;
    inst?.dispose();
    inst = null;
    root.replaceChildren();
  }

  function open(i, btn) {
    if (current >= 0) return go(i);
    setOrigin(btn);
    window.dispatchEvent(new Event('lab:open'));
    document.body.classList.add('lab-open');
    el.classList.add('open');
    mount(i);
    el.querySelector('.lab-back').focus({ preventScroll: true });
  }

  function go(i) {
    i = (i + beads.length) % beads.length;
    if (i === current) return;
    unmount();
    setOrigin(beads[i].b);
    mount(i);
  }

  function close() {
    if (current < 0) return;
    const was = current;
    unmount();
    current = -1;
    setOrigin(beads[was].b);
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

  return { open, close, go };
}

function isBright(hex) {
  const [r, g, b] = [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16));
  return (r * 0.299 + g * 0.587 + b * 0.114) > 150;
}
