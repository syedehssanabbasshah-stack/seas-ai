/* ══════════════════════════════════════════════
   pc.js — desktop control toolkit (main process)
   The renderer can only ask for a named tool with
   plain arguments; no shell string ever crosses the
   bridge. Windows gets the full set, macOS a subset,
   Linux answers "Windows only" instead of failing
   silently.
   ══════════════════════════════════════════════ */

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const http = require('node:http');
const https = require('node:https');

const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';
const HOME = os.homedir();
const FILES = path.join(HOME, 'Seas_Files');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

try { fs.mkdirSync(FILES, { recursive: true }); } catch { /* noop */ }

/* ───────────────────── allowed folders ───────────────────── */

const ROOTS = [];
for (const base of [HOME, path.join(HOME, 'OneDrive')]) {
  for (const name of ['Desktop', 'Documents', 'Downloads', 'Music', 'Videos', 'Pictures']) {
    try {
      const dir = path.join(base, name);
      if (fs.statSync(dir).isDirectory()) ROOTS.push(fs.realpathSync(dir));
    } catch { /* folder not present */ }
  }
}
try { ROOTS.push(fs.realpathSync(FILES)); } catch { /* noop */ }

const fail = (message, code = 400) => Object.assign(new Error(message), { code });

function inside(input) {
  const raw = String(input || '').replace(/^~(?=$|[\\/])/, HOME);
  if (!raw.trim()) return [false, ''];
  let real;
  try { real = fs.realpathSync(path.resolve(raw)); } catch { return [false, '']; }
  const allowed = ROOTS.some((root) => real === root || real.startsWith(root + path.sep));
  return [allowed, real];
}

/* ───────────────────── process helpers ───────────────────── */

const run = (file, args, ms = 15000) =>
  new Promise((resolve) => {
    cp.execFile(file, args, { windowsHide: true, timeout: ms }, (error, stdout, stderr) =>
      resolve(String(stdout || stderr || '').trim().slice(0, 400))
    );
  });

const powershell = (script, env = {}, ms = 15000) =>
  new Promise((resolve, reject) => {
    cp.execFile(
      'powershell',
      ['-NoProfile', '-Command', script],
      { windowsHide: true, timeout: ms, env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        const out = String(stdout || '').trim();
        if (error && !out) {
          reject(fail(String(stderr || error.message).trim().slice(0, 300) || 'PowerShell failed', 500));
          return;
        }
        resolve(out.slice(0, 400));
      }
    );
  });

const needWin = (what) => {
  if (!WIN) throw fail(`${what} works on Windows only`);
};

/* ───────────────────── lookup tables ───────────────────── */

const APPS = {
  notepad: 'notepad',
  calculator: 'calc',
  calc: 'calc',
  paint: 'mspaint',
  chrome: 'chrome',
  edge: 'msedge',
  firefox: 'firefox',
  explorer: 'explorer',
  files: 'explorer',
  'file explorer': 'explorer',
  'this pc': 'explorer',
  vscode: 'code',
  code: 'code',
  word: 'winword',
  excel: 'excel',
  powerpoint: 'powerpnt',
  spotify: 'spotify',
  whatsapp: 'whatsapp:',
  telegram: 'telegram',
  discord: 'discord',
  vlc: 'vlc',
  cmd: 'cmd',
  terminal: 'wt',
  settings: 'ms-settings:',
  'task manager': 'taskmgr',
  camera: 'microsoft.windows.camera:',
  'snipping tool': 'snippingtool',
  clock: 'ms-clock:',
  store: 'ms-windows-store:',
  control: 'control',
};

const KILL = {
  chrome: 'chrome.exe',
  edge: 'msedge.exe',
  firefox: 'firefox.exe',
  notepad: 'notepad.exe',
  calculator: 'CalculatorApp.exe',
  calc: 'CalculatorApp.exe',
  spotify: 'Spotify.exe',
  whatsapp: 'WhatsApp.exe',
  telegram: 'Telegram.exe',
  discord: 'Discord.exe',
  vlc: 'vlc.exe',
  word: 'WINWORD.EXE',
  excel: 'EXCEL.EXE',
  powerpoint: 'POWERPNT.EXE',
  vscode: 'Code.exe',
  code: 'Code.exe',
  paint: 'mspaint.exe',
};

