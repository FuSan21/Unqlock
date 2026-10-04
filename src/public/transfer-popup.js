"use strict";
(() => {
  const transfer = UnqlockTransfer;
  const storedKeys = ['appearance', 'rowLayout', 'canvasToolbar', 'componentColors', 'builderPanels', 'environment', 'floating', ...Object.keys(UnqlockPanels.panels).map(UnqlockPanels.rememberedKey)];
  const exportOutput = document.getElementById('export-output');
  const exportStatus = document.getElementById('export-status');
  const exportButtons = [document.getElementById('export-copy'), document.getElementById('export-download')];
  const importText = document.getElementById('import-text');
  const importFile = document.getElementById('import-file');
  const fileButton = document.getElementById('import-file-button');
  const reviewButton = document.getElementById('import-review');
  const preview = document.getElementById('import-preview');
  const sectionFields = document.getElementById('import-sections');
  const applyButton = document.getElementById('import-apply');
  const importStatus = document.getElementById('import-status');
  let pending = null;
  const setStatus = (element, text, state) => {
    element.textContent = text;
    if (state) element.dataset.state = state; else delete element.dataset.state;
  };
  async function exportJson() {
    const stored = await extensionAPI.storage.local.get(storedKeys);
    return transfer.stringify(stored, { version:extensionAPI.runtime.getManifest().version, appearance:normalize });
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      exportOutput.hidden = true;
      return true;
    } catch { /* The floating menu's frame may not be allowed to write to the clipboard. */ }
    exportOutput.value = text;
    exportOutput.hidden = false;
    exportOutput.focus();
    exportOutput.select();
    try { return document.execCommand('copy'); } catch { return false; }
  }
  function busy(value) {
    for (const button of [...exportButtons, reviewButton, fileButton, applyButton]) button.disabled = value;
  }
  document.getElementById('export-copy').addEventListener('click', async () => {
    busy(true);
    try {
      const copied = await copyText(await exportJson());
      setStatus(exportStatus, copied ? 'Settings copied as JSON.' : 'Copying is blocked here. The JSON is selected above; press Ctrl+C or ⌘C to copy it.', copied ? '' : 'error');
    } catch { setStatus(exportStatus, 'Could not read settings. Reopen Unqlock and try again.', 'error'); }
    finally { busy(false); }
  });
  document.getElementById('export-download').addEventListener('click', async () => {
    busy(true);
    try {
      const name = transfer.fileName();
      // A data URL outlives the popup, which can close while the browser saves the file.
      const link = document.createElement('a');
      link.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(await exportJson());
      link.download = name;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      setStatus(exportStatus, 'Download started: ' + name);
    } catch { setStatus(exportStatus, 'Could not read settings. Reopen Unqlock and try again.', 'error'); }
    finally { busy(false); }
  });
  function cancel() {
    pending = null;
    preview.hidden = true;
    sectionFields.replaceChildren(sectionFields.querySelector('legend'));
  }
  function review(text, source) {
    cancel();
    try {
      pending = transfer.parse(text, { layoutKeys });
    } catch (error) {
      setStatus(importStatus, 'Not imported. ' + error.message, 'error');
      return;
    }
    const origin = [pending.extensionVersion && 'Unqlock ' + pending.extensionVersion, pending.exportedAt && 'exported ' + pending.exportedAt.toLocaleString(), source].filter(Boolean).join(' · ');
    document.getElementById('import-summary').textContent = (origin ? origin + '. ' : '') + 'Choose the settings to replace:';
    for (const id of pending.sections) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = id;
      input.checked = true;
      const name = document.createElement('span');
      name.textContent = transfer.sections[id];
      label.append(name, input);
      sectionFields.append(label);
    }
    setStatus(importStatus, '');
    preview.hidden = false;
    sectionFields.querySelector('input').focus();
  }
  reviewButton.addEventListener('click', () => review(importText.value, ''));
  // Firefox closes its toolbar popup when the file picker opens, so the picker runs in a tab there.
  const firefoxToolbarPopup = () => typeof extensionAPI.runtime.getBrowserInfo === 'function' && window.top === window && !['page', 'targetTab'].some(key => new URL(location.href).searchParams.has(key));
  fileButton.addEventListener('click', async () => {
    if (!firefoxToolbarPopup()) { importFile.click(); return; }
    try {
      await extensionAPI.tabs.create({ url:extensionAPI.runtime.getURL('popup.html') + '?page=transfer-page' });
      window.close();
    } catch { setStatus(importStatus, 'Could not open the file picker. Paste the JSON instead.', 'error'); }
  });
  importFile.addEventListener('change', async () => {
    const [file] = importFile.files;
    importFile.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { cancel(); setStatus(importStatus, 'Not imported. This file is larger than 1 MB and is not an Unqlock export.', 'error'); return; }
    try { review(await file.text(), file.name); }
    catch { setStatus(importStatus, 'Could not read ' + file.name + '. Try again.', 'error'); }
  });
  document.getElementById('import-cancel').addEventListener('click', () => {
    cancel();
    setStatus(importStatus, 'Import canceled. Nothing changed.');
    reviewButton.focus();
  });
  applyButton.addEventListener('click', async () => {
    const chosen = [...sectionFields.querySelectorAll('input:checked')].map(input => input.name);
    if (!chosen.length) { setStatus(importStatus, 'Choose at least one setting to import.', 'error'); return; }
    busy(true);
    setStatus(importStatus, 'Importing…');
    try {
      const stored = await extensionAPI.storage.local.get(storedKeys);
      const { update, environment } = transfer.apply(pending, chosen, stored, { appearance:normalize, layoutKeys });
      // The background owns environment storage and registers badges for custom domains.
      if (environment) await environmentMessage({ type:'environment.save', replace:environment });
      if (Object.keys(update).length) await extensionAPI.storage.local.set(update);
      if (update.rowLayout) showLayout(update.rowLayout);
      if (update.canvasToolbar) showToolbar(update.canvasToolbar);
      if (update.componentColors) showColors(update.componentColors);
      if (update.appearance) show(update.appearance);
      if (environment) renderStrip(environmentTarget ? UnqlockEnvironment.detect(environmentTarget.url, environmentConfig) : null);
      const names = chosen.map(id => transfer.sections[id]).join(', ');
      cancel();
      importText.value = '';
      setStatus(importStatus, 'Imported ' + names + '.' + (chosen.includes('environments') && missingOrigins.length ? ' Open Environments to enable automatic badges on custom domains.' : ''));
      reviewButton.focus();
    } catch (error) { setStatus(importStatus, 'Not imported. ' + (error.message || 'Try again.'), 'error'); }
    finally { busy(false); }
  });
  // Escape dismisses a pending import before leaving the page.
  UnqlockPages.onLeave('transfer-page', options => {
    if (options.escape && !preview.hidden) {
      cancel();
      setStatus(importStatus, 'Import canceled. Nothing changed.');
      reviewButton.focus();
      return false;
    }
    cancel();
  });
})();
