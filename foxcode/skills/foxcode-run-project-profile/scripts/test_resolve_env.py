"""Tests for resolve_env.py."""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = str(Path(__file__).parent / "resolve_env.py")


class TestResolveEnv(unittest.TestCase):
    """resolve_env.py discovers environment and outputs shell or JSON."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        # Build fake skill tree:
        # tmpdir/skills/foxcode-run-project-profile/scripts/resolve_env.py (symlink)
        # tmpdir/extension/manifest.json
        self.skill_dir = os.path.join(
            self.tmpdir, "skills", "foxcode-run-project-profile",
        )
        self.scripts_dir = os.path.join(self.skill_dir, "scripts")
        os.makedirs(self.scripts_dir)

        # Symlink resolve_env.py so __file__ resolves inside our tree
        self.script_link = os.path.join(self.scripts_dir, "resolve_env.py")
        os.symlink(os.path.abspath(SCRIPT), self.script_link)

        # Fake extension dir
        self.ext_dir = os.path.join(self.tmpdir, "extension")
        os.makedirs(self.ext_dir)
        Path(os.path.join(self.ext_dir, "manifest.json")).write_text("{}")

        # Fake Firefox binary
        self.fake_ff = os.path.join(self.tmpdir, "firefox")
        Path(self.fake_ff).write_text("#!/bin/sh\necho fake")
        os.chmod(self.fake_ff, 0o755)

        # Fake foxcode home dir with port and password
        self.foxcode_home = os.path.join(self.tmpdir, ".foxcode")
        os.makedirs(self.foxcode_home)
        Path(os.path.join(self.foxcode_home, "port")).write_text("8800")
        Path(os.path.join(self.foxcode_home, "password")).write_text("abc123")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _run(self, fmt="shell", extra_args=None, env_override=None):
        env = os.environ.copy()
        # Override HOME so script finds our fake .foxcode/
        env["HOME"] = self.tmpdir
        # Pass fake firefox path
        if env_override:
            env.update(env_override)
        cmd = [
            sys.executable, self.script_link,
            "--format", fmt,
            "--firefox-search-paths", self.fake_ff,
            "--no-default-firefox-paths",
            "--extension-search-paths", self.ext_dir,
        ] + (extra_args or [])
        return subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=10)

    def test_shell_format_exports_all_vars(self):
        """--format=shell outputs all required variables."""
        result = self._run(fmt="shell")
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = result.stdout.strip().splitlines()
        exports = {l.split("=", 1)[0]: l.split("=", 1)[1] for l in lines if "=" in l}
        self.assertIn("SKILL_DIR", exports)
        self.assertIn("FIREFOX", exports)
        self.assertIn("EXT_DIR", exports)
        self.assertIn("PORT", exports)
        self.assertIn("PASSWORD", exports)
        self.assertEqual(exports["FIREFOX"], self.fake_ff)
        self.assertEqual(exports["PORT"], "8800")
        self.assertEqual(exports["PASSWORD"], "abc123")
        self.assertTrue(exports["SKILL_DIR"].endswith("foxcode-run-project-profile"))
        self.assertEqual(exports["EXT_DIR"], self.ext_dir)

    def test_json_format(self):
        """--format=json outputs valid JSON with all fields."""
        result = self._run(fmt="json")
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["firefox"], self.fake_ff)
        self.assertEqual(data["port"], "8800")
        self.assertEqual(data["password"], "abc123")
        self.assertIn("skillDir", data)
        self.assertIn("extensionDir", data)

    def test_missing_firefox_fails(self):
        """Exits non-zero when Firefox not found."""
        result = self._run(extra_args=[
            "--firefox-search-paths", "/nonexistent/ff",
            "--no-default-extension-paths",
        ])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("firefox", result.stderr.lower())

    def test_missing_extension_fails(self):
        """Exits non-zero when extension dir not found."""
        result = self._run(extra_args=[
            "--extension-search-paths", "/nonexistent/ext",
            "--no-default-extension-paths",
        ])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("extension", result.stderr.lower())

    def test_missing_port_outputs_empty(self):
        """Missing port file outputs empty PORT but still succeeds."""
        os.remove(os.path.join(self.foxcode_home, "port"))
        result = self._run(fmt="shell")
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = result.stdout.strip().splitlines()
        exports = {l.split("=", 1)[0]: l.split("=", 1)[1] for l in lines if "=" in l}
        self.assertEqual(exports["PORT"], "")

    def test_unreadable_port_file_fails(self):
        """Port file with no read permission -> exit 1 with error."""
        port_file = os.path.join(self.foxcode_home, "port")
        os.chmod(port_file, 0o000)
        result = self._run(fmt="shell")
        os.chmod(port_file, 0o644)  # restore for cleanup
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("permission", result.stderr.lower())

    def test_unreadable_password_file_fails(self):
        """Password file with no read permission -> exit 1 with error."""
        pw_file = os.path.join(self.foxcode_home, "password")
        os.chmod(pw_file, 0o000)
        result = self._run(fmt="shell")
        os.chmod(pw_file, 0o644)  # restore for cleanup
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("permission", result.stderr.lower())

    def test_missing_password_outputs_empty(self):
        """Missing password file outputs empty PASSWORD but still succeeds."""
        os.remove(os.path.join(self.foxcode_home, "password"))
        result = self._run(fmt="shell")
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = result.stdout.strip().splitlines()
        exports = {l.split("=", 1)[0]: l.split("=", 1)[1] for l in lines if "=" in l}
        self.assertEqual(exports["PASSWORD"], "")

    def test_skill_dir_from_file_location(self):
        """SKILL_DIR derived from script's own __file__ path."""
        result = self._run(fmt="json")
        data = json.loads(result.stdout)
        # Script is at .../skills/foxcode-run-project-profile/scripts/resolve_env.py
        # SKILL_DIR should be .../skills/foxcode-run-project-profile
        self.assertEqual(data["skillDir"], self.skill_dir)


