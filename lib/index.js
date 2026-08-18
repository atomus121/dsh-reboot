import path from "node:path";
import os from "node:os";
//#region src/index.ts
/**
* dsh-reboot — host half (Node / Cordis).
*
* Registers a same-origin POST route `/reboot` that silently closes and
* restarts the running `dsh web` process, then returns so the client can
* reload the page.
*
* Restart mechanics (Windows):
*   - `dsh web` runs inside a kill-on-close sandbox job, so ANY child of the
*     harness is terminated the moment dsh web dies. A launcher that kills
*     dsh web directly therefore cannot survive long enough to start the
*     replacement.
*   - Instead the host writes a restarter script to %TEMP% and spawns a tiny
*     launcher (`powershell -Command -`, flat script — no here-strings, which
*     break the stdin path) that creates the restarter through
*     `Win32_Process.Create`. The WMI-created process is parented to
*     WmiPrvSE, OUTSIDE dsh web's job, so it survives the kill and can
*     relaunch `node <dsh bin.js> web`.
*
* Cordis access discipline: services are declared in `inject` and bare-accessed
* (the same proven path as dsh-session-manager / aionui-panel).
*/
const name = "dsh-reboot";
/** Services injected from the web profile; bare access is legal once declared. */
const inject = [
	"webServer",
	"subprocess",
	"fs"
];
const PS = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
/**
* The restarter body, written to %TEMP% by the host and launched via
* `Win32_Process.Create` (parented to WmiPrvSE, outside dsh web's sandbox job).
* It kills the dsh process tree listening on PORT (with `/T` — safe now that
* the restarter is not inside that tree), waits for the port to free, gives a
* settle grace, relaunches `node <dsh bin.js> web` hidden from the same cwd,
* and verifies the new server comes up. Every step is logged to `logPath`.
*/
function restartScript(nodePath, binPath, cwd, logPath) {
	return [
		"$ErrorActionPreference = 'SilentlyContinue'",
		"'restart start ' + (Get-Date -Format 'HH:mm:ss') | Out-File '" + logPath + "'",
		"Start-Sleep -Seconds 2",
		"$c = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1",
		"'found pid ' + $c.OwningProcess | Out-File '" + logPath + "' -Append",
		"if ($c) { taskkill /PID $c.OwningProcess /T /F }",
		"$tries = 0",
		"do {",
		"  Start-Sleep -Seconds 1",
		"  $tries++",
		"  $still = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue",
		"} while ($still -and $tries -lt 15)",
		"'port free after ' + $tries + 's' | Out-File '" + logPath + "' -Append",
		"Start-Sleep -Seconds 3",
		"Start-Process -FilePath '" + nodePath + "' -ArgumentList '" + binPath + "','web' -WorkingDirectory '" + cwd + "' -WindowStyle Hidden",
		"'started at ' + (Get-Date -Format 'HH:mm:ss') | Out-File '" + logPath + "' -Append",
		"$up = $false",
		"$t2 = 0",
		"do {",
		"  Start-Sleep -Seconds 2",
		"  $t2++",
		"  if (Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue) { $up = $true }",
		"} while (-not $up -and $t2 -lt 20)",
		"'up after ' + ($t2 * 2) + 's = ' + $up | Out-File '" + logPath + "' -Append",
		"Remove-Item $MyInvocation.MyCommand.Path -ErrorAction SilentlyContinue"
	].join("\n");
}
/** Loopback-only gate: refuse non-loopback hosts before any side effect. */
function isLoopback(req) {
	const host = req.headers["host"];
	return typeof host === "string" && /^(localhost|127\.|\[::1\])/i.test(host);
}
async function apply(ctx) {
	const nodePath = process.execPath;
	const binPath = path.resolve(process.argv[1] ?? "");
	const cwd = process.cwd();
	const restarterFile = path.join(os.tmpdir(), "dsh-reboot-restart.ps1");
	const logFile = path.join(os.tmpdir(), "dsh-reboot-restart.log");
	const target = await ctx.fs.resolve(restarterFile);
	await ctx.fs.writeText(target, restartScript(nodePath, binPath, cwd, logFile));
	const launcher = ["$ErrorActionPreference = 'SilentlyContinue'", "Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = \"C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -WindowStyle Hidden -File `\"" + ctx.fs.processPath(target) + "`\"\" } | Out-Null"].join("\n");
	const dispose = ctx.webServer.register({
		kind: "prefix",
		path: "/reboot",
		handler: (req, res) => {
			if (req.method !== "POST") {
				res.writeHead(405, { allow: "POST" });
				res.end("method not allowed");
				return;
			}
			if (!isLoopback(req)) {
				res.writeHead(403);
				res.end("forbidden");
				return;
			}
			try {
				ctx.subprocess.spawn({
					argv: [
						PS,
						"-NoProfile",
						"-WindowStyle",
						"Hidden",
						"-Command",
						"-"
					],
					cwd,
					stdio: {
						stdin: { data: launcher },
						stdout: "ignore",
						stderr: "ignore"
					},
					graceMs: 3e4
				});
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({ ok: true }));
			} catch (err) {
				res.writeHead(500, { "content-type": "application/json" });
				res.end(JSON.stringify({
					ok: false,
					error: String(err?.message ?? err)
				}));
			}
		}
	});
	ctx.effect(() => dispose);
}
//#endregion
export { apply, inject, name };
