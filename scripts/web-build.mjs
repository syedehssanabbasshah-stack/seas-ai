/* Collects the browser build into dist-web/ — the exact folder Cloudflare
   Pages should publish. Only the files the site needs end up there, so the
   Electron main process and the PC toolkit are never served by the website. */

import { cpSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-web');

const files = ['index.html'];
const folders = ['assets'];
const deployFiles = [join('web', '_headers')];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const file of files) {
  cpSync(join(root, file), join(out, file));
}

for (const folder of folders) {
  cpSync(join(root, folder), join(out, folder), { recursive: true });
}

for (const file of deployFiles) {
  cpSync(join(root, file), join(out, dirname(file) === 'web' ? file.replace(/^web\//, '') : file));
}

const size = (file) => `${(statSync(join(out, file)).size / 1024).toFixed(1)} KB`;
console.log(`web build → dist-web  (index.html ${size('index.html')})`);
