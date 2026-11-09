// Tunables. Everything here is live-editable from the panel and persisted to localStorage.

export const DEFAULTS = {
  iconSet: 'celestial',
  offColor: '#6d84ff',
  onColor: '#ffa630',
  intensity: 1.85,
  lightWidth: 0.9,
  path: 'glass',     // 'glass' = strip orbits the knob, 'track' = strip runs inside the track wall
  orbit: true,
  refraction: 38,
  frost: 0.74,
  dispersion: 1,
  swirl: 1.6,
  burst: 0.4,
  glow: 0.62,
  stiffness: 130,
  magnet: true,
  sparks: true,
  shockwave: true,
  stars: true,
  sound: true,
  volume: 0.5,
  // — new world features —
  slosh: true,        // pixels shake loose and slosh inside the glass
  detach: true,       // knob can be pulled out of the track and thrown
  gravity: 2200,
  sunClock: false,    // toggle follows the real sun
  timelapse: false,   // …at one day per 40 s
};

export const SCHEMA = [
  { group: 'Icons' },
  { key: 'iconSet', label: 'Set', type: 'select', options: null /* filled from ICON_SETS */ },
  { key: 'offColor', label: 'Off light', type: 'color' },
  { key: 'onColor', label: 'On light', type: 'color' },
  { group: 'Light' },
  { key: 'intensity', label: 'Intensity', type: 'range', min: 0, max: 3.5, step: 0.01 },
  { key: 'lightWidth', label: 'Strip length', type: 'range', min: 0.15, max: 2.2, step: 0.01 },
  { key: 'path', label: 'Strip path', type: 'select', options: [['glass', 'Around glass'], ['track', 'Track wall']] },
  { key: 'orbit', label: 'Orbit', type: 'checkbox' },
  { key: 'glow', label: 'Icon bloom', type: 'range', min: 0, max: 2, step: 0.01 },
  { group: 'Glass' },
  { key: 'refraction', label: 'Refraction', type: 'range', min: 0, max: 90, step: 0.5 },
  { key: 'frost', label: 'Frost', type: 'range', min: 0, max: 1, step: 0.01 },
  { key: 'dispersion', label: 'Dispersion', type: 'range', min: 0, max: 4, step: 0.01 },
  { group: 'Motion' },
  { key: 'swirl', label: 'Swirl', type: 'range', min: 0, max: 4, step: 0.01 },
  { key: 'burst', label: 'Burst', type: 'range', min: 0, max: 2, step: 0.01 },
  { key: 'stiffness', label: 'Spring', type: 'range', min: 30, max: 400, step: 1 },
  { group: 'World' },
  { key: 'slosh', label: 'Slosh pixels', type: 'checkbox' },
  { key: 'detach', label: 'Pull out knob', type: 'checkbox' },
  { key: 'gravity', label: 'Gravity', type: 'range', min: 400, max: 4000, step: 10 },
  { key: 'motion', label: 'Tilt / shake', type: 'button', text: '📱 Enable' },
  { key: 'sunClock', label: 'Sun clock', type: 'checkbox' },
  { key: 'timelapse', label: 'Timelapse', type: 'checkbox' },
  { key: 'locate', label: 'Location', type: 'button', text: '📍 Use mine' },
  { group: 'Extras' },
  { key: 'magnet', label: 'Shy pixels', type: 'checkbox' },
  { key: 'sparks', label: 'Sparks', type: 'checkbox' },
  { key: 'shockwave', label: 'Shockwave', type: 'checkbox' },
  { key: 'stars', label: 'Starfield', type: 'checkbox' },
  { key: 'sound', label: 'Sound', type: 'checkbox' },
  { key: 'volume', label: 'Volume', type: 'range', min: 0, max: 1, step: 0.01 },
];

const KEY = 'glass-toggle:params:v1';

export function loadParams() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...saved };
  } catch { return { ...DEFAULTS }; }
}

export function saveParams(P) {
  try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* private mode */ }
}
