const fs = require('node:fs');
const path = require('node:path');
const { unzipSync } = require('fflate');
const project = path.resolve(__dirname, '..');
const archive = path.join(project, 'artifacts', 'unqlock-chrome.zip');
const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const items = 'https://www.googleapis.com/chromewebstore/v1.1/items';
const uploads = 'https://www.googleapis.com/upload/chromewebstore/v1.1/items';

async function body(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Chrome Web Store returned an unreadable ${response.status} response`);
  }
}

async function accessToken(id, secret, refresh) {
  const response = await fetch(tokenEndpoint, {
    method:'POST',
    headers:{ 'content-type':'application/x-www-form-urlencoded' },
    body:new URLSearchParams({ client_id:id, client_secret:secret, refresh_token:refresh, grant_type:'refresh_token' }),
  });
  const result = await body(response);
  if (!response.ok || !result.access_token) throw new Error(`Could not refresh the Chrome Web Store token: ${result.error_description || result.error || response.status}`);
  return result.access_token;
}

async function upload(item, token, bytes) {
  const response = await fetch(`${uploads}/${item}?uploadType=media`, {
    method:'PUT',
    headers:{ authorization:`Bearer ${token}`, 'x-goog-api-version':'2', 'content-type':'application/zip' },
    body:bytes,
  });
  const result = await body(response);
  const detail = (result.itemError || []).map(error => error.error_detail || error.error_code).join('; ');
  if (!response.ok) throw new Error(`Upload failed with status ${response.status}: ${detail || result.error?.message || 'no detail'}`);
  if (result.uploadState !== 'SUCCESS') throw new Error(`Upload finished as ${result.uploadState}: ${detail || 'no detail'}`);
}

async function publish(item, token, target) {
  const response = await fetch(`${items}/${item}/publish?publishTarget=${target}`, {
    method:'POST',
    headers:{ authorization:`Bearer ${token}`, 'x-goog-api-version':'2', 'content-length':'0' },
  });
  const result = await body(response);
  const status = result.status || [];
  const detail = (result.statusDetail || []).join('; ');
  if (!response.ok) throw new Error(`Publish failed with status ${response.status}: ${detail || result.error?.message || 'no detail'}`);
  if (!status.every(value => ['OK', 'ITEM_PENDING_REVIEW'].includes(value))) throw new Error(`Publish rejected as ${status.join(', ')}: ${detail || 'no detail'}`);
  return status.includes('ITEM_PENDING_REVIEW') ? 'awaiting Chrome Web Store review' : 'published';
}

async function publishChrome(target) {
  const version = require('./version.cjs').checkVersion(project);
  const item = process.env.CWS_EXTENSION_ID || '';
  const id = process.env.CWS_CLIENT_ID || '';
  const secret = process.env.CWS_CLIENT_SECRET || '';
  const refresh = process.env.CWS_REFRESH_TOKEN || '';
  if (!['default', 'trustedTesters', 'draft'].includes(target)) throw new Error('Use target default, trustedTesters or draft');
  if (!id || !secret || !refresh) throw new Error('Set CWS_CLIENT_ID, CWS_CLIENT_SECRET and CWS_REFRESH_TOKEN to the Chrome Web Store API credentials');
  if (!/^[a-p]{32}$/.test(item)) throw new Error('Set CWS_EXTENSION_ID to the 32-character item ID of an existing Web Store listing');
  if (!fs.existsSync(archive)) throw new Error('Run npm run build first, or provide the tested artifacts/unqlock-chrome.zip');
  const bytes = fs.readFileSync(archive);
  const manifest = JSON.parse(Buffer.from(unzipSync(bytes)['manifest.json']).toString());
  if (manifest.version !== version) throw new Error('Packaged manifest version does not match the package version');
  const token = await accessToken(id, secret, refresh);
  await upload(item, token, bytes);
  if (target === 'draft') return `Uploaded ${version} to Chrome Web Store item ${item} as an unpublished draft`;
  const outcome = await publish(item, token, target);
  return `Uploaded ${version} to Chrome Web Store item ${item} and ${outcome}${target === 'trustedTesters' ? ' for trusted testers' : ''}`;
}

if (require.main === module) {
  publishChrome(process.argv[2] || process.env.CWS_PUBLISH_TARGET || 'default').then(console.log, error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { publishChrome };
