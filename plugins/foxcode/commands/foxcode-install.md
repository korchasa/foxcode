# FoxCode Install

You are running the FoxCode install command. Guide the user through setting up the FoxCode Firefox extension step by step.

**IMPORTANT:** Detect the user's language from conversation context and communicate in that language throughout. All instructions, questions, and explanations must be in the user's language.

---

## Step 0: Explain

Before doing anything, explain to the user what will happen:

1. Check that Node.js (v18+) and Firefox are installed
2. Download the FoxCode extension (.xpi) from GitHub releases
3. Help install the extension in Firefox (two options available)
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

## Step 2: Download .xpi

Check if `/tmp/foxcode-extension.xpi` already exists.

- **If exists**: Ask the user: "FoxCode extension already downloaded at `/tmp/foxcode-extension.xpi`. Re-download latest version or skip?"
  - If re-download: proceed with download below
  - If skip: move to Step 3
- **If not exists**: proceed with download

Download:
```bash
curl -L -o /tmp/foxcode-extension.xpi "https://github.com/korchasa/foxcode/releases/latest/download/foxcode-extension.xpi"
```

Verify: check file exists and size > 0 bytes. If download failed, stop with error:
> Download failed. Check your internet connection or download manually from https://github.com/korchasa/foxcode/releases

---

## Step 3: Ask Firefox Install Mode

Ask the user which option they prefer:

> **A) Separate window** (recommended for first try)
> Launches a clean Firefox profile with FoxCode pre-loaded via `web-ext`. Your existing Firefox stays untouched. Extension disappears when you close the window. Requires the foxcode repository to be cloned locally (needs `extension/` directory).
>
> **B) Existing Firefox**
> Load extension as temporary add-on via `about:debugging`. Works with the downloaded .xpi file. Extension stays until Firefox restart.

Wait for user's answer before proceeding.

---

## Step 4a: Option A (web-ext — separate window)

Check that `extension/` directory exists in the current working directory.

If NOT found:
> This option requires the cloned foxcode repository. Either:
> - Clone it: `git clone https://github.com/korchasa/foxcode.git && cd foxcode`
> - Or choose Option B instead

If found, run:
```bash
npx web-ext run --source-dir extension/ --firefox="$(which firefox || echo '/Applications/Firefox.app/Contents/MacOS/firefox')"
```

Explain to the user: A separate Firefox window will open with FoxCode pre-installed. Open the sidebar via **View > Sidebar > FoxCode**.

---

## Step 4b: Option B (about:debugging — existing Firefox)

Tell the user to perform these steps:

1. Open Firefox
2. Navigate to `about:debugging#/runtime/this-firefox`
3. Click **"Load Temporary Add-on..."**
4. Select the file: `/tmp/foxcode-extension.xpi`
5. Open sidebar: **View > Sidebar > FoxCode**

Note: There is no CLI command to load a temporary add-on into a running Firefox instance. This must be done through the Firefox UI.

---

## Step 5: Final Summary

Output the following summary:

```
Setup complete!

MCP server: configured via plugin (foxcode-channel)
Extension: installed in Firefox
Tool permissions: will be prompted on first use (approve mcp__foxcode__*)

Launch Claude Code with FoxCode:
  claude --dangerously-load-development-channels server:foxcode

Open sidebar: View > Sidebar > FoxCode
```
