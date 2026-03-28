# FoxCode — Setup Prompt for Claude Code

Set up **FoxCode** — Firefox browser UI for Claude Code sessions.

### Step 0: Explain to user (in their language)

Before doing anything, tell the user what you are about to do. Use the user's language (detect from conversation context). Briefly explain:

1. You will check that Node.js and Firefox are installed
2. You will add the FoxCode channel plugin to `.mcp.json` in the current project
3. You will download the extension .xpi and install it into Firefox
4. The user will need to restart Claude Code with channel flag

Ask the user to confirm before proceeding.

### Step 1: Check prerequisites

1. `node --version` — must be v18+
2. Firefox installed: macOS → `/Applications/Firefox.app`, Linux → `which firefox`

If any check fails, tell the user what to install and stop.

### Step 2: Configure .mcp.json

Create or update `.mcp.json` in CWD (merge into existing `mcpServers`, don't overwrite):

```json
{
  "mcpServers": {
    "foxcode": {
      "command": "npx",
      "args": ["-y", "foxcode-channel"]
    }
  }
}
```

### Step 3: Download extension .xpi

Check if `/tmp/foxcode-extension.xpi` already exists.
- If exists: ask "Re-download or skip?"
- If not: download

```bash
curl -L -o /tmp/foxcode-extension.xpi \
  "https://github.com/korchasa/foxcode/releases/latest/download/foxcode-extension.xpi"
```

Verify download succeeded (file must be >0 bytes).

### Step 4: Ask user about Firefox launch mode

Ask the user (in their language):

> How would you like to install FoxCode in Firefox?
>
> **A) Separate window** (recommended for first try) — launches a clean Firefox profile with extension pre-loaded via `web-ext`. Your existing Firefox stays untouched. Extension disappears when you close the window.
>
> **B) Existing Firefox** — installs extension as temporary add-on into your running Firefox via `about:debugging`. Extension stays until Firefox restart.

Wait for user's answer before proceeding.

### Step 5: Install extension

#### If user chose A (separate window):

```bash
npx web-ext run --source-dir <path-to-foxcode>/extension --firefox="$(which firefox || echo '/Applications/Firefox.app/Contents/MacOS/firefox')"
```

Tell the user: the separate Firefox window has FoxCode pre-installed. Open sidebar via View → Sidebar → FoxCode.

#### If user chose B (existing Firefox):

Tell the user to perform these steps manually:

```
1. Open Firefox → about:debugging#/runtime/this-firefox
2. Click "Load Temporary Add-on..."
3. Select the downloaded file: /tmp/foxcode-extension.xpi
4. Open sidebar: View → Sidebar → FoxCode
```

Note: there is no CLI command to load a temporary add-on into a running Firefox. This must be done via the GUI.

### Step 6: Tell user

```
Setup complete! Restart Claude Code in this directory:

  claude --dangerously-load-development-channels server:foxcode

The sidebar will auto-connect when the channel plugin starts.
```
