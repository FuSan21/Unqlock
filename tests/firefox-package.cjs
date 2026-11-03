const path = require('node:path');
const { firefox } = require('playwright');
const { exitWebExt } = require('./browser.cjs');
(async () => {
  const { default:webExt } = await import('web-ext');
  const runner = await webExt.cmd.run({
    sourceDir:path.resolve(__dirname, '../dist/firefox'),
    artifactsDir:path.resolve(__dirname, '../artifacts'),
    firefox:process.env.FIREFOX_PATH || firefox.executablePath(),
    target:['firefox-desktop'],
    args:['-headless'],
    noInput:true,
    noReload:true,
    startUrl:['about:blank']
  });
  try {
    const results = await runner.reloadAllExtensions();
    if (results.some(result => result.reloadError)) throw new Error('Firefox add-on reload failed');
    console.log('PASS: actual Firefox temporary add-on installation and reload in an isolated profile.');
  } finally { await exitWebExt(runner); }
})().catch(error => { console.error(error); process.exitCode = 1; });
