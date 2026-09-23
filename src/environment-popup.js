"use strict";
const environmentPage = document.getElementById('environment-page');
const environmentForm = document.getElementById('environment-form');
const environmentStatus = document.getElementById('environment-status');
const environmentFields = document.getElementById('environment-fields');
const groupSelect = document.getElementById('environment-group');
const domainRows = document.getElementById('environment-hosts');
const accessButton = document.getElementById('environment-access');
let environmentTarget;
let environmentConfig;
let editingGroup;
let missingOrigins = [];
let saveQueue = Promise.resolve();
let editRevision = 0;
async function environmentMessage(message) {
  const response = await extensionAPI.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || 'Could not save environment settings. Reopen Unqlock to retry.');
  environmentConfig = UnqlockEnvironment.settings(response.config);
  missingOrigins = response.missingOrigins || [];
  accessButton.hidden = missingOrigins.length === 0;
  accessButton.title = missingOrigins.join('\n');
  return response;
}
function addDomain(domain = { hostname:'', environment:'unknown' }) {
  const row = document.createElement('div');
  row.className = 'environment-domain';
  row.dataset.originalHostname = domain.hostname;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = domain.hostname;
  input.placeholder = 'organization-staging.unqork.io';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Hostname');
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Environment for hostname');
  for (const [kind, label] of Object.entries(UnqlockEnvironment.labels)) select.add(new Option(label, kind));
  select.value = domain.environment;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.setAttribute('aria-label', 'Remove domain');
  remove.addEventListener('click', () => { row.remove(); saveEnvironment(); document.getElementById('environment-add-domain').focus(); });
  row.append(input, select, remove);
  domainRows.append(row);
  return input;
}
function editGroup(id) {
  editRevision++;
  editingGroup = environmentConfig.groups.find(group => group.id === id) || { id:crypto.randomUUID(), name:'', domains:[] };
  document.getElementById('environment-group-name').value = editingGroup.name;
  UnqlockDisabled.set(document.getElementById('environment-delete-group'), environmentConfig.groups.some(group => group.id === editingGroup.id) ? '' : 'This group has not been saved yet. Enter a valid group name and hostname to save it.');
  domainRows.replaceChildren();
  for (const domain of editingGroup.domains) addDomain(domain);
  if (!editingGroup.domains.length) addDomain();
  groupSelect.value = environmentConfig.groups.some(group => group.id === editingGroup.id) ? editingGroup.id : '';
}
function renderEnvironment(selectedId, preserveEditor = false) {
  const current = environmentTarget ? UnqlockEnvironment.detect(environmentTarget.url, environmentConfig) : null;
  document.getElementById('environment-current').textContent = current ? current.label + ' · ' + current.host + ' — ' + current.source : 'Open a web page to identify its environment.';
  groupSelect.replaceChildren(new Option('New group', ''));
  for (const group of environmentConfig.groups) groupSelect.add(new Option(group.name, group.id));
  if (preserveEditor) {
    const saved = environmentConfig.groups.some(group => group.id === editingGroup.id);
    groupSelect.value = saved ? editingGroup.id : '';
    UnqlockDisabled.set(document.getElementById('environment-delete-group'), saved ? '' : 'This group has not been saved yet. Enter a valid group name and hostname to save it.');
  }
  else editGroup(selectedId ?? current?.groupId ?? environmentConfig.groups[0]?.id);
  const links = document.getElementById('environment-links');
  links.replaceChildren();
  const currentGroup = environmentConfig.groups.find(group => group.id === current?.groupId);
  for (const domain of currentGroup?.domains || []) {
    if (domain.hostname === current.host) continue;
    const link = document.createElement('a');
    link.textContent = UnqlockEnvironment.labels[domain.environment] + ' · ' + domain.hostname + ' ↗';
    link.href = UnqlockEnvironment.switchUrl(environmentTarget.url, domain.hostname);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = link.href;
    links.append(link);
  }
}
document.getElementById('open-environment').addEventListener('click', async () => {
  menu.hidden = true;
  environmentPage.hidden = false;
  document.getElementById('environment-title').focus();
  environmentFields.disabled = true;
  environmentStatus.textContent = 'Loading…';
  try {
    await saveQueue;
    const [tab] = await Promise.all([getTargetTab(), environmentMessage({ type:'environment.read' })]);
    environmentTarget = /^https?:\/\//.test(tab?.url || '') ? tab : null;
    for (const key of ['badge', 'blockProduction', 'autoDiscover']) environmentForm.elements[key].checked = environmentConfig[key];
    renderEnvironment();
    environmentFields.disabled = false;
    environmentStatus.textContent = missingOrigins.length ? 'Saved custom domains need site access for automatic badges.' : '';
  } catch (error) { environmentStatus.textContent = error.message; }
});
function closeEnvironment() {
  environmentPage.hidden = true;
  menu.hidden = false;
  document.getElementById('open-environment').focus();
}
document.getElementById('environment-back').addEventListener('click', closeEnvironment);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !environmentPage.hidden) { event.preventDefault(); closeEnvironment(); }
});
groupSelect.addEventListener('change', () => editGroup(groupSelect.value));
document.getElementById('environment-new-group').addEventListener('click', () => { editGroup(''); document.getElementById('environment-group-name').focus(); });
document.getElementById('environment-add-domain').addEventListener('click', () => addDomain().focus());
function preferences() {
  return Object.fromEntries(['badge', 'blockProduction', 'autoDiscover'].map(key => [key, environmentForm.elements[key].checked]));
}
async function injectCurrentBadge() {
  if (!environmentTarget || !environmentConfig.groups.some(group => group.domains.some(domain => domain.hostname === new URL(environmentTarget.url).hostname))) return;
  try { await extensionAPI.scripting.executeScript({ target:{ tabId:environmentTarget.id }, files:['environment.js', 'environment-badge.js'] }); } catch { /* Registered scripts run on the next permitted page load. */ }
}
function saveEnvironment(preferencesOnly = false) {
  const revision = ++editRevision;
  try {
    if (!preferencesOnly && [...domainRows.children].some(row => row.dataset.originalHostname && !row.querySelector('input').value.trim())) throw new Error('Enter a hostname, or choose Remove to delete the domain.');
    const domains = [...domainRows.children].map(row => ({ hostname:row.querySelector('input').value.trim(), environment:row.querySelector('select').value })).filter(domain => domain.hostname);
    const name = document.getElementById('environment-group-name').value.trim();
    const group = preferencesOnly || (!name && !domains.length && !environmentConfig.groups.some(group => group.id === editingGroup.id)) ? null : { ...editingGroup, name, domains };
    const config = UnqlockEnvironment.settings({ ...environmentConfig, ...preferences(), groups:[...environmentConfig.groups.filter(item => item.id !== group?.id), ...(group ? [group] : [])] });
    const message = { type:'environment.save', group:group ? config.groups.find(item => item.id === group.id) : null, preferences:preferences() };
    environmentStatus.textContent = 'Saving…';
    // Dispatch immediately so closing the popup cannot discard a queued edit.
    // The background serializes writes; this queue only coordinates UI updates.
    const saving = environmentMessage(message);
    saveQueue = Promise.allSettled([saveQueue, saving]).then(async results => {
      try {
        if (results[1].status === 'rejected') throw results[1].reason;
        // Refresh labels and switch links without replacing focused inputs or newer edits.
        renderEnvironment(undefined, true);
        if (revision === editRevision) {
          environmentStatus.textContent = missingOrigins.length ? 'Saved. Enable automatic badges below to grant access to custom domains.' : 'Saved';
          if (group) for (const row of domainRows.children) {
            const hostname = row.querySelector('input').value.trim();
            if (group.domains.some(domain => domain.hostname === hostname)) row.dataset.originalHostname = hostname;
          }
        }
        await injectCurrentBadge();
      } catch (error) {
        if (revision === editRevision) environmentStatus.textContent = 'Not saved. ' + error.message;
      }
    });
  } catch (error) { environmentStatus.textContent = 'Not saved. ' + error.message; }
}
environmentForm.addEventListener('submit', event => event.preventDefault());
environmentForm.addEventListener('input', event => {
  if (event.target === groupSelect) return;
  saveEnvironment(event.target.type === 'checkbox');
});
document.getElementById('environment-delete-group').addEventListener('click', async () => {
  environmentFields.disabled = true;
  try {
    await saveQueue;
    await environmentMessage({ type:'environment.save', deleteId:editingGroup.id });
    renderEnvironment();
    environmentStatus.textContent = 'Group removed. Auto-discovery may collect these hosts again when visited.';
  } catch (error) { environmentStatus.textContent = error.message; }
  finally { environmentFields.disabled = false; }
});
accessButton.addEventListener('click', async () => {
  // Call directly from the gesture, before awaits (required by Firefox).
  const requested = [...missingOrigins];
  accessButton.disabled = true;
  try {
    const granted = await extensionAPI.permissions.request({ origins:requested });
    await environmentMessage({ type:'environment.sync' });
    environmentStatus.textContent = granted ? 'Automatic badges enabled. Site access and mappings persist after reloads and browser restarts.' : 'Mappings saved. Site access was not granted; automatic custom-domain badges remain off.';
    if (granted) await injectCurrentBadge();
  } catch (error) { environmentStatus.textContent = 'Could not enable automatic badges: ' + error.message; }
  finally { accessButton.disabled = false; }
});
