/* ══════════════════════════════════════════════
   Seas AI — Electron main process
   Serves the static shell over a private app://
   scheme (ES modules need a real origin), opens a
   frameless desktop window and hands the microphone
   permission to the app origin.
   ══════════════════════════════════════════════ */

const { app, BrowserWindow, ipcMain, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = __dirname;
const ORIGIN = 'app://seas';
const DEV = process.argv.includes('--dev');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

let mainWindow = null;

/* ───────────────────── static file scheme ───────────────────── */

/* Every place the static shell can live: source folder, app.asar, or an
   unpacked resources/app folder. Trying all of them keeps the packaged app
   working whether asar is on or off. */
function filesystemRoots() {
  const roots = [
    app.getAppPath(),
    ROOT,
    path.join(process.resourcesPath, 'app'),
    path.join(process.resourcesPath, 'app.asar'),
  ];
  return [...new Set(roots.filter(Boolean))];
}

function insideRoot(root, filePath) {
  return filePath === root || filePath.startsWith(root + path.sep);
}

function readFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, (error, data) => (error ? reject(error) : resolve(data)));
  });
}

function errorPage(pathname, roots, error) {
  const detail = error ? `${error.code || error.name}: ${error.message}` : 'file not found';
  return `<!doctype html><meta charset="utf-8"><title>Seas AI — file missing</title>
<style>body{margin:0;padding:32px;background:#05070a;color:#dbe7f3;font:14px/1.6 ui-monospace,Menlo,Consolas,monospace}h1{font-size:16px;color:#35f0ff;letter-spacing:.08em}code{color:#ffd479}p{opacity:.75}</style>
<h1>SEAS AI · FILE NOT FOUND</h1>
<p>Requested: <code>${pathname.replace(/[<>&]/g, '')}</code></p>
<p>Searched: <code>${roots.join(' · ').replace(/[<>&]/g, '')}</code></p>
<p>${detail.replace(/[<>&]/g, '')}</p>`;
}

async function serveFile(request) {
  let pathname = '/index.html';
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname) || '/index.html';
  } catch {
    /* malformed URL → entry point */
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const roots = filesystemRoots();
  let lastError = null;

  for (const root of roots) {
    const filePath = path.normalize(path.join(root, pathname));
    if (!insideRoot(root, filePath)) continue;

    try {
      const data = await readFile(filePath);
      return new Response(data, {
        status: 200,
        headers: {
          'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
          'cache-control': 'no-cache',
        },
      });
    } catch (error) {
      lastError = error;
    }

    /* Electron's net stack can read files (including inside app.asar) even
       when the plain fs view cannot; use it as a second attempt. */
    try {
      const response = await net.fetch(pathToFileURL(filePath).toString());
      if (response.ok) return response;
      lastError = new Error(`net.fetch ${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
  }

  const detail = `[seas] cannot serve ${pathname} — searched: ${roots.join(', ')} — ${lastError?.message || 'not found'}`;
  console.error(detail);
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'serve-error.log'), `${new Date().toISOString()} ${detail}\n`);
  } catch {
    /* logging is best effort */
  }
  return new Response(errorPage(pathname, roots, lastError), {
    status: 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/* ───────────────────── permissions ───────────────────── */

function hardenSession() {
  const ses = session.defaultSession;
  const allowed = new Set(['media', 'audioCapture', 'clipboard-read', 'clipboard-sanitized-write', 'notifications', 'fullscreen']);

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === 'media') {
      const types = details?.mediaTypes || [];
      callback(types.length === 0 || types.includes('audio'));
      return;
    }
    callback(allowed.has(permission));
  });

  ses.setPermissionCheckHandler((webContents, permission) => allowed.has(permission));
}

/* ───────────────────── window ───────────────────── */

function sendMaximized(win, value) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('window:maximized', value);
}

function createWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 14, y: 12 } : undefined,
    backgroundColor: '#05070a',
    title: 'Seas AI',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('maximize', () => sendMaximized(mainWindow, true));
  mainWindow.on('unmaximize', () => sendMaximized(mainWindow, false));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(ORIGIN)) return;
    event.preventDefault();
    if (/^https?:/i.test(url)) shell.openExternal(url);
  });

  mainWindow.loadURL(`${ORIGIN}/index.html`);

  if (DEV) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

/* ───────────────────── IPC ───────────────────── */

function windowFrom(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

ipcMain.on('window:minimize', (event) => windowFrom(event)?.minimize());
ipcMain.on('window:maximize', (event) => {
  const win = windowFrom(event);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('window:close', (event) => windowFrom(event)?.close());

/* ───────────────────── lifecycle ───────────────────── */

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('com.seas.ai');
    protocol.handle('app', serveFile);
    hardenSession();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
