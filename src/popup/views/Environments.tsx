import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import * as Environment from '@/lib/environment';
import { Toggle } from '../components/controls';
import { ActionRow, Button, Note, Page, Status } from '../components/layout';
import { useEnvironment, type EnvironmentResult } from '../environment';
import { usePageOpen } from '../pages';

interface DomainRow { key: string; hostname: string; environment: Environment.EnvironmentKind; originalHostname: string }
interface Editor { id: string; name: string; autoKey?: string; rows: DomainRow[] }
type Preferences = Pick<Environment.EnvironmentSettings, 'blockProduction' | 'autoDiscover'>;

const environmentOptions = Object.entries(Environment.labels) as [Environment.EnvironmentKind, string][];
const unsavedReason = 'This group has not been saved yet. Enter a valid group name and hostname to save it.';
const row = (domain?: Environment.Domain): DomainRow => ({ key:crypto.randomUUID(), hostname:domain?.hostname || '', environment:domain?.environment || 'unknown', originalHostname:domain?.hostname || '' });

function editorFor(config: Environment.EnvironmentSettings, id: string | undefined): Editor {
  const group = config.groups.find(item => item.id === id) || { id:crypto.randomUUID(), name:'', domains:[] };
  return { id:group.id, name:group.name, ...(group.autoKey ? { autoKey:group.autoKey } : {}), rows:group.domains.length ? group.domains.map(row) : [row()] };
}

