import type { ReactNode } from 'react';
import * as Environment from '@/lib/environment';
import { AppearanceToggle } from '../components/AppearanceToggle';
import { FeatureEntry, MenuHeading } from '../components/layout';
import { useDebug } from '../debug';
import { useEnvironment } from '../environment';
import { usePages } from '../pages';
import { useSettings } from '../settings';

const icon = (paths: ReactNode, linecap = true) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap={linecap ? 'round' : undefined} strokeLinejoin="round">{paths}</svg>
);

// The current environment, with links to the same path on the rest of its group.
function EnvironmentStrip() {
  const { open } = usePages();
  const { config, current, target, error } = useEnvironment();
  const domains = current && config ? (config.groups.find(group => group.id === current.groupId)?.domains || []).filter(domain => domain.hostname !== current.host) : [];
  let summary: ReactNode = 'Checking environment…';
  if (error) summary = error;
  else if (config && !current) summary = 'Open an Unqork page to see its environment.';
  else if (current) summary = <><strong className="environment-kind" data-kind={current.kind}>{current.label}</strong>{' · ' + current.host}</>;
  return (
    <section id="environment-strip" className="environment-strip" aria-label="Current environment">
      <div className="strip-row">
        <p id="environment-summary" title={current?.source}>{summary}</p>
        <button id="environment-manage" className="link-button" type="button" data-page="environment-page" aria-describedby="environment-summary" onClick={event => open('environment-page', event.currentTarget)}>Manage<span aria-hidden="true"> ›</span></button>
      </div>
      <div id="environment-links">
        {domains.map(domain => {
          const shared = domains.some(other => other !== domain && other.environment === domain.environment);
          // A page that cannot be switched, such as one with credentials in its address, gets no links.
          let href: string;
          try { href = Environment.switchUrl(target!.url, domain.hostname); } catch { return null; }
          return <a key={domain.hostname} href={href} target="_blank" rel="noopener noreferrer" title={href}>{'Open in ' + Environment.labels[domain.environment] + (shared ? ' · ' + domain.hostname : '') + ' ↗'}</a>;
        })}
      </div>
    </section>
  );
}

export function Home() {
  const { current } = usePages();
  const { busy } = useSettings();
  const debug = useDebug();
  return (
    <div id="home" hidden={current !== null}>
      <EnvironmentStrip />
      <fieldset id="home-switches" className="appearance-fields quick-switches" disabled={busy}>
        <legend className="visually-hidden">Quick switches</legend>
        <AppearanceToggle setting="enabled" label="Component styling" tile onHome />
        <AppearanceToggle setting="compact" label="Compact components" tile onHome />
      </fieldset>
      <div className="home-action">
        <button id="home-log" className="primary" type="button" disabled={debug.busy} onClick={event => debug.logFromHome(event.currentTarget)}>Log page data</button>
        <p id="home-log-status" className="debug-feedback" role="status" aria-live="polite" data-state={debug.feedback.home.state}>{debug.feedback.home.text}</p>
      </div>
      <nav id="feature-menu" aria-label="Features">
        <MenuHeading>Builder</MenuHeading>
        <FeatureEntry id="open-style" page="style-page" icon="ƒ" title="Component style" description="Colors, icons, labels and frames" />
        <FeatureEntry id="open-layout" page="layout-page" icon={icon(<path d="M4 6h16M4 12h16M8 18h12" />)} title="Canvas layout" description="Compact, row layout and containers" />
        <FeatureEntry id="open-panels" page="panels-page" icon={icon(<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></>, false)} title="Builder panels" description="Collapse and widths" />
        <MenuHeading>Tools</MenuHeading>
        <FeatureEntry id="open-quick" page="quick-page" icon={icon(<path d="m13 2-9 12h7l-1 8 10-12h-7z" />)} title="Debug tools" description="Inspect, data and execute" />
        <MenuHeading>Setup</MenuHeading>
        <FeatureEntry id="open-environment" page="environment-page" icon="◎" title="Environments" description="Groups and production guard" />
        <FeatureEntry id="open-launcher" page="launcher-page" icon={icon(<><rect x="3" y="3" width="18" height="18" rx="2" /><rect x="12" y="13" width="6" height="5" rx="1" /></>, false)} title="Floating launcher" description="Show, corner and environment label" />
        <FeatureEntry id="open-transfer" page="transfer-page" icon={icon(<path d="M7 4v13M3 13l4 4 4-4M17 20V7M13 11l4-4 4 4" />)} title="Import & export" description="Back up or share settings as JSON" />
      </nav>
    </div>
  );
}
