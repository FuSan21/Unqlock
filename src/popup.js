"use strict";
  const extensionAPI = typeof browser !== "undefined" ? browser : chrome;
const defaults = { enabled: true, tray: true, canvas: true, icons: true, tiles: true, trayLabels: false, accents: false, backgrounds: false, borders: false, labels: true, symbols: true, compact: false };
const form = document.getElementById("appearance");
const status = document.getElementById("status");
const controls = document.getElementById("controls");
const reset = document.getElementById("reset");
const menu = document.getElementById("feature-menu");
const appearancePage = document.getElementById("appearance-page");
const openAppearance = document.getElementById("open-appearance");
const rowPreset = document.getElementById("row-preset");
let rowLayout = UnqlockRowLayout.settings();
rowPreset.replaceChildren(...[["native", "Native"], ...Object.entries(UnqlockRowLayout.presets).map(([id, preset]) => [id, preset.label]), ["custom", "Custom"]].map(([value, label]) => new Option(label, value)));
const rowSections = document.getElementById("row-sections");
rowSections.replaceChildren(...Object.entries(UnqlockRowLayout.sections).map(([id, name]) => {
  const group = document.createElement("fieldset");
  group.className = "row-section";
  const legend = document.createElement("legend");
  legend.textContent = name;
  const segments = document.createElement("div");
  segments.className = "segments";
  for (const slot of UnqlockRowLayout.slots) {
    const option = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "row-" + id;
    input.value = slot;
    input.setAttribute("aria-label", name + " " + slot);
    const text = document.createElement("span");
    text.textContent = slot[0].toUpperCase() + slot.slice(1);
    option.append(input, text);
    segments.append(option);
  }
  group.append(legend, segments);
  return group;
}));
async function getTargetTab() {
  if (window.top !== window || new URL(location.href).searchParams.has('targetTab')) {
    const result = await extensionAPI.runtime.sendMessage({ type:'floating.target' });
    if (!result?.ok) throw new Error(result?.error || 'Could not identify this page.');
    return result.tab;
  }
  return (await extensionAPI.tabs.query({ active:true, currentWindow:true }))[0];
}
function showMenu() {
  appearancePage.hidden = true;
  menu.hidden = false;
  openAppearance.focus();
}
openAppearance.addEventListener("click", () => {
  menu.hidden = true;
  appearancePage.hidden = false;
  document.getElementById("appearance-title").focus();
});
document.getElementById("back-to-menu").addEventListener("click", showMenu);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !appearancePage.hidden) {
    event.preventDefault();
    showMenu();
  }
});
const families = [["Inputs","1D4ED8","93C5FD"],["Contact & identity","0F766E","5EEAD4"],["Layout","4338CA","A5B4FC"],["Content","6D28D9","C4B5FD"],["Data & storage","0E7490","67E8F9"],["Calculation & workflows","7E22CE","D8B4FE"],["Decisions","92400E","FCD34D"],["Actions & execution","166534","86EFAC"],["Integrations","9A3412","FDBA74"],["Charts & maps","9D174D","FDA4AF"],["Hidden & protected","475569","CBD5E1"]];
function show(value) {
  for (const [key, fallback] of Object.entries(defaults)) form.elements[key].checked = typeof value?.[key] === "boolean" ? value[key] : fallback;
  for (const key of Object.keys(defaults)) {
    let reason = key !== 'enabled' && !form.elements.enabled.checked ? 'Turn on Enable component styling to use this setting.' : '';
    if (!reason && !['enabled','tray','canvas'].includes(key) && !form.elements.tray.checked && !form.elements.canvas.checked) reason = 'Turn on sidebar or canvas styling to use this setting.';
    if (!reason && key === 'trayLabels' && !form.elements.tray.checked) reason = 'Turn on Style sidebar components to color sidebar names.';
    if (!reason && key === 'labels' && !form.elements.canvas.checked) reason = 'Turn on Style canvas components to color canvas labels.';
    if (!reason && key === 'symbols' && !form.elements.icons.checked) reason = 'Turn on Colored icons to use distinct icon shapes.';
    UnqlockDisabled.set(form.elements[key], reason);
  }
  showLayout(rowLayout);
}
function showLayout(value) {
  rowLayout = UnqlockRowLayout.settings(value);
  rowPreset.value = UnqlockRowLayout.preset(rowLayout);
  const reason = !form.elements.enabled.checked ? 'Turn on Enable component styling to arrange canvas rows.' : !form.elements.canvas.checked ? 'Turn on Style canvas components to arrange canvas rows.' : '';
  UnqlockDisabled.set(rowPreset, reason);
  // Section controls only appear while a layout applies; the select explains why otherwise.
  rowSections.hidden = Boolean(reason) || !rowLayout.enabled;
  for (const id of Object.keys(UnqlockRowLayout.sections)) {
    for (const input of form.elements["row-" + id]) input.checked = input.value === rowLayout[id];
  }
}
async function save(items) {
  controls.disabled = true;
  reset.disabled = true;
  try {
    await extensionAPI.storage.local.set(items);
    if (items.rowLayout) rowLayout = UnqlockRowLayout.settings(items.rowLayout);
    if (items.appearance) show(items.appearance); else showLayout(rowLayout);
    status.textContent = "Saved";
  }
  catch { status.textContent = "Could not save. Try again."; }
  finally { controls.disabled = false; reset.disabled = false; }
}
form.addEventListener("change", event => {
  if (event.target === rowPreset) {
    const preset = UnqlockRowLayout.presets[rowPreset.value];
    save({ rowLayout:{ ...rowLayout, ...preset?.positions, enabled:rowPreset.value !== "native" } });
  } else if (event.target.name?.startsWith("row-")) {
    save({ rowLayout:{ ...rowLayout, [event.target.name.slice(4)]:event.target.value, enabled:true } });
  } else {
    save({ appearance:Object.fromEntries(Object.keys(defaults).map(key => [key, form.elements[key].checked])) });
  }
});
reset.addEventListener("click", () => save({ appearance:defaults, rowLayout:UnqlockRowLayout.settings() }));
function drawLegend() {
  document.getElementById("legend").replaceChildren(...families.map(([name, light, dark]) => {
    const row = document.createElement("div");
    const swatch = document.createElement("span");
    swatch.className = "swatch";
    swatch.style.backgroundColor = "#" + (matchMedia("(prefers-color-scheme:dark)").matches ? dark : light);
    row.append(swatch, document.createTextNode(name));
    return row;
  }));
}
drawLegend();
matchMedia("(prefers-color-scheme:dark)").addEventListener("change", drawLegend);
extensionAPI.storage.local.get(["appearance", "rowLayout"]).then(result => { rowLayout = UnqlockRowLayout.settings(result.rowLayout); show(result.appearance); status.textContent = "Ready"; controls.disabled = false; }).catch(() => { show(defaults); status.textContent = "Storage unavailable"; });
