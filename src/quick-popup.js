"use strict";
const quickPage = document.getElementById('quick-page');
const quickStatus = document.getElementById('quick-status');
const quickControls = document.getElementById('quick-controls');
const quickEntry = document.getElementById('open-quick');
const confirmation = document.getElementById('debug-confirmation');
const debugTabs = [...quickPage.querySelectorAll('[role="tab"]')];
let quickTarget;
let pendingAction;
let pendingButton;
let busy = false;
function cancelConfirmation(focus = false) {
  confirmation.hidden = true;
  pendingAction = undefined;
  if (focus) pendingButton?.focus();
}
function selectDebugTab(tab) {
  cancelConfirmation();
  for (const item of debugTabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  }
}
for (const tab of debugTabs) {
  tab.addEventListener('click', () => selectDebugTab(tab));
  tab.addEventListener('keydown', event => {
    const index = debugTabs.indexOf(tab);
    const next = { ArrowRight:(index + 1) % 3, ArrowLeft:(index + 2) % 3, Home:0, End:2 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectDebugTab(debugTabs[next]);
    debugTabs[next].focus();
  });
}
quickEntry.addEventListener('click', async () => {
  menu.hidden = true;
  quickPage.hidden = false;
  document.getElementById('quick-title').focus();
  if (busy) return;
  cancelConfirmation();
  quickControls.disabled = true;
  quickTarget = undefined;
  quickStatus.textContent = 'Checking active tab…';
  try {
    const [tab] = await extensionAPI.tabs.query({ active:true, currentWindow:true });
    if (!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw new Error('Unsupported tab');
    quickTarget = { id:tab.id, url:tab.url };
    quickControls.disabled = false;
    quickStatus.textContent = 'For Angular Unqork application pages.';
  } catch {
    quickStatus.textContent = 'Open Unqork, then open Unqlock from the browser toolbar.';
  }
});
function closeQuickActions() {
  cancelConfirmation();
  quickPage.hidden = true;
  menu.hidden = false;
  quickEntry.focus();
}
document.getElementById('quick-back').addEventListener('click', closeQuickActions);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !quickPage.hidden) {
    event.preventDefault();
    if (!confirmation.hidden) cancelConfirmation(true);
    else closeQuickActions();
  }
});
quickControls.addEventListener('input', () => cancelConfirmation());
document.getElementById('cancel-action').addEventListener('click', () => cancelConfirmation(true));
async function executeAction(request, button) {
  const feedback = button.closest('[role="tabpanel"]').querySelector('.debug-feedback');
  cancelConfirmation();
  busy = true;
  quickControls.disabled = true;
  feedback.dataset.state = 'pending';
  feedback.textContent = 'Running…';
  try {
    const results = await extensionAPI.scripting.executeScript({ target:{ tabId:quickTarget.id }, world:'MAIN', func:runQuickAction, args:[request] });
    const result = results[0]?.result;
    feedback.dataset.state = result?.ok ? 'success' : 'error';
    feedback.textContent = result?.message || 'No result returned. Check the page before retrying.';
  } catch {
    feedback.dataset.state = 'error';
    feedback.textContent = 'Could not access the page. Reopen from the toolbar; check the page before retrying.';
  } finally {
    busy = false;
    quickControls.disabled = false;
    if (!quickPage.hidden) button.focus();
  }
}
document.getElementById('confirm-action').addEventListener('click', () => {
  if (pendingAction && !busy) executeAction(pendingAction, pendingButton);
});
quickControls.addEventListener('click', event => {
  const button = event.target.closest('[data-quick-action]');
  if (!button || !quickTarget || quickControls.disabled) return;
  const action = button.dataset.quickAction;
  const request = {
    action, confirmed:action !== 'log', url:quickTarget.url,
    key:document.getElementById(action === 'trigger' ? 'component-key' : 'property-key').value,
    value:document.getElementById('property-value').value,
    type:quickPage.querySelector('input[name="value-type"]:checked').value,
    style:document.getElementById('log-style').value
  };
  if (action === 'log') { executeAction(request, button); return; }
  const feedback = button.closest('[role="tabpanel"]').querySelector('.debug-feedback');
  if (!request.key.trim() || ['__proto__', 'constructor', 'prototype'].includes(request.key)) {
    cancelConfirmation();
    feedback.dataset.state = 'error';
    feedback.textContent = 'Enter a valid, non-reserved property or component key.';
    return;
  }
  feedback.textContent = '';
  pendingAction = request;
  pendingButton = button;
  document.getElementById('confirmation-text').textContent = action === 'trigger'
    ? 'Run “' + request.key + '”? This may save data or call integrations.'
    : (action === 'remove' ? 'Remove' : 'Update') + ' “' + request.key + '” in this page’s in-memory data?';
  document.getElementById('confirm-action').textContent = action === 'trigger' ? 'Confirm run' : action === 'remove' ? 'Confirm removal' : 'Confirm update';
  confirmation.hidden = false;
  document.getElementById('confirm-action').focus();
});
