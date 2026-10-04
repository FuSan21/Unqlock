"use strict";
const launcherForm = document.getElementById('launcher-form');
const launcherFields = document.getElementById('launcher-fields');
const launcherStatus = document.getElementById('launcher-status');
UnqlockPages.onOpen('launcher-page', async () => {
  launcherFields.disabled = true;
  launcherStatus.textContent = 'Loading…';
  try {
    const [stored] = await Promise.all([extensionAPI.storage.local.get('floating'), environmentMessage({ type:'environment.read' })]);
    const config = UnqlockEnvironment.floatingSettings(stored.floating);
    launcherForm.elements.enabled.checked = config.enabled;
    launcherForm.elements.position.value = config.position;
    launcherForm.elements.badge.checked = environmentConfig.badge;
    updateLauncherDependencies();
    launcherFields.disabled = false;
    launcherStatus.textContent = '';
  } catch { launcherStatus.textContent = 'Could not load settings. Reopen Unqlock to retry.'; }
});
launcherForm.addEventListener('submit', event => event.preventDefault());
launcherForm.addEventListener('change', async event => {
  updateLauncherDependencies();
  launcherFields.disabled = true;
  try {
    // The label is an environment preference; the background merges it into the saved groups.
    if (event.target.name === 'badge') await environmentMessage({ type:'environment.save', preferences:{ badge:launcherForm.elements.badge.checked } });
    else {
      const floating = UnqlockEnvironment.floatingSettings({ enabled:launcherForm.elements.enabled.checked, position:launcherForm.elements.position.value });
      await extensionAPI.storage.local.set({ floating });
    }
    launcherStatus.textContent = 'Saved';
  } catch { launcherStatus.textContent = 'Could not save. Try again.'; }
  finally { launcherFields.disabled = false; }
});
function updateLauncherDependencies() {
  const reason = launcherForm.elements.enabled.checked ? '' : 'Turn on Show floating launcher to change this setting.';
  UnqlockDisabled.set(launcherForm.elements.position, reason);
  UnqlockDisabled.set(launcherForm.elements.badge, reason);
}
