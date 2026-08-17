import path from "node:path";
//#region src/index.ts
/**
* dsh-reboot — host half (Node / Cordis).
*
* Registers a same-origin POST route `/reboot` that silently closes and
* restarts the running `dsh web` process, then returns so the client can
* reload the page. The restart itself is performed by a detached,
* window-hidden PowerShell process (spawned via WMI so it survives the
* `taskkill /T` of the dsh process tree), which:
*   1. kills the process tree listening on port 3080,
*   2. waits for the port to free,
*   3. relaunches `node <dsh bin.js> web` hidden, from the same cwd.
*
* Cordis access discipline: services are declared in `inject` and bare-accessed
* (the same proven path as dsh-session-manager / aionui-panel).
*/
const name = "dsh-reboot";
/** Services injected from the web profile; bare access is legal once declared. */
const inject = ["webServer", "subprocess"];
const PS = "C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
/**
* The detached restarter body. Runs inside `powershell -File` (hidden, WMI
* detached). `nodePath` / `binPath` / `cwd` are captured from THIS process so
* the restart reproduces the exact launch it is replacing.
*/
function restartScript(nodePath, binPath, cwd) {
	return [
		"$ErrorActionPreference = 'SilentlyContinue'",
		"Start-Sleep -Seconds 1",
		"$c = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue",
		"if ($c) { taskkill /PID $c.OwningProcess /T /F }",
		"$tries = 0",
		"do {",
		"  Start-Sleep -Seconds 1",
		"  $tries++",
		"  $still = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue",
		"} while ($still -and $tries -lt 15)",
		"Start-Process -FilePath '" + nodePath + "' -ArgumentList '\"" + binPath + "\" web' -WorkingDirectory '" + cwd + "' -WindowStyle Hidden",
		"Remove-Item $MyInvocation.MyCommand.Path -ErrorAction SilentlyContinue"
	].join("\n");
}
/**
* The launcher fed to a short-lived, hidden `powershell -Command -`. It writes
* the restarter to a temp .ps1 and re-launches it through `Win32_Process.Create`
* so the restarter is parented to WmiPrvSE — NOT this dsh process — and thus
* survives the `taskkill /T` that closes dsh web.
*/
function launcherScript(restart) {
	return [
		"$ErrorActionPreference = 'SilentlyContinue'",
		"$restart = @'",
		restart,
		"'@",
		"$p = Join-Path $env:TEMP \"dsh-reboot-restart.ps1\"",
		"Set-Content -Path $p -Value $restart -Encoding ASCII",
		"Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = \"C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -WindowStyle Hidden -File `\"$p`\"\" } | Out-Null"
	].join("\n");
}
/** Loopback-only gate: refuse non-loopback hosts before any side effect. */
function isLoopback(req) {
	const host = req.headers["host"];
	return typeof host === "string" && /^(localhost|127\.|\[::1\])/i.test(host);
}
function apply(ctx) {
	const nodePath = process.execPath;
	const binPath = path.resolve(process.argv[1] ?? "");
	const cwd = process.cwd();
	const launcher = launcherScript(restartScript(nodePath, binPath, cwd));
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