class TestConfigCache(unittest.TestCase):
    """Greenfield saves config, brownfield reads it."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.skill_dir = os.path.join(self.tmpdir, "skills", "foxcode-run-project-profile")
        self.scripts_dir = os.path.join(self.skill_dir, "scripts")
        os.makedirs(self.scripts_dir)
        self.script_link = os.path.join(self.scripts_dir, "resolve_env.py")
        os.symlink(
            os.path.abspath(str(Path(__file__).parent / "resolve_env.py")),
            self.script_link,
        )
        self.ext_dir = os.path.join(self.tmpdir, "extension")
        os.makedirs(self.ext_dir)
        Path(os.path.join(self.ext_dir, "manifest.json")).write_text("{}")
        self.fake_ff = os.path.join(self.tmpdir, "firefox")
        Path(self.fake_ff).write_text("#!/bin/sh\necho fake")
        os.chmod(self.fake_ff, 0o755)
        self.foxcode_home = os.path.join(self.tmpdir, ".foxcode")
        os.makedirs(self.foxcode_home)
        Path(os.path.join(self.foxcode_home, "port")).write_text("8800")
        Path(os.path.join(self.foxcode_home, "password")).write_text("abc123")
        # config.json lives under CWD/.foxcode/ (cwd overridden to tmpdir)
        self.config_path = os.path.join(self.tmpdir, ".foxcode", "config.json")

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _run(self, extra_args=None):
        env = os.environ.copy()
        env["HOME"] = self.tmpdir
        cmd = [
            sys.executable, self.script_link,
            "--format", "json",
            "--firefox-search-paths", self.fake_ff,
            "--no-default-firefox-paths",
            "--extension-search-paths", self.ext_dir,
        ] + (extra_args or [])
        return subprocess.run(cmd, capture_output=True, text=True, env=env, cwd=self.tmpdir, timeout=10)

    def test_greenfield_creates_config(self):
        """First run creates .foxcode/config.json."""
        self.assertFalse(os.path.exists(self.config_path))
        result = self._run()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(os.path.exists(self.config_path))
        config = json.loads(Path(self.config_path).read_text())
        self.assertEqual(config["firefox"], self.fake_ff)
        self.assertIn("extensionDir", config)

    def test_brownfield_uses_cached_config(self):
        """Second run reads from cache, ignoring search paths."""
        # First run — creates config pointing to fake_ff
        self._run()
        self.assertTrue(os.path.exists(self.config_path))
        # Second run — pass bogus search paths; should still work from cache
        result = self._run(extra_args=[
            "--firefox-search-paths", "/nonexistent/ff",
        ])
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data["firefox"], self.fake_ff)

    def test_brownfield_stale_config_rediscovers(self):
        """If cached firefox path is invalid, re-discovers."""
        # Write stale config
        Path(self.config_path).write_text(json.dumps({
            "firefox": "/nonexistent/old-firefox",
            "extensionDir": self.ext_dir,
        }))
        result = self._run()
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        # Should have re-discovered the real fake_ff
        self.assertEqual(data["firefox"], self.fake_ff)


if __name__ == "__main__":
    unittest.main()
