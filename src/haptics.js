// Haptics for every platform.
//   Android & co: navigator.vibrate.
//   iPhone: Safari has no vibrate API, but toggling a native switch (<input type="checkbox" switch>, iOS 18+)
//   plays the system's light haptic tick. A hidden one is clicked through its label.
// Only after the user has touched the page, never in shelf miniatures (callers pass that in).
let label = null, last = 0;
const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function tick() {
  if (!label) {
    label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    const sw = document.createElement('input');
    sw.type = 'checkbox'; sw.setAttribute('switch', ''); sw.tabIndex = -1;
    label.appendChild(sw);
    document.body.appendChild(label);
  }
  const now = performance.now();
  if (now - last < 35) return;                       // the engine can't tick faster anyway
  last = now;
  label.click();
}

export function buzz(pattern) {
  if (!navigator.userActivation?.hasBeenActive) return;
  if (navigator.vibrate && !ios) { navigator.vibrate(pattern); return; }
  if (!ios) return;
  // a pattern [on, off, on, ...]: one tick at the start of each "on"
  const p = Array.isArray(pattern) ? pattern : [pattern];
  let t = 0;
  p.forEach((ms, i) => { if (i % 2 === 0) (t ? setTimeout(tick, t) : tick()); t += ms; });
}
