# SEAS AI · Generation 3

A sci-fi AI character that lives in your PC — a voice, a personality and a memory of you, in one
page. Choose the **female** character or the **male** character (hair, eyes, blush and mood are
drawn live on canvas, with three looks: Light hologram, Anime character, Dot cloud), talk with your
voice, and let it remember what you tell it.

The same page runs in three places and always looks the same:

| Where | What runs |
| --- | --- |
| **Cloudflare Pages** | `index.html` + `_worker.js` — the site, with the cloud brain and the voice |
| **Desktop app** (Electron) | loads that same Cloudflare page, so a change published there shows up in the PC app |
| **Bundled fallback** | the identical `index.html` shipped in the installer, used when the cloud is offline |

## Install from GitHub

```bash
git clone https://github.com/<your-user>/seas-ai.git
cd seas-ai
npm install        # Electron 45 once, ~275 MB
npm start          # desktop app
```

**Code → Download ZIP** works the same way. For the browser build instead, run
`npm run web:preview` and open <http://localhost:3002>.

## Installers

Everything below is attached to every tagged release (**Releases** page):

| Platform | File | Install |
| --- | --- | --- |
| Windows 10/11 x64 | `Seas-AI-<version>-Setup.exe` | Run it, pick the folder, finish. |
| Linux x64 | `Seas-AI-<version>-x86_64.AppImage` | `chmod +x Seas-AI-*.AppImage`, run it. |
| Cloudflare Pages | `Seas-AI-Cloudflare-<version>.zip` | Unzip, then **Workers & Pages → your project → Create deployment → Upload assets**. |

### Windows 11: “Smart App Control blocked an app that may be unsafe”

The installer is **not code-signed**, so Smart App Control refuses it and there is no “Run anyway”.
Either run it from source (`npm install` + `npm start`, works today) or sign the build by adding
`CSC_LINK` (base64 `.pfx` or a URL to it) and `CSC_KEY_PASSWORD` as repository secrets — the CI
workflow then signs `Seas AI.exe` and the installer automatically.

## Cloudflare Pages → one UI for web and desktop

The site is what ships to Cloudflare, and the desktop app **loads that page**, so anything you
publish there is in the PC app on the next launch. `cloud.json` holds the address:

```json
{ "url": "https://seas-ai-agent.pages.dev/", "clearCache": true }
```

With a `url` the app clears the HTTP cache and loads it, so a fresh deploy is never hidden behind a
stale file. With an empty `url`, `npm start -- --local`, or the site being unreachable, the app
opens its bundled copy instead. Only the bundled origin and the configured cloud origin keep the
window controls and the desktop toolkit.

### The worker (`_worker.js`)

`_worker.js` turns the Pages project into the app's backend. Routes:

| Route | What it does |
| --- | --- |
| `POST /api/brain` | streaming chat; Gemini, Workers AI and any OpenAI-compatible provider, plus council mode that merges several brains |
| `POST /api/tool/tts` | the character's cloud voice (male `Charon`, female `Kore`), native Urdu/English |
| `POST /api/tool/stt` | speech-to-text in Urdu, English or a mix (Whisper fallback) |
| `GET /api/tool/news` | headlines from five world feeds |
| `POST /api/tool/search` · `websearch` · `read_page` | live web research |
| `POST /api/tool/image` | image generation (Gemini or Flux) |
| `POST /api/tool/youtube` | finds a playable video |
| `POST /api/tool/frame_check` | can a page be shown inside the app |
| `GET /SEAS-AI-AGENT-App.zip` | builds the PC copy on the fly, already pointing at the live site |

Fair use is built in: per-IP requests per minute, a daily limit, two simultaneous requests, and a
global safety valve.

### Bindings that switch features on

**Cloudflare dashboard → your Pages project → Settings → Bindings / Variables:**

| Binding | Type | Turns on |
| --- | --- | --- |
| `AI` | Workers AI | the free brain (`/api/brain`), Whisper STT, Flux images |
| `GEMINI_API_KEY` | Secret | the character's voice (`/api/tool/tts`), Gemini chat, STT and search |

