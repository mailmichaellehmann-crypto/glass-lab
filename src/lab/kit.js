// Shared plumbing for lab experiments: loop, canvas sizing, pointer tracking, GL helpers.

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// rAF loop with dt clamp; pauses itself while the tab is hidden.
export function loop(step) {
  let id = 0, last = 0, running = false;
  const tick = now => {
    if (!running) return;
    const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000 || 1 / 60));
    last = now;
    step(dt, now / 1000);
    id = requestAnimationFrame(tick);
  };
  const vis = () => (document.hidden ? api.stop() : api.start());
  const api = {
    start() { if (running) return; running = true; last = performance.now(); id = requestAnimationFrame(tick); },
    stop() { running = false; cancelAnimationFrame(id); },
    dispose() { api.stop(); document.removeEventListener('visibilitychange', vis); },
  };
  document.addEventListener('visibilitychange', vis);
  return api;
}

// Keeps a canvas sized to its parent with a capped device pixel ratio.
export function autosize(canvas, onResize, maxDpr = 2) {
  const size = { w: 0, h: 0, dpr: 1 };
  const apply = () => {
    // layout size (unaffected by CSS transforms, so scaled thumbnails render at full size)
    const el = canvas.parentElement;
    size.w = Math.max(1, el.clientWidth); size.h = Math.max(1, el.clientHeight);
    size.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    canvas.width = Math.round(size.w * size.dpr);
    canvas.height = Math.round(size.h * size.dpr);
    onResize?.(size);
  };
  const ro = new ResizeObserver(apply);
  ro.observe(canvas.parentElement);
  apply();
  return { size, dispose: () => ro.disconnect() };
}

// Pointer state in CSS px relative to the element, with smoothed velocity.
export function pointer(el, handlers = {}) {
  const p = { x: -1e4, y: -1e4, px: -1e4, py: -1e4, vx: 0, vy: 0, down: false, button: 0, inside: false, type: 'mouse', shift: false, t: 0 };
  const pos = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const move = e => {
    const [x, y] = pos(e);
    const now = performance.now(), dt = Math.max(1, now - p.t) / 1000;
    if (p.inside) { p.vx = p.vx * 0.5 + ((x - p.x) / dt) * 0.5; p.vy = p.vy * 0.5 + ((y - p.y) / dt) * 0.5; }
    p.px = p.x; p.py = p.y; p.x = x; p.y = y; p.t = now; p.inside = true; p.type = e.pointerType; p.shift = e.shiftKey;
    handlers.move?.(p, e);
  };
  const down = e => {
    move(e);
    p.down = true; p.button = e.button; p.vx = p.vy = 0;
    el.setPointerCapture?.(e.pointerId);
    handlers.down?.(p, e);
  };
  const up = e => { if (!p.down) return; p.down = false; handlers.up?.(p, e); };
  const leave = () => { if (!p.down) { p.inside = false; p.x = p.y = -1e4; } };
  const ctx = e => e.preventDefault();
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', leave);
  el.addEventListener('contextmenu', ctx);
  p.dispose = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('pointerleave', leave);
    el.removeEventListener('contextmenu', ctx);
  };
  // decay velocity when the pointer is still
  p.tick = dt => { if (performance.now() - p.t > 60) { p.vx *= Math.exp(-dt * 12); p.vy *= Math.exp(-dt * 12); } };
  return p;
}

export function makeCanvas(root, cls = '') {
  const c = document.createElement('canvas');
  c.className = 'lab-canvas ' + cls;
  root.appendChild(c);
  return c;
}

// ---------------------------------------------------------------- WebGL2
export const FULLSCREEN_VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

export function glProgram(gl, vs, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
    return s;
  };
  const prog = gl.createProgram();
  const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(prog, v); gl.attachShader(prog, f);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.deleteShader(v); gl.deleteShader(f);
  const U = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(prog, i).name.replace(/\[0\]$/, '');
    U[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, U };
}

export function fullscreenTriangle(gl) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  return { draw: () => { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); }, dispose: () => { gl.deleteBuffer(buf); gl.deleteVertexArray(vao); } };
}

// Release every GPU resource the context holds by losing it on purpose.
export function loseContext(gl) { gl.getExtension('WEBGL_lose_context')?.loseContext(); }

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
