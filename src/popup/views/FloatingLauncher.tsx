import { useState } from 'react';
import { api } from '@/lib/api';
import * as Environment from '@/lib/environment';
import { Select, Toggle } from '../components/controls';
import { Note, Page, Status } from '../components/layout';
import { useEnvironment } from '../environment';
import { usePageOpen } from '../pages';

const positions = [['top-left', 'Top left'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right']] as const;

export function FloatingLauncher() {
  const environment = useEnvironment();
  const [floating, setFloating] = useState(() => Environment.floatingSettings());
  const [badge, setBadge] = useState(false);
  const [disabled, setDisabled] = useState(true);
  const [status, setStatus] = useState('');

  usePageOpen('launcher-page', async () => {
    setDisabled(true);
    setStatus('Loading…');
    try {
      const [stored, result] = await Promise.all([api.storage.local.get('floating'), environment.message({ type:'environment.read' })]);
      setFloating(Environment.floatingSettings(stored.floating));
      setBadge(result.config.badge);
      setDisabled(false);
      setStatus('');
    } catch { setStatus('Could not load settings. Reopen Unqlock to retry.'); }
  });

  async function save(task: () => Promise<unknown>) {
    setDisabled(true);
    try {
      await task();
      setStatus('Saved');
    } catch { setStatus('Could not save. Try again.'); }
    finally { setDisabled(false); }
  }
  const saveFloating = (next: Environment.FloatingSettings) => {
    setFloating(next);
    save(() => api.storage.local.set({ floating:Environment.floatingSettings(next) }));
  };
  const reason = floating.enabled ? '' : 'Turn on Show floating launcher to change this setting.';

  return (
    <Page id="launcher-page" title="Floating launcher" titleId="launcher-title">
      <form id="launcher-form" onSubmit={event => event.preventDefault()}>
        <fieldset id="launcher-fields" disabled={disabled}>
          <Toggle name="enabled" label="Show floating launcher" checked={floating.enabled} onChange={enabled => saveFloating({ ...floating, enabled })} />
          <Select id="floating-position" name="position" label="Corner" options={positions} value={floating.position} reason={reason} onChange={position => saveFloating({ ...floating, position })} />
          {/* The label is an environment preference; the background merges it into the saved groups. */}
          <Toggle name="badge" label="Show environment in badge" checked={badge} reason={reason}
            onChange={checked => { setBadge(checked); save(() => environment.message({ type:'environment.save', preferences:{ badge:checked } })); }} />
        </fieldset>
      </form>
      <Note>Click the floating Unqlock icon to open this menu. The environment label comes from the domain groups under Environments; hiding it does not turn off production safeguards. Changes save automatically.</Note>
      <Status id="launcher-status">{status}</Status>
    </Page>
  );
}
