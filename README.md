# dsh-reboot

为 [DeepSeek Harness Web](https://github.com/deepseek-ai/deepseek-harness) 添加一个「重启」按钮的插件。

在侧边栏「设置」正上方显示一个 Windows 11 风格的重启图标 + 「重启」文字，点击后：

1. **静默关闭**当前 `dsh web` 进程（杀掉监听 3080 端口的进程树）；
2. **静默重启** `dsh web`（隐藏窗口、后台运行，不弹出终端）；
3. 浏览器**自动刷新** `http://127.0.0.1:3080/`。

## 特性

- 按钮外观与网页原生「设置」一致（字体 14px / 行高 22px / 间距 8px / 主题色变量）。
- 侧边栏展开时显示「图标 + 重启」，收起（rail）时仅显示图标。
- 终端静默执行：重启由隐藏的 PowerShell 进程完成，全程无窗口。
- **沙箱感知**：`dsh web` 运行在 kill-on-close 沙箱 job 里，插件通过 WMI 在 job 之外创建重启进程，保证「杀进程 → 重启」真实完成，而不是只刷新页面。
- 纯增量挂载，不替换任何现有 UI。

## 安装

直接安装 GitHub 上的预构建版本（推荐）：

```bash
dsh plugin --profile web add "github:atomus121/dsh-reboot"
```

> 注意：pnpm 默认会阻止 git 依赖的构建脚本。若安装时报 `allowBuilds` 相关错误，在 `~/.dsh/profiles/web/pnpm-workspace.yaml` 的 `allowBuilds:` 下添加一行 `dsh-reboot: true`，然后重跑上面的命令。

安装完成后重启当前 `dsh web` 进程，并刷新页面。

如需从源码本地构建安装：

```bash
git clone https://github.com/atomus121/dsh-reboot.git
cd dsh-reboot
pnpm install
pnpm build
dsh plugin --profile web add "link:$PWD"
```

## 本地构建

```bash
pnpm build   # tsdown 双端构建 → lib/index.js + lib/client.js
pnpm check   # tsc 类型检查（node + client 两份 tsconfig）
```

`lib/` 已预构建并随仓库提交，便于 `dsh plugin add "github:..."` 直接安装；改动源码后运行 `pnpm build` 重新生成。

## 目录结构

```text
src/
  index.ts            # Node 宿主半部：/reboot 路由 + 写 restarter + WMI 触发重启
  client/index.tsx    # 浏览器客户端半部：侧边栏「重启」按钮 + 死窗检测刷新
cordis.patch.yml      # 组合补丁（dsh plugin add 挂载本插件行）
build.mjs             # Windows 兼容的 tsdown 构建驱动
tsdown.config.mjs     # 双端（node ESM + browser CJS）打包配置
tsconfig.json         # Node 半部类型检查
tsconfig.client.json  # 客户端半部类型检查
```

## 工作原理

`dsh web` 运行在 DSH 沙箱的 **kill-on-close job** 里：一旦 `dsh web` 进程死亡，job 内所有进程都会被强制终止。因此任何「先杀 dsh、再由自己的子进程重启」的方案都不可行——launcher 会在杀掉 dsh 的瞬间一起死掉。

插件的做法是**把重启动作放到 job 之外**：

1. 客户端点击按钮 → `POST /reboot`（同源 + 回环校验）。
2. 宿主半部在启动时（async `apply`）用 `ctx.fs` 把一段 **restarter 脚本**写入 `%TEMP%\dsh-reboot-restart.ps1`。
3. 点击时宿主 spawn 一个极短的隐藏 PowerShell（`-Command -`，扁平脚本、不用 here-string），用 `Win32_Process.Create` 创建 `powershell -File <restarter>`——**WMI 创建的进程挂在 WmiPrvSE 之下，不在 dsh web 的 job 里**。
4. restarter（job 之外，能存活）：杀 3080 进程树（`taskkill /T /F`）→ 等端口释放 → 以 `process.execPath` + 原 bin.js + `process.cwd()` 隐藏重启 `dsh web` → 轮询确认 3080 恢复。
5. 客户端**只在观测到旧服务死亡之后**才刷新页面（死窗检测），确保刷新落在新启动的实例上，新装的插件随之生效。

每一步都会写入 `%TEMP%\dsh-reboot-restart.log`（start → found pid → port free → started → up），便于排查。

## 许可证

MIT
