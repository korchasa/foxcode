#!/usr/bin/env python3
from __future__ import annotations

"""Resolve FoxCode environment: Firefox binary, extension dir, skill dir, port, password.

Derives SKILL_DIR from its own __file__ location (no external hints needed).
Searches well-known paths for Firefox and extension directory.

Output formats:
  --format=shell  (default): KEY=VALUE lines, one per var (eval-friendly)
  --format=json:             JSON object

Usage:
    resolve_env.py [--format shell|json] [--firefox-search-paths P ...] [--extension-search-paths P ...]

Cross-platform: macOS, Linux, Windows.
"""

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

# --- Firefox discovery ---

KNOWN_FIREFOX_PATHS = {
    "darwin": [
        "/Applications/Firefox.app/Contents/MacOS/firefox",
    ],
    "linux": [
        "/usr/bin/firefox",
        "/usr/lib/firefox/firefox",
        "/snap/bin/firefox",
        "/usr/bin/firefox-esr",
    ],
    "win32": [
        os.path.expandvars(r"%ProgramFiles%\Mozilla Firefox\firefox.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"),
        os.path.expandvars(r"%LocalAppData%\Mozilla Firefox\firefox.exe"),
    ],
}


def _is_executable(path: str) -> bool:
    return os.path.isfile(path) and os.access(path, os.X_OK)


def find_firefox(
    search_paths: list[str] | None = None,
    use_default_paths: bool = True,
) -> str | None:
    """Find Firefox binary. Returns path or None."""
    if search_paths:
        for p in search_paths:
            if _is_executable(p):
                return p
    if use_default_paths:
        for p in KNOWN_FIREFOX_PATHS.get(sys.platform, []):
            if _is_executable(p):
                return p
    # PATH fallback (only with default paths enabled)
    if use_default_paths:
        for name in ("firefox", "firefox-esr"):
            found = shutil.which(name)
            if found:
                return found
    return None


# --- Extension directory discovery ---

def find_extension_dir(
    search_paths: list[str] | None = None,
    use_default_paths: bool = True,
) -> str | None:
    """Find extension directory containing manifest.json."""
    candidates = list(search_paths or [])
    if use_default_paths:
        skill_dir = _resolve_skill_dir()
        if skill_dir:
            # Marketplace: .../marketplaces/korchasa/foxcode/skills/... -> .../korchasa/extension/
            marketplace_ext = str(Path(skill_dir).parent.parent.parent / "extension")
            candidates.append(marketplace_ext)
        candidates.append("./extension")

    for d in candidates:
        if os.path.isfile(os.path.join(d, "manifest.json")):
            return os.path.abspath(d)
    return None


# --- Skill dir from __file__ ---

def _resolve_skill_dir() -> str:
    """SKILL_DIR = parent of parent of this script (scripts/ -> skill/).

    Uses abspath (not realpath) so symlinks are preserved — the caller
    wants the path where the script was *invoked*, not the original source.
    """
    return str(Path(os.path.abspath(__file__)).parent.parent)


# --- Port and password ---

def _read_file(path: str) -> str:
    """Read file contents. Returns empty string if file doesn't exist. Raises on permission error."""
    try:
        return Path(path).read_text().strip()
    except FileNotFoundError:
        return ""


# --- Config cache ---

def _config_path() -> Path:
    return Path(".foxcode") / "config.json"


def _load_cached_config() -> dict | None:
    """Load cached config if it exists and paths are still valid."""
    try:
        config = json.loads(_config_path().read_text())
    except (FileNotFoundError, json.JSONDecodeError, PermissionError):
        return None
    # Validate cached paths still exist
    if not config.get("firefox") or not _is_executable(config["firefox"]):
        return None
    ext = config.get("extensionDir", "")
    if not ext or not os.path.isfile(os.path.join(ext, "manifest.json")):
        return None
    return config


def _save_config(env: dict) -> None:
    """Save discovered firefox and extensionDir to config cache."""
    p = _config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({
        "firefox": env["firefox"],
        "extensionDir": env["extensionDir"],
    }, indent=2) + "\n")


def resolve_all(
    firefox_search_paths: list[str] | None = None,
    use_default_firefox_paths: bool = True,
    extension_search_paths: list[str] | None = None,
    use_default_extension_paths: bool = True,
) -> dict:
    """Resolve all environment variables. Returns dict.

    Brownfield: reads .foxcode/config.json if cached paths are valid.
    Greenfield: discovers paths, saves to .foxcode/config.json.
    """
    home = os.path.expanduser("~")
    port = _read_file(os.path.join(home, ".foxcode", "port"))
    password = _read_file(os.path.join(home, ".foxcode", "password"))

    cached = _load_cached_config()
    if cached:
        return {
            "skillDir": _resolve_skill_dir(),
            "firefox": cached["firefox"],
            "extensionDir": cached["extensionDir"],
            "port": port,
            "password": password,
        }

    # Greenfield discovery
    env = {
        "skillDir": _resolve_skill_dir(),
        "firefox": find_firefox(firefox_search_paths, use_default_firefox_paths),
        "extensionDir": find_extension_dir(extension_search_paths, use_default_extension_paths),
        "port": port,
        "password": password,
    }

    # Cache discovered paths for next run
    if env["firefox"] and env["extensionDir"]:
        _save_config(env)

    return env


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve FoxCode environment")
    parser.add_argument(
        "--format", choices=["shell", "json"], default="shell",
        help="Output format (default: shell)",
    )
    parser.add_argument(
        "--firefox-search-paths", nargs="+", default=None,
        help="Additional Firefox paths to check first",
    )
    parser.add_argument(
        "--no-default-firefox-paths", action="store_true",
        help="Disable platform default Firefox paths",
    )
    parser.add_argument(
        "--extension-search-paths", nargs="+", default=None,
        help="Additional extension dirs to check first",
    )
    parser.add_argument(
        "--no-default-extension-paths", action="store_true",
        help="Disable default extension path discovery",
    )
    args = parser.parse_args()

    try:
        env = resolve_all(
            firefox_search_paths=args.firefox_search_paths,
            use_default_firefox_paths=not args.no_default_firefox_paths,
            extension_search_paths=args.extension_search_paths,
            use_default_extension_paths=not args.no_default_extension_paths,
        )
    except PermissionError as e:
        print(f"Error: permission denied reading {e.filename}", file=sys.stderr)
        return 1

    # Validate required fields
    errors = []
    if not env["firefox"]:
        errors.append("Firefox not found. Install Firefox or pass --firefox-search-paths.")
    if not env["extensionDir"]:
        errors.append("Extension directory not found (no manifest.json). Pass --extension-search-paths.")

    if errors:
        for e in errors:
            print(f"Error: {e}", file=sys.stderr)
        return 1

    if args.format == "json":
        print(json.dumps(env))
    else:
        print(f"SKILL_DIR={env['skillDir']}")
        print(f"FIREFOX={env['firefox']}")
        print(f"EXT_DIR={env['extensionDir']}")
        print(f"PORT={env['port']}")
        print(f"PASSWORD={env['password']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
