/**
 * Acceptance: channel survives a strict MCP host.
 *
 * The existing acceptance suite (mcp.test.mjs / bridge.test.mjs) parses
 * server stdout leniently — non-JSON lines are silently skipped. That
 * mirrors Claude Code / OpenCode behaviour but masks the failure mode
 * exposed by `codex exec --experimental-json`, which closes the
 * transport on the first non-JSON frame.
 *
 * This suite models the strict host: ANY non-JSON line on the server's
 * stdout is a fatal protocol violation. The launchBrowser path is
 * exercised end-to-end with a fake `npx` on PATH that writes plain
 * text to stdout (simulating `web-ext run`'s "Running web extension
 * from …" banner). If a future regression lets that text leak into
 * the channel's stdout, this test fails immediately.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'

import { withTmp, findFreePort } from '../../lib/test-helpers.mjs'

const CHANNEL_SERVER = new URL('../../../foxcode/channel/server.mjs', import.meta.url).pathname

class StrictStdioMcpClient {
  constructor(child) {
    this.child = child
    this.buffer = ''
    this.pending = new Map()
    this.nextId = 1
    this.stderr = ''
    this.protocolViolations = []
    child.stderr.on('data', (b) => { this.stderr += b.toString('utf8') })
    child.stdout.on('data', (b) => this._onData(b))
  }

  _onData(buf) {
    this.buffer += buf.toString('utf8')
    let nl
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl)
      this.buffer = this.buffer.slice(nl + 1)
      if (line.length === 0) continue
      let msg
      try {
        msg = JSON.parse(line)
      } catch {
        // Strict host: a non-JSON line is a fatal protocol violation,
        // not something to skip. Record verbatim for diagnostics.
        this.protocolViolations.push(line)
        continue
      }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(`MCP error: ${JSON.stringify(msg.error)}`))
        else resolve(msg.result)
      }
    }
  }

  request(method, params, timeoutMs = 10_000) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          reject(new Error(
            `MCP request '${method}' timed out\n` +
            `stderr:\n${this.stderr}\n` +
            `protocolViolations:\n${this.protocolViolations.join('\n')}`,
          ))
        }
      }, timeoutMs)
    })
  }

  notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n')
  }

  async close() {
    try { this.child.stdin.end() } catch { /* already closed */ }
    await new Promise((resolve) => {
      this.child.once('close', resolve)
      setTimeout(() => { try { this.child.kill('SIGTERM') } catch { /* gone */ } resolve() }, 2_000)
    })
  }
}

/**
 * Create a temp PATH dir with:
 *  - fake `npx` that prints `web-ext`-style banner to stdout, then exits 1
 *    (matches the empirically-observed shape of the real subprocess and
 *     ensures the handler does not block waiting for an extension connect).
 *  - fake `firefox` so `findFirefox()` via PATH walk returns non-null
 *    (otherwise the handler short-circuits before spawning anything).
 */
function makeFakeBinDir(tmp) {
  const bin = join(tmp, 'bin')
  mkdirSync(bin, { recursive: true })
  const npxScript = [
    '#!/bin/sh',
    '# Fake npx: writes a non-JSON banner to stdout, matching web-ext run.',
    'printf "Running web extension from /fake\\n"',
    'printf "More plain text on stdout that would corrupt JSON-RPC framing\\n"',
    'exit 1',
    '',
  ].join('\n')
  writeFileSync(join(bin, 'npx'), npxScript)
  chmodSync(join(bin, 'npx'), 0o755)
  // findFirefox does PATH walk for `firefox` — file just needs to be executable.
  writeFileSync(join(bin, 'firefox'), '#!/bin/sh\nexit 0\n')
  chmodSync(join(bin, 'firefox'), 0o755)
  return bin
}

