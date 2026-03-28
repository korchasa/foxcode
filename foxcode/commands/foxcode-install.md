# FoxCode Install

You are running the FoxCode install command. Guide the user through setting up the FoxCode Firefox extension step by step.

**IMPORTANT:** Detect the user's language from conversation context and communicate in that language throughout. All instructions, questions, and explanations must be in the user's language.

---

## Step 0: Explain

Before doing anything, explain to the user what will happen:

1. Check that Node.js (v18+) and Firefox are installed
2. Locate extension source (local repo or marketplace clone)
3. Launch Firefox with a persistent project-local profile and FoxCode pre-loaded
4. Provide the launch command for Claude Code with FoxCode

Ask the user to confirm before proceeding.

---

## Step 1: Check Prerequisites

Run these checks. On failure, stop immediately with a clear error and fix instructions.

### Node.js

Run `node --version`. Must be v18 or higher.

If missing or too old:
> Node.js 18+ is required. Install from https://nodejs.org

### Firefox

Check Firefox is installed:
- **macOS**: check `/Applications/Firefox.app` exists
- **Linux**: run `which firefox`

If not found:
> Firefox is required. Install from https://www.mozilla.org/firefox/

---

## Step 2: Locate extension source

Resolve the `extension/` directory using the shared script:

```bash
EXT_DIR="$(bash scripts/resolve-extension-dir.sh 2>/dev/null || bash ~/.claude/plugins/marketplaces/korchasa/scripts/resolve-extension-dir.sh 2>/dev/null)"
```

If empty/failed:
> Extension source not found. Clone the repo: `git clone https://github.com/korchasa/foxcode.git && cd foxcode`

---

## Step 3: Launch Firefox with FoxCode

Create profile directory in the current project if it doesn't exist:
```bash
mkdir -p .foxcode/firefox-profile
```

Suggest adding `.foxcode/` to `.gitignore` if not already there.

Run:
```bash
npx web-ext run \
  --source-dir "$EXT_DIR" \
  --firefox-profile .foxcode/firefox-profile \
  --keep-profile-changes \
  --firefox="$(which firefox || echo '/Applications/Firefox.app/Contents/MacOS/firefox')"
```

Explain to the user: A separate Firefox window will open with FoxCode pre-installed. Your existing Firefox stays untouched. The profile is stored in `.foxcode/firefox-profile/` — logins, cookies, and settings persist between sessions. Open the sidebar via **View > Sidebar > FoxCode**.

---

## Step 4: Final Summary

Output the following summary:

```
Setup complete!

MCP server: configured via plugin (auto-loaded from foxcode/channel/)
Extension: running in persistent profile at .foxcode/firefox-profile/
Tool permissions: will be prompted on first use (approve mcp__foxcode__*)

Launch Claude Code with FoxCode:
  claude --dangerously-load-development-channels server:foxcode

Open sidebar: View > Sidebar > FoxCode
```
