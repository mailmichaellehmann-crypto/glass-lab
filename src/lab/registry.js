// Four everyday controls, rebuilt with the toggle's glass, light and pixel DNA.
// Modules load lazily on first open.
export const EXPERIMENTS = [
  {
    id: 'pour', thumb: { span: 340, fx: 0, fy: 0 }, hint: 'Drag, click or scroll', name: 'Pour', line: 'a volume slider filled with liquid light',
    how: 'Drag, click or scroll the tube · ← → · M mutes',
    bg: '#0b0b0b', accent: '#ffa630', load: () => import('./exp/pour.js'),
  },
  {
    id: 'hold', thumb: { span: 410, fx: 0, fy: 0, still: { demo: true, wait: 1750 } }, hint: 'Press and hold', name: 'Hold', line: 'a button you have to mean',
    how: 'Press and hold until the light closes the loop · let go early to cancel',
    bg: '#0b0b0b', accent: '#3dffa8', load: () => import('./exp/hold.js'),
  },
  {
    id: 'dial', thumb: { span: 395, fx: 0, fy: 0 }, hint: 'Turn it — or flick it', name: 'Dial', line: 'a glass thermostat with weight and detents',
    how: 'Grab the dial and turn it · flick it to spin · scroll for fine steps',
    bg: '#0b0b0b', accent: '#ff7a45', load: () => import('./exp/dial.js'),
  },
  {
    id: 'tabs', thumb: { span: 330, fx: 0, fy: 0 }, hint: 'Click — or drag the lens', name: 'Tabs', line: 'a selector that flows like a drop of glass',
    how: 'Click a tab · drag the lens and let it snap · ← →',
    bg: '#0b0b0b', accent: '#8ea0ff', load: () => import('./exp/tabs.js'),
  },
  {
    id: 'lens', thumb: { span: 340, fx: 0, fy: 0, still: { demo: true, wait: 1550 } }, hint: 'Type to search the lab', name: 'Lens', line: 'a search field with a glass loupe on its caret',
    how: 'Type · Tab or → takes the suggestion · Enter opens it · Esc or × clears',
    bg: '#0b0b0b', accent: '#a9b8ff', load: () => import('./exp/lens.js'),
  },
  {
    id: 'drop', thumb: { span: 118, fx: -150, fy: 0, still: { demo: true, wait: 2100 } }, hint: 'Check a task', name: 'Drop', line: 'a checklist where every tick is a drop of glass',
    how: 'Click a task (or 1 2 3) · hover to see the drop swell · click again to take it back',
    bg: '#0b0b0b', accent: '#7fe0ff', load: () => import('./exp/drop.js'),
  },
];
