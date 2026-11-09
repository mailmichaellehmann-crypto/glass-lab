// A small frosted control panel generated from SCHEMA. No dependencies.

export function createPanel(root, schema, P, { onChange, onReset, onRandom, onAction }) {
  const inputs = new Map();
  const panel = document.createElement('aside');
  panel.className = 'panel';
  panel.innerHTML = `
    <header>
      <span>Tweak</span>
      <button class="ghost" data-act="collapse" title="Hide panel (H)">–</button>
    </header>
    <div class="body"></div>
    <footer>
      <button data-act="random" title="Randomise look (R)">Shuffle</button>
      <button data-act="reset">Reset</button>
      <button data-act="copy" title="Copy settings as JSON">Copy</button>
    </footer>`;
  const body = panel.querySelector('.body');

  for (const row of schema) {
    if (row.group) {
      const h = document.createElement('h4');
      h.textContent = row.group;
      body.appendChild(h);
      continue;
    }
    const label = document.createElement('label');
    label.className = 'row ' + row.type;
    const name = document.createElement('span');
    name.textContent = row.label;
    label.appendChild(name);

    let input;
    if (row.type === 'button') {
      label.className = 'row select';
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = row.text;
      b.addEventListener('click', async e => {
        e.preventDefault();
        b.disabled = true;
        try { b.textContent = (await onAction(row.key)) || '✓ On'; }
        catch (err) { b.textContent = '✕ ' + (err?.name || 'Failed'); b.disabled = false; }
      });
      label.appendChild(b);
      body.appendChild(label);
      continue;
    }
    if (row.type === 'select') {
      input = document.createElement('select');
      for (const [v, t] of row.options) {
        const o = document.createElement('option');
        o.value = v; o.textContent = t;
        input.appendChild(o);
      }
    } else {
      input = document.createElement('input');
      input.type = row.type;
      if (row.type === 'range') Object.assign(input, { min: row.min, max: row.max, step: row.step });
    }
    const out = document.createElement('output');
    label.appendChild(input);
    if (row.type === 'range') label.appendChild(out);

    const read = () => {
      if (row.type === 'checkbox') return input.checked;
      if (row.type === 'range') return +input.value;
      return input.value;
    };
    input.addEventListener('input', () => {
      P[row.key] = read();
      if (row.type === 'range') out.textContent = fmt(P[row.key]);
      onChange(row.key);
    });
    inputs.set(row.key, { input, out, row });
    body.appendChild(label);
  }

  panel.addEventListener('click', e => {
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'collapse') toggle();
    if (act === 'reset') onReset();
    if (act === 'random') onRandom();
    if (act === 'copy') {
      navigator.clipboard?.writeText(JSON.stringify(P, null, 2));
      e.target.textContent = '✓';
      setTimeout(() => (e.target.textContent = 'Copy'), 1200);
    }
  });

  const fab = document.createElement('button');
  fab.className = 'panel-fab';
  fab.title = 'Show panel (H)';
  fab.textContent = '⚙';
  fab.addEventListener('click', () => toggle());

  root.append(panel, fab);

  function fmt(v) { return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2); }

  function refresh() {
    for (const [key, { input, out, row }] of inputs) {
      if (row.type === 'checkbox') input.checked = !!P[key];
      else input.value = P[key];
      if (row.type === 'range') out.textContent = fmt(+P[key]);
    }
  }

  function toggle(force) {
    const hidden = force ?? !panel.classList.contains('hidden');
    panel.classList.toggle('hidden', hidden);
    try { localStorage.setItem('glass-toggle:panel', hidden ? '0' : '1'); } catch { /* ignore */ }
    fab.classList.toggle('show', hidden);
  }

  refresh();
  // the panel is a tool, not part of the piece: folded by default, it remembers if you open it
  let open = false;
  try { open = localStorage.getItem('glass-toggle:panel') === '1'; } catch { /* ignore */ }
  if (!open || matchMedia('(max-width: 700px)').matches) toggle(true);
  return { refresh, toggle };
}
