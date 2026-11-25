# SEAS AI · Generation 3 (web build)

A sci-fi AI desktop character in a single browser page — voice in, voice out, memory of you,
an on-device skill matrix, a multi-agent "Agent Town", and an optional AI engine for real conversation.
Plain HTML, CSS and ES modules. No build step, no framework, no backend.

## Install from GitHub

Two ways, both from the repository page:

```bash
# 1. clone the repo
git clone https://github.com/<your-user>/<your-repo>.git
cd <your-repo>

# 2. install Electron, then start the desktop app
npm install
npm start
```

Or use **Code → Download ZIP**, unzip it, and run the same `npm install` / `npm start`
in that folder. `node_modules` is not in the repo — `npm install` fetches it from
`package-lock.json` (Electron 45, ~275 MB once). For the browser build instead, serve
the folder with `python3 -m http.server 3002` and open <http://localhost:3002>.

## Installers (.exe / AppImage)

Pre-built installers are attached to every tagged GitHub release (**Releases** page):

| Platform | File | Install |
| --- | --- | --- |
| Windows 10/11 (x64) | `Seas-AI-<version>-Setup.exe` | Run it, choose the folder, finish. Desktop + Start-menu shortcuts are created. |
| Linux (x64) | `Seas-AI-<version>-x86_64.AppImage` | `chmod +x Seas-AI-*.AppImage` then run it. |

### Windows 11: “Smart App Control blocked an app that may be unsafe”

Smart App Control blocks the installer because it is **not code-signed**. There is no “Run anyway”
and no per-app exception, so pick one of these:

1. **Run it from source — works today, free.** `npm install` then `npm start` (see below).
   Nothing unsigned is executed: Electron’s own `electron.exe` is Authenticode-signed by the
   Electron project, and only our plain JS files load on top of it.
2. **Turn Smart App Control off.** Settings → Privacy & security → Windows Security → App & browser
   control → Smart App Control → **Off**. Microsoft documents that it cannot be switched back on
   without reinstalling Windows, so treat this as permanent.
3. **Sign the build — the only fix that keeps Smart App Control on.** The CI is already wired for
   it: add `CSC_LINK` (base64 `.pfx`, or a link to it) and `CSC_KEY_PASSWORD` under
   *Settings → Secrets and variables → Actions*, and the next tag signs both `Seas AI.exe` and the
   installer with that certificate. Free certificate for public repos: **SignPath Foundation**
   (requires an OSI-approved licence — this repo is currently `UNLICENSED`). Paid: **Azure
   Artifact Signing**, ~$9.99/month, individuals only from the USA/Canada. A brand-new certificate
   has no SmartScreen reputation yet, so early warnings are normal.

With Smart App Control off, an unsigned installer only shows plain SmartScreen, where
**More info → Run anyway** works.

Build them yourself (electron-builder):

```bash
npm install
npm run dist:win     # dist/Seas-AI-<version>-Setup.exe   (run on Windows, or Linux + wine)
npm run dist:linux   # dist/Seas-AI-<version>-x86_64.AppImage
npm run dist         # installer for the current OS
npm run pack         # unpacked app in dist/ (quick smoke test)
```

Publishing: push a tag such as `v3.1.23` and `.github/workflows/build-installers.yml` builds
both installers on GitHub runners and attaches them to the release automatically. You can
also trigger it manually from the **Actions** tab (workflow_dispatch); that run keeps the
files as downloadable workflow artifacts instead of creating a release.

## Run it

Any static server works:

```bash
python3 -m http.server 3002 --bind 0.0.0.0
# open http://localhost:3002
```

Or `npx serve .` / drop the folder on any static host.
It must be served over `http://` (not opened as a `file://` path) so the ES modules load.

Voice features need a microphone. Chrome/Edge use the built-in `SpeechRecognition`; everywhere
else — and whenever that fails — the mic button falls back to an **on-device Whisper tiny**
model (transformers.js, ~40 MB downloaded once, then cached and offline). Typing works everywhere.

## Desktop app (Electron)

The same shell runs as a native desktop window — frameless, with the top-bar minimize /
maximize / close buttons wired to the real window. It is served over a private
`app://seas` scheme, because ES modules need a real origin and `file://` cannot load them.

```bash
npm install     # installs Electron (dev dependency only)
npm start       # open the app window
npm run dev     # same window + detached DevTools
```

If the Electron binary download stalls, install through a mirror:

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

On Linux the window needs the usual Chromium desktop libraries (`libnss3`, `libgtk-3-0`,
`libasound2`, `libxkbcommon0`, …) plus an X/Wayland session — on a server install them first or
run under `xvfb-run`.

