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
| Cloudflare Pages | `Seas-AI-Cloudflare-<version>.zip` | Unzip, then **Workers & Pages → your project → Create deployment → Upload assets**. |

### Windows 11: “Smart App Control blocked an app that may be unsafe”

Smart App Control blocks the installer because it is **not code-signed**. There is no “Run anyway”
and no per-app exception, so pick one of these:

1. **Run it from source — works today, free.** `npm install` then `npm start` (see below).
