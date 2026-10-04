import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { api } from '@/lib/api';
import * as Panels from '@/lib/panel-settings';
import * as Transfer from '@/lib/settings-transfer';
import { Toggle } from '../components/controls';
import { ActionRow, Note, Page, SettingsHeading } from '../components/layout';
import { useEnvironment } from '../environment';
import { usePageLeave } from '../pages';
import { embedded, params } from '../runtime';
import { useSettings } from '../settings';

const storedKeys = ['appearance', 'rowLayout', 'canvasToolbar', 'componentColors', 'builderPanels', 'environment', 'floating', ...Panels.panelIds.map(Panels.rememberedKey)];
interface Message { text: string; error?: boolean }
interface Review { parsed: Transfer.Parsed; summary: string; chosen: Transfer.SectionId[] }

function TransferStatus({ id, message }: { id: string; message: Message }) {
  return <p id={id} className="transfer-status" role="status" aria-live="polite" data-state={message.error ? 'error' : undefined}>{message.text}</p>;
}

// Firefox closes its toolbar popup when the file picker opens, so the picker runs in a tab there.
const firefoxToolbarPopup = () => typeof (api.runtime as { getBrowserInfo?: unknown }).getBrowserInfo === 'function' && !embedded() && !['page', 'targetTab'].some(key => params().has(key));

