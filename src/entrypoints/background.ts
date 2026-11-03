import { defineBackground } from 'wxt/utils/define-background';
import { api, type Stored } from '@/lib/api';
import * as Access from '@/lib/access';
import * as DevOverlay from '@/lib/dev-overlay';
import * as Environment from '@/lib/environment';
import { promptKinds, reply } from '@/lib/messages';
import { runQuickAction, type QuickRequest } from '@/lib/quick-actions';
import * as SseDebugger from '@/lib/sse-debugger';
import * as WhatsNew from '@/lib/whats-new';

export default defineBackground(() => {
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }
  async function readConfig() {
    return Environment.settings((await api.storage.local.get('environment')).environment);
  }
  // The saved custom domains, split by whether the browser has granted each one.
  async function customAccess(config: Environment.EnvironmentSettings) {
    const origins = Environment.customOrigins(config);
    const granted = await Promise.all(origins.map(origin => api.permissions.contains({ origins:[origin] })));
    return { permitted:origins.filter((_, index) => granted[index]), missing:origins.filter((_, index) => !granted[index]) };
  }
  // Registers the badge for the granted custom domains and returns the access each domain has.
  async function syncScripts(config: Environment.EnvironmentSettings) {
    const { permitted, missing } = await customAccess(config);
    const id = 'unqlock-custom-environments';
    const existing = await api.scripting.getRegisteredContentScripts({ ids:[id] });
    if (!permitted.length) {
      if (existing.length) await api.scripting.unregisterContentScripts({ ids:[id] });
    } else {
      const script = { id, matches:permitted.sort(), js:['content-scripts/environment-badge.js'], runAt:'document_idle' as const, persistAcrossSessions:true };
      if (existing.length) await api.scripting.updateContentScripts([script]);
      else await api.scripting.registerContentScripts([script]);
    }
    return { permitted, missing };
  }
  // The dev overlay's scripts exist only while Detach dev overlay or the Unqlock SSE debugger is on and
  // their site access is granted: Chrome does not extend the manifest content scripts' access to
  // registered ones. Turning one on also adds its button to builder tabs already open; the guard, which
  // only Detach needs, can only take effect from their next load.
  const overlayOptions = async () => {
    const stored = await api.storage.local.get([DevOverlay.key, SseDebugger.key]);
    return { detach:DevOverlay.enabled(stored[DevOverlay.key]), debugger:SseDebugger.enabled(stored[SseDebugger.key]) };
  };
  // `turnedOn` names an option just turned on. Its button is injected into open tabs only when the other option
  // was off: otherwise the script is already running there, follows the option itself, and injecting again
  // would only stack another copy of its stylesheet.
  async function syncOverlay(turnedOn?: 'detach' | 'debugger') {
    const granted = await api.permissions.contains({ origins:DevOverlay.matches });
    const options = await overlayOptions();
    const wanted = granted ? DevOverlay.needed(options.detach, options.debugger) : [];
    const ids = DevOverlay.scripts.map(script => script.id);
    const existing = (await api.scripting.getRegisteredContentScripts({ ids })).map(script => script.id);
    const extra = existing.filter(id => !wanted.some(script => script.id === id));
    if (extra.length) await api.scripting.unregisterContentScripts({ ids:extra });
    const missing = wanted.filter(script => !existing.includes(script.id));
    if (missing.length) await api.scripting.registerContentScripts(missing);
    // Persisted registrations keep their definition across updates, so refresh the ones kept.
    const kept = wanted.filter(script => existing.includes(script.id));
    if (kept.length) await api.scripting.updateContentScripts(kept);
    if (!turnedOn || !wanted.length || options[turnedOn === 'detach' ? 'debugger' : 'detach']) return;
    for (const tab of await api.tabs.query({ url:'https://*.unqork.io/*' })) {
      if (tab.id === undefined) continue;
      api.scripting.insertCSS({ target:{ tabId:tab.id }, files:['/content-scripts/dev-overlay.css'] }).catch(() => {});
      api.scripting.executeScript({ target:{ tabId:tab.id }, files:['/content-scripts/dev-overlay.js'] }).catch(() => {});
    }
  }
  async function observe(host: string) {
    const before = await readConfig();
    const config = Environment.discover(before, host);
    if (JSON.stringify(before) !== JSON.stringify(config)) await api.storage.local.set({ environment:config });
    return config;
  }
  // Reading a tab's URL needs host access the badge never requests, so the page in it
  // reports its own address. sender.url comes from the browser, not from page content.
  const sourceKey = (tabId: number) => 'floating.source.' + tabId;
  async function rememberSource(tabId: number, url: string) {
    await api.storage.session.set({ [sourceKey(tabId)]:url });
  }
  async function resolveSource(tabId: number): Promise<string> {
    const live: { url?: string } | undefined = await api.tabs.sendMessage(tabId, { type:'floating.source' }, { frameId:0 }).catch(() => undefined);
    if (live?.url) { await rememberSource(tabId, live.url); return live.url; }
    const key = sourceKey(tabId);
    const stored = (await api.storage.session.get(key))[key];
    return (stored as string | undefined) || (await api.tabs.get(tabId)).url!;
  }
  async function debugAccess(tab: { id: number; url: string }) {
    if (await api.permissions.contains({ origins:[new URL(tab.url).origin + '/*'] })) return true;
    // An existing activeTab grant can permit execution without a persistent host grant.
    try {
      const results = await api.scripting.executeScript({ target:{ tabId:tab.id }, func:() => true });
      return results[0]?.result === true;
    } catch { return false; }
  }
  // The prompt window asks for access or picks a settings file where a popup cannot (src/lib/access.ts).
  const fromPage = (sender: { url?: string }, file: '/popup.html' | typeof Access.page) => sender.url?.split('?')[0] === api.runtime.getURL(file);
  // The address of the top frame that sent a message, from the browser rather than the page, when it is a web
  // page using one of `protocols`.
  function topPage(sender: { url?: string; frameId?: number }, protocols = ['https:']) {
    if (!sender.url || sender.frameId !== 0) return null;
    try {
      const url = new URL(sender.url);
      return protocols.includes(url.protocol) ? url : null;
    } catch { return null; }
  }
  const onUnqork = (url: URL | null) => url !== null && url.hostname.endsWith('.unqork.io');
  async function openPrompt(kind: Access.AccessKind | 'import', tabId?: number) {
    const query = new URLSearchParams({ kind, ...(tabId === undefined ? {} : { tab:String(tabId) }) });
    await api.windows.create({ url:api.runtime.getURL(Access.page) + '?' + query, type:'popup', ...Access.sizes[kind === 'import' ? 'import' : 'access'] });
  }
  // A configured web page in a tab, read through the page itself since host access may be missing.
  async function configuredPage(tabId: number) {
    await api.tabs.get(tabId);
    const href = await resolveSource(tabId);
    const url = new URL(href);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported page.');
    const config = await readConfig();
    if (!url.hostname.endsWith('.unqork.io') && !config.groups.some(group => group.domains.some(domain => domain.hostname === url.hostname))) throw new Error('Page is not configured.');
    return { href, url, config };
  }
  // What each kind of request asks for. Badges ask for the saved custom domains not yet granted.
  async function accessOrigins(kind: Access.AccessKind, tabId?: number) {
    if (kind === 'devOverlay' || kind === 'sseDebugger') return DevOverlay.matches;
    if (kind === 'debug') {
      if (tabId === undefined) throw new Error('Debug tools need a page.');
      return [(await configuredPage(tabId)).url.origin + '/*'];
    }
    return (await customAccess(await readConfig())).missing;
  }
  // Finishes a granted request in the background, since a Firefox toolbar popup has closed by now.
  async function afterGrant(kind: Access.AccessKind, tabId?: number) {
    // In the queue with devOverlay.set, which reads one option to decide whether to give the shared grant back.
    if (kind === 'devOverlay') await serial(() => api.storage.local.set({ [DevOverlay.key]:true }));
    if (kind === 'sseDebugger') await serial(() => api.storage.local.set({ [SseDebugger.key]:true }));
    if (kind === 'badges') {
      // Read inside the queue, so a save queued meanwhile is not overwritten with the older domains.
      const { permitted } = await serial(async () => syncScripts(await readConfig()));
      if (permitted.length) for (const tab of await api.tabs.query({ url:permitted })) {
        if (tab.id !== undefined) api.scripting.executeScript({ target:{ tabId:tab.id }, files:['/content-scripts/environment-badge.js'] }).catch(() => {});
      }
    }
    // The floating menu that asked learns through its page.
    if (tabId !== undefined) await api.tabs.sendMessage(tabId, { type:'access.changed', kind }, { frameId:0 }).catch(() => {});
  }
  api.tabs.onRemoved.addListener(tabId => api.storage.session.remove(sourceKey(tabId)).catch(() => {}));
  // A tab that loads another page no longer holds the page its badge reported, so a site it moves on to cannot
  // frame the menu as if it were that page. The badge reports again when the menu next opens there.
  api.tabs.onUpdated?.addListener((tabId, change) => { if (change.status === 'loading') api.storage.session.remove(sourceKey(tabId)).catch(() => {}); });
  // One debugger window per builder tab: a second click focuses it. Window IDs by tab live in session storage.
  const debuggerWindows = 'sse.windows';
  // It opens maximized. A browser that refuses a maximized popup gets the screen's work area the page reported.
  // The map of windows is read and written through the background's queue, so two at once lose nothing.
  const readWindows = async () => ((await api.storage.session.get(debuggerWindows))[debuggerWindows] || {}) as Record<string, number>;
  async function openDebugger(tabId: number, screen: Record<string, unknown>) {
    const windows = await readWindows();
    const existing = windows[tabId];
    if (existing !== undefined) {
      try { await api.windows.update(existing, { focused:true }); return; } catch {}
    }
    const url = api.runtime.getURL(SseDebugger.page) + '?tab=' + tabId;
    const number = (value: unknown, minimum: number) => typeof value === 'number' && Number.isFinite(value) && value >= minimum ? Math.round(value) : undefined;
    const width = number(screen.width, 480), height = number(screen.height, 480), left = number(screen.left, -100000), top = number(screen.top, -100000);
    const created = await api.windows.create({ url, type:'popup', state:'maximized' }).catch(() => api.windows.create({
      url, type:'popup', width:width ?? SseDebugger.size.width, height:height ?? SseDebugger.size.height,
      ...(width !== undefined && left !== undefined ? { left } : {}), ...(height !== undefined && top !== undefined ? { top } : {})
    }));
    if (created?.id !== undefined) await api.storage.session.set({ [debuggerWindows]:{ ...await readWindows(), [tabId]:created.id } });
  }
  api.windows?.onRemoved?.addListener(windowId => {
    serial(async () => {
      const windows = await readWindows();
      const kept = Object.fromEntries(Object.entries(windows).filter(([, id]) => id !== windowId));
      if (Object.keys(kept).length !== Object.keys(windows).length) await api.storage.session.set({ [debuggerWindows]:kept });
    }).catch(() => {});
  });
  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === 'prompt.open') {
      // Debug tools open theirs through debug.permission, which resolves and checks the page first.
      if (!fromPage(sender, '/popup.html') || !(promptKinds as readonly unknown[]).includes(message.kind)) return;
      // A floating menu names its own tab, to be told when access is granted.
      const tabId = sender.frameId ? sender.tab?.id : undefined;
      return reply(respond, (async () => {
        if (message.kind !== 'import') {
          const origins = await accessOrigins(message.kind);
          if (!origins.length || await api.permissions.contains({ origins })) return { ok:true, granted:true };
        }
        await openPrompt(message.kind, tabId);
        return { ok:true, granted:false };
      })());
    }
    // Detach dev overlay and the Unqlock SSE debugger are read and changed here, since a floating menu
    // frame may have no permissions API. They share one unqork.io grant.
    if (message?.type === 'devOverlay.state' || message?.type === 'devOverlay.set') {
      if (!fromPage(sender, '/popup.html')) return;
      const key = message.option === 'debugger' ? SseDebugger.key : DevOverlay.key;
      const other = key === DevOverlay.key ? SseDebugger.key : DevOverlay.key;
      return reply(respond, serial(async () => {
        const granted = await api.permissions.contains({ origins:DevOverlay.matches });
        if (message.type === 'devOverlay.set') {
          if (message.on === true) {
            // Turning on needs the access first; the popup asks for it, directly or in the prompt window.
            if (!granted) return { ok:true, on:false, needsAccess:true };
            await api.storage.local.set({ [key]:true });
          } else {
            await api.storage.local.set({ [key]:false });
            // Gives the access back once neither option needs it, so nothing more runs on Unqork pages.
            if ((await api.storage.local.get(other))[other] !== true) await api.permissions.remove({ origins:DevOverlay.matches }).catch(() => false);
          }
        }
        const on = (await api.storage.local.get(key))[key] === true;
        return { ok:true, on:on && await api.permissions.contains({ origins:DevOverlay.matches }) };
      }));
    }
    // Open in Unqlock debugger, from the button on Unqork's dev overlay in a builder tab.
    if (message?.type === 'sse.open') {
      if (!sender.tab?.id || !onUnqork(topPage(sender))) return;
      return reply(respond, (async () => {
        if (!(await overlayOptions()).debugger) throw new Error('The Unqlock SSE debugger is off.');
        await serial(() => openDebugger(sender.tab!.id!, { width:message.width, height:message.height, left:message.left, top:message.top }));
        return { ok:true };
      })());
    }
    if (message?.type === 'prompt.describe' || message?.type === 'prompt.granted') {
      if (!fromPage(sender, Access.page) || !Access.isAccessKind(message.kind)) return;
      const tabId = message.tab === undefined ? undefined : Number(message.tab);
      if (tabId !== undefined && (!Number.isInteger(tabId) || tabId <= 0)) return;
      return reply(respond, (async () => {
        if (message.type === 'prompt.describe') {
          const origins = await accessOrigins(message.kind, tabId);
          const host = message.kind === 'debug' ? new URL(origins[0].slice(0, -2)).hostname : undefined;
          return { ok:true, origins, host };
        }
        // Only a grant the browser holds finishes the request.
        const missing = message.kind === 'badges' ? (await accessOrigins('badges')).length > 0 : !await api.permissions.contains({ origins:await accessOrigins(message.kind, tabId) });
        if (missing) throw new Error('Site access was not granted.');
        await afterGrant(message.kind, tabId);
        return { ok:true };
      })());
    }
    if (message?.type === 'floating.open') {
      if (!sender.tab?.id || !topPage(sender, ['https:', 'http:'])) return;
      return reply(respond, (async () => {
        await rememberSource(sender.tab!.id!, sender.url!);
        return { ok:true };
      })());
    }
    if (['floating.target', 'debug.access', 'debug.permission', 'debug.execute'].includes(message?.type)) {
      // Only the floating menu's frame asks: its tab is the page it acts on, as the browser reports it.
      if (!fromPage(sender, '/popup.html') || !sender.frameId) return;
      const tabId = sender.tab?.id;
      if (typeof tabId !== 'number' || !Number.isInteger(tabId) || tabId <= 0) return;
      return reply(respond, (async () => {
        const { href, config } = await configuredPage(tabId);
        const tab = { id:tabId, url:href };
        if (message.type === 'floating.target') return { ok:true, tab };
        if (message.type === 'debug.access') return { ok:true, granted:await debugAccess(tab) };
        if (message.type === 'debug.permission') {
          if (await debugAccess(tab)) return { ok:true, granted:true };
          await openPrompt('debug', tabId);
          return { ok:true, granted:false };
        }
        const request: QuickRequest | undefined = message.request;
        if (!request || request.url !== href) throw new Error('Page changed. Reopen Debug tools and try again.');
        const current = Environment.detect(href, config);
        const refusal = request.action === 'log' ? null : Environment.productionRefusal(href, config, request.productionConfirmed === true);
        if (refusal) throw new Error(refusal === 'blocked' ? 'Production actions are disabled.' : 'Review and confirm the production action again.');
        const results = await api.scripting.executeScript({
          target:{ tabId }, world:'MAIN', func:runQuickAction,
          args:[{ ...request, production:current.kind === 'production', blockProduction:config.blockProduction }]
        });
        return { ok:true, result:results[0]?.result };
      })());
    }
    if (message?.type === 'environment.observe') {
      const url = topPage(sender);
      if (!url || !onUnqork(url)) return;
      serial(() => observe(url.hostname)).then(config => respond({ ok:true, config }), () => respond({ ok:false }));
      return true;
    }
    // Configuration messages must come from the extension, never a website content script. The prompt
    // window imports settings files.
    if (!fromPage(sender, '/popup.html') && !fromPage(sender, Access.page)) return;
    if (!['environment.save', 'environment.sync', 'environment.read'].includes(message?.type)) return;
    return reply(respond, serial(async () => {
      let config = await readConfig();
      if (message.type === 'environment.save') {
        // An import replaces every group and preference at once.
        if (message.replace) config = Environment.settings(message.replace);
        if (message.deleteId) config.groups = config.groups.filter(group => group.id !== message.deleteId);
        if (message.group) {
          const index = config.groups.findIndex(group => group.id === message.group.id);
          if (index < 0) config.groups.push(message.group);
          else config.groups[index] = message.group;
        }
        config = Environment.settings({ ...config, ...message.preferences, groups:config.groups });
        await api.storage.local.set({ environment:config });
      }
      const { missing } = await syncScripts(config);
      return { ok:true, config, missingOrigins:missing };
    }));
  });
  // The toolbar shows NEW after an update that brings a minor or major release the user has not read.
  // Versions before What's new stored nothing, so their previousVersion is where the notes start.
  const badge = (on: boolean) => Promise.all([
    api.action.setBadgeText({ text:on ? 'NEW' : '' }),
    api.action.setBadgeBackgroundColor({ color:'#6d28d9' })
  ]).catch(() => {});
  const showBadge = () => api.storage.local.get(WhatsNew.key).then(stored => badge(WhatsNew.state(stored[WhatsNew.key]).badge)).catch(() => {});
  async function installed(reason: string, previousVersion?: string) {
    try {
      const current = api.runtime.getManifest().version;
      const stored = WhatsNew.state((await api.storage.local.get(WhatsNew.key))[WhatsNew.key]);
      if (reason === 'install') await api.storage.local.set({ [WhatsNew.key]:{ seen:current, badge:false } });
      else if (reason === 'update') {
        const seen = stored.seen || previousVersion || current;
        await api.storage.local.set({ [WhatsNew.key]:{ seen, badge:stored.badge || WhatsNew.notify(seen, current) } });
      }
    } catch {}
    return showBadge();
  }
  // Persistent registrations survive reloads. Reconcile on grants, revocations and startup.
  const sync = () => serial(async () => syncScripts(await readConfig())).catch(() => {});
  const syncDevOverlay = (turnedOn?: 'detach' | 'debugger') => serial(() => syncOverlay(turnedOn)).catch(() => {});
  // The dev overlay's scripts follow their unqork.io grant too.
  api.permissions.onAdded.addListener(() => { sync(); syncDevOverlay(); });
  api.permissions.onRemoved.addListener(() => { sync(); syncDevOverlay(); });
  api.runtime.onStartup.addListener(() => { sync(); syncDevOverlay(); showBadge(); });
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || (!changes[DevOverlay.key] && !changes[SseDebugger.key])) return;
    syncDevOverlay(changes[DevOverlay.key]?.newValue === true ? 'detach' : changes[SseDebugger.key]?.newValue === true ? 'debugger' : undefined);
  });
  api.runtime.onInstalled.addListener(({ reason, previousVersion }) => {
    installed(reason, previousVersion);
    sync();
    syncDevOverlay();
    // Existing Unqork tabs are discovered on installation, without reading page contents.
    api.tabs.query({ url:'https://*.unqork.io/*' }).then(tabs => {
      for (const tab of tabs) {
        if (!tab.url || tab.id === undefined) continue;
        serial(() => observe(new URL(tab.url!).hostname)).catch(() => {});
        api.scripting.executeScript({ target:{ tabId:tab.id }, files:['/content-scripts/environment-badge.js'] }).catch(() => {});
      }
    }).catch(() => {});
  });
});