Microphone and voice:

- The main process grants the app origin `media` (audio only) permission, so the first mic
  click shows the normal Chromium prompt; the answer is remembered per app.
- **Windows:** Settings → Privacy → Microphone must allow desktop apps.
- **macOS:** allow the app under System Settings → Privacy & Security → Microphone.
- **Linux:** needs a working PulseAudio/PipeWire input.
- `SpeechRecognition` (mic → text) in Electron uses Google's speech service, which only
  answers in builds that carry Google API keys. Export `GOOGLE_API_KEY`,
  `GOOGLE_DEFAULT_CLIENT_ID` and `GOOGLE_DEFAULT_CLIENT_SECRET` before `npm start` to enable
  it. Without them the app reports that recognition is unavailable, and typing plus spoken
  replies keep working.
- Text-to-speech uses the OS voices and needs no keys.
- No Google keys? The mic button auto-switches to the **on-device speech model**: it records with
  `MediaRecorder` and transcribes locally with Whisper tiny via transformers.js. The first use
  downloads the model (~40 MB, cached afterwards); after that it works offline.

External links open in your normal browser, the renderer runs with `contextIsolation`, no
Node integration and a sandboxed preload, and a second launch focuses the existing window.
Packaging is wired up with `electron-builder` (see **Installers** above); the app ships as an
NSIS `.exe` installer on Windows and an `.AppImage` on Linux.

## What it does

| Area | Details |
| --- | --- |
| **Core orb** | Canvas renderer with five states: idle, listening, processing, speaking, standby. Reacts to real activity. |
| **Conversation** | Chat with typewriter output, transcript restored from local storage. |
| **Voice** | Speech recognition (mic button or `Ctrl/⌘ + M`) with an on-device Whisper fallback, optional wake word ("hey seas"), speech synthesis with a single **Male / Female** switch (SYSTEM → VOICE). |
| **Memory** | Facts live in `localStorage`. "remember that …", "my name is …" and similar sentences are captured automatically. |
| **Skills** | 20 on-device modules: open sites, YouTube, web search, maths, timers, notes/to-dos, device report, weather, WhatsApp draft, coin/dice, memory, session control. |
| **Agent Town** | Four local seats (Researcher, Builder, Analyst, Critic) walk a grid, take a task and report back. A simulation of a multi-agent office, entirely client-side. |
| **System** | Male / Female voice, engine endpoint, model, API key (all stored on this device only). |

Keyboard: `Ctrl/⌘ + K` command console, `/` focus the composer, `Ctrl/⌘ + M` toggle the
microphone, `Enter` send, `Shift+Enter` newline.

## AI engine (optional)

Without a key the app runs on its **local core** — deterministic skills plus a small rule-based
conversation layer. To get real reasoning, open **SYSTEM → AI ENGINE** and point it at any
OpenAI-compatible `/chat/completions` endpoint:

- Endpoint, e.g. `https://api.openai.com/v1`
- Model, e.g. `gpt-4o-mini`
- API key

The key is stored in this browser's `localStorage` and sent only to the endpoint you configure.
Some providers block cross-origin browser requests (CORS); if you see
"Engine unreachable", use a provider that allows CORS or proxy the call through your own server.

> Note: this build runs in a browser sandbox. It can open sites, play media in a new tab and
> remember things — it cannot launch installed apps, read your disk, or control the OS.
> For that you need a native desktop build.

## Files

```
main.js                 Electron main process (app:// scheme, window, permissions)
preload.js              contextBridge window-control API
package.json            Electron scripts, electron-builder config, dev dependencies
build/icon.png          optional app icon — not committed here; add it and re-enable the
                        win.icon / linux.icon fields to make installers use it
.github/workflows/      CI that builds both installers and publishes a release
index.html              HUD markup, boot sequence, modules
assets/css/style.css    design system, layout, animation
assets/js/state.js      settings + personality + persistence
assets/js/memory.js     local memory store, matching, fact extraction
assets/js/voice.js      speech synthesis + speech recognition wrappers
assets/js/skills.js     skill matrix (sites, search, maths, timers, notes, device…)
assets/js/brain.js      skill dispatch → remote engine → local core fallback
assets/js/character.js  canvas orb, starfield, waveform
assets/js/agents.js     Agent Town simulation
assets/js/app.js        boot, chat pipeline, views, settings wiring
```

## Privacy

Memory, transcript, to-dos and settings stay in `localStorage` on this device.
The only outbound request is the optional AI engine call, when you configure one.
