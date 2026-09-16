"use strict";
  const extensionAPI = typeof browser !== "undefined" ? browser : chrome;
const defaults = { enabled: true, tray: true, canvas: true, icons: true, tiles: true, trayLabels: false, accents: false, backgrounds: false, borders: false, labels: true, symbols: true };
const form = document.getElementById("appearance");
const status = document.getElementById("status");
const controls = document.getElementById("controls");
const reset = document.getElementById("reset");
const menu = document.getElementById("feature-menu");
const appearancePage = document.getElementById("appearance-page");
const openAppearance = document.getElementById("open-appearance");
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
}
async function save(value) {
  controls.disabled = true;
  reset.disabled = true;
  try { await extensionAPI.storage.local.set({ appearance:value }); show(value); status.textContent = "Saved"; }
  catch { status.textContent = "Could not save. Try again."; }
  finally { controls.disabled = false; reset.disabled = false; }
}
form.addEventListener("change", () => save(Object.fromEntries(Object.keys(defaults).map(key => [key, form.elements[key].checked]))));
reset.addEventListener("click", () => save(defaults));
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
extensionAPI.storage.local.get("appearance").then(result => { show(result.appearance); status.textContent = "Ready"; controls.disabled = false; }).catch(() => { show(defaults); status.textContent = "Storage unavailable"; });
