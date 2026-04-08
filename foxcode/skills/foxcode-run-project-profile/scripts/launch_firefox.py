#!/usr/bin/env python3
from __future__ import annotations

"""Launch Firefox with FoxCode extension via web-ext.

Resolves environment (Firefox binary, extension dir, port, password) internally,
then launches web-ext with PID file lifecycle management.

Usage:
    launch_firefox.py [--pid-file PATH] [--profile-dir PATH]

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

    # Build start URL
    start_url_args = []
    if env["port"]:
        url = f"http://localhost:{env['port']}"
        if env["password"]:
            url += f"#{env['port']}:{env['password']}"
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
