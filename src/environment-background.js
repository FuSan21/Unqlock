"use strict";
if (typeof importScripts === 'function') importScripts('environment.js', 'quick-actions.js');
const api = typeof browser !== 'undefined' ? browser : chrome;
let queue = Promise.resolve();
function serial(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}
async function readConfig() {
  return UnqlockEnvironment.settings((await api.storage.local.get('environment')).environment);
}
async function syncScripts(config) {
  const origins = UnqlockEnvironment.customOrigins(config);
  const permitted = [];
  for (const origin of origins) if (await api.permissions.contains({ origins:[origin] })) permitted.push(origin);
  const id = 'unqlock-custom-environments';
  const existing = await api.scripting.getRegisteredContentScripts({ ids:[id] });
  if (!permitted.length) {
    if (existing.length) await api.scripting.unregisterContentScripts({ ids:[id] });
  } else {
    const script = { id, matches:permitted.sort(), js:['environment.js', 'environment-badge.js'], runAt:'document_idle', persistAcrossSessions:true };
    if (existing.length) await api.scripting.updateContentScripts([script]);
    else await api.scripting.registerContentScripts([script]);
  }
  return origins.filter(origin => !permitted.includes(origin));
}
async function observe(host) {
  const before = await readConfig();
  const config = UnqlockEnvironment.discover(before, host);
  if (JSON.stringify(before) !== JSON.stringify(config)) await api.storage.local.set({ environment:config });
  return config;
}
// Reading a tab's URL needs host access the badge never requests, so the page in it
// reports its own address. sender.url comes from the browser, not from page content.
const sourceKey = tabId => 'floating.source.' + tabId;
async function rememberSource(tabId, url) {
  await api.storage.session.set({ [sourceKey(tabId)]:url });
}
async function resolveSource(tabId) {
  const live = await api.tabs.sendMessage(tabId, { type:'floating.source' }, { frameId:0 }).catch(() => undefined);
  if (live?.url) { await rememberSource(tabId, live.url); return live.url; }
  const key = sourceKey(tabId);
  const stored = (await api.storage.session.get(key))[key];
  return stored || (await api.tabs.get(tabId)).url;
}
async function debugAccess(tab) {
  if (await api.permissions.contains({ origins:[new URL(tab.url).origin + '/*'] })) return true;
  // An existing activeTab grant can permit execution without a persistent host grant.
  try {
    const results = await api.scripting.executeScript({ target:{ tabId:tab.id }, func:() => true });
    return results[0]?.result === true;
  } catch { return false; }
}
api.tabs.onRemoved.addListener(tabId => api.storage.session.remove(sourceKey(tabId)).catch(() => {}));
api.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'floating.open') {
    if (!sender.tab?.id || sender.frameId !== 0 || !sender.url) return;
    let url;
    try { url = new URL(sender.url); } catch { return; }
    if (!['https:', 'http:'].includes(url.protocol)) return;
    (async () => {
      await rememberSource(sender.tab.id, sender.url);
      return { ok:true };
    })().then(respond, error => respond({ ok:false, error:error.message }));
    return true;
  }
  if (['floating.target', 'debug.access', 'debug.permission', 'debug.execute', 'debug.granted'].includes(message?.type)) {
    if (sender.url?.split('?')[0] !== api.runtime.getURL('popup.html')) return;
    const detachedTarget = new URL(sender.url).searchParams.get('targetTab');
    const tabId = detachedTarget === null ? sender.tab?.id : Number(detachedTarget);
    if (!Number.isInteger(tabId) || tabId <= 0) return;
    if (detachedTarget === null ? !sender.frameId : sender.frameId !== 0) return;
    (async () => {
      await api.tabs.get(tabId);
      const href = await resolveSource(tabId);
      const url = new URL(href);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported page.');
      const config = await readConfig();
      if (!url.hostname.endsWith('.unqork.io') && !config.groups.some(group => group.domains.some(domain => domain.hostname === url.hostname))) throw new Error('Page is not configured.');
      const tab = { id:tabId, url:href };
      if (message.type === 'floating.target') return { ok:true, tab };
      if (message.type === 'debug.access') return { ok:true, granted:await debugAccess(tab) };
      if (message.type === 'debug.permission') {
        if (await debugAccess(tab)) return { ok:true, granted:true };
        await api.windows.create({
          url:api.runtime.getURL('popup.html') + '?targetTab=' + tabId + '&permission=debug',
          type:'popup', width:380, height:650
        });
        return { ok:true, granted:false };
      }
      if (message.type === 'debug.granted') {
        await api.tabs.sendMessage(tabId, { type:'debug.accessChanged' }, { frameId:0 });
        return { ok:true };
      }
      const request = message.request;
      if (!request || request.url !== href) throw new Error('Page changed. Reopen Debug tools and try again.');
      const current = UnqlockEnvironment.detect(href, config);
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
  // Configuration messages must come from the extension, never a website content script.
  if (sender.url?.split('?')[0] !== api.runtime.getURL('popup.html')) return;
  if (!['environment.save', 'environment.sync', 'environment.read'].includes(message?.type)) return;
  serial(async () => {
    let config = await readConfig();
    if (message.type === 'environment.save') {
      if (message.deleteId) config.groups = config.groups.filter(group => group.id !== message.deleteId);
      if (message.group) {
        const index = config.groups.findIndex(group => group.id === message.group.id);
        if (index < 0) config.groups.push(message.group);
        else config.groups[index] = message.group;
      }
      config = UnqlockEnvironment.settings({ ...config, ...message.preferences, groups:config.groups });
      await api.storage.local.set({ environment:config });
    }
    const missingOrigins = await syncScripts(config);
    return { ok:true, config, missingOrigins };
  }).then(respond, error => respond({ ok:false, error:error.message }));
  return true;
});
// Persistent registrations survive reloads. Reconcile on grants, revocations and startup.
const sync = () => serial(async () => syncScripts(await readConfig())).catch(() => {});
api.permissions.onAdded.addListener(sync);
api.permissions.onRemoved.addListener(sync);
api.runtime.onStartup.addListener(sync);
api.runtime.onInstalled.addListener(() => {
  sync();
  // Existing Unqork tabs are discovered on installation, without reading page contents.
  api.tabs.query({ url:'https://*.unqork.io/*' }).then(tabs => {
    for (const tab of tabs) {
      if (!tab.url) continue;
      serial(() => observe(new URL(tab.url).hostname)).catch(() => {});
      api.scripting.executeScript({ target:{ tabId:tab.id }, files:['environment.js', 'environment-badge.js'] }).catch(() => {});
    }
  }).catch(() => {});
});
