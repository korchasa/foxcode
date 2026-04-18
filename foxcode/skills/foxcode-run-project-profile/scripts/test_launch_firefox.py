"""Tests for launch_firefox.py."""
from __future__ import annotations

import json
import os
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

        # Port/password supplied by caller (skill) — authoritative from status
        self.port = 8800
        self.password = "secret"

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _run_launch(self, extra_env=None, background=False, extra_args=None, pass_credentials=True):
        env = os.environ.copy()
        env["HOME"] = self.tmpdir
        # Override PATH so npx resolves to a fake that exits fast
        fake_npx = os.path.join(self.tmpdir, "bin", "npx")
        os.makedirs(os.path.dirname(fake_npx), exist_ok=True)
        Path(fake_npx).write_text(textwrap.dedent("""\
            #!/usr/bin/env python3
            import json, sys, signal, time
            signal.signal(signal.SIGTERM, lambda *a: sys.exit(0))
            print(json.dumps({"args": sys.argv[1:]}), flush=True)
            if "--wait" in sys.argv:
                while True:
                    time.sleep(0.1)
        """))
        os.chmod(fake_npx, 0o755)
        env["PATH"] = os.path.dirname(fake_npx) + os.pathsep + env.get("PATH", "")

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


class TestLaunchResolves(LaunchTestBase):
    """launch_firefox.py resolves env and launches web-ext."""

    def test_launches_and_cleans_pid(self):
        """Launches web-ext (fake npx exits immediately), PID file cleaned up."""
        result = self._run_launch()
        self.assertEqual(result.returncode, 0, result.stderr)
        # PID file should be cleaned up after exit
        self.assertFalse(os.path.exists(self.pid_file))

    def test_pid_file_written(self):
        """PID file is created while process runs."""
        # Override fake npx to stay alive
        fake_npx = os.path.join(self.tmpdir, "bin", "npx")
        os.makedirs(os.path.dirname(fake_npx), exist_ok=True)
        Path(fake_npx).write_text(textwrap.dedent("""\
            #!/usr/bin/env python3
            import signal, sys, time
            signal.signal(signal.SIGTERM, lambda *a: sys.exit(0))
            print("RUNNING", flush=True)
            while True:
                time.sleep(0.1)
        """))
        os.chmod(fake_npx, 0o755)

        proc = self._run_launch(background=True)
        try:
            for _ in range(50):
                if os.path.exists(self.pid_file):
                    break
                time.sleep(0.1)
            self.assertTrue(os.path.exists(self.pid_file))
            pid = int(Path(self.pid_file).read_text().strip())
            self.assertGreater(pid, 0)
        finally:
            proc.terminate()
            proc.wait(timeout=5)

    def test_sigterm_cleans_pid(self):
        """SIGTERM cleans up PID file."""
        fake_npx = os.path.join(self.tmpdir, "bin", "npx")
        os.makedirs(os.path.dirname(fake_npx), exist_ok=True)
        Path(fake_npx).write_text(textwrap.dedent("""\
            #!/usr/bin/env python3
            import signal, sys, time
            signal.signal(signal.SIGTERM, lambda *a: sys.exit(0))
            while True:
                time.sleep(0.1)
        """))
        os.chmod(fake_npx, 0o755)

        proc = self._run_launch(background=True)
        for _ in range(50):
            if os.path.exists(self.pid_file):
                break
            time.sleep(0.1)
        self.assertTrue(os.path.exists(self.pid_file))
        proc.terminate()
        proc.wait(timeout=5)
        self.assertFalse(os.path.exists(self.pid_file))


class TestStaleDetection(LaunchTestBase):
    """Stale/live PID detection."""

    def test_stale_pid_overwritten(self):
        """Stale PID file is overwritten on new launch."""
        Path(self.pid_file).write_text("99999999\n")
        result = self._run_launch()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_live_pid_exits_ok(self):
        """Live PID in file -> exit 0 with 'already running' message."""
        blocker = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(60)"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        Path(self.pid_file).write_text(str(blocker.pid) + "\n")
        try:
            result = self._run_launch()
            self.assertEqual(result.returncode, 0)
            self.assertIn("already running", result.stdout.lower())
        finally:
            blocker.terminate()
            blocker.wait()


class TestWebExtArgs(LaunchTestBase):
    """web-ext receives correct arguments from resolved env."""

    def test_passes_extension_and_firefox(self):
        """npx receives web-ext run with resolved paths."""
        result = self._run_launch()
        # fake npx prints its args as JSON
        for line in result.stdout.splitlines():
            try:
                data = json.loads(line)
                args = data["args"]
                self.assertIn("web-ext", args)
                self.assertIn("run", args)
                self.assertIn("--keep-profile-changes", args)
                # Check --source-dir points to our ext dir
                idx = args.index("--source-dir")
                self.assertEqual(args[idx + 1], self.ext_dir)
                return
            except (json.JSONDecodeError, ValueError, KeyError):
                continue
        self.fail(f"No JSON args in stdout: {result.stdout}")

    def test_start_url_includes_port_and_password(self):
        """--start-url contains port and password passed explicitly by caller."""
        result = self._run_launch()
        for line in result.stdout.splitlines():
            try:
                data = json.loads(line)
                args = data["args"]
                idx = args.index("--start-url")
                url = args[idx + 1]
                self.assertIn(str(self.port), url)
                self.assertIn(self.password, url)
                self.assertEqual(
                    url,
                    f"http://localhost:{self.port}#{self.port}:{self.password}",
                )
                return
            except (json.JSONDecodeError, ValueError, KeyError):
                continue
        self.fail(f"No start-url in stdout: {result.stdout}")

    def test_no_start_url_when_credentials_omitted(self):
        """Without --port/--password, web-ext starts without --start-url (dev mode)."""
        result = self._run_launch(pass_credentials=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        for line in result.stdout.splitlines():
            try:
                data = json.loads(line)
                args = data["args"]
                self.assertNotIn("--start-url", args)
                return
            except (json.JSONDecodeError, ValueError, KeyError):
                continue
        self.fail(f"No JSON args in stdout: {result.stdout}")

    def test_port_without_password_rejected(self):
        """--port without --password is a caller error (invariant: both or neither)."""
        result = self._run_launch(pass_credentials=False, extra_args=["--port", "8800"])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--port", result.stderr)
        self.assertIn("--password", result.stderr)


if __name__ == "__main__":
    unittest.main()
