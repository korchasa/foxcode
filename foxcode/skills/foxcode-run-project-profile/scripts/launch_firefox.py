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
import time
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


def _read_pid_file(pid_file: Path) -> tuple[int, int | None]:
    """Read PID file. Returns (pid, port_or_None). Port absent in old-format files."""
    lines = pid_file.read_text().strip().splitlines()
    pid = int(lines[0])
    port = int(lines[1]) if len(lines) > 1 else None
    return pid, port


def _write_pid_file(pid_file: Path, pid: int, port: int | None) -> None:
    content = str(pid) if port is None else f"{pid}\n{port}"
    pid_file.write_text(content + "\n")


def _kill_process(pid: int) -> None:
    """Terminate process: SIGTERM with 2 s grace period, then SIGKILL.

    Uses os.kill(pid, 0) to check liveness — valid here because the target
    (web-ext) is a child of another launch_firefox.py instance which reaps
    it promptly via proc.wait(). Do NOT use os.kill(pid, 0) in tests where
    the process may become a zombie — use Popen.poll() instead.
    """
    try:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/F", "/PID", str(pid)], check=False)
            return
        os.kill(pid, signal.SIGTERM)
        for _ in range(40):
            time.sleep(0.05)
            try:
                os.kill(pid, 0)
            except OSError:
                return
        os.kill(pid, signal.SIGKILL)
    except OSError:
        pass


def handle_existing_process(pid_file: Path, current_port: int | None) -> bool:
    """Check existing PID file against current_port.

    - No file or stale PID → False (proceed to launch).
    - Live PID, port matches or no port context → True (already running, skip).
    - Live PID, port mismatch → kill old process, remove file, False (relaunch).
    """
    if not pid_file.exists():
        return False
    try:
        pid, stored_port = _read_pid_file(pid_file)
    except (ValueError, IndexError, FileNotFoundError):
        pid_file.unlink(missing_ok=True)
        return False
    if not is_process_alive(pid):
        pid_file.unlink(missing_ok=True)
        return False
    # Process is alive — check port
    if current_port is not None and stored_port != current_port:
        print(f"Port changed ({stored_port} -> {current_port}), restarting Firefox (PID {pid})...")
        _kill_process(pid)
        pid_file.unlink(missing_ok=True)
        return False
    return True


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
    if handle_existing_process(args.pid_file, args.port):
        pid = int(args.pid_file.read_text().strip().splitlines()[0])
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
    _write_pid_file(args.pid_file, proc.pid, args.port)

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