export function ImportExport() {
  const settings = useSettings();
  const environment = useEnvironment();
  const [busy, setBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState<Message>({ text:'' });
  const [importMessage, setImportMessage] = useState<Message>({ text:'' });
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const output = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const reviewButton = useRef<HTMLButtonElement>(null);
  const sections = useRef<HTMLFieldSetElement>(null);

  async function exportJson() {
    const stored = await api.storage.local.get(storedKeys);
    return Transfer.stringify(stored, { version:api.runtime.getManifest().version });
  }
  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setManualCopy(null);
      return true;
    } catch { /* The floating menu's frame may not be allowed to write to the clipboard. */ }
    flushSync(() => setManualCopy(value));
    output.current!.value = value;
    output.current!.focus();
    output.current!.select();
    try { return document.execCommand('copy'); } catch { return false; }
  }

  function cancel() {
    setReview(null);
  }
  function canceled() {
    cancel();
    setImportMessage({ text:'Import canceled. Nothing changed.' });
    reviewButton.current?.focus();
  }
  function start(value: string, source: string) {
    cancel();
    let parsed: Transfer.Parsed;
    try { parsed = Transfer.parse(value); }
    catch (error) { setImportMessage({ text:'Not imported. ' + (error as Error).message, error:true }); return; }
    const origin = [parsed.extensionVersion && 'Unqlock ' + parsed.extensionVersion, parsed.exportedAt && 'exported ' + parsed.exportedAt.toLocaleString(), source].filter(Boolean).join(' · ');
    flushSync(() => {
      setReview({ parsed, summary:(origin ? origin + '. ' : '') + 'Choose the settings to replace:', chosen:[...parsed.sections] });
      setImportMessage({ text:'' });
    });
    sections.current?.querySelector('input')?.focus();
  }

  async function apply() {
    if (!review) return;
    const chosen = review.parsed.sections.filter(id => review.chosen.includes(id));
    if (!chosen.length) { setImportMessage({ text:'Choose at least one setting to import.', error:true }); return; }
    setBusy(true);
    setImportMessage({ text:'Importing…' });
    try {
      const stored = await api.storage.local.get(storedKeys);
      const { update, environment:imported } = Transfer.apply(review.parsed, chosen, stored);
      // The background owns environment storage and registers badges for custom domains.
      const saved = imported ? await environment.message({ type:'environment.save', replace:imported }) : null;
      if (Object.keys(update).length) await api.storage.local.set(update);
      settings.show(update);
      const names = chosen.map(id => Transfer.sections[id]).join(', ');
      // Finish in one render, with the buttons enabled, so focus can return to Review.
      flushSync(() => {
        setBusy(false);
        cancel();
        setText('');
        setImportMessage({ text:'Imported ' + names + '.' + (chosen.includes('environments') && (saved?.missingOrigins.length ?? environment.missingOrigins.length) ? ' Open Environments to enable automatic badges on custom domains.' : '') });
      });
      reviewButton.current?.focus();
    } catch (error) { setImportMessage({ text:'Not imported. ' + ((error as Error).message || 'Try again.'), error:true }); }
    finally { flushSync(() => setBusy(false)); }
  }

  // Escape dismisses a pending import before leaving the page.
  usePageLeave('transfer-page', ({ escape }) => {
    if (escape && review) {
      canceled();
      return false;
    }
    cancel();
  });

  return (
    <Page id="transfer-page" title="Import & export" titleId="transfer-title">
      <Note>Move settings to another browser or share them with your team. Debug tool inputs are not included.</Note>
      <SettingsHeading>Export</SettingsHeading>
      <Note id="export-help">Exports Component style, Canvas layout, Builder panels, Environments and Floating launcher. Domain groups list your organization’s hostnames; review the file before sharing it.</Note>
      <ActionRow>
        <button id="export-copy" type="button" aria-describedby="export-help" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const copied = await copyText(await exportJson());
            setExportMessage(copied ? { text:'Settings copied as JSON.' } : { text:'Copying is blocked here. The JSON is selected above; press Ctrl+C or ⌘C to copy it.', error:true });
          } catch { setExportMessage({ text:'Could not read settings. Reopen Unqlock and try again.', error:true }); }
          finally { flushSync(() => setBusy(false)); }
        }}>Copy JSON</button>
        <button id="export-download" type="button" aria-describedby="export-help" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            const name = Transfer.fileName();
            // A data URL outlives the popup, which can close while the browser saves the file.
            const link = document.createElement('a');
            link.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(await exportJson());
            link.download = name;
            link.hidden = true;
            document.body.append(link);
            link.click();
            link.remove();
            setExportMessage({ text:'Download started: ' + name });
          } catch { setExportMessage({ text:'Could not read settings. Reopen Unqlock and try again.', error:true }); }
          finally { flushSync(() => setBusy(false)); }
        }}>Download file</button>
      </ActionRow>
      <textarea ref={output} id="export-output" className="transfer-text" rows={6} readOnly spellCheck={false} aria-label="Exported settings" hidden={manualCopy === null} defaultValue="" />
      <TransferStatus id="export-status" message={exportMessage} />
      <SettingsHeading>Import</SettingsHeading>
      <label htmlFor="import-text" className="stacked">Paste exported JSON</label>
      <textarea id="import-text" className="transfer-text" rows={6} spellCheck={false} placeholder='{ "unqlock": 1, … }' value={text} onChange={event => setText(event.target.value)} />
      <ActionRow>
        <button ref={reviewButton} id="import-review" type="button" disabled={busy} onClick={() => start(text, '')}>Review pasted JSON</button>
        <button id="import-file-button" type="button" disabled={busy} onClick={async () => {
          if (!firefoxToolbarPopup()) { fileInput.current!.click(); return; }
          try {
            await api.tabs.create({ url:api.runtime.getURL('/popup.html') + '?page=transfer-page' });
            window.close();
          } catch { setImportMessage({ text:'Could not open the file picker. Paste the JSON instead.', error:true }); }
        }}>Choose file</button>
      </ActionRow>
      <input ref={fileInput} id="import-file" type="file" accept=".json,application/json" hidden onChange={async event => {
        const [file] = event.target.files || [];
        event.target.value = '';
        if (!file) return;
        if (file.size > 1024 * 1024) { cancel(); setImportMessage({ text:'Not imported. This file is larger than 1 MB and is not an Unqlock export.', error:true }); return; }
        try { start(await file.text(), file.name); }
        catch { setImportMessage({ text:'Could not read ' + file.name + '. Try again.', error:true }); }
      }} />
      <div id="import-preview" className="debug-confirmation" hidden={!review}>
        <p id="import-summary">{review?.summary}</p>
        <fieldset ref={sections} id="import-sections">
          <legend className="visually-hidden">Settings to replace</legend>
          {review?.parsed.sections.map(id => (
            <Toggle key={id} name={id} label={Transfer.sections[id]} checked={review.chosen.includes(id)}
              onChange={checked => setReview({ ...review, chosen:checked ? [...review.chosen, id] : review.chosen.filter(item => item !== id) })} />
          ))}
        </fieldset>
        <Note>Chosen settings replace the current ones. Anything not chosen stays as it is.</Note>
        <ActionRow>
          <button id="import-apply" className="primary" type="button" disabled={busy} onClick={apply}>Import selected</button>
          <button id="import-cancel" type="button" onClick={canceled}>Cancel</button>
        </ActionRow>
      </div>
      <TransferStatus id="import-status" message={importMessage} />
    </Page>
  );
}
