"use strict";
const generalPage = document.getElementById('general-page');
const generalForm = document.getElementById('general-form');
const generalFields = document.getElementById('general-fields');
const generalStatus = document.getElementById('general-status');
document.getElementById('open-general').addEventListener('click', async () => {
  menu.hidden = true;
  generalPage.hidden = false;
  document.getElementById('general-title').focus();
  generalFields.disabled = true;
  generalStatus.textContent = 'Loading…';
  try {
    const config = UnqlockEnvironment.floatingSettings((await extensionAPI.storage.local.get('floating')).floating);
    generalForm.elements.enabled.checked = config.enabled;
    generalForm.elements.position.value = config.position;
    updateFloatingDependencies();
    generalFields.disabled = false;
    generalStatus.textContent = '';
  } catch { generalStatus.textContent = 'Could not load settings. Reopen Unqlock to retry.'; }
});
generalForm.addEventListener('submit', event => event.preventDefault());
generalForm.addEventListener('change', async () => {
  updateFloatingDependencies();
  generalFields.disabled = true;
  try {
    const floating = UnqlockEnvironment.floatingSettings({ enabled:generalForm.elements.enabled.checked, position:generalForm.elements.position.value });
    await extensionAPI.storage.local.set({ floating });
    generalStatus.textContent = 'Saved';
  } catch { generalStatus.textContent = 'Could not save. Try again.'; }
  finally { generalFields.disabled = false; }
});
function updateFloatingDependencies() {
  UnqlockDisabled.set(generalForm.elements.position, generalForm.elements.enabled.checked ? '' : 'Turn on Show Floating window to change its position.');
}
function closeGeneral() {
  generalPage.hidden = true;
  menu.hidden = false;
  document.getElementById('open-general').focus();
}
document.getElementById('general-back').addEventListener('click', closeGeneral);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !generalPage.hidden) { event.preventDefault(); closeGeneral(); }
});
