import { Fragment, type ReactNode } from 'react';
import * as Notes from '@/lib/whats-new';
import { Page } from '../components/layout';
import { usePageOpen, usePages, type PageId } from '../pages';
import { useWhatsNew } from '../whats-new';

const pageTitles: Record<PageId, string> = {
  'style-page':'Component style', 'layout-page':'Canvas layout', 'panels-page':'Builder panels', 'quick-page':'Debug tools',
  'environment-page':'Environments', 'launcher-page':'Floating launcher', 'transfer-page':'Import & export', 'whats-new-page':"What's new"
};

// Renders **bold** and *italic* as elements, never as HTML.
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={index}>{part.slice(1, -1)}</em>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

const formatDate = (date?: string) => date ? new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone:'UTC', year:'numeric', month:'long', day:'numeric' }) : '';
const anchor = (version: string) => 'release-' + version.replaceAll('.', '-');

function Items({ release }: { release: Notes.Release }) {
  const { open } = usePages();
  // Returning from a linked page lands on the What's new entry, since this page is closed by then.
  const follow = (page: PageId) => open(page, document.getElementById('open-whats-new'));
  return (
    <ul className="release-items">
      {release.items.map(item => (
        <li key={item.title}>
          <strong>{item.title}:</strong> {inline(item.text)}
          {item.page && <> <button type="button" className="link-button release-link" onClick={() => follow(item.page!)}>{'Open ' + pageTitles[item.page]}<span aria-hidden="true"> ›</span></button></>}
        </li>
      ))}
    </ul>
  );
}

export function WhatsNew() {
  const { current, fresh, dismiss } = useWhatsNew();
  usePageOpen('whats-new-page', dismiss);
  const releases = Notes.shipped(current);
  // Unread releases and the newest one are shown in full; the rest are collapsed.
  const expanded = releases.filter((release, index) => index === 0 || fresh.includes(release.version));
  const earlier = releases.slice(expanded.length);
  const heading = (release: Notes.Release): ReactNode => <>
    {'Unqlock ' + release.version}
    {fresh.includes(release.version) && <span className="release-new">New</span>}
    {release.date && <span className="release-date">{formatDate(release.date)}</span>}
  </>;
  return (
    <Page id="whats-new-page" title="What's new" titleId="whats-new-title">
      {expanded.map(release => (
        <section key={release.version} id={anchor(release.version)} className="release" aria-labelledby={anchor(release.version) + '-title'}>
          <h3 id={anchor(release.version) + '-title'}>{heading(release)}</h3>
          <Items release={release} />
        </section>
      ))}
      {earlier.length > 0 && <>
        <h3 className="settings-heading">Earlier releases</h3>
        {earlier.map(release => (
          <details key={release.version} id={anchor(release.version)} className="release">
            <summary>{heading(release)}</summary>
            <Items release={release} />
          </details>
        ))}
      </>}
    </Page>
  );
}