async function spawnStrictChannel(tmp, port) {
  const home = join(tmp, 'home')
  mkdirSync(home, { recursive: true })
  mkdirSync(join(home, '.foxcode'), { recursive: true, mode: 0o700 })
  writeFileSync(join(home, '.foxcode', 'password'), 'test-password-1234')
  chmodSync(join(home, '.foxcode', 'password'), 0o600)
  const bin = makeFakeBinDir(tmp)
  const projectDir = join(tmp, 'project')
  mkdirSync(projectDir, { recursive: true })
  const env = {
    ...process.env,
    HOME: home,
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    FOXCODE_PORT: String(port),
    FOXCODE_PROJECT_DIR: projectDir,
  }
  const child = spawn(process.execPath, [CHANNEL_SERVER], {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return new StrictStdioMcpClient(child)
}

test('strict MCP host: launchBrowser does not corrupt JSON-RPC framing', async (t) => {
  if (process.platform === 'win32') {
    t.skip('shell-script PATH stubs are POSIX-only; Tier-4 covers win32')
    return
  }
  await withTmp(async (tmp) => {
    const client = await spawnStrictChannel(tmp, await findFreePort())
    try {
      await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'strict-acceptance', version: '0.0.0' },
      })
      client.notify('notifications/initialized')

      // Fast timeout: fake npx exits immediately, no extension will ever
      // connect, so the handler returns `{status: "timeout"}` quickly.
      // The exact result is irrelevant — what matters is whether the
      // child's stdout leaked into the server's stdout.
      const launchResult = await client.request('tools/call', {
        name: 'launchBrowser',
        arguments: { timeout: 500 },
      })

      assert.ok(Array.isArray(launchResult.content), 'launchBrowser must return content array')
      const launchText = launchResult.content.find((c) => c.type === 'text')?.text
      assert.ok(launchText, 'launchBrowser must include text content')
      const launchPayload = JSON.parse(launchText)
      assert.ok(
        ['timeout', 'connected', 'error'].includes(launchPayload.status),
        `unexpected launchBrowser status: ${launchPayload.status}`,
      )

      // Critical invariant: zero non-JSON lines reached the strict host.
      // A regression to inherit-stdout (or any direct console.log from
      // server code) breaks this.
      assert.deepEqual(
        client.protocolViolations,
        [],
        'server stdout must contain only JSON-RPC frames; ' +
        'protocol violations indicate child stdout (or unguarded ' +
        'console output) leaked onto fd 1',
      )

      // Transport must survive the launchBrowser call. Under the
      // pre-fix bug, codex's strict parser closes its end on the
      // first non-JSON frame; the channel's stdin.on("end") shutdown
      // hook then exits the process and this follow-up call times out.
      const statusResult = await client.request('tools/call', {
        name: 'status',
        arguments: {},
      })
      const statusText = statusResult.content.find((c) => c.type === 'text')?.text
      const status = JSON.parse(statusText)
      assert.ok(status.uptime > 0, 'channel must still be alive after launchBrowser')
      assert.equal(status.connectedClients, 0, 'fake npx never connects an extension')

      // Diagnostic preservation: the banner the fake npx printed to
      // its own stdout must end up on the channel's stderr, so a
      // human debugging the session still sees it.
      assert.match(
        client.stderr,
        /Running web extension from \/fake/,
        'child stdout must be forwarded to channel stderr for diagnostics',
      )
    } finally {
      await client.close()
    }
  })
})

test('strict MCP host: server never writes non-JSON to stdout during a normal session', async (t) => {
  if (process.platform === 'win32') {
    t.skip('POSIX-only')
    return
  }
  await withTmp(async (tmp) => {
    const client = await spawnStrictChannel(tmp, await findFreePort())
    try {
      await client.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'strict-acceptance', version: '0.0.0' },
      })
      client.notify('notifications/initialized')
      await client.request('tools/list', {})
      await client.request('tools/call', { name: 'status', arguments: {} })
      assert.deepEqual(
        client.protocolViolations,
        [],
        'baseline session must not emit non-JSON on stdout',
      )
    } finally {
      await client.close()
    }
  })
})
