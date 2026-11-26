/* Packs dist-web/ into one downloadable zip — the folder Cloudflare Pages needs
   (index.html, _worker.js, sw.js, appfiles). Drag the unzipped folder into Pages,
   or run `npx wrangler pages deploy dist-web`. No dependencies. */

import { readFileSync, readdirSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'dist-web');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const outDir = join(root, 'dist-cloudflare');
const outFile = join(outDir, `Seas-AI-Cloudflare-${pkg.version}.zip`);

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (~c) >>> 0;
}

function walk(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, base));
    else files.push({ name: relative(base, full).split('\\').join('/'), data: readFileSync(full) });
  }
  return files;
}

function zip(files) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const packed = deflateRawSync(file.data, { level: 9 });
    const store = packed.length >= file.data.length;
    const body = store ? file.data : packed;
    const crc = crc32(file.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(0x21, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(store ? 0 : 8, 10);
    dir.writeUInt32LE(0x21, 12);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(file.data.length, 24);
    dir.writeUInt16LE(name.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(dir, name);

    offset += 30 + name.length + body.length;
  }

  const dirSize = central.reduce((total, part) => total + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dirSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

if (!statSync(src, { throwIfNoEntry: false })) {
  console.error('dist-web is missing — run `npm run web:build` first.');
  process.exit(1);
}

const files = walk(src);
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, zip(files));

const kb = (statSync(outFile).size / 1024).toFixed(0);
console.log(`cloudflare zip → ${relative(root, outFile)} (${files.length} files, ${kb} KB)`);
