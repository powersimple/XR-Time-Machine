// Builds dist/org.xrtimemachine.premiere_premierepro.ccx (a ZIP with manifest.json at its root).
// Double-click the .ccx to install it through Creative Cloud.
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = ['manifest.json', 'index.html', 'main.js', 'lib.js', 'icons'];
for (const f of files) if (!fs.existsSync(path.join(root, f))) throw new Error(`missing ${f}`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', `${manifest.id}_premierepro.ccx`);
fs.rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', '-q', out, ...files], { cwd: root });
console.log(`Packaged ${manifest.name} ${manifest.version} → ${path.relative(process.cwd(), out)}`);