const VK = { volume_up: 175, volume_down: 174, mute: 173, next: 176, previous: 177, play_pause: 179 };

const WIN_ACT = {
  minimize_all: '(New-Object -ComObject Shell.Application).MinimizeAll()',
  show_desktop: '(New-Object -ComObject Shell.Application).ToggleDesktop()',
  restore_all: '(New-Object -ComObject Shell.Application).UndoMinimizeALL()',
  switch_window: "(New-Object -ComObject WScript.Shell).SendKeys('%{TAB}')",
  close_window: "(New-Object -ComObject WScript.Shell).SendKeys('%{F4}')",
  maximize: "(New-Object -ComObject WScript.Shell).SendKeys('% x')",
  minimize: "(New-Object -ComObject WScript.Shell).SendKeys('% n')",
  task_view: "(New-Object -ComObject WScript.Shell).SendKeys('^{ESC}')",
};

const KEYS = {
  copy: '^c', paste: '^v', cut: '^x', undo: '^z', redo: '^y', select_all: '^a', save: '^s',
  find: '^f', new_tab: '^t', close_tab: '^w', reopen_tab: '^+t', next_tab: '^{TAB}',
  refresh: '{F5}', fullscreen: '{F11}', enter: '{ENTER}', escape: '{ESC}', tab: '{TAB}',
  page_down: '{PGDN}', page_up: '{PGUP}', backspace: '{BACKSPACE}', delete: '{DEL}',
  print: '^p', zoom_in: '^{ADD}', zoom_out: '^{SUBTRACT}',
};

const VDESK = { new: '0x5B,0x11,0x44', left: '0x5B,0x11,0x25', right: '0x5B,0x11,0x27', close: '0x5B,0x11,0x73' };

/* ───────────────────── file helpers ───────────────────── */

const safeName = (name) =>
  String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 80);

async function whereDir(where) {
  const key = String(where || 'desktop').toLowerCase().replace(/[^a-z]/g, '') || 'desktop';
  const name =
    { desktop: 'Desktop', documents: 'Documents', downloads: 'Downloads', pictures: 'Pictures', music: 'Music', videos: 'Videos' }[key] ||
    'Desktop';
  if (WIN && name === 'Desktop') {
    const out = await powershell("[Environment]::GetFolderPath('Desktop')", {}).catch(() => '');
    if (out && inside(out)[0]) return inside(out)[1];
  }
  const match = ROOTS.filter((dir) => path.basename(dir).toLowerCase() === name.toLowerCase());
  if (!match.length) throw fail(`Could not find your ${name} folder`);
  return match[match.length - 1];
}

function unique(dir, name, ext = '') {
  let target = path.join(dir, name + ext);
  let i = 2;
  while (fs.existsSync(target)) target = path.join(dir, name + ' (' + i++ + ')' + ext);
  return target;
}

/* ───────────────────── web helpers ───────────────────── */

const clean = (value) =>
  String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function httpText(url, { method = 'GET', body = '', headers = {}, timeout = 9000, depth = 0 } = {}) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL(url); } catch { reject(fail('That is not a valid address')); return; }
    if (!/^https?:$/.test(target.protocol)) { reject(fail('Only http(s) addresses are allowed')); return; }
    const lib = target.protocol === 'http:' ? http : https;
    const req = lib.request(
      {
        method,
        hostname: target.hostname,
        path: target.pathname + target.search,
        headers: { 'User-Agent': UA, ...headers },
        timeout,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 3) {
          res.resume();
          resolve(httpText(new URL(res.headers.location, target).toString(), { method: 'GET', headers, timeout, depth: depth + 1 }));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { if (data.length < 1_500_000) data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: data, type: String(res.headers['content-type'] || '') }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('The request timed out')));
    req.on('error', (error) => reject(fail(error.message || 'network error', 502)));
    if (body) req.write(body);
    req.end();
  });
}

