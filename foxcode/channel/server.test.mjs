import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER = join(__dirname, 'server.mjs')
const OWN_VERSION = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf8'),
).version

function runServer(args) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, [SERVER, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FOXCODE_PORT: '0' },
    })
    let out = ''
    let err = ''
    proc.stdout.on('data', (b) => { out += b })
    proc.stderr.on('data', (b) => { err += b })
    const killTimer = setTimeout(() => proc.kill('SIGKILL'), 15000)
    proc.on('exit', (code, signal) => {
      clearTimeout(killTimer)
      resolve({ code, signal, stdout: out, stderr: err })
    })
  })
}

describe('CLI flags', () => {
  it('--version prints version from own package.json and exits 0', async () => {
    const r = await runServer(['--version'])
    assert.equal(r.code, 0, `expected exit 0, got code=${r.code} signal=${r.signal}\nstderr: ${r.stderr}`)
    assert.match(r.stdout.trim(), new RegExp(`^${OWN_VERSION.replace(/\./g, '\\.')}$`))
  })

  it('-v is an alias for --version', async () => {
    const r = await runServer(['-v'])
    assert.equal(r.code, 0)
    assert.match(r.stdout.trim(), new RegExp(`^${OWN_VERSION.replace(/\./g, '\\.')}$`))
  })

  it('--help prints usage and exits 0 without opening a port', async () => {
    const r = await runServer(['--help'])
    assert.equal(r.code, 0)
    assert.match(r.stdout, /Usage:/)
    assert.match(r.stdout, /--version/)
    assert.match(r.stdout, /--help/)
  })

  it('-h is an alias for --help', async () => {
    const r = await runServer(['-h'])
    assert.equal(r.code, 0)
    assert.match(r.stdout, /Usage:/)
  })
})

/**
 * Helper: create an HTTP server with upgrade-level token auth (same pattern as server.mjs).
 * Returns { httpServer, wss, port, password, close() }.
 */
async function createAuthServer(password) {
  const httpServer = createServer()
  const wss = new WebSocketServer({ noServer: true })

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost')
    const token = url.searchParams.get('token')
    if (token !== password) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  const port = await new Promise((resolve, reject) => {
    httpServer.on('error', reject)
    httpServer.listen(0, '127.0.0.1', () => {
      resolve(httpServer.address().port)
    })
  })

  return {
    httpServer,
    wss,
    port,
    password,
    close() {
      return new Promise((resolve) => {
        for (const client of wss.clients) client.terminate()
        wss.close()
        httpServer.close(resolve)
      })
    },
  }
}

describe('graceful shutdown', () => {
  it('exits when stdin closes (parent agent EOF)', async () => {
    const proc = spawn(process.execPath, [SERVER], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FOXCODE_PORT: '0' },
    })
    try {
      // Wait for the server to print its WebSocket banner so we know the
      // start-up path completed before we tear it down.
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout waiting for ws banner')), 5000)
        const onData = (b) => {
          if (/foxcode: ws:\/\/|foxcode: no free port/.test(String(b))) {
            clearTimeout(t)
            proc.stderr.off('data', onData)
            resolve()
          }
        }
        proc.stderr.on('data', onData)
      })
      proc.stdin.end()
      const exitInfo = await new Promise((resolve) => {
        const killTimer = setTimeout(() => {
          proc.kill('SIGKILL')
          resolve({ code: null, signal: 'SIGKILL', timedOut: true })
        }, 5000)
        proc.on('exit', (code, signal) => {
          clearTimeout(killTimer)
          resolve({ code, signal, timedOut: false })
        })
      })
      assert.equal(exitInfo.timedOut, false, 'server should exit within 5s of stdin close')
      assert.equal(exitInfo.code, 0, `expected clean exit 0, got code=${exitInfo.code} signal=${exitInfo.signal}`)
    } finally {
      if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
    }
  })
})

describe('upgrade-level auth', () => {
  let server

  afterEach(async () => {
    if (server) await server.close()
    server = null
  })

  it('connects with valid token', async () => {
    server = await createAuthServer('secret123')
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}?token=secret123`)
    await new Promise((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })
    assert.equal(ws.readyState, WebSocket.OPEN)
    ws.close()
  })

  it('rejects connection without token', async () => {
    server = await createAuthServer('secret123')
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`)
    const error = await new Promise((resolve) => {
      ws.on('open', () => resolve(null))
      ws.on('error', resolve)
      ws.on('unexpected-response', (_req, res) => resolve(res))
    })
    assert.ok(error, 'should not connect')
    if (error.statusCode) {
      assert.equal(error.statusCode, 401)
    }
  })

  it('rejects connection with wrong token', async () => {
    server = await createAuthServer('secret123')
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}?token=wrong`)
    const error = await new Promise((resolve) => {
      ws.on('open', () => resolve(null))
      ws.on('error', resolve)
      ws.on('unexpected-response', (_req, res) => resolve(res))
    })
    assert.ok(error, 'should not connect')
    if (error.statusCode) {
      assert.equal(error.statusCode, 401)
    }
  })
})
