/* Collects the browser build into dist-web/ — the exact folder Cloudflare
   Pages should publish. Only the files the site needs end up there, so the
   Electron main process and the PC toolkit are never served by the website.

   dist-web/_worker.js is what turns the Pages project into an app with a brain:
   /api/brain (chat), /api/tool/tts (the character's voice), stt, news, search,
   image, youtube — the whole Cloudflare Worker that the desktop app talks to. */

import { cpSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-web');

const files = ['index.html', 'sw.js', '_worker.js', 'manifest.webmanifest'];
const folders = ['assets', 'appfiles'];
const deployFiles = [join('web', '_headers'), join('web', '_redirects')];

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
console.log(`web build → dist-web  (index.html ${size('index.html')}, _worker.js ${size('_worker.js')})`);
