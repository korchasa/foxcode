#!/usr/bin/env bash
# Resolve FoxCode extension/ directory path.
# Checks: 1) ./extension/ (cloned repo) 2) marketplace clone via known_marketplaces.json
# Prints absolute path to stdout. Exits 1 if not found.
set -euo pipefail

if [ -d "./extension" ]; then
  echo "$(cd ./extension && pwd)"
  exit 0
fi

EXT_DIR="$(node -e "
  const fs = require('fs');
  const p = require('path');
  const f = p.join(process.env.HOME, '.claude/plugins/known_marketplaces.json');
  if (!fs.existsSync(f)) process.exit(1);
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  const e = Object.values(m).find(v => v.source?.repo === 'korchasa/foxcode');
  if (e) console.log(p.join(e.installLocation, 'extension'));
  else process.exit(1);
" 2>/dev/null)" || true

if [ -n "$EXT_DIR" ] && [ -d "$EXT_DIR" ]; then
  echo "$EXT_DIR"
  exit 0
fi

echo "Extension source not found." >&2
exit 1
