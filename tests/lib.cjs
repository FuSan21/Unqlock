// Bundles TypeScript sources from src/ for tests that run them outside the built extension.
const path = require('node:path');
const esbuild = require('esbuild');
const src = path.resolve(__dirname, '../src');

// Returns a self-contained script that assigns the module's exports to `globalName`.
function bundle(file, globalName) {
  return esbuild.buildSync({
    entryPoints:[path.join(src, file)], bundle:true, write:false, format:'iife', globalName,
    platform:'browser', target:'es2022', alias:{ '@':src }, logLevel:'silent'
  }).outputFiles[0].text;
}

// Evaluates a module from src/lib and returns its exports.
function load(name) {
  return new Function(bundle(`lib/${name}.ts`, 'exported') + '\nreturn exported;')();
}

module.exports = { bundle, load };
