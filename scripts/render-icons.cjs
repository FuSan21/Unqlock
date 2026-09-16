const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const project = path.resolve(__dirname, '..');
  const folder = path.join(project, 'src/icons');
  const svg = fs.readFileSync(path.join(folder, 'unqlock.svg'), 'utf8');
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath:process.env.CHROME_PATH } : {}), headless:true });
  try {
    const page = await browser.newPage({ deviceScaleFactor:1 });
    for (const size of [16, 32, 48, 128, 512]) {
      await page.setViewportSize({ width:size, height:size });
      await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
      const target = size === 512 ? path.join(project, 'docs/assets/extension-icon.png') : path.join(folder, `icon-${size}.png`);
      fs.mkdirSync(path.dirname(target), { recursive:true });
      await page.screenshot({ path:target, omitBackground:true });
      const bytes = fs.readFileSync(target);
      if (bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size) throw new Error('Incorrect icon size');
    }
    console.log('Rendered icon PNGs and documentation preview from src/icons/unqlock.svg.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
