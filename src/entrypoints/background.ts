import { defineBackground } from 'wxt/utils/define-background';
import { api, type Stored } from '@/lib/api';
import * as Access from '@/lib/access';
import * as DevOverlay from '@/lib/dev-overlay';
import * as Environment from '@/lib/environment';
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
  async function syncScripts(config: Environment.EnvironmentSettings) {
    const origins = Environment.customOrigins(config);
    const permitted: string[] = [];
    for (const origin of origins) if (await api.permissions.contains({ origins:[origin] })) permitted.push(origin);
    const id = 'unqlock-custom-environments';
    const existing = await api.scripting.getRegisteredContentScripts({ ids:[id] });
    if (!permitted.length) {
      if (existing.length) await api.scripting.unregisterContentScripts({ ids:[id] });
    } else {
      const script = { id, matches:permitted.sort(), js:['content-scripts/environment-badge.js'], runAt:'document_idle' as const, persistAcrossSessions:true };
      if (existing.length) await api.scripting.updateContentScripts([script]);
      else await api.scripting.registerContentScripts([script]);
    }
    return origins.filter(origin => !permitted.includes(origin));
  }
  // The dev overlay's scripts exist only while Detach dev overlay or the Unqlock SSE debugger is on and
  // their site access is granted: Chrome does not extend the manifest content scripts' access to
  // registered ones. Turning one on also adds its button to builder tabs already open; the guard, which
  // only Detach needs, can only take effect from their next load.
  const overlayOptions = async () => {
    const stored = await api.storage.local.get([DevOverlay.key, SseDebugger.key]);
    return { detach:DevOverlay.enabled(stored[DevOverlay.key]), debugger:SseDebugger.enabled(stored[SseDebugger.key]) };
  };
  async function syncOverlay(inject = false) {
    const granted = await api.permissions.contains({ origins:DevOverlay.matches });
    const options = await overlayOptions();
    const wanted = granted ? DevOverlay.needed(options.detach, options.debugger) : [];
    const ids = DevOverlay.scripts.map(script => script.id);
    const existing = (await api.scripting.getRegisteredContentScripts({ ids })).map(script => script.id);
    const extra = existing.filter(id => !wanted.some(script => script.id === id));
    if (extra.length) await api.scripting.unregisterContentScripts({ ids:extra });
    const missing = wanted.filter(script => !existing.includes(script.id));
    if (missing.length) await api.scripting.registerContentScripts(missing);
    if (!inject || !wanted.length) return;
    for (const tab of await api.tabs.query({ url:DevOverlay.matches })) {
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
    const missing: string[] = [];
    for (const origin of Environment.customOrigins(await readConfig())) if (!await api.permissions.contains({ origins:[origin] })) missing.push(origin);
    return missing;
  }
  // Finishes a granted request in the background, since a Firefox toolbar popup has closed by now.
  async function afterGrant(kind: Access.AccessKind, tabId?: number) {
    if (kind === 'devOverlay') await api.storage.local.set({ [DevOverlay.key]:true });
    if (kind === 'sseDebugger') await api.storage.local.set({ [SseDebugger.key]:true });
    if (kind === 'badges') {
      const config = await readConfig();
      await serial(() => syncScripts(config));
      const permitted: string[] = [];
      for (const origin of Environment.customOrigins(config)) if (await api.permissions.contains({ origins:[origin] })) permitted.push(origin);
      if (permitted.length) for (const tab of await api.tabs.query({ url:permitted })) {
        if (tab.id !== undefined) api.scripting.executeScript({ target:{ tabId:tab.id }, files:['/content-scripts/environment-badge.js'] }).catch(() => {});
      }
    }
    // The floating menu that asked learns through its page.
    if (tabId !== undefined) await api.tabs.sendMessage(tabId, { type:'access.changed', kind }, { frameId:0 }).catch(() => {});
  }
  api.tabs.onRemoved.addListener(tabId => api.storage.session.remove(sourceKey(tabId)).catch(() => {}));
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
      if (!fromPage(sender, '/popup.html') || !['devOverlay', 'sseDebugger', 'badges', 'import'].includes(message.kind)) return;
      // A floating menu names its own tab, to be told when access is granted.
      const tabId = sender.frameId ? sender.tab?.id : undefined;
      (async () => {
        if (message.kind !== 'import') {
          const origins = await accessOrigins(message.kind);
          if (!origins.length || await api.permissions.contains({ origins })) return { ok:true, granted:true };
        }
        await openPrompt(message.kind, tabId);
        return { ok:true, granted:false };
      })().then(respond, error => respond({ ok:false, error:error.message }));
      return true;
    }
    // Detach dev overlay and the Unqlock SSE debugger are read and changed here, since a floating menu
    // frame may have no permissions API. They share one unqork.io grant.
    if (message?.type === 'devOverlay.state' || message?.type === 'devOverlay.set') {
      if (!fromPage(sender, '/popup.html')) return;
      const key = message.option === 'debugger' ? SseDebugger.key : DevOverlay.key;
      const other = key === DevOverlay.key ? SseDebugger.key : DevOverlay.key;
      (async () => {
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
      })().then(respond, error => respond({ ok:false, error:error.message }));
      return true;
    }
    // Open in Unqlock debugger, from the button on Unqork's dev overlay in a builder tab.
    if (message?.type === 'sse.open') {
      if (!sender.tab?.id || sender.frameId !== 0 || !sender.url) return;
      let url;
      try { url = new URL(sender.url); } catch { return; }
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.unqork.io')) return;
      (async () => {
        if (!(await overlayOptions()).debugger) throw new Error('The Unqlock SSE debugger is off.');
        await serial(() => openDebugger(sender.tab!.id!, { width:message.width, height:message.height, left:message.left, top:message.top }));
        return { ok:true };
      })().then(respond, error => respond({ ok:false, error:error.message }));
      return true;
    }
    if (message?.type === 'prompt.describe' || message?.type === 'prompt.granted') {
      if (!fromPage(sender, Access.page) || !Access.isAccessKind(message.kind)) return;
      const tabId = message.tab === undefined ? undefined : Number(message.tab);
      if (tabId !== undefined && (!Number.isInteger(tabId) || tabId <= 0)) return;
      (async () => {
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
      })().then(respond, error => respond({ ok:false, error:error.message }));
      return true;
    }
    if (message?.type === 'floating.open') {
      if (!sender.tab?.id || sender.frameId !== 0 || !sender.url) return;
      let url;
      try { url = new URL(sender.url); } catch { return; }
      if (!['https:', 'http:'].includes(url.protocol)) return;
      (async () => {
        await rememberSource(sender.tab!.id!, sender.url!);
        return { ok:true };
      })().then(respond, error => respond({ ok:false, error:error.message }));
      return true;
    }
    if (['floating.target', 'debug.access', 'debug.permission', 'debug.execute'].includes(message?.type)) {
      if (sender.url?.split('?')[0] !== api.runtime.getURL('/popup.html')) return;
      const detachedTarget = new URL(sender.url).searchParams.get('targetTab');
      const tabId = detachedTarget === null ? sender.tab?.id : Number(detachedTarget);
      if (typeof tabId !== 'number' || !Number.isInteger(tabId) || tabId <= 0) return;
      if (detachedTarget === null ? !sender.frameId : sender.frameId !== 0) return;
      (async () => {
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
        if (request.action !== 'log' && current.kind === 'production') {
          if (config.blockProduction) throw new Error('Production actions are disabled.');
          if (request.productionConfirmed !== true) throw new Error('Review and confirm the production action again.');
        }
        const results = await api.scripting.executeScript({
          target:{ tabId }, world:'MAIN', func:runQuickAction,
          args:[{ ...request, production:current.kind === 'production', blockProduction:config.blockProduction }]
        });
        return { ok:true, result:results[0]?.result };
      })().then(respond, error => respond({ ok:false, error:error.message }));
      return true;
    }
    if (message?.type === 'environment.observe') {
      if (!sender.url || sender.frameId !== 0) return;
      let url;
      try { url = new URL(sender.url); } catch { return; }
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.unqork.io')) return;
      serial(() => observe(url.hostname)).then(config => respond({ ok:true, config }), () => respond({ ok:false }));
      return true;
    }
    // Configuration messages must come from the extension, never a website content script. The prompt
    // window imports settings files.
    if (!fromPage(sender, '/popup.html') && !fromPage(sender, Access.page)) return;
    if (!['environment.save', 'environment.sync', 'environment.read'].includes(message?.type)) return;
    serial(async () => {
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
      const missingOrigins = await syncScripts(config);
      return { ok:true, config, missingOrigins };
    }).then(respond, error => respond({ ok:false, error:error.message }));
    return true;
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
  const syncDevOverlay = (inject?: boolean) => serial(() => syncOverlay(inject)).catch(() => {});
  // The dev overlay's scripts follow their unqork.io grant too.
  api.permissions.onAdded.addListener(() => { sync(); syncDevOverlay(); });
  api.permissions.onRemoved.addListener(() => { sync(); syncDevOverlay(); });
  api.runtime.onStartup.addListener(() => { sync(); syncDevOverlay(); showBadge(); });
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes[DevOverlay.key] || changes[SseDebugger.key])) syncDevOverlay(true);
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
