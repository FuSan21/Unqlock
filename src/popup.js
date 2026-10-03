"use strict";
  const extensionAPI = typeof browser !== "undefined" ? browser : chrome;
const defaults = { enabled: true, tray: true, canvas: true, icons: true, tiles: true, trayLabels: false, accents: false, backgrounds: false, borders: false, labels: true, symbols: true, compact: false, containerSpacing: false, containerHeaders: false, containerGuides: false, containerDepth: false, containerSticky: false, containerEnd: false };
// Each reset owns the keys shown on its page; the home switch is left alone.
const layoutKeys = Object.keys(defaults).filter(key => key === "compact" || key.startsWith("container"));
const styleKeys = Object.keys(defaults).filter(key => key !== "enabled" && !layoutKeys.includes(key));
const home = document.getElementById("home");
const appearanceFields = [...document.querySelectorAll(".appearance-fields")];
const appearanceStatus = [...document.querySelectorAll(".appearance-status")];
const appearanceControls = [...document.querySelectorAll("input[data-appearance]")];
const resetButtons = [document.getElementById("reset-style"), document.getElementById("reset-layout")];
const rowPreset = document.getElementById("row-preset");
let appearance = { ...defaults };
let rowLayout = UnqlockRowLayout.settings();
let canvasToolbar = UnqlockToolbar.settings();
let componentColors = {};
// The color guide doubles as the color settings: each group has a text and a background swatch
// per theme, and each swatch is a color picker.
const partNames = { ink:"foreground", tint:"background" };
const colorRows = UnqlockColors.families.map(family => {
  const row = document.createElement("div");
  row.className = "color-row";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", family.name + " colors");
  const name = document.createElement("span");
  name.textContent = family.name;
  const pickers = [];
  const pairs = UnqlockColors.modes.map(mode => {
    const pair = document.createElement("span");
    pair.className = "color-pair";
    for (const part of UnqlockColors.parts) {
      const picker = document.createElement("input");
      picker.type = "color";
      picker.className = "swatch";
      picker.dataset.color = family.id + "-" + mode + "-" + part;
      picker.title = (mode === "light" ? "Light " : "Dark ") + partNames[part];
      picker.setAttribute("aria-label", family.name + " " + mode + " " + partNames[part] + " color");
      picker.addEventListener("change", () => {
        const next = structuredClone(componentColors);
        next[family.id] = { ...next[family.id], [mode]:{ ...next[family.id]?.[mode], [part]:picker.value } };
        save({ componentColors:UnqlockColors.settings(next) });
      });
      pickers.push({ mode, part, picker });
      pair.append(picker);
    }
    return pair;
  });
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "link-button";
  reset.textContent = "Reset";
  reset.setAttribute("aria-label", "Reset " + family.name + " colors");
  reset.addEventListener("click", async () => {
    const { [family.id]:_removed, ...rest } = componentColors;
    await save({ componentColors:rest });
    pickers[0].picker.focus();
  });
  const resetCell = document.createElement("span");
  resetCell.append(reset);
  row.append(name, ...pairs, resetCell);
  return { family, pickers, reset, row };
});
document.getElementById("color-settings").append(...colorRows.map(entry => entry.row));
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
// Toolbar controls work without Component styling, since they only keep Unqork's own controls open.
const toolbarControls = Object.entries(UnqlockToolbar.controls).map(([id, control]) => {
  const label = document.createElement("label");
  const name = document.createElement("span");
  name.textContent = control.label;
  const select = document.createElement("select");
  select.dataset.toolbar = id;
  select.setAttribute("aria-label", control.label);
  select.setAttribute("aria-describedby", "toolbar-help");
  select.append(new Option("Use Unqork default", "native"), new Option(control.always, "always"));
  label.append(name, select);
  return label;
});
document.getElementById("toolbar-controls").replaceChildren(...toolbarControls);
const toolbarSelects = [...document.querySelectorAll("select[data-toolbar]")];
async function getTargetTab() {
  if (window.top !== window || new URL(location.href).searchParams.has('targetTab')) {
    const result = await extensionAPI.runtime.sendMessage({ type:'floating.target' });
    if (!result?.ok) throw new Error(result?.error || 'Could not identify this page.');
    return result.tab;
  }
  return (await extensionAPI.tabs.query({ active:true, currentWindow:true }))[0];
}
// One page is shown at a time. Opening focuses its title; returning focuses the control that opened it.
globalThis.UnqlockPages = (() => {
  const openHooks = {};
  const leaveHooks = {};
  let current = null;
  let origin = null;
  function open(id, from) {
    const page = document.getElementById(id);
    if (current) document.getElementById(current).hidden = true;
    origin = from || document.querySelector('#feature-menu [data-page="' + id + '"]');
    current = id;
    home.hidden = true;
    page.hidden = false;
    page.querySelector(".page-title").focus();
    for (const hook of openHooks[id] || []) hook();
  }
  function back(options = {}) {
    if (!current) return;
    // A leave hook can keep the page open, such as Escape dismissing a pending confirmation.
    for (const hook of leaveHooks[current] || []) if (hook(options) === false) return;
    document.getElementById(current).hidden = true;
    current = null;
    home.hidden = false;
    origin?.focus();
  }
  const register = hooks => (id, hook) => { (hooks[id] ||= []).push(hook); };
  document.addEventListener("click", event => {
    const entry = event.target.closest("[data-page]");
    if (entry) open(entry.dataset.page, entry);
    else if (event.target.closest(".page-back")) back();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && current) {
      event.preventDefault();
      back({ escape:true });
    }
  });
  return { open, back, current:() => current, onOpen:register(openHooks), onLeave:register(leaveHooks) };
})();
function normalize(value) {
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, typeof value?.[key] === "boolean" ? value[key] : fallback]));
}
function reasonFor(key, control) {
  const onHome = home.contains(control);
  if (key !== "enabled" && !appearance.enabled) return onHome ? "Turn on Component styling to use this setting." : "Turn on Component styling on the home menu to use this setting.";
  if (!["enabled", "tray", "canvas"].includes(key) && !appearance.tray && !appearance.canvas) return "Turn on Component style → Style sidebar components or Style canvas components to use this setting.";
  if (key === "trayLabels" && !appearance.tray) return "Turn on Style sidebar components to color sidebar names.";
  if (key === "labels" && !appearance.canvas) return "Turn on Style canvas components to color canvas labels.";
  if (key.startsWith("container") && !appearance.canvas) return "Turn on Component style → Style canvas components to use container settings.";
  if (key === "symbols" && !appearance.icons) return "Turn on Colored icons to use distinct icon shapes.";
  return "";
}
function show(value) {
  appearance = normalize(value);
  for (const control of appearanceControls) {
    const key = control.dataset.appearance;
    control.checked = appearance[key];
    UnqlockDisabled.set(control, reasonFor(key, control));
  }
  showLayout(rowLayout);
  showToolbar(canvasToolbar);
  showColors(componentColors);
}
// Swatches show the resolved colors, so a derived partner shows what the builder will use.
function showColors(value) {
  componentColors = UnqlockColors.settings(value);
  const palette = UnqlockColors.palette(componentColors);
  for (const { family, pickers, reset } of colorRows) {
    const entry = palette.find(item => item.id === family.id);
    for (const { mode, part, picker } of pickers) {
      picker.value = entry[mode][UnqlockColors.parts.indexOf(part)].toLowerCase();
      UnqlockDisabled.set(picker, reasonFor("colors", picker));
    }
    reset.hidden = !Object.keys(entry.picked).length;
  }
}
function showToolbar(value) {
  canvasToolbar = UnqlockToolbar.settings(value);
  for (const select of toolbarSelects) select.value = canvasToolbar[select.dataset.toolbar];
}
function showLayout(value) {
  rowLayout = UnqlockRowLayout.settings(value);
  rowPreset.value = UnqlockRowLayout.preset(rowLayout);
  const reason = !appearance.enabled ? "Turn on Component styling on the home menu to arrange canvas rows." : !appearance.canvas ? "Turn on Component style → Style canvas components to arrange canvas rows." : "";
  UnqlockDisabled.set(rowPreset, reason);
  // Section controls only appear while a layout applies; the select explains why otherwise.
  rowSections.hidden = Boolean(reason) || !rowLayout.enabled;
  for (const id of Object.keys(UnqlockRowLayout.sections)) {
    for (const input of rowSections.querySelectorAll('input[name="row-' + id + '"]')) input.checked = input.value === rowLayout[id];
  }
}
function setAppearanceStatus(text) {
  for (const status of appearanceStatus) status.textContent = text;
}
function setAppearanceBusy(busy) {
  for (const fields of appearanceFields) fields.disabled = busy;
  for (const button of resetButtons) button.disabled = busy;
}
async function save(items) {
  setAppearanceBusy(true);
  try {
    await extensionAPI.storage.local.set(items);
    if (items.rowLayout) rowLayout = UnqlockRowLayout.settings(items.rowLayout);
    if (items.canvasToolbar) canvasToolbar = UnqlockToolbar.settings(items.canvasToolbar);
    if (items.componentColors) componentColors = UnqlockColors.settings(items.componentColors);
    if (items.appearance) show(items.appearance); else { showLayout(rowLayout); showToolbar(canvasToolbar); showColors(componentColors); }
    setAppearanceStatus("Saved");
  }
  catch { setAppearanceStatus("Could not save. Try again."); }
  finally { setAppearanceBusy(false); }
}
for (const control of appearanceControls) {
  control.addEventListener("change", () => save({ appearance:{ ...appearance, [control.dataset.appearance]:control.checked } }));
}
rowPreset.addEventListener("change", () => {
  const preset = UnqlockRowLayout.presets[rowPreset.value];
  save({ rowLayout:{ ...rowLayout, ...preset?.positions, enabled:rowPreset.value !== "native" } });
});
rowSections.addEventListener("change", event => {
  if (event.target.name?.startsWith("row-")) save({ rowLayout:{ ...rowLayout, [event.target.name.slice(4)]:event.target.value, enabled:true } });
});
for (const select of toolbarSelects) {
  select.addEventListener("change", () => save({ canvasToolbar:{ ...canvasToolbar, [select.dataset.toolbar]:select.value } }));
}
const pick = (source, keys) => Object.fromEntries(keys.map(key => [key, source[key]]));
document.getElementById("reset-style").addEventListener("click", () => save({ appearance:{ ...appearance, ...pick(defaults, styleKeys) }, componentColors:{} }));
document.getElementById("reset-layout").addEventListener("click", () => save({ appearance:{ ...appearance, ...pick(defaults, layoutKeys) }, rowLayout:UnqlockRowLayout.settings(), canvasToolbar:UnqlockToolbar.settings() }));
extensionAPI.storage.local.get(["appearance", "rowLayout", "canvasToolbar", "componentColors"]).then(result => { rowLayout = UnqlockRowLayout.settings(result.rowLayout); canvasToolbar = UnqlockToolbar.settings(result.canvasToolbar); componentColors = UnqlockColors.settings(result.componentColors); show(result.appearance); setAppearanceStatus("Ready"); setAppearanceBusy(false); }).catch(() => { show(defaults); setAppearanceStatus("Storage unavailable"); });
