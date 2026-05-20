"""Tests for launch_firefox.py."""
from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path

SCRIPT = str(Path(__file__).parent / "launch_firefox.py")


class LaunchTestBase(unittest.TestCase):
    """Base class setting up a fake skill tree with fake Firefox and extension."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

        # Fake skill tree so resolve_env works via __file__
        self.skill_dir = os.path.join(self.tmpdir, "skills", "foxcode-run-project-profile")
        self.scripts_dir = os.path.join(self.skill_dir, "scripts")
        os.makedirs(self.scripts_dir)

        # Symlink both scripts so imports work
        for name in ("launch_firefox.py", "resolve_env.py"):
            src = str(Path(__file__).parent / name)
            os.symlink(os.path.abspath(src), os.path.join(self.scripts_dir, name))

        self.launch_script = os.path.join(self.scripts_dir, "launch_firefox.py")

        # Fake extension
        self.ext_dir = os.path.join(self.tmpdir, "extension")
        os.makedirs(self.ext_dir)
        Path(os.path.join(self.ext_dir, "manifest.json")).write_text("{}")

        # Fake Firefox (just prints args and sleeps)
        self.fake_ff = os.path.join(self.tmpdir, "firefox")
        Path(self.fake_ff).write_text("#!/bin/sh\necho fake")
        os.chmod(self.fake_ff, 0o755)

        # Dirs for PID and profile
        self.pid_file = os.path.join(self.tmpdir, "web-ext.pid")
        self.profile_dir = os.path.join(self.tmpdir, "ff-profile")
        self.npx_args_file = os.path.join(self.tmpdir, "npx-args.json")

        # Port/password supplied by caller (skill) — authoritative from status
        self.port = 8800
        self.password = "secret"

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _run_launch(self, extra_env=None, background=False, extra_args=None, pass_credentials=True, npx_keepalive=False):
        env = os.environ.copy()
        env["HOME"] = self.tmpdir
        # Override PATH so npx resolves to a fake. Default = exit fast; tests
        # that need to observe a live PID set npx_keepalive=True so the fake
        # blocks until SIGTERM (matches real web-ext lifecycle).
        fake_npx = os.path.join(self.tmpdir, "bin", "npx")
        os.makedirs(os.path.dirname(fake_npx), exist_ok=True)
        if npx_keepalive:
            Path(fake_npx).write_text(textwrap.dedent("""\
                #!/usr/bin/env python3
                import json, os, sys, signal, time
                signal.signal(signal.SIGTERM, lambda *a: sys.exit(0))
                if os.environ.get("NPX_ARGS_FILE"):
                    open(os.environ["NPX_ARGS_FILE"], "w").write(json.dumps({"args": sys.argv[1:]}))
                else:
                    print(json.dumps({"args": sys.argv[1:]}), flush=True)
                while True:
                    time.sleep(0.1)
            """))
        else:
            Path(fake_npx).write_text(textwrap.dedent("""\
                #!/usr/bin/env python3
                import json, os, sys, signal, time
                signal.signal(signal.SIGTERM, lambda *a: sys.exit(0))
                if os.environ.get("NPX_ARGS_FILE"):
                    open(os.environ["NPX_ARGS_FILE"], "w").write(json.dumps({"args": sys.argv[1:]}))
                else:
                    print(json.dumps({"args": sys.argv[1:]}), flush=True)
                if "--wait" in sys.argv:
                    while True:
                        time.sleep(0.1)
            """))
        os.chmod(fake_npx, 0o755)
        env["PATH"] = os.path.dirname(fake_npx) + os.pathsep + env.get("PATH", "")
        env["NPX_ARGS_FILE"] = self.npx_args_file

        if extra_env:
            env.update(extra_env)

        cmd = [
            sys.executable, self.launch_script,
            "--pid-file", self.pid_file,
            "--profile-dir", self.profile_dir,
            "--firefox-search-paths", self.fake_ff,
            "--no-default-firefox-paths",
            "--extension-search-paths", self.ext_dir,
            "--no-default-extension-paths",
        ]
        if pass_credentials:
            cmd += ["--port", str(self.port), "--password", self.password]
        if extra_args:
            cmd += extra_args
        # cwd=tmpdir so resolve_env's .foxcode/config.json lookup is isolated from
        # whatever project the tests happen to run in.
        if background:
            return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, cwd=self.tmpdir)
        return subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=15, cwd=self.tmpdir)

    def _read_pid(self) -> int:
        return int(Path(self.pid_file).read_text().strip().splitlines()[0])

    def _kill_pid_file_process(self) -> None:
        if not os.path.exists(self.pid_file):
            return
        pid = self._read_pid()
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

    def _read_npx_args(self):
        deadline = time.time() + 2.0
        while time.time() < deadline:
            if os.path.exists(self.npx_args_file):
                return json.loads(Path(self.npx_args_file).read_text())["args"]
            time.sleep(0.05)
        self.fail(f"No npx args file at {self.npx_args_file}")


class TestLaunchResolves(LaunchTestBase):
    """launch_firefox.py resolves env and launches web-ext."""

    def test_launches_and_cleans_pid(self):
        """Launches web-ext (fake npx exits immediately), PID file cleaned up."""
        result = self._run_launch()
        self.assertEqual(result.returncode, 0, result.stderr)
        # PID file should be cleaned up after exit
        self.assertFalse(os.path.exists(self.pid_file))

    def test_pid_file_written(self):
        """Default mode returns after launch and leaves web-ext tracked by PID."""
        result = self._run_launch(npx_keepalive=True)
        try:
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(os.path.exists(self.pid_file))
            pid = self._read_pid()
            self.assertGreater(pid, 0)
            os.kill(pid, 0)
        finally:
            self._kill_pid_file_process()

    def test_foreground_sigterm_cleans_pid(self):
        """Foreground mode keeps the old supervising behaviour."""
        proc = self._run_launch(background=True, npx_keepalive=True, extra_args=["--foreground"])
        for _ in range(50):
            if os.path.exists(self.pid_file):
                break
            time.sleep(0.1)
        self.assertTrue(os.path.exists(self.pid_file))
        proc.terminate()
        proc.wait(timeout=5)
        proc.stdout.close()
        proc.stderr.close()
        self.assertFalse(os.path.exists(self.pid_file))


class TestStaleDetection(LaunchTestBase):
    """Stale/live PID detection.

    Use Popen.poll() (not os.kill(pid, 0)) to check subprocess liveness.
    os.kill(pid, 0) returns success for zombie processes (dead but not reaped)
    on macOS/Linux. poll() calls waitpid() which reaps the zombie correctly.
    """

    def test_stale_pid_overwritten(self):
        """Stale PID file is overwritten on new launch."""
        Path(self.pid_file).write_text("99999999\n")
        result = self._run_launch()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_live_pid_exits_ok(self):
        """Live PID with matching port -> exit 0 with 'already running' message."""
        blocker = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(60)"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        # Write PID file with matching port so check passes
        Path(self.pid_file).write_text(f"{blocker.pid}\n{self.port}\n")
        try:
            result = self._run_launch()
            self.assertEqual(result.returncode, 0)
            self.assertIn("already running", result.stdout.lower())
        finally:
            blocker.terminate()
            blocker.wait()

    def test_live_pid_port_mismatch_relaunches(self):
        """Live PID with different port -> kill old process and launch new Firefox."""
        blocker = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(60)"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        old_pid = blocker.pid
        stale_port = self.port + 99
        Path(self.pid_file).write_text(f"{old_pid}\n{stale_port}\n")
        try:
            result = self._run_launch()
            self.assertEqual(result.returncode, 0, result.stderr)
            # Use poll() to reap the zombie and detect actual termination
            deadline = time.time() + 2.0
            while time.time() < deadline and blocker.poll() is None:
                time.sleep(0.05)
            exited = blocker.poll() is not None
            self.assertTrue(
                exited,
                f"Old Firefox process should have been killed. "
                f"stdout={result.stdout!r} stderr={result.stderr!r}",
            )
            # Should NOT print "already running"
            self.assertNotIn("already running", result.stdout.lower())
        finally:
            if blocker.poll() is None:
                blocker.terminate()
            blocker.wait()


class TestWebExtArgs(LaunchTestBase):
    """web-ext receives correct arguments from resolved env."""

    def test_passes_extension_and_firefox(self):
        """npx receives web-ext run with resolved paths."""
        result = self._run_launch()
        self.assertEqual(result.returncode, 0, result.stderr)
        # fake npx prints its args as JSON
        args = self._read_npx_args()
        self.assertIn("web-ext", args)
        self.assertIn("run", args)
        self.assertIn("--keep-profile-changes", args)
        # Check --source-dir points to our ext dir
        idx = args.index("--source-dir")
        self.assertEqual(args[idx + 1], self.ext_dir)

    def test_start_url_includes_port_and_password(self):
        """--start-url contains port and password passed explicitly by caller."""
        result = self._run_launch()
        self.assertEqual(result.returncode, 0, result.stderr)
        args = self._read_npx_args()
        idx = args.index("--start-url")
        url = args[idx + 1]
        self.assertIn(str(self.port), url)
        self.assertIn(self.password, url)
        self.assertEqual(
            url,
            f"http://localhost:{self.port}#{self.port}:{self.password}",
        )

    def test_disables_firefox_auto_update(self):
        """web-ext receives --pref flags that suppress auto-update and staging.

        Without these, a staged update under ~/Library/Caches/Mozilla/updates
        is applied on launch and the updater can hang while replacing the
        Firefox.app bundle, causing ECONNREFUSED on the remote debugger port.
        """
        required_prefs = {
            "app.update.enabled=false",
            "app.update.auto=false",
            "app.update.service.enabled=false",
            "app.update.staging.enabled=false",
            "app.update.background.scheduling.enabled=false",
            "app.update.checkInstallTime=false",
        }
        result = self._run_launch()
        self.assertEqual(result.returncode, 0, result.stderr)
        args = self._read_npx_args()
        got = {
            a[len("--pref="):]
            for a in args
            if a.startswith("--pref=")
        }
        missing = required_prefs - got
        self.assertFalse(missing, f"Missing --pref flags: {missing}")

    def test_no_start_url_when_credentials_omitted(self):
        """Without --port/--password, web-ext starts without --start-url (dev mode)."""
        result = self._run_launch(pass_credentials=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        args = self._read_npx_args()
        self.assertNotIn("--start-url", args)

    def test_port_without_password_rejected(self):
        """--port without --password is a caller error (invariant: both or neither)."""
        result = self._run_launch(pass_credentials=False, extra_args=["--port", "8800"])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--port", result.stderr)
        self.assertIn("--password", result.stderr)


class TestFirefoxUpdatePreflight(LaunchTestBase):
    """Firefox updater preflight diagnostics."""

    def _write_applied_update(self):
        update_dir = Path(self.tmpdir) / "Library" / "Caches" / "Mozilla" / "updates" / "abc" / "0"
        update_dir.mkdir(parents=True)
        (update_dir / "update.status").write_text("applied\n")
        return update_dir

    def _write_updated_app(self):
        update_dir = Path(self.tmpdir) / "Library" / "Caches" / "Mozilla" / "updates" / "abc" / "0"
        updated_app = update_dir / "Updated.app"
        updated_app.mkdir(parents=True)
        return updated_app

    def test_blocks_launch_when_applied_update_is_staged(self):
        """A staged applied update is reported before web-ext launch."""
        update_dir = self._write_applied_update()

        result = self._run_launch()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Firefox update is pending", result.stderr)
        self.assertIn("update.status=applied", result.stderr)
        self.assertIn(str(update_dir / "update.status"), result.stderr)
        self.assertFalse(os.path.exists(self.npx_args_file))

    def test_blocks_launch_when_updated_app_is_staged(self):
        """A staged Updated.app is reported before web-ext launch."""
        updated_app = self._write_updated_app()

        result = self._run_launch()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Firefox update is pending", result.stderr)
        self.assertIn("Updated.app", result.stderr)
        self.assertIn(str(updated_app), result.stderr)
        self.assertFalse(os.path.exists(self.npx_args_file))

    def test_blocks_launch_when_foxcode_updater_process_is_running(self):
        """A live org.mozilla.updater for the FoxCode URL is reported."""
        fake_ps = Path(self.tmpdir) / "bin" / "ps"
        fake_ps.parent.mkdir(parents=True, exist_ok=True)
        fake_ps.write_text(textwrap.dedent(f"""\
            #!/bin/sh
            cat <<'EOF'
            123 org.mozilla.updater http://localhost:{self.port}#{self.port}:secret
            EOF
        """))
        fake_ps.chmod(0o755)

        result = self._run_launch()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Firefox update is pending", result.stderr)
        self.assertIn("org.mozilla.updater", result.stderr)
        self.assertIn(f"http://localhost:{self.port}", result.stderr)
        self.assertNotIn(self.password, result.stderr)
        self.assertFalse(os.path.exists(self.npx_args_file))

    def test_ignores_updater_process_when_credentials_are_omitted(self):
        """Dev mode has no authoritative port, so updater process checks are skipped."""
        fake_ps = Path(self.tmpdir) / "bin" / "ps"
        fake_ps.parent.mkdir(parents=True, exist_ok=True)
        fake_ps.write_text(textwrap.dedent("""\
            #!/bin/sh
            cat <<'EOF'
            123 org.mozilla.updater http://localhost:8795#8795:secret
            EOF
        """))
        fake_ps.chmod(0o755)

        result = self._run_launch(pass_credentials=False)

        self.assertEqual(result.returncode, 0, result.stderr)
        args = self._read_npx_args()
        self.assertNotIn("--start-url", args)


if __name__ == "__main__":
    unittest.main()
