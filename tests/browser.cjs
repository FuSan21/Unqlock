// Shared set-up for the browser suites: launching Chrome with the built extension or a plain Firefox, the
// Firefox branch's storage double, storage polling and temporary folders that are removed when the run ends.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, firefox } = require('playwright');

const dist = target => path.resolve(__dirname, '../dist', target);

// Profiles and extension copies, removed when the process exits however the suite ended.
const temporary = [];
process.on('exit', () => {
  for (const folder of temporary) try { fs.rmSync(folder, { recursive:true, force:true }); } catch {}
});
function tempDir(name) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'unqlock-' + name + '-'));
  temporary.push(folder);
  return folder;
}

// A copy of the built Chrome extension whose manifest already holds `hostPermissions`, so requests for them
// resolve without a prompt, which automation cannot accept.
function extensionWith(name, hostPermissions) {
  const folder = tempDir(name + '-extension');
  fs.cpSync(dist('chrome'), folder, { recursive:true });
  const manifestPath = path.join(folder, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')), host_permissions:hostPermissions }));
  return folder;
}

// Chrome for Testing from CHROME_PATH, otherwise Playwright's Chromium, with only the given extension loaded.
function launchChrome(name, { extension = dist('chrome'), profile = tempDir(name), ...options } = {}) {
  return chromium.launchPersistentContext(profile, {
    ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : { channel:'chromium' }), headless:true, ...options,
    args:['--disable-extensions-except=' + extension, '--load-extension=' + extension, ...(options.args || [])]
  });
}

// The extension's ID, read on chrome://extensions in `page`, which stays there.
async function extensionId(page) {
  await page.goto('chrome://extensions');
  return page.evaluate(() => new Promise(resolve => chrome.developerPrivate.getExtensionsInfo({}, list => resolve(list.find(each => each.name === 'Unqlock').id))));
}

// A Firefox context for the API-branch tests, which inject the built scripts themselves. Close it with close().
async function launchFirefox(options = {}) {
  const browser = await firefox.launch({ headless:true });
  const context = await browser.newContext(options);
  context.closeBrowser = () => browser.close();
  return context;
}
const close = context => context?.closeBrowser ? context.closeBrowser() : context?.close();

const builtScript = (target, name) => fs.readFileSync(path.join(dist(target), 'content-scripts', name), 'utf8');

// Two animation frames, so a content script's scheduled pass has run.
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// The Firefox branch's extension API: storage.local kept in the page's localStorage, with onChanged.
function installStorageDouble(page) {
  return page.addInitScript(() => {
    const callbacks = [];
    window.browser = { runtime:{ id:'fixture', onMessage:{ addListener() {} } }, storage:{
      local:{ get:async () => JSON.parse(localStorage.getItem('fixture') || '{}'), set:async updates => {
        const data = JSON.parse(localStorage.getItem('fixture') || '{}'); const changes = {};
        for (const [key, value] of Object.entries(updates)) { changes[key] = { oldValue:data[key], newValue:value }; data[key] = value; }
        localStorage.setItem('fixture', JSON.stringify(data)); callbacks.forEach(fn => fn(changes, 'local'));
      } }, onChanged:{ addListener:fn => callbacks.push(fn) }
    } };
  });
}

// Reads and writes extension storage through `page`, the popup or a fixture page with the double, and waits
// for it to reach a state.
function storage(page) {
  const set = values => page.evaluate(values => (window.chrome?.storage || window.browser.storage).local.set(values), values);
  const get = () => page.evaluate(() => (window.chrome?.storage || window.browser.storage).local.get(null));
  async function storedWhen(predicate) {
    const until = Date.now() + 7000;
    while (Date.now() < until) {
      const values = await get();
      if (predicate(values)) return values;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error('Storage did not reach the expected state: ' + JSON.stringify(await get()));
  }
  return { set, get, storedWhen };
}

// Stops a web-ext run and waits for each Firefox it started to exit, so its profile is released before the
// caller removes any folder that Firefox was using.
async function exitWebExt(runner) {
  if (!runner) return;
  const closed = runner.extensionRunners.map(item => {
    const process = item.runningInfo?.firefox;
    return !process || process.exitCode !== null ? Promise.resolve() : new Promise(resolve => process.once('close', resolve));
  });
  await runner.exit();
  await Promise.all(closed);
}

module.exports = { builtScript, close, exitWebExt, dist, extensionId, extensionWith, frames, installStorageDouble, launchChrome, launchFirefox, storage, tempDir };
