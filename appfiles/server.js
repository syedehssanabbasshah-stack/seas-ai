/* SEAS AI — tiny local server for the downloaded copy of the app.
   Serves the files next to it and forwards /api/* to the website it came from,
   so the desktop copy talks to the same cloud brain as the browser. */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const config = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); }
  catch { return {}; }
})();

const CLOUD = String(config.cloud_url || '').replace(/\/$/, '');
const PORT = Number(process.env.PORT || config.port || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.zip': 'application/zip',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

async function proxy(req, res) {
  if (!CLOUD) return send(res, 503, 'config.json has no cloud_url. Set it to your Seas AI website address.');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  try {
    const upstream = await fetch(CLOUD + req.url, {
      method: req.method,
      headers: { ...req.headers, host: new URL(CLOUD).host },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    });
    const out = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': upstream.headers.get('cache-control') || 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(out);
  } catch (error) {
    send(res, 502, 'Seas AI cloud is unreachable: ' + error.message);
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return proxy(req, res);
  if (req.url === '/' || req.url.startsWith('/?')) return serve('/index.html', res);
  serve(req.url.split('?')[0], res);
});

function serve(route, res) {
  const file = path.join(__dirname, path.normalize(route).replace(/^([/\\])+/, ''));
  if (!file.startsWith(__dirname)) return send(res, 403, 'forbidden');
  fs.readFile(file, (error, data) => {
    if (error) return send(res, 404, 'not found');
    send(res, 200, data, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
}

server.listen(PORT, () => {
  console.log('Seas AI is running:  http://localhost:' + PORT);
  console.log(CLOUD ? 'Brain: ' + CLOUD : 'Brain: not configured (edit config.json)');
});
