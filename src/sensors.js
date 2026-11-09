// Optional real-world input: device tilt/shake.

export class Motion {
  constructor() { this.gravity = [0, 1]; this.shake = 0; this.active = false; }

  async start() {
    const DOE = window.DeviceOrientationEvent, DME = window.DeviceMotionEvent;
    if (DOE?.requestPermission) await DOE.requestPermission();
    if (DME?.requestPermission) await DME.requestPermission();
    window.addEventListener('deviceorientation', e => {
      if (e.beta == null) return;
      const b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180;
      this.gravity = [Math.sin(g), Math.sin(b)];
    });
    window.addEventListener('devicemotion', e => {
      const a = e.acceleration;
      if (!a || a.x == null) return;
      this.shake = Math.max(this.shake, Math.hypot(a.x, a.y, a.z));
    });
    this.active = true;
  }

  takeShake() { const s = this.shake; this.shake = 0; return s; }
}
