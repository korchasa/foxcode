import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'

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
