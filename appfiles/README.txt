SEAS AI — your copy of the app
==============================

Everything here already points at your Seas AI website (see config.json), so the
character, the voice, the memory and the cloud brain are exactly the same as on
the web — change the website and this copy follows it.

Windows
  1. Install Node.js from https://nodejs.org (one time).
  2. Double-click START_SEAS-AI-AGENT.bat.
  3. The app opens at http://localhost:4173.

macOS / Linux
  1. Install Node.js from https://nodejs.org (one time).
  2. Run:  sh start.sh
  3. The app opens at http://localhost:4173.

Files
  index.html           the app
  server.js            tiny local server (static files + /api proxy)
  config.json          cloud_url = your website; optional access code / API keys
  sw.js                offline cache

Nothing is uploaded from this folder. The AI runs on your website (Cloudflare),
your files stay on this PC.
