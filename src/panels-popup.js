"use strict";
(() => {
  const model = UnqlockPanels;
  const form = document.getElementById('panels-form');
  const fields = document.getElementById('panels-fields');
  const status = document.getElementById('panels-status');
  let config = model.settings();
  let widths = {};
  let sizingErrors = {};
  let remembered = {};
  let target;
  let busy = false;
  let saveQueue = Promise.resolve();
  let pendingSaves = 0;
  let refreshing = false;
  const controls = new Map();
  function select(id, label, options) {
    const wrapper = document.createElement('label');
    wrapper.htmlFor = id;
    wrapper.textContent = label;
    const input = document.createElement('select');
    input.id = id;
    for (const [value, text] of options) input.add(new Option(text, value));
    return { wrapper, input };
  }
  for (const [id, meta] of Object.entries(model.panels)) {
    const card = document.createElement('details');
    card.className = 'panel-settings-card';
    const summary = document.createElement('summary');
    summary.textContent = meta.label;
    const badge = document.createElement('span');
    badge.className = 'panel-settings-summary';
    summary.append(badge);
    card.append(summary);
    const visibility = select(id + '-visibility', meta.label + ' visibility', [['native','Use Unqork default'],['start','Start collapsed'],['always','Always collapsed']]);
    const sizing = select(id + '-sizing', meta.label + ' size behavior', [['native','Use Unqork default'],['custom','Use custom default width'],['remember','Remember my last width']]);
    card.append(visibility.wrapper, visibility.input, sizing.wrapper, sizing.input);
    const label = document.createElement('label');
    label.htmlFor = id + '-width'; label.textContent = 'Default width (px)';
    const input = document.createElement('input');
    input.id = label.htmlFor; input.type = 'number'; input.min = '120'; input.max = '1600'; input.step = '1';
    input.setAttribute('aria-label', meta.label + ' default width (px)');
    input.placeholder = '120–1600';
    const note = document.createElement('p'); note.className = 'note';
    const actions = document.createElement('div'); actions.className = 'action-row';
    const current = document.createElement('button'); current.type = 'button'; current.textContent = 'Use current width';
    current.setAttribute('aria-label', 'Use current ' + meta.label + ' width');
    const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Reset';
    reset.setAttribute('aria-label', 'Reset ' + meta.label);
    actions.append(current, reset);
    card.append(label, input, note, actions);
    fields.append(card);
    controls.set(id, { visibility:visibility.input, sizing:sizing.input, input, current, note, badge });
    visibility.input.addEventListener('change', () => save(id, { visibility:visibility.input.value }));
    sizing.input.addEventListener('change', () => save(id, {
      sizing:sizing.input.value,
      ...(sizing.input.value === 'custom' && config[id].width === null ? { width:model.width(widths[id]) || 300 } : {})
    }));
    input.addEventListener('change', () => {
      if (!input.checkValidity() || model.width(input.valueAsNumber) === null) {
        input.setAttribute('aria-invalid', 'true'); status.textContent = 'Enter a whole-number width from 120 to 1600 pixels. The saved width has not changed.'; return;
      }
      input.removeAttribute('aria-invalid'); save(id, { width:input.valueAsNumber });
    });
    current.addEventListener('click', async () => {
      try {
        await measure();
        if (model.width(widths[id]) === null) throw new Error();
        await save(id, { width:widths[id], sizing:'custom' });
      } catch { status.textContent = 'Open this panel in the active module, then try again.'; }
    });
    reset.addEventListener('click', () => save(id, model.settings()[id], true));
  }
  function show() {
    for (const [id, c] of controls) {
      const pref = config[id];
      c.visibility.value = pref.visibility; c.sizing.value = pref.sizing;
      if (document.activeElement !== c.input) {
        c.input.value = pref.width ?? '';
        c.input.removeAttribute('aria-invalid');
      }
      c.badge.textContent = { native:'Unqork default', start:'Start collapsed', always:'Always collapsed' }[pref.visibility];
      const locked = pref.visibility === 'always' ? 'Choose another visibility option to change this panel’s size.' : '';
      UnqlockDisabled.set(c.sizing, locked);
      UnqlockDisabled.set(c.input, locked || (pref.sizing !== 'custom' ? 'Choose Use custom default width to enter a width.' : ''));
      UnqlockDisabled.set(c.current, locked || (!widths[id] ? 'Open this panel in the active module to use its current width.' : ''));
      c.note.textContent = pref.sizing === 'remember'
        ? (remembered[model.rememberedKey(id)] ? 'Last saved: ' + remembered[model.rememberedKey(id)] + ' px. Drag the handle to update it.' : 'Drag the panel’s handle to save its width.')
        : pref.sizing === 'custom' ? 'Applied when a module opens. You can still drag to resize during that visit.' : 'Unqork manages this panel’s width.';
      if (pref.sizing !== 'native' && sizingErrors[id]) c.note.textContent = sizingErrors[id];
    }
  }
  async function measure() {
    widths = {};
    sizingErrors = {};
    const active = await getTargetTab();
    if (!active?.id || !/^https:\/\/[^/]+\/ide\/builder\/workspaces\/[^/]+\/modules\//.test(active.url || '')) return;
    if (target && (target.id !== active.id || target.url !== active.url)) return;
    target = { id:active.id, url:active.url };
    const result = await extensionAPI.tabs.sendMessage(active.id, { type:'panels.measure' });
    widths = result?.widths || {};
    sizingErrors = result?.errors || {};
  }
  function save(id, patch, reset = false) {
    // Keep keyboard focus and serialize every change, including reset requests.
    config = id ? { ...config, [id]:{ ...config[id], ...patch } } : model.settings();
    show();
    pendingSaves++;
    busy = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Saving…';
    saveQueue = saveQueue.then(() => persist(id, patch, reset));
    return saveQueue;
  }
  async function persist(id, patch, reset) {
    try {
      const latest = model.settings((await extensionAPI.storage.local.get('builderPanels')).builderPanels);
      const next = id ? { ...latest, [id]:{ ...latest[id], ...patch } } : model.settings();
      const update = { builderPanels:next };
      if (reset) for (const key of id ? [id] : Object.keys(model.panels)) update[model.rememberedKey(key)] = null;
      await extensionAPI.storage.local.set(update);
      if (pendingSaves === 1) config = next;
      if (reset) for (const key of id ? [id] : Object.keys(model.panels)) remembered[model.rememberedKey(key)] = null;
      if (pendingSaves === 1) {
        status.textContent = 'Saved. Start collapsed applies on the next module visit. Widths fit the available space.';
        show();
      }
    } catch { status.textContent = 'Could not save. Try again.'; }
    finally {
      pendingSaves--;
      busy = pendingSaves > 0;
      form.setAttribute('aria-busy', String(busy));
    }
  }
  async function refreshWidths() {
    if (refreshing || busy || !form.getClientRects().length || fields.disabled) return;
    refreshing = true;
    try {
      await measure();
      for (const [id, c] of controls) {
        UnqlockDisabled.set(c.current, config[id].visibility === 'always'
          ? 'Choose another visibility option to change this panel’s size.'
          : !widths[id] ? 'Open this panel in the active module to use its current width.' : '');
      }
    } catch { /* A closed or navigating module will be measured again on the next refresh. */ }
    finally { refreshing = false; }
  }
  // The floating settings can stay open while panels change behind it.
  setInterval(refreshWidths, 1000);
  window.addEventListener('focus', refreshWidths);
  form.addEventListener('submit', event => event.preventDefault());
  document.getElementById('panels-reset').addEventListener('click', () => save(null, null, true));
  document.getElementById('open-general').addEventListener('click', async () => {
    fields.disabled = true; status.textContent = 'Loading panel settings…'; target = null;
    try {
      const result = await extensionAPI.storage.local.get(['builderPanels', ...Object.keys(model.panels).map(model.rememberedKey)]);
      config = model.settings(result.builderPanels); remembered = result;
      try { await measure(); } catch { widths = {}; }
      show(); fields.disabled = false; status.textContent = '';
    } catch { status.textContent = 'Could not load panel settings. Reopen Unqlock to retry.'; }
  });
})();
