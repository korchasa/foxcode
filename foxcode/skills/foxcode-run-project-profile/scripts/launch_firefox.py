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
    launch_firefox.py [--port PORT --password PW] [--pid-file PATH] [--profile-dir PATH] [--foreground]

Cross-platform: macOS, Linux, Windows.
"""

import os
import shutil
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

    Detached POSIX launches make the web-ext process a process-group leader,
    so a port change can stop the whole web-ext/Firefox tree. Older PID files
    may point at a non-group-leader process; in that case fall back to the
    single PID.
    """
    try:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], check=False)
            return
        try:
            os.killpg(pid, signal.SIGTERM)
        except OSError:
            os.kill(pid, signal.SIGTERM)
        for _ in range(40):
            time.sleep(0.05)
            try:
                os.kill(pid, 0)
            except OSError:
                return
        try:
            os.killpg(pid, signal.SIGKILL)
        except OSError:
            os.kill(pid, signal.SIGKILL)
    except OSError:
        pass


def _popen_kwargs(foreground: bool) -> dict:
    """Build subprocess options for foreground or launch-helper mode."""
    if foreground:
        return {}
    if sys.platform == "win32":
        return {
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
            "creationflags": subprocess.CREATE_NEW_PROCESS_GROUP,
        }
    return {
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
        "start_new_session": True,
    }


def _purge_staged_firefox_updates(home: Path) -> list[str]:
    """Remove staged Firefox update markers so the in-place .app swap can't run.

    A staged update under ~/Library/Caches/Mozilla/updates/.../0/ is applied at
    Firefox startup; the updater can hang while replacing Firefox.app, leaving
    web-ext with ECONNREFUSED on the remote debugger port (commit edcad6f).
    Wiping update.status / Updated.app / update.mar / update.version /
    active-update.xml before launch makes Firefox skip the swap entirely. The
    matching --pref=app.update.*=false flags then prevent the launched profile
    from re-staging on the same run.

    Returns the list of removed paths (for logging).
    """
    root = home / "Library" / "Caches" / "Mozilla" / "updates"
    if not root.exists():
        return []

    removed: list[str] = []
    for filename in ("update.status", "update.version", "update.mar", "active-update.xml"):
        for path in root.rglob(filename):
            try:
                path.unlink()
                removed.append(str(path))
            except OSError:
                continue
    for updated_app in root.rglob("Updated.app"):
        if updated_app.is_dir():
            try:
                shutil.rmtree(updated_app)
                removed.append(str(updated_app))
            except OSError:
                continue
    return removed


def _kill_stale_foxcode_updaters(port: int | None) -> list[int]:
    """SIGTERM org.mozilla.updater processes whose args reference our FoxCode URL.

    Some staged updates leave a `org.mozilla.updater` process spinning for hours
    after its parent Firefox exited (observed on macOS: PID 14045 alive 17h+).
    If the process holds our FoxCode start URL, kill it so the next web-ext run
    doesn't inherit the same zombie. Without --port we skip this — dev mode has
    no authoritative URL marker to match against.

    Returns the list of killed PIDs (for logging).
    """
    if port is None or sys.platform == "win32":
        return []

    try:
        result = subprocess.run(
            ["ps", "-axo", "pid=,comm=,args="],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    if result.returncode != 0:
        return []

    port_marker = f"http://localhost:{port}"
    killed: list[int] = []
    for line in result.stdout.splitlines():
        if "org.mozilla.updater" not in line:
            continue
        if port_marker not in line:
            continue
        try:
            pid = int(line.split()[0])
        except (ValueError, IndexError):
            continue
        try:
            os.kill(pid, signal.SIGTERM)
            killed.append(pid)
        except OSError:
            continue
    return killed


def _prepare_firefox_for_launch(home: Path, port: int | None) -> None:
    """Clear Firefox update state that would block web-ext launch.

    Always succeeds (never blocks launch). Prints a summary line per action
    performed so the operator can see what was reclaimed.
    """
    purged = _purge_staged_firefox_updates(home)
    killed = _kill_stale_foxcode_updaters(port)
    if purged:
        print(f"Purged {len(purged)} staged Firefox update marker(s)")
    if killed:
        print(f"Killed {len(killed)} stale org.mozilla.updater process(es): {killed}")


def _wait_foreground(proc: subprocess.Popen, pid_file: Path) -> int:
    """Supervise web-ext until it exits, cleaning the PID file on shutdown."""
    shutdown_requested = False

    def on_signal(signum, frame):
        nonlocal shutdown_requested
        shutdown_requested = True

    if sys.platform != "win32":
        signal.signal(signal.SIGTERM, on_signal)
        signal.signal(signal.SIGHUP, on_signal)

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

    pid_file.unlink(missing_ok=True)
    return proc.returncode if proc.returncode is not None else 1


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
    parser.add_argument(
        "--headless", action="store_true",
        help="Run Firefox in headless mode (no UI). Used by acceptance tests.",
    )
    parser.add_argument(
        "--foreground", action="store_true",
        help="Keep supervising web-ext until it exits. Default launches and returns.",
    )
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

    _prepare_firefox_for_launch(Path.home(), args.port)

    args.pid_file.parent.mkdir(parents=True, exist_ok=True)
    args.profile_dir.mkdir(parents=True, exist_ok=True)

    # Build start URL from explicit port/password (authoritative via status).
    start_url_args = []
    if args.port is not None and args.password is not None:
        url = f"http://localhost:{args.port}#{args.port}:{args.password}"
        start_url_args = ["--start-url", url]

    # Disable Firefox auto-update. Without these, a staged update in
    # ~/Library/Caches/Mozilla/updates/.../0/ is applied on launch and the
    # updater can hang while replacing /Applications/Firefox.app, leaving
    # web-ext with ECONNREFUSED on the remote debugger port. Profile-level
    # user.js prefs alone are insufficient — staging.enabled must be off
    # to prevent re-staging on the next run.
    update_prefs = [
        "--pref=app.update.enabled=false",
        "--pref=app.update.auto=false",
        "--pref=app.update.service.enabled=false",
        "--pref=app.update.staging.enabled=false",
        "--pref=app.update.background.scheduling.enabled=false",
        "--pref=app.update.checkInstallTime=false",
    ]

    # Build web-ext command
    cmd = [
        "npx", "web-ext", "run",
        "--source-dir", env["extensionDir"],
        "--firefox-profile", str(args.profile_dir),
        "--keep-profile-changes",
        f"--firefox={env['firefox']}",
    ] + update_prefs + start_url_args
    if args.headless:
        cmd += ["--args=--headless"]

    # Launch. Default mode is a launch helper for IDE skills: return control
    # after web-ext starts so the skill can poll `status`. Foreground mode is
    # kept for development scripts that want the old supervising behaviour.
    proc = subprocess.Popen(cmd, **_popen_kwargs(args.foreground))
    _write_pid_file(args.pid_file, proc.pid, args.port)

    if args.foreground:
        return _wait_foreground(proc, args.pid_file)

    time.sleep(0.5)
    if proc.poll() is not None:
        args.pid_file.unlink(missing_ok=True)
        return proc.returncode if proc.returncode is not None else 1

    print(f"Launched (PID {proc.pid})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
