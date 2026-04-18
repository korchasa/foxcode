#!/usr/bin/env python3
from __future__ import annotations

"""Launch Firefox with FoxCode extension via web-ext.

Resolves Firefox binary and extension dir via resolve_env. Port and password
are supplied by the caller (skill) from the live MCP `status` response — not
read from any file — so the URL hash always matches the server the skill
is actually talking to.

If --port/--password are omitted, web-ext starts without a --start-url and
the extension discovers the server via its own port-range scan (dev mode).

Usage:
    launch_firefox.py [--port PORT --password PW] [--pid-file PATH] [--profile-dir PATH]

Cross-platform: macOS, Linux, Windows.
"""

import os
import signal
import subprocess
import sys
from pathlib import Path

from resolve_env import resolve_all


def is_process_alive(pid: int) -> bool:
    """Check if process with given PID is running."""
    if sys.platform == "win32":
        import ctypes
        kernel32 = ctypes.windll.kernel32
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if handle:
            kernel32.CloseHandle(handle)
            return True
        return False
    else:
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False


def check_stale_pid(pid_file: Path) -> bool:
    """Check existing PID file. Remove if stale. Return True if live process found."""
    if not pid_file.exists():
        return False
    try:
        pid = int(pid_file.read_text().strip())
    except (ValueError, FileNotFoundError):
        pid_file.unlink(missing_ok=True)
        return False
    if is_process_alive(pid):
        return True
    pid_file.unlink(missing_ok=True)
    return False


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(description="Launch Firefox with FoxCode extension")
    parser.add_argument(
        "--port", type=int, default=None,
        help="WebSocket port of the live MCP server (from status response). "
             "When provided together with --password, Firefox opens a start URL "
             "that triggers extension auto-connect.",
    )
    parser.add_argument(
        "--password", type=str, default=None,
        help="Shared password of the MCP server (from status response).",
    )
    parser.add_argument(
        "--pid-file", type=Path, default=Path(".foxcode/web-ext.pid"),
        help="PID file path (default: .foxcode/web-ext.pid)",
    )
    parser.add_argument(
        "--profile-dir", type=Path, default=Path(".foxcode/firefox-profile"),
        help="Firefox profile directory (default: .foxcode/firefox-profile)",
    )
    parser.add_argument("--firefox-search-paths", nargs="+", default=None)
    parser.add_argument("--no-default-firefox-paths", action="store_true")
    parser.add_argument("--extension-search-paths", nargs="+", default=None)
    parser.add_argument("--no-default-extension-paths", action="store_true")
    args = parser.parse_args()

    if (args.port is None) != (args.password is None):
        print("Error: --port and --password must be provided together.", file=sys.stderr)
        return 1

    # Resolve environment
    env = resolve_all(
        firefox_search_paths=args.firefox_search_paths,
        use_default_firefox_paths=not args.no_default_firefox_paths,
        extension_search_paths=args.extension_search_paths,
        use_default_extension_paths=not args.no_default_extension_paths,
    )
    errors = []
    if not env["firefox"]:
        errors.append("Firefox not found. Install Firefox.")
    if not env["extensionDir"]:
        errors.append("Extension directory not found.")
    if errors:
        for e in errors:
            print(f"Error: {e}", file=sys.stderr)
        return 1

    # Check for existing process
    if check_stale_pid(args.pid_file):
        pid = int(args.pid_file.read_text().strip())
        print(f"Already running (PID {pid})")
        return 0
    args.pid_file.parent.mkdir(parents=True, exist_ok=True)
    args.profile_dir.mkdir(parents=True, exist_ok=True)

    # Build start URL from explicit port/password (authoritative via status).
    start_url_args = []
    if args.port is not None and args.password is not None:
        url = f"http://localhost:{args.port}#{args.port}:{args.password}"
        start_url_args = ["--start-url", url]

    # Build web-ext command
    cmd = [
        "npx", "web-ext", "run",
        "--source-dir", env["extensionDir"],
        "--firefox-profile", str(args.profile_dir),
        "--keep-profile-changes",
        f"--firefox={env['firefox']}",
    ] + start_url_args

    # Launch
    proc = subprocess.Popen(cmd)
    args.pid_file.write_text(str(proc.pid) + "\n")

    # Signal handling for graceful shutdown
    shutdown_requested = False

    def on_signal(signum, frame):
        nonlocal shutdown_requested
        shutdown_requested = True

    if sys.platform != "win32":
        signal.signal(signal.SIGTERM, on_signal)
        signal.signal(signal.SIGHUP, on_signal)

    # Wait for process
    try:
        while proc.poll() is None:
            if shutdown_requested:
                break
            try:
                proc.wait(timeout=0.2)
            except subprocess.TimeoutExpired:
                pass
    except KeyboardInterrupt:
        shutdown_requested = True

    if shutdown_requested:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()

    args.pid_file.unlink(missing_ok=True)
    return proc.returncode if proc.returncode is not None else 1


if __name__ == "__main__":
    sys.exit(main())
