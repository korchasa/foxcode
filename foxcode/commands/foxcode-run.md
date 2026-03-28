# FoxCode Run

You are running the FoxCode run command. Launch Firefox with FoxCode extension using the persistent project-local profile.

**IMPORTANT:** Detect the user's language from conversation context and communicate in that language throughout.

---

## Step 1: Locate extension source

Check in order, use the first match:

1. `./extension/` — current working directory (cloned repo)
2. Marketplace clone — parse `~/.claude/plugins/known_marketplaces.json`, find entry with `"repo": "korchasa/foxcode"`, read its `installLocation`, check `<installLocation>/extension/`

```bash
EXT_DIR="$(node -e "
  const fs = require('fs');
  const p = require('path');
  const f = p.join(process.env.HOME, '.claude/plugins/known_marketplaces.json');
  if (!fs.existsSync(f)) process.exit(1);
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  const e = Object.values(m).find(v => v.source?.repo === 'korchasa/foxcode');
  if (e) console.log(p.join(e.installLocation, 'extension'));
" 2>/dev/null)"
```

If NEITHER found:
> Extension source not found. Run `/foxcode:foxcode-install` first.

---

## Step 2: Launch Firefox

```bash
mkdir -p .foxcode/firefox-profile
npx web-ext run \
  --source-dir "$EXT_DIR" \
  --firefox-profile .foxcode/firefox-profile \
  --keep-profile-changes \
  --firefox="$(which firefox || echo '/Applications/Firefox.app/Contents/MacOS/firefox')"
```

Tell the user: Firefox launched with FoxCode. Open sidebar: **View > Sidebar > FoxCode**.
