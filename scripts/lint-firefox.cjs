// Runs web-ext lint on dist/firefox and fails on any error or warning, except the linter's
// innerHTML notice inside React DOM. React DOM assigns innerHTML only to support
// dangerouslySetInnerHTML, which Unqlock never uses; the notice appears for any unminified React build.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const project = path.resolve(__dirname, '..');
const popup = fs.readdirSync(path.join(project, 'dist/firefox/chunks')).filter(name => /^popup-[\w-]+\.js$/.test(name)).map(name => 'chunks/' + name);
const result = spawnSync(process.execPath, [path.join(project, 'node_modules/web-ext/bin/web-ext.js'), 'lint', '--source-dir', 'dist/firefox', '--output', 'json'], { cwd:project, encoding:'utf8', maxBuffer:64 * 1024 * 1024 });
let report;
try { report = JSON.parse(result.stdout.slice(result.stdout.indexOf('{'))); }
catch { process.stdout.write(result.stdout); process.stderr.write(result.stderr); throw new Error('web-ext lint did not return a JSON report'); }
const reactInnerHtml = message => message.code === 'UNSAFE_VAR_ASSIGNMENT' && popup.includes(message.file) && /innerHTML/.test(message.message);
const problems = [...report.errors, ...report.warnings].filter(message => !reactInnerHtml(message));
const allowed = report.warnings.length - report.warnings.filter(message => !reactInnerHtml(message)).length;
for (const message of problems) console.error(`${message.type.toUpperCase()} ${message.code} ${message.file || ''}:${message.line || ''} ${message.message}`);
// React DOM has two such assignments; more would mean new code that needs review.
if (allowed > 2) { console.error(`Expected at most 2 React DOM innerHTML notices, found ${allowed}.`); process.exitCode = 1; }
if (problems.length) process.exitCode = 1;
else console.log(`web-ext lint: 0 errors, 0 warnings, ${report.notices.length} notices (${allowed} React DOM innerHTML notices allowed).`);
