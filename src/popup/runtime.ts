import { api } from '@/lib/api';
import { send } from '@/lib/messages';

// The popup runs as the toolbar popup or inside the floating menu's frame on the page.
export const params = () => new URL(location.href).searchParams;
export const embedded = () => window.top !== window;
// Only Firefox's API has getBrowserInfo.
export const firefox = () => typeof (api.runtime as { getBrowserInfo?: unknown } | undefined)?.getBrowserInfo === 'function';

export interface TargetTab { id: number; url: string }

// The page this popup acts on. The floating menu asks the background, which resolves the tab
// through the browser rather than trusting a page-supplied ID.
export async function getTargetTab(): Promise<TargetTab | undefined> {
  if (embedded()) {
    return (await send({ type:'floating.target' }, 'Could not identify this page.')).tab;
  }
  const [tab] = await api.tabs.query({ active:true, currentWindow:true });
  return tab?.id === undefined ? undefined : { id:tab.id, url:tab.url || '' };
}
