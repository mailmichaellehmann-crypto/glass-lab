// Tiny procedural sound kit: no samples, everything synthesised with WebAudio.
//   ping(on)   glass "tink" when the switch is triggered (brighter for "on")
//   land(v)    soft thud + shimmer when the knob arrives
//   air(speed) filtered-noise whoosh that follows the knob velocity while it moves

// iOS Safari only lets Web Audio start inside a *finished* gesture (touchend / click / keydown), not on
// pointerdown, where the controls first ask for sound. So every kit is also woken up on those events:
// its context is created or resumed and a silent sample is played, which unlocks it for good.
const kits = new Set();
const unlock = () => {
  for (const k of kits) {
    if (!k.enabled) continue;
    const ctx = k._ensure();
    if (!ctx || k._primed) continue;
    const b = ctx.createBuffer(1, 1, 22050), src = ctx.createBufferSource();
    src.buffer = b; src.connect(ctx.destination); src.start(0);
    k._primed = true;
  }
};
for (const ev of ['touchend', 'click', 'keydown', 'pointerup']) addEventListener(ev, unlock, { capture: true, passive: true });

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.5;
    kits.add(this);
  }

  _ensure() {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain();
      this.master.gain.value = this.volume * 0.6;
      this.master.connect(ctx.destination);

      // looping noise → bandpass → gain, used for the whoosh
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      this.airFilter = ctx.createBiquadFilter();
      this.airFilter.type = 'bandpass';
      this.airFilter.Q.value = 1.4;
      this.airFilter.frequency.value = 900;
      this.airGain = ctx.createGain();
      this.airGain.gain.value = 0;
      src.connect(this.airFilter).connect(this.airGain).connect(this.master);
      src.start();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v * 0.6, this.ctx.currentTime, 0.05);
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on && this.airGain) this.airGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
  }

  _partial(freq, gain, decay, t0, type = 'sine') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + decay + 0.05);
  }

  ping(on) {
    const ctx = this._ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    const f = on ? 1760 : 1318.5;
    // inharmonic partials of a small glass bar
    this._partial(f, 0.22, 0.55, t);
    this._partial(f * 2.76, 0.08, 0.32, t);
    this._partial(f * 5.4, 0.035, 0.18, t);
  }

  // a short detent click, pitch 0..1
  tick(pitch = 0.5, gain = 1) {
    const ctx = this._ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    this._partial(1800 + pitch * 1600, 0.05 * gain, 0.05, t);
    this._partial(5200 + pitch * 2000, 0.015 * gain, 0.03, t);
  }

  // a water drop: a quick downward pitch sweep with a bubbly overtone
  drip(pitch = 0.5, gain = 1) {
    const ctx = this._ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    const f0 = 900 + pitch * 700;
    o.type = 'sine';
    o.frequency.setValueAtTime(f0 * 0.55, t);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.035);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16 * gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.25);
  }

  // a soft key click for typing, pitch varies per character
  key(pitch = 0.5) {
    const ctx = this._ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    this._partial(2400 + pitch * 1400, 0.035, 0.03, t);
    this._partial(700 + pitch * 300, 0.04, 0.05, t);
  }

  // a soft bell-like note (a music box / glass marimba): freq in Hz, dur in s
  note(freq, gain = 1, dur = 0.6) {
    const ctx = this._ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    this._partial(freq, 0.16 * gain, dur, t);
    this._partial(freq * 2, 0.05 * gain, dur * 0.6, t);
    this._partial(freq * 3.01, 0.025 * gain, dur * 0.35, t);
    this._partial(freq * 4.2, 0.012 * gain, dur * 0.2, t);
  }

  land(strength = 1) {
    const ctx = this._ensure(); if (!ctx) return;
    const t = ctx.currentTime;
    const s = Math.min(1, strength);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35 * s, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.25);
    this._partial(3520, 0.03 * s, 0.4, t + 0.01);
  }

  air(speed) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, speed / 6);
    this.airGain.gain.setTargetAtTime(v * v * 0.12, t, 0.04);
    this.airFilter.frequency.setTargetAtTime(500 + v * 2200, t, 0.05);
  }
}
