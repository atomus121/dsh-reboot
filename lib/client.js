window.__ModuleLoader__.load({
	id: "dsh-reboot",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		//#region src/client/index.tsx
		/**
		* dsh-reboot — client half (browser / React).
		*
		* Adds a restart button above the sidebar Settings entry. It renders a Win11
		* style circular-arrow icon plus the 「重启」 label, styled to match the native
		* Settings trigger. Clicking POSTs to the host `/reboot` route and then polls
		* the origin until the restarted server responds, reloading once it does.
		*/
		/** Client services this plugin injects (slots for the sidebar footer action). */
		const inject = ["slots"];
		/** Button styles mirroring the native Settings trigger (`--dsw-alias-*` tokens). */
		const CSS = [
			".dsh-reboot-btn{box-sizing:border-box;cursor:pointer;width:calc(100% + 8px);height:34px;color:var(--dsw-alias-label-primary);background:0 0;border:none;border-radius:12px;flex:none;align-items:center;gap:8px;margin:4px -4px;padding:6px 2px 6px 10px;font-family:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden}",
			".dsh-reboot-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".dsh-reboot-btn:disabled{opacity:.55;cursor:default}",
			".dsh-reboot-btn-rail{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;margin:8px 0 10px;padding:0}",
			".dsh-reboot-label{white-space:nowrap;overflow:hidden}",
			".dsh-reboot-spin{animation:dsh-reboot-spin 1s linear infinite}",
			"@keyframes dsh-reboot-spin{to{transform:rotate(360deg)}}"
		].join("");
		function injectCss() {
			if (document.querySelector("style[data-plugin=\"dsh-reboot\"]")) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-reboot";
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		/** Win11-style circular-arrow (restart) glyph, stroke-based like the Fluent icons. */
		function RestartIcon(props) {
			return (0, react.createElement)("svg", {
				width: props.size,
				height: props.size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				className: props.spin ? "dsh-reboot-spin" : void 0
			}, (0, react.createElement)("polyline", { points: "23 4 23 10 17 10" }), (0, react.createElement)("path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" }));
		}
		function RebootButton(props) {
			const [busy, setBusy] = (0, react.useState)(false);
			const wide = props.wide;
			const onClick = () => {
				if (busy) return;
				setBusy(true);
				fetch("/reboot", {
					method: "POST",
					cache: "no-store"
				}).then(() => {
					let sawDead = false;
					let tries = 0;
					const poll = () => {
						tries += 1;
						fetch(window.location.origin + "/", { cache: "no-store" }).then(() => {
							if (sawDead || tries > 30) window.location.reload();
							else setTimeout(poll, 1e3);
						}, () => {
							sawDead = true;
							setTimeout(poll, 1e3);
						});
					};
					setTimeout(poll, 2e3);
				}).catch(() => setBusy(false));
			};
			const children = [(0, react.createElement)(RestartIcon, {
				size: wide ? 16 : 18,
				spin: busy
			})];
			if (wide) children.push((0, react.createElement)("span", { className: "dsh-reboot-label" }, "重启"));
			return (0, react.createElement)("button", {
				type: "button",
				className: wide ? "dsh-reboot-btn" : "dsh-reboot-btn dsh-reboot-btn-rail",
				title: "重启",
				"aria-label": "重启",
				disabled: busy,
				onClick
			}, children);
		}
		function apply(ctx) {
			injectCss();
			const dispose = ctx.slots.register({
				name: "sidebar.footer.action",
				id: "dsh-reboot",
				order: -1,
				label: "重启"
			}, (props) => (0, react.createElement)(RebootButton, { wide: props.wide }));
			ctx.effect(() => dispose);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
