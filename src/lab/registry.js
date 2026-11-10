// Four everyday controls, rebuilt with the toggle's glass, light and pixel DNA.
// Modules load lazily on first open.
export const EXPERIMENTS = [
  {
    id: 'pour', thumb: { span: 320, fx: 0, fy: 0 }, hint: 'Drag, click or scroll', name: 'Pour', line: 'a volume slider filled with liquid light',
    how: 'Drag, click or scroll the tube · ← → · M mutes',
    bg: '#0b0b0b', accent: '#ffa630', load: () => import('./exp/pour.js'),
  },
  {
    id: 'hold', thumb: { span: 385, fx: 0, fy: 0, still: { demo: true, wait: 1750 } }, hint: 'Press and hold', name: 'Hold', line: 'a button you have to mean',
    how: 'Press and hold until the light closes the loop · let go early to cancel',
    bg: '#0b0b0b', accent: '#3dffa8', load: () => import('./exp/hold.js'),
  },
  {
    id: 'dial', thumb: { span: 340, fx: 0, fy: 0 }, hint: 'Turn it — or flick it', name: 'Dial', line: 'a glass thermostat with weight and detents',
    how: 'Grab the dial and turn it · flick it to spin · scroll for fine steps',
    bg: '#0b0b0b', accent: '#ff7a45', load: () => import('./exp/dial.js'),
  },
  {
    id: 'tabs', thumb: { span: 284, fx: 0, fy: 0 }, hint: 'Click — or drag the lens', name: 'Tabs', line: 'a selector that flows like a drop of glass',
    how: 'Click a tab · drag the lens and let it snap · ← →',
    bg: '#0b0b0b', accent: '#8ea0ff', load: () => import('./exp/tabs.js'),
  },
  {
    id: 'lens', thumb: { span: 320, fx: 0, fy: 0, still: { demo: true, wait: 1550 } }, hint: 'Type to search the lab', name: 'Lens', line: 'a search field with a glass loupe on its caret',
    how: 'Type · Tab or → takes the suggestion · Enter opens it · Esc or × clears',
    bg: '#0b0b0b', accent: '#a9b8ff', load: () => import('./exp/lens.js'),
  },
  {
    id: 'drop', thumb: { span: 101, fx: -150, fy: 0, still: { demo: true, wait: 2100 } }, hint: 'Check a task', name: 'Drop', line: 'a checklist where every tick is a drop of glass',
    how: 'Click a task (or 1 2 3) · hover to see the drop swell · click again to take it back',
    bg: '#0b0b0b', accent: '#7fe0ff', load: () => import('./exp/drop.js'),
  },
  {
    id: 'bridge', thumb: { span: 254, fx: 0, fy: 0, still: { demo: true, wait: 900 } }, hint: 'Drag a lens · or the bridge', name: 'Bridge', line: 'a range slider joined by liquid light',
    how: 'Drag either lens · push them together to merge · grab the bridge to move the range · ← → (⇧ for the upper value)',
    bg: '#0b0b0b', accent: '#b07cff', load: () => import('./exp/bridge.js'),
  },
  {
    id: 'stars', thumb: { span: 249, fx: 0, fy: 0, still: { demo: true, wait: 2450 } }, hint: 'Hover · tap a star', name: 'Stars', line: 'a rating in five glass stars',
    how: 'Hover to pour light in · tap to rate · tap again to clear · ← → or 0–5',
    bg: '#0b0b0b', accent: '#ffc23a', load: () => import('./exp/stars.js'),
  },
  {
    id: 'picker', thumb: { span: 258, fx: 0, fy: 0, still: { demo: true, wait: 1150 } }, hint: 'Drag or flick a drum', name: 'Picker', line: 'a time picker under a glass rod',
    how: 'Drag or flick a drum · tap a row · scroll · ↑ ↓ turns, ← → switches drum',
    bg: '#0b0b0b', accent: '#ffb36b', load: () => import('./exp/picker.js'),
  },
  {
    id: 'commit', thumb: { span: 258, fx: 0, fy: 0, still: { demo: true, wait: 1350 } }, hint: 'Slide the lens all the way', name: 'Commit', line: 'slide to confirm, with rising tension',
    how: 'Drag the lens to the end to send · let go early and it springs back · Enter slides it for you',
    bg: '#0b0b0b', accent: '#ff6a88', load: () => import('./exp/commit.js'),
  },
  {
    id: 'pin', thumb: { span: 273, fx: 0, fy: 0, still: { demo: true, wait: 1150 } }, hint: 'The code is 2580', name: 'PIN', line: 'a code in four glass cells',
    how: 'Type 2580 on the keypad or your keyboard (or a wrong code to see it shake) · ⌫ deletes',
    bg: '#0b0b0b', accent: '#9b8cff', load: () => import('./exp/pin.js'),
  },
  {
    id: 'bloom', thumb: { span: 284, fx: 0, fy: 0, still: { demo: true, wait: 1500 } }, hint: 'Hold the drop · slide to a bubble', name: 'Bloom', line: 'a radial menu that flowers out of glass',
    how: 'Hold the drop and slide to a bubble, let go to choose · a quick tap keeps it open · ← → and Enter',
    bg: '#0b0b0b', accent: '#c8a2ff', load: () => import('./exp/bloom.js'),
  },
  {
    id: 'beads', thumb: { span: 189, fx: 0, fy: 0, still: { demo: true, wait: 1450 } }, hint: 'Tap a task · type into the empty bead', name: 'Beads', line: 'a task list of glass beads in a rail',
    how: 'Type into the empty bead and press Enter · tap a task to get it done · drag to reorder, drag out of the rail to delete',
    bg: '#0b0b0b', accent: '#ff9ad5', load: () => import('./exp/beads.js'),
  },
  {
    id: 'copy', thumb: { span: 284, fx: 0, fy: -22, still: { demo: true, wait: 1350 } }, hint: 'Click to copy the link', name: 'Copy', line: 'a copy button that divides like a cell',
    how: 'Click the drop or the link (or press Enter / ⌘C) · the link is really copied',
    bg: '#0b0b0b', accent: '#8fb8ff', load: () => import('./exp/copy.js'),
  },
  {
    id: 'scrub', thumb: { span: 292, fx: -12, fy: 0, still: { demo: true, wait: 1700 } }, hint: 'Play · drag the playhead', name: 'Scrub', line: 'an audio player you can scrub like tape',
    how: 'Play or pause with the glass button (or Space) · drag the playhead to scrub, faster rings higher · ← → skip',
    bg: '#0b0b0b', accent: '#7ab8ff', load: () => import('./exp/scrub.js'),
  },
  {
    id: 'timer', thumb: { span: 198, fx: 0, fy: 0, still: { demo: true, wait: 1300 } }, hint: 'Turn the disc to wind it up', name: 'Timer', line: 'a wind-up kitchen timer of thick glass',
    how: 'Turn the disc clockwise to wind it up, let go to start · tap to pause · tap to stop the bell · ↑ ↓ minutes, Space start/pause',
    bg: '#0b0b0b', accent: '#ff8a3d', load: () => import('./exp/timer.js'),
  },
  {
    id: 'secret', thumb: { span: 273, fx: 0, fy: 0, still: { demo: true, wait: 1500 } }, hint: 'Type · slide the lens to decode', name: 'Secret', line: 'a password field with a decoding lens',
    how: 'Type a password · slide the glass lens over the dots to read them · tap the lens to reveal all · the tube shows its strength · Enter to save',
    bg: '#0b0b0b', accent: '#b38bff', load: () => import('./exp/secret.js'),
  },
  {
    id: 'hue', thumb: { span: 300, fx: 0, fy: 0, still: { demo: true, wait: 1200 } }, hint: 'Push the glass ball over the colours', name: 'Hue', line: 'a colour picker: a glass ball that soaks up colour',
    how: 'Drag the ball (or tap the floor) to pick a colour · let go and a drop settles in the palette · tap a drop to return to it · scroll or ↑ ↓ for brightness, ← → for hue',
    bg: '#0b0b0b', accent: '#ff8a5c', load: () => import('./exp/hue.js'),
  },
  {
    id: 'like', thumb: { span: 250, fx: 0, fy: 0, still: { demo: true, wait: 1700 } }, hint: 'Tap it · or hold and let go', name: 'Like', line: 'a heart cut from glass that fills with light',
    how: 'Tap the heart to like, tap again to take it back · press and hold to charge it, let go for a burst · Space or L',
    bg: '#0b0b0b', accent: '#ff3d77', load: () => import('./exp/like.js'),
  },
];
