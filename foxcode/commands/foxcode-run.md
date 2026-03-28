# FoxCode Run

You are running the FoxCode run command. Launch Firefox with FoxCode extension using the persistent project-local profile.

**IMPORTANT:** Detect the user's language from conversation context and communicate in that language throughout.

---

## Step 1: Locate extension source

Find the `extension/` directory. Check in order, use the first match:

1. `./extension/` in current working directory
2. Marketplace clone: read `~/.claude/plugins/known_marketplaces.json`, find entry where `source.repo` equals `korchasa/foxcode`, use its `installLocation` + `/extension/`

If not found:
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
