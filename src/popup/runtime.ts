import { api } from '@/lib/api';

// The popup runs as the toolbar popup, inside the floating menu's frame on the page, or as a
// detached window or tab that names its target tab in the URL.
export const params = () => new URL(location.href).searchParams;
export const embedded = () => window.top !== window;
export const detached = () => params().has('targetTab');

export interface TargetTab { id: number; url: string }

// The page this popup acts on. The floating menu and detached windows ask the background, which
// resolves the tab through the browser rather than trusting a page-supplied ID.
export async function getTargetTab(): Promise<TargetTab | undefined> {
  if (embedded() || detached()) {
    const result = await api.runtime.sendMessage({ type:'floating.target' });
    if (!result?.ok) throw new Error(result?.error || 'Could not identify this page.');
    return result.tab;
  }
  const [tab] = await api.tabs.query({ active:true, currentWindow:true });
  return tab?.id === undefined ? undefined : { id:tab.id, url:tab.url || '' };
}
