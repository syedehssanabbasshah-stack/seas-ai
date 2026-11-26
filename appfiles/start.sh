#!/usr/bin/env sh
# SEAS AI — local launcher (macOS / Linux)
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it from https://nodejs.org then run this file again."
  exit 1
fi
(sleep 1; command -v xdg-open >/dev/null 2>&1 && xdg-open http://localhost:4173 || open http://localhost:4173 2>/dev/null) &
node server.js