const FEEDS = [
  { source: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { source: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { source: 'Google News', url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en' },
  { source: 'Dawn', url: 'https://www.dawn.com/feeds/home' },
  { source: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml' },
];

async function readFeed(feed) {
  const res = await httpText(feed.url, { headers: { Accept: 'application/rss+xml,application/xml,text/xml,*/*' }, timeout: 7000 });
  const out = [];
  for (const block of res.body.matchAll(/<(?:item|entry)[\s>][\s\S]*?<\/(?:item|entry)>/g)) {
    const title = (block[0].match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1];
    if (!title) continue;
    const text = clean(title.replace(/<!\[CDATA\[|\]\]>/g, '')).replace(/\s+-\s+[^-]{2,40}$/, '').trim();
    const link = (block[0].match(/<link[^>]*>([\s\S]*?)<\/link>/) || [])[1];
    if (text.length < 15) continue;
    out.push({ title: text, summary: feed.source, source: feed.source, url: clean(link || '') });
  }
  return out;
}

async function news(limit = 6) {
  const settled = await Promise.allSettled(FEEDS.map(readFeed));
  const buckets = settled.map((entry) => (entry.status === 'fulfilled' ? entry.value : []));
  const items = [];
  for (let i = 0; items.length < limit && i < 6; i += 1) {
    for (const bucket of buckets) {
      const item = bucket[i];
      if (item && !items.some((existing) => existing.title === item.title) && items.length < limit) items.push(item);
    }
  }
  if (!items.length) throw fail('No news feed was reachable just now', 502);
  return items;
}

/* ───────────────────── tools ───────────────────── */

const tools = {};

tools.system_info = async () => {
  const info = {
    os: `${os.type()} ${os.release()}`,
    platform: process.platform,
    arch: process.arch,
    cpus: os.cpus().length,
    cpu_model: (os.cpus()[0] || {}).model || 'unknown',
    ram_total_gb: +(os.totalmem() / 1e9).toFixed(1),
    ram_used_percent: Math.round(100 - (os.freemem() / os.totalmem()) * 100),
    user: os.userInfo().username,
    uptime_hours: +(os.uptime() / 3600).toFixed(1),
    host: os.hostname(),
  };
  try {
    const stat = fs.statfsSync(HOME);
    info.disk_free_gb = +((stat.bavail * stat.bsize) / 1e9).toFixed(1);
  } catch { /* disk stats unavailable */ }
  return info;
};

tools.open_app = async ({ name } = {}) => {
  const key = String(name || '').trim().toLowerCase();
  if (!key) throw fail('Tell me which app to open');
  const target = APPS[key] || key;
  if (!/^[a-z0-9 ._:-]{1,60}$/.test(target)) throw fail('That app name is not allowed');
  const child = WIN
    ? cp.spawn('cmd', ['/c', 'start', '', target], { windowsHide: true, detached: true, stdio: 'ignore' })
    : MAC
      ? cp.spawn('open', ['-a', key], { detached: true, stdio: 'ignore' })
      : cp.spawn(target, [], { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
  return { app: key };
};

tools.close_app = async ({ name } = {}) => {
  const key = String(name || '').trim().toLowerCase();
  const exe = KILL[key];
  if (!exe) throw fail(`I only close: ${Object.keys(KILL).join(', ')}`);
  const out = WIN ? await run('taskkill', ['/IM', exe, '/F']) : await run('pkill', ['-f', exe.replace('.exe', '')]);
  return { app: key, output: out };
};

tools.media = async ({ action, amount } = {}) => {
  needWin('Media keys');
  const key = VK[String(action || '')];
  if (!key) throw fail(`Pick one of: ${Object.keys(VK).join(', ')}`);
  const times = Math.max(1, Math.min(Number(amount) || 1, 25));
  await powershell(`$w=New-Object -ComObject WScript.Shell;1..${times}|%{$w.SendKeys([char]${key})}`);
  return { action, amount: times };
};

tools.set_volume = async ({ level } = {}) => {
  needWin('Volume control');
  const value = Math.max(0, Math.min(100, Math.round(Number(level))));
  if (!Number.isFinite(value)) throw fail('level must be 0-100');
  await powershell(
    `$w=New-Object -ComObject WScript.Shell;1..50|%{$w.SendKeys([char]174)};1..${Math.round(value / 2)}|%{$w.SendKeys([char]175)}`,
    {},
    30000
  );
  return { level: value };
};

tools.lock_screen = async () => {
  needWin('Locking');
  cp.spawn('rundll32.exe', ['user32.dll,LockWorkStation'], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
  return { action: 'lock' };
};

tools.power = async ({ action } = {}) => {
  needWin('Power control');
  const key = String(action || '').toLowerCase().replace(/[^a-z_ ]/g, '');
  if (/cancel|abort/.test(key)) {
    await run('shutdown', ['/a']);
    return { action: 'cancel' };
  }
  if (/lock/.test(key)) return tools.lock_screen();
  if (/sleep|suspend/.test(key)) {
    cp.spawn('rundll32.exe', ['powrprof.dll,SetSuspendState 0,1,0'], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
    return { action: 'sleep' };
  }
  if (/hibernate/.test(key)) {
    await run('shutdown', ['/h']);
    return { action: 'hibernate' };
  }
  if (/log ?off|log ?out|sign ?out/.test(key)) {
    await run('shutdown', ['/l']);
    return { action: 'logoff' };
  }
  if (/monitor|screen.*off|display.*off/.test(key)) {
    await powershell(
      "Add-Type -Name W -Namespace S -MemberDefinition '[DllImport(\"user32.dll\")] public static extern int SendMessage(int h,int m,int w,int l);'; [S.W]::SendMessage(-1,0x0112,0xF170,2)"
    );
    return { action: 'monitors_off' };
  }
  if (/restart|reboot/.test(key)) {
    await run('shutdown', ['/r', '/t', '30']);
    return { action: 'restart' };
  }
  if (/shut/.test(key)) {
    await run('shutdown', ['/s', '/t', '30']);
    return { action: 'shutdown' };
  }
  throw fail(`Unknown power action: ${key}`);
};

tools.message_box = async ({ text, title } = {}) => {
  needWin('Message boxes');
  const body = String(text || '').slice(0, 400);
  if (!body.trim()) throw fail('The message is empty');
  cp.spawn(
    'powershell',
    [
      '-NoProfile',
      '-WindowStyle',
      'Hidden',
      '-Command',
      'Add-Type -AssemblyName System.Windows.Forms;[void][System.Windows.Forms.MessageBox]::Show($env:SEAS_MSG,$env:SEAS_TITLE)',
    ],
    {
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, SEAS_MSG: body, SEAS_TITLE: String(title || 'Seas AI').slice(0, 60) },
    }
  ).unref();
  return { shown: true };
};

tools.type_text = async ({ text } = {}) => {
  needWin('Typing into other apps');
  const value = String(text || '').slice(0, 2000);
  if (!value) throw fail('There is no text to type');
  await powershell(
    "Set-Clipboard -Value $env:SEAS_T; Start-Sleep -Milliseconds 150; (New-Object -ComObject WScript.Shell).SendKeys('^v')",
    { SEAS_T: value }
  );
  return { chars: value.length };
};

tools.press_keys = async ({ keys, times } = {}) => {
  needWin('Keyboard shortcuts');
  const key = String(keys || '').toLowerCase().replace(/[^a-z_]/g, '_');
  if (!KEYS[key]) throw fail(`Shortcuts: ${Object.keys(KEYS).join(', ')}`);
  const count = Math.max(1, Math.min(10, Number(times) || 1));
  await powershell(
    `$w=New-Object -ComObject WScript.Shell;1..${count}|%{$w.SendKeys($env:SEAS_K);Start-Sleep -Milliseconds 80}`,
    { SEAS_K: KEYS[key] }
  );
  return { keys: key, times: count };
};

tools.window_control = async ({ action } = {}) => {
  needWin('Window control');
  const key = String(action || '').toLowerCase().replace(/[^a-z_]/g, '_');
  const script = WIN_ACT[key];
  if (!script) throw fail(`Actions: ${Object.keys(WIN_ACT).join(', ')}`);
  await powershell(script);
  return { action: key };
};

tools.virtual_desktop = async ({ action } = {}) => {
  needWin('Virtual desktops');
  const key = String(action || 'new').toLowerCase();
  const combo = VDESK[key];
  if (!combo) throw fail(`Actions: ${Object.keys(VDESK).join(', ')}`);
  await powershell(`$w=New-Object -ComObject WScript.Shell;$w.SendKeys([char]${combo})`);
  return { action: key };
};

tools.make_folder = async ({ name, where } = {}) => {
  const cleanName = safeName(name);
  if (!cleanName) throw fail('Give the folder a name');
  const dir = await whereDir(where);
  const target = unique(dir, cleanName);
  fs.mkdirSync(target);
  return { message: `Created the folder "${path.basename(target)}" in ${path.basename(dir)}.`, path: target };
};

tools.create_file = async ({ name, text, where } = {}) => {
  const cleanName = safeName(name);
  if (!cleanName) throw fail('Give the file a name');
  const dir = await whereDir(where);
  const ext = path.extname(cleanName) || '.txt';
  const base = path.basename(cleanName, path.extname(cleanName));
  const target = unique(dir, base, ext);
  fs.writeFileSync(target, String(text || '').slice(0, 200000), 'utf8');
  return { message: `Created the file "${path.basename(target)}" in ${path.basename(dir)}.`, path: target };
};

tools.find_files = async ({ query } = {}) => {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) throw fail('Give me something to look for');
  const found = [];
  const started = Date.now();
  const walk = (dir, depth) => {
    if (depth > 4 || found.length >= 40 || Date.now() - started > 5000) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (words.every((word) => entry.name.toLowerCase().includes(word))) found.push(full);
      if (entry.isDirectory() && entry.name !== 'node_modules') walk(full, depth + 1);
    }
  };
  ROOTS.forEach((root) => walk(root, 0));
  return { paths: found.slice(0, 40), count: found.length };
};

tools.open_path = async ({ path: target } = {}) => {
  const [allowed, real] = inside(target);
  if (!allowed) throw fail('That path is not found or is outside your Desktop, Documents, Downloads, Music, Videos, Pictures and Seas_Files folders');
  const child = WIN
    ? cp.spawn('cmd', ['/c', 'start', '', real], { windowsHide: true, detached: true, stdio: 'ignore' })
    : cp.spawn(MAC ? 'open' : 'xdg-open', [real], { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
  return { path: real };
};

tools.read_text = async ({ path: target } = {}) => {
  const [allowed, real] = inside(target);
  if (!allowed) throw fail('That file is not found or is outside the allowed folders');
  const stat = fs.statSync(real);
  if (!stat.isFile()) throw fail('That is a folder, not a file');
  if (stat.size > 2e6) throw fail('That file is too large to read here');
  return { text: fs.readFileSync(real, 'utf8').slice(0, 12000), path: real };
};

tools.save_text = async ({ filename, content } = {}) => {
  const base = safeName(path.basename(String(filename || '').replace(/\\/g, '/')));
  if (!base) throw fail('Give the file a name');
  const target = path.join(FILES, base);
  fs.writeFileSync(target, String(content || ''), 'utf8');
  return { message: `Saved to ${target}`, path: target };
};

tools.doc_search = async ({ query } = {}) => {
  const words = String(query || '').toLowerCase().split(/\s+/).filter((word) => word.length > 1);
  if (!words.length) throw fail('Give me some words to search for');
  const EXT = /\.(txt|md|csv|json|py|js|html|log|ini|cfg|xml|tex)$/i;
  const hits = [];
  const started = Date.now();
  let scanned = 0;
  const walk = (dir, depth) => {
    if (depth > 3 || scanned > 400 || Date.now() - started > 6000) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!EXT.test(entry.name)) continue;
      try {
        if (fs.statSync(full).size > 1e6) continue;
        scanned += 1;
        const text = fs.readFileSync(full, 'utf8');
        const lower = text.toLowerCase();
        let score = 0;
        let first = -1;
        for (const word of words) {
          let index = 0;
          let count = 0;
          while ((index = lower.indexOf(word, index)) >= 0 && count < 20) {
            if (first < 0) first = index;
            count += 1;
            index += word.length;
          }
          score += count;
        }
        if (score) hits.push({ score, path: full, excerpt: text.slice(Math.max(0, first - 80), first + 220).replace(/\s+/g, ' ') });
      } catch { /* unreadable file */ }
    }
  };
  ROOTS.forEach((root) => walk(root, 0));
  hits.sort((a, b) => b.score - a.score);
  if (!hits.length) return { excerpt: '', count: 0 };
  const top = hits.slice(0, 3);
  return {
    count: hits.length,
    excerpt: top.map((hit) => `${hit.path}: ...${hit.excerpt}...`).join('\n'),
    paths: top.map((hit) => hit.path),
  };
};

tools.screenshot = async () => {
  const target = path.join(os.tmpdir(), `seas_shot_${Date.now()}.jpg`);
  if (WIN) {
    await powershell(
      `Add-Type -AssemblyName System.Windows.Forms,System.Drawing;$b=[System.Windows.Forms.SystemInformation]::VirtualScreen;$bm=New-Object System.Drawing.Bitmap $b.Width,$b.Height;$g=[System.Drawing.Graphics]::FromImage($bm);$g.CopyFromScreen($b.Left,$b.Top,0,0,$bm.Size);$w=1280;$h=[int]($b.Height*$w/$b.Width);$s=New-Object System.Drawing.Bitmap $bm,$w,$h;$s.Save('${target}',[System.Drawing.Imaging.ImageFormat]::Jpeg)`,
      {},
      20000
    );
  } else if (MAC) {
    await run('screencapture', ['-x', '-t', 'jpg', target], 20000);
  } else {
    throw fail('Screenshots are supported on Windows and macOS');
  }
  if (!fs.existsSync(target)) throw fail('The screenshot failed — try again');
  const image = fs.readFileSync(target).toString('base64');
  try { fs.unlinkSync(target); } catch { /* noop */ }
  return { image, mime: 'image/jpeg' };
};

tools.delete_file = async ({ path: target } = {}) => {
  const [allowed, real] = inside(target);
  if (!allowed) throw fail('That file is not found or is outside the allowed folders');
  const stat = fs.statSync(real);
  if (!stat.isFile()) throw fail('Only single files can be deleted this way');
  if (WIN) {
    await powershell(
      "Add-Type -AssemblyName Microsoft.VisualBasic;[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:SEAS_P,'OnlyErrorDialogs','SendToRecycleBin')",
      { SEAS_P: real }
    );
    return { message: `Moved to the Recycle Bin: ${path.basename(real)}`, path: real };
  }
  fs.rmSync(real);
  return { message: `Deleted ${path.basename(real)}`, path: real };
};

tools.research = async ({ query } = {}) => {
  const question = String(query || '').trim().slice(0, 300);
  if (!question) throw fail('Give me something to research');
  const response = await httpText('https://html.duckduckgo.com/html/', {
    method: 'POST',
    body: `q=${encodeURIComponent(question)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const hits = [];
  const pattern =
    /class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  while ((match = pattern.exec(response.body)) && hits.length < 6) {
    let url = match[1];
    const unwrapped = url.match(/uddg=([^&]+)/);
    if (unwrapped) url = decodeURIComponent(unwrapped[1]);
    hits.push({ title: clean(match[2]), url, snippet: clean(match[3]) });
  }
  if (!hits.length) throw fail('No results came back — try a shorter query', 502);
  let page = '';
  try {
    const top = await httpText(hits[0].url, { timeout: 8000 });
    page = clean(top.body).slice(0, 1400);
  } catch { /* the snippet is enough */ }
  return { query: question, hits, page, checked: new Date().toISOString() };
};

tools.news = async ({ limit } = {}) => ({ items: await news(Number(limit) || 6) });

/* ───────────────────── entry point ───────────────────── */

async function invoke(tool, args = {}) {
  const fn = tools[String(tool || '')];
  if (!fn) throw fail(`Unknown tool: ${tool}`);
  const safeArgs = args && typeof args === 'object' ? args : {};
  return fn(safeArgs);
}

module.exports = { invoke, news, tools: Object.keys(tools), roots: ROOTS };