Optional: `ACCESS_CODE` (visitors must enter a code), `ALLOWED_ORIGINS` (extra CORS origins),
`DAILY_PER_IP`, `RATE_PER_MIN`, `MAX_INFLIGHT_PER_IP`, and `LLM_API_KEY` + `LLM_BASE_URL` +
`LLM_MODEL_FAST` / `LLM_MODEL_SMART` for an OpenAI-compatible provider. `GET /api/status` reports
what is connected.

### Build and publish

```bash
npm run web:build     # → dist-web/  (index.html, _worker.js, sw.js, manifest, appfiles, headers)
npm run web:preview   # http://localhost:3002 to check it
npm run web:zip       # → dist-cloudflare/Seas-AI-Cloudflare-<version>.zip
```

Then either connect the repo in the dashboard — build command `npm run web:build`, output
directory `dist-web` — or deploy from a machine:

```bash
npx wrangler pages deploy dist-web --project-name seas-ai-agent
```

Or unzip the release's Cloudflare zip and use **Create deployment → Upload assets**. Cloudflare
does not accept a zip directly: unzip it first.

> The page itself is one large `index.html`. If you edit it on the live site, the
> **Sync the web app page** workflow (*Run workflow*) copies the published page back into the repo,
> so the installers and the Pages build keep the same file.

## What the character can do

- **Talk** — mic in, spoken answer out; the language follows what you speak (Urdu / English /
  Roman Urdu), with a male or a female voice.
- **Remember** — name, plans, the things you care about, stored in `localStorage` on your device.
- **Three looks** — Light hologram, Anime character, Dot cloud; plus mood, blinking, lip-sync.
- **Agent Town** — the multi-agent simulation that runs beside the chat.
- **News desk** — world headlines, refreshed from five feeds.
- **Research** — live search, page reading and a short answer with sources.
- **Images and video** — prompt an image, or ask for a YouTube video that plays inside the app.
- **PC check** — reports what the desktop shell allows on this machine.

The desktop shell keeps the allow-listed PC toolkit in the main process (`pc.js`): apps, sound,
files, screenshots, windows and power actions. It is reachable only from the trusted shell origin,
never from a page loaded in the window, so a prompt injection cannot become a shell command.

## Files

```
index.html              the whole Generation-3 app (characters, voice, memory, Agent Town)
_worker.js              Cloudflare Worker backend: brain, voice, STT, news, search, image, YouTube
sw.js                   service worker (offline shell)
manifest.webmanifest    PWA manifest (assets/favicon.svg is the icon)
appfiles/               files inside the in-app PC download (local server, launchers, readme)
main.js                 Electron main process (app:// scheme, cloud-first loading, permissions, pc IPC)
pc.js                   desktop control toolkit: apps, sound, files, screenshots, power
preload.js              contextBridge window-control + PC-control API
assets/js/desktop.js    renderer bridge to the PC layer (browser-safe fallback)
cloud.json              cloud URL — the desktop app loads the Cloudflare build (empty = bundled)
scripts/web-build.mjs   collects the app + worker + icons into dist-web/ for Cloudflare Pages
scripts/cloudflare-zip.mjs  packs dist-web/ into dist-cloudflare/Seas-AI-Cloudflare-<version>.zip
web/_headers            Cloudflare Pages headers (no-cache HTML, cached assets)
web/_redirects          serves the SVG icon for the icon paths the page asks for
wrangler.toml           Cloudflare Pages project config (output: dist-web)
assets/css, assets/js   the earlier modular shell, kept for the PC toolkit UI
.github/workflows/      installers + release, the Cloudflare zip, and the page sync
```

## Privacy

Memory, transcript, to-dos and settings stay in `localStorage` on your device. What you say or type
goes to the AI to be answered — through your own Cloudflare deployment. The app uploads no files
unless you attach one.