export function Environments() {
  const environment = useEnvironment();
  const { config, current, target, missingOrigins } = environment;
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [preferences, setPreferences] = useState<Preferences>({ blockProduction:false, autoDiscover:true });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [accessPending, setAccessPending] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const revision = useRef(0);
  const configRef = useRef(config);
  configRef.current = config;
  const targetRef = useRef(target);
  targetRef.current = target;
  const addDomainButton = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focus) return;
    if (focus === 'name') nameInput.current?.focus();
    else if (focus === 'add') addDomainButton.current?.focus();
    else document.querySelector<HTMLInputElement>('[data-domain="' + focus + '"] input')?.focus();
    setFocus(null);
  }, [focus]);

  function edit(id: string | undefined, settings = configRef.current) {
    revision.current++;
    if (settings) setEditor(editorFor(settings, id));
  }

  usePageOpen('environment-page', async () => {
    setLoading(true);
    setStatus('Loading…');
    try {
      await saveQueue.current;
      const result = await environment.reload();
      setPreferences({ blockProduction:result.config.blockProduction, autoDiscover:result.config.autoDiscover });
      const page = result.target ? Environment.detect(result.target.url, result.config) : null;
      edit(page?.groupId ?? result.config.groups[0]?.id, result.config);
      setLoading(false);
      setStatus(result.missingOrigins.length ? 'Saved custom domains need site access for automatic badges.' : '');
    } catch (error) { setStatus((error as Error).message); }
  });

  async function injectCurrentBadge(settings: Environment.EnvironmentSettings) {
    const page = targetRef.current;
    if (!page || !settings.groups.some(group => group.domains.some(domain => domain.hostname === new URL(page.url).hostname))) return;
    try { await api.scripting.executeScript({ target:{ tabId:page.id }, files:['/content-scripts/environment-badge.js'] }); } catch { /* Registered scripts run on the next permitted page load. */ }
  }

  // Valid changes save as they are made. The background serializes writes; this queue only
  // coordinates the status and row updates.
  function save(next: Editor, nextPreferences: Preferences, preferencesOnly = false) {
    const saved = configRef.current;
    if (!saved) return;
    const thisRevision = ++revision.current;
    try {
      if (!preferencesOnly && next.rows.some(item => item.originalHostname && !item.hostname.trim())) throw new Error('Enter a hostname, or choose Remove to delete the domain.');
      const domains = next.rows.map(item => ({ hostname:item.hostname.trim(), environment:item.environment })).filter(domain => domain.hostname);
      const name = next.name.trim();
      const known = saved.groups.some(group => group.id === next.id);
      const group = preferencesOnly || (!name && !domains.length && !known) ? null : { id:next.id, name, ...(next.autoKey ? { autoKey:next.autoKey } : {}), domains };
      const settings = Environment.settings({ ...saved, ...nextPreferences, groups:[...saved.groups.filter(item => item.id !== group?.id), ...(group ? [group] : [])] });
      setStatus('Saving…');
      // Dispatch immediately so closing the popup cannot discard a queued edit.
      const saving = environment.message({ type:'environment.save', group:group ? settings.groups.find(item => item.id === group.id) : null, preferences:nextPreferences });
      saveQueue.current = Promise.allSettled([saveQueue.current, saving]).then(async results => {
        try {
          const outcome = results[1] as PromiseSettledResult<EnvironmentResult>;
          if (outcome.status === 'rejected') throw outcome.reason;
          if (thisRevision === revision.current) {
            setStatus(outcome.value.missingOrigins.length ? 'Saved. Enable automatic badges below to grant access to custom domains.' : 'Saved');
            if (group) setEditor(previous => previous && ({ ...previous, rows:previous.rows.map(item => group.domains.some(domain => domain.hostname === item.hostname.trim()) ? { ...item, originalHostname:item.hostname.trim() } : item) }));
          }
          await injectCurrentBadge(outcome.value.config);
        } catch (error) {
          if (thisRevision === revision.current) setStatus('Not saved. ' + (error as Error).message);
        }
      });
    } catch (error) { setStatus('Not saved. ' + (error as Error).message); }
  }

  function change(next: Editor) {
    setEditor(next);
    save(next, preferences);
  }

  const saved = Boolean(editor && config?.groups.some(group => group.id === editor.id));
  return (
    <Page id="environment-page" title="Environments" titleId="environment-title">
      <p id="environment-current">{current ? 'Current: ' + current.label + ' · ' + current.host + ' — ' + current.source : 'Open a web page to identify its environment.'}</p>
      <form id="environment-form" onSubmit={event => event.preventDefault()}>
        <fieldset id="environment-fields" disabled={loading}>
          {(['blockProduction', 'autoDiscover'] as const).map(key => (
            <Toggle key={key} name={key} label={key === 'blockProduction' ? 'Disable Data and Execute in production' : 'Discover Unqork domain groups automatically'} checked={preferences[key]}
              onChange={checked => {
                const next = { ...preferences, [key]:checked };
                setPreferences(next);
                if (editor) save(editor, next, true);
              }} />
          ))}
          <label htmlFor="environment-group">Domain group</label>
          <select id="environment-group" value={saved ? editor!.id : ''} onChange={event => edit(event.target.value)}>
            <option value="">New group</option>
            {config?.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <ActionRow>
            <button id="environment-new-group" type="button" onClick={() => { edit(''); setFocus('name'); }}>New group</button>
            <Button id="environment-delete-group" reason={saved ? '' : unsavedReason} onClick={async () => {
              setLoading(true);
              try {
                await saveQueue.current;
                const result = await environment.message({ type:'environment.save', deleteId:editor!.id });
                const page = targetRef.current ? Environment.detect(targetRef.current.url, result.config) : null;
                edit(page?.groupId ?? result.config.groups[0]?.id, result.config);
                setStatus('Group removed. Auto-discovery may collect these hosts again when visited.');
              } catch (error) { setStatus((error as Error).message); }
              finally { setLoading(false); }
            }}>Delete group</Button>
          </ActionRow>
          <label htmlFor="environment-group-name">Group name</label>
          <input ref={nameInput} id="environment-group-name" type="text" maxLength={80} placeholder="Organization or project" value={editor?.name ?? ''}
            onChange={event => editor && change({ ...editor, name:event.target.value })} />
          <Note>Visited Unqork hosts are grouped automatically. Edit detected labels or add your own domains. Unknown does not mean non-production. Valid changes save automatically.</Note>
          <div id="environment-hosts">
            {editor?.rows.map(item => {
              const update = (patch: Partial<DomainRow>) => change({ ...editor, rows:editor.rows.map(other => other.key === item.key ? { ...other, ...patch } : other) });
              return (
                <div key={item.key} className="environment-domain" data-domain={item.key}>
                  <input type="text" value={item.hostname} placeholder="organization-staging.unqork.io" autoComplete="off" aria-label="Hostname" onChange={event => update({ hostname:event.target.value })} />
                  <select aria-label="Environment for hostname" value={item.environment} onChange={event => update({ environment:event.target.value as Environment.EnvironmentKind })}>
                    {environmentOptions.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
                  </select>
                  <button type="button" aria-label="Remove domain" onClick={() => { change({ ...editor, rows:editor.rows.filter(other => other.key !== item.key) }); setFocus('add'); }}>Remove</button>
                </div>
              );
            })}
          </div>
          <button ref={addDomainButton} id="environment-add-domain" type="button" onClick={() => {
            if (!editor) return;
            const added = row();
            setEditor({ ...editor, rows:[...editor.rows, added] });
            setFocus(added.key);
          }}>Add domain</button>
        </fieldset>
      </form>
      <Status id="environment-status">{status}</Status>
      <button id="environment-access" type="button" hidden={missingOrigins.length === 0} title={missingOrigins.join('\n')} disabled={accessPending} onClick={async () => {
        // Call directly from the gesture, before awaits (required by Firefox).
        const requested = [...missingOrigins];
        setAccessPending(true);
        try {
          const granted = await api.permissions.request({ origins:requested });
          const result = await environment.message({ type:'environment.sync' });
          setStatus(granted ? 'Automatic badges enabled. Site access and mappings persist after reloads and browser restarts.' : 'Mappings saved. Site access was not granted; automatic custom-domain badges remain off.');
          if (granted) await injectCurrentBadge(result.config);
        } catch (error) { setStatus('Could not enable automatic badges: ' + (error as Error).message); }
        finally { setAccessPending(false); }
      }}>Enable automatic badges on saved custom domains</button>
      <Note>Custom domains need a one-time browser site-access grant. Group mappings are stored locally. The switch links on the home menu open a new tab with the same path, query and fragment; review URL parameters before switching. The environment label in the badge is set under Floating launcher.</Note>
    </Page>
  );
}
