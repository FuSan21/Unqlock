import { useEffect, useRef, useState, type DragEvent } from 'react';
import { api } from '@/lib/api';
import * as Transfer from '@/lib/settings-transfer';
import { Toggle } from '../components/controls';
import { importSections, origin, readFile } from '../transfer';

interface Review { parsed: Transfer.Parsed; name: string; from: string; chosen: Transfer.SectionId[] }
interface Done { names: string; badges: boolean }

// Firefox closes its toolbar popup when a file picker opens, so files are chosen here instead, by
// dropping one or through the picker, then reviewed and imported like Import & export does.
export function ImportFile({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const [review, setReview] = useState<Review | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const choose = useRef<HTMLButtonElement>(null);
  const sections = useRef<HTMLFieldSetElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => { choose.current?.focus(); }, []);
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);

  async function open(file: File | undefined) {
    if (!file) return;
    setError('');
    try {
      const parsed = Transfer.parse(await readFile(file));
      setReview({ parsed, name:file.name, from:origin(parsed, ''), chosen:[...parsed.sections] });
      requestAnimationFrame(() => sections.current?.querySelector('input')?.focus());
    } catch (reason) {
      setReview(null);
      setError((reason as Error).message);
      choose.current?.focus();
    }
  }

  async function apply() {
    if (!review) return;
    const chosen = review.parsed.sections.filter(id => review.chosen.includes(id));
    if (!chosen.length) { setError('Choose at least one setting to import.'); return; }
    setBusy(true);
    setError('');
    try {
      const result = await importSections(review.parsed, chosen, async replace => {
        const response = await api.runtime.sendMessage({ type:'environment.save', replace });
        if (!response?.ok) throw new Error(response?.error || 'Could not save environment settings.');
        return { missingOrigins:response.missingOrigins || [] };
      });
      setDone({ names:result.names, badges:chosen.includes('environments') && Boolean(result.missingOrigins?.length) });
      requestAnimationFrame(() => close.current?.focus());
    } catch (reason) { setError((reason as Error).message || 'Try again.'); }
    finally { setBusy(false); }
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setOver(false);
    open(event.dataTransfer.files[0]);
  }

  if (done) return (
    <section className="prompt-result" data-state="success" aria-labelledby="prompt-title">
      <span className="prompt-mark" aria-hidden="true">✓</span>
      <h1 id="prompt-title">Settings imported</h1>
      <p role="status" id="prompt-import-done">Imported {done.names}.{done.badges ? ' Open Environments to enable automatic badges on custom domains.' : ''}</p>
      <div className="prompt-actions"><button ref={close} id="prompt-close" className="primary" type="button" onClick={() => window.close()}>Done</button></div>
    </section>
  );

  return (
    <section className="prompt-request" aria-labelledby="prompt-title" aria-busy={busy}>
      <h1 id="prompt-title">{review ? 'Choose what to import' : 'Import a settings file'}</h1>
      {!review && <>
        <p className="prompt-lead">Choose an Unqlock export to replace some or all of your settings. You pick the sections before anything changes.</p>
        <div className="prompt-drop" data-over={over || undefined} onDragOver={event => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
          <svg className="prompt-drop-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 18v-6" /><path d="m9 15 3-3 3 3" /></svg>
          <p className="prompt-drop-title">Drop an export here</p>
          <p className="prompt-drop-or">or</p>
          <button ref={choose} id="prompt-choose" className="primary" type="button" onClick={() => input.current?.click()}>Choose file</button>
          <p className="prompt-fine">JSON from Import &amp; export, up to 1 MB</p>
        </div>
        <input ref={input} id="prompt-file" type="file" accept=".json,application/json" hidden onChange={event => { const [file] = event.target.files || []; event.target.value = ''; open(file); }} />
      </>}
      {review && <>
        <div className="prompt-file">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
          <div><strong id="prompt-file-name">{review.name}</strong>{review.from && <span>{review.from}</span>}</div>
        </div>
        <fieldset ref={sections} id="prompt-sections" className="prompt-card" disabled={busy}>
          <legend>Settings to replace</legend>
          {review.parsed.sections.map(id => (
            <Toggle key={id} name={id} label={Transfer.sections[id]} checked={review.chosen.includes(id)}
              onChange={checked => setReview({ ...review, chosen:checked ? [...review.chosen, id] : review.chosen.filter(item => item !== id) })} />
          ))}
        </fieldset>
        <p className="prompt-fine">Chosen settings replace the current ones. Anything not chosen stays as it is.</p>
      </>}
      {error && <p className="prompt-notice" role="alert" id="prompt-error">Not imported. {error}</p>}
      {review && (
        <div className="prompt-actions">
          <button id="prompt-other" type="button" disabled={busy} onClick={() => { setReview(null); setError(''); requestAnimationFrame(() => choose.current?.focus()); }}>Choose another</button>
          <button id="prompt-import" className="primary" type="button" disabled={busy} onClick={apply}>{busy ? 'Importing…' : 'Import selected'}</button>
        </div>
      )}
    </section>
  );
}
