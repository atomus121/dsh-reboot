/**
 * dsh-reboot — host half (Node / Cordis).
 *
 * Registers a same-origin POST route `/reboot` that silently closes and
 * restarts the running `dsh web` process, then returns so the client can
 * reload the page. The restart is performed by a short-lived, window-hidden
 * PowerShell process that is a DIRECT CHILD of this dsh process: it kills
 * ONLY the dsh PID listening on port 3080 (`taskkill /F` without `/T`), so
 * Windows lets the launcher outlive its own parent, then waits for the port
 * to free and relaunches `node <dsh bin.js> web` hidden from the same cwd.
 *
 * Cordis access discipline: services are declared in `inject` and bare-accessed
 * (the same proven path as dsh-session-manager / aionui-panel).
 */
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from 'cordis'

export const name = 'dsh-reboot'

/** Services injected from the web profile; bare access is legal once declared. */
export const inject = ['webServer', 'subprocess'] as const

/** Minimal structural faces for the injected services (see dsh-plugins convention). */
interface SubprocessSpawnSpec {
  argv: readonly string[]
  cwd: string
  stdio: {
    stdin: 'ignore' | { data: string }
    stdout: 'ignore' | 'inherit' | object
    stderr: 'ignore' | 'inherit' | object
  }
  graceMs: number
  env?: Record<string, string | undefined>
}

interface SubprocessFace {
  spawn(spec: SubprocessSpawnSpec): unknown
}

interface WebServerFace {
  register(route: {
    kind: 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

interface InjectedCtx extends Context {
  webServer: WebServerFace
  subprocess: SubprocessFace
}

const PORT = '3080'
const PS = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'

/**
 * The launcher script, fed to a short-lived, hidden `powershell -Command -`.
 * It is a DIRECT CHILD of this dsh process, so the kill below targets ONLY
 * the dsh PID — `taskkill /F` WITHOUT `/T` — letting the launcher outlive
 * its own parent (Windows does not reap children of a killed parent, and the
 * DSH subprocess seam uses no job objects). It then waits for the port to
 * free and relaunches `node <dsh bin.js> web` hidden from the same cwd.
 */
function launcherScript(nodePath: string, binPath: string, cwd: string): string {
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    'Start-Sleep -Seconds 2',
    '$c = Get-NetTCPConnection -LocalPort ' + PORT + ' -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1',
    'if ($c) { taskkill /PID $c.OwningProcess /F }',
    '$tries = 0',
    'do {',
    '  Start-Sleep -Seconds 1',
    '  $tries++',
    '  $still = Get-NetTCPConnection -LocalPort ' + PORT + ' -State Listen -ErrorAction SilentlyContinue',
    '} while ($still -and $tries -lt 15)',
    "Start-Process -FilePath '" + nodePath + "' -ArgumentList '" + binPath + "','web' -WorkingDirectory '" + cwd + "' -WindowStyle Hidden",
  ].join('\n')
}

/** Loopback-only gate: refuse non-loopback hosts before any side effect. */
function isLoopback(req: IncomingMessage): boolean {
  const host = req.headers['host']
  return typeof host === 'string' && /^(localhost|127\.|\[::1\])/i.test(host)
}

export function apply(ctx: InjectedCtx): void {
  const nodePath = process.execPath
  const binPath = path.resolve(process.argv[1] ?? '')
  const cwd = process.cwd()
  const launcher = launcherScript(nodePath, binPath, cwd)

  const dispose = ctx.webServer.register({
    kind: 'prefix',
    path: '/reboot',
    handler: (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' })
        res.end('method not allowed')
        return
      }
      if (!isLoopback(req)) {
        res.writeHead(403)
        res.end('forbidden')
        return
      }
      try {
        ctx.subprocess.spawn({
          argv: [PS, '-NoProfile', '-WindowStyle', 'Hidden', '-Command', '-'],
          cwd,
          stdio: { stdin: { data: launcher }, stdout: 'ignore', stderr: 'ignore' },
          graceMs: 30000,
        })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: false, error: String((err as Error)?.message ?? err) }))
      }
    },
  })

  ctx.effect(() => dispose)
}
