import { assertEquals } from "jsr:@std/assert";
import { detectRunner, isGitCommit } from "./run.ts";

// --- isGitCommit ---

Deno.test("isGitCommit: 'git commit -m test' returns true", () => {
  assertEquals(isGitCommit("git commit -m test"), true);
});

Deno.test("isGitCommit: 'git push' returns false", () => {
  assertEquals(isGitCommit("git push"), false);
});

Deno.test("isGitCommit: 'git   commit' (extra spaces) returns true", () => {
  assertEquals(isGitCommit("git   commit"), true);
});

Deno.test("isGitCommit: 'echo git commit' returns false", () => {
  assertEquals(isGitCommit("echo git commit"), false);
});

Deno.test("isGitCommit: '&& git commit' returns true", () => {
  assertEquals(isGitCommit("foo && git commit -m bar"), true);
});

Deno.test("isGitCommit: '; git commit' returns true", () => {
  assertEquals(isGitCommit("echo hi; git commit"), true);
});

Deno.test("isGitCommit: '| git commit' returns true", () => {
  assertEquals(isGitCommit("echo | git commit"), true);
});

Deno.test("isGitCommit: empty string returns false", () => {
  assertEquals(isGitCommit(""), false);
});

Deno.test("isGitCommit: 'git commit --amend' returns true", () => {
  assertEquals(isGitCommit("git commit --amend"), true);
});

// --- detectRunner ---

Deno.test("detectRunner: dir with deno.json returns deno task check", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      `${tmpDir}/deno.json`,
      '{"tasks":{"check":"deno fmt"}}',
    );
    const result = await detectRunner(tmpDir);
    assertEquals(result, {
      cmd: ["deno", "task", "check"],
      marker: "deno.json",
    });
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detectRunner: dir with package.json returns npm test", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(
      `${tmpDir}/package.json`,
      '{"scripts":{"test":"jest"}}',
    );
    const result = await detectRunner(tmpDir);
    assertEquals(result, { cmd: ["npm", "test"], marker: "package.json" });
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detectRunner: dir with Makefile returns make test", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    await Deno.writeTextFile(`${tmpDir}/Makefile`, "test:\n\techo ok\n");
    const result = await detectRunner(tmpDir);
    assertEquals(result, { cmd: ["make", "test"], marker: "Makefile" });
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("detectRunner: empty dir returns null", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const result = await detectRunner(tmpDir);
    assertEquals(result, null);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

// --- Integration ---

Deno.test("integration: non-commit command exits 0", async () => {
  const input = JSON.stringify({
    tool_name: "Bash",
    tool_input: { command: "echo hello" },
  });
  const cmd = new Deno.Command("deno", {
    args: [
      "run",
      "-A",
      "--no-config",
      new URL("./run.ts", import.meta.url).pathname,
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = cmd.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(input));
  await writer.close();
  const { code } = await child.output();
  assertEquals(code, 0);
});
