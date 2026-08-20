# dsh-reboot

为 [DeepSeek Harness Web](https://github.com/deepseek-ai/deepseek-harness) 添加一个「重启」按钮的插件。

点击侧边栏「设置」上方的「重启」按钮（Windows 11 风格图标）：

1. **静默关闭** `dsh web`（杀掉监听 3080 端口的进程树）；
2. **静默重启** `dsh web`（隐藏窗口，不弹终端）；
3. 浏览器**自动刷新**到新实例。

## 安装

```bash
dsh plugin --profile web add "github:atomus121/dsh-reboot"
```

> pnpm 默认拦截 git 依赖的构建脚本。若报 `ERR_PNPM_IGNORED_BUILDS`：编辑 `~/.dsh/profiles/web/pnpm-workspace.yaml`，在 `allowBuilds:` 下把报错提示的那一行（形如 `dsh-reboot@https://codeload.github.com/...`）设为 `true`，然后重跑安装命令。

安装完成后**重启 dsh web** 并刷新页面，侧边栏即出现「重启」按钮。

## 卸载

```bash
dsh plugin --profile web remove dsh-reboot
```

重启 dsh web 后按钮消失。本地源码仓库不受影响，想再装回运行安装命令即可。

## 使用

点击侧边栏的「重启」按钮即可。侧边栏展开时显示「图标 + 重启」，收起时仅显示图标。每次重启的完整过程会写入 `%TEMP%\dsh-reboot-restart.log`，出问题时便于排查。

## 工作原理

`dsh web` 运行在 DSH 沙箱的 **kill-on-close job** 里：dsh web 一死，它派生的所有进程都会被强制终止，所以「由插件自己拉起新进程」行不通。

插件的做法是**把重启动作放到 job 之外**：

1. 点击按钮 → 页面 `POST /reboot`；
2. 插件用一个极短的隐藏 PowerShell 通过 **WMI**（`Win32_Process.Create`）创建重启脚本进程——它挂在 WmiPrvSE 之下，**不在 dsh web 的 job 里**，能活到 dsh web 死后；
3. 该进程：杀 3080 进程树 → 等端口释放 → 用原路径隐藏重启 `dsh web` → 轮询确认恢复；
4. 浏览器**等到旧服务确实死亡后**才刷新，确保刷新落在新实例上（新装的插件随之生效）。

## 本地开发

```bash
git clone https://github.com/atomus121/dsh-reboot.git
cd dsh-reboot
pnpm install
pnpm build   # tsdown 双端构建 → lib/index.js + lib/client.js
pnpm check   # tsc 类型检查（node + client）
```

`lib/` 已预构建并随仓库提交，普通使用直接 `dsh plugin add "github:..."` 即可；改动源码后运行 `pnpm build` 重新生成。

## 许可证

MIT
