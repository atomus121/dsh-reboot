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
- 纯增量挂载，不替换任何现有 UI。

## 安装

直接安装 GitHub 上的预构建版本（推荐）：

```bash
dsh plugin --profile web add "github:atomus121/dsh-reboot"
```

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
  index.ts            # Node 宿主半部：/reboot 路由 + 静默重启
  client/index.tsx    # 浏览器客户端半部：侧边栏「重启」按钮
cordis.patch.yml      # 组合补丁（dsh plugin add 挂载本插件行）
build.mjs             # Windows 兼容的 tsdown 构建驱动
tsdown.config.mjs     # 双端（node ESM + browser CJS）打包配置
tsconfig.json         # Node 半部类型检查
tsconfig.client.json  # 客户端半部类型检查
```

## 工作原理

客户端点击按钮 → `POST /reboot`（同源 + 回环校验）→ 宿主半部生成一段 PowerShell 重启脚本，经 `Win32_Process.Create` 以**脱离于 dsh 进程树**的方式启动（这样重启脚本在杀掉 dsh 自己后仍能存活），依次：杀 3080 进程树 → 等端口释放 → 以 `process.execPath` + 原 bin.js + `process.cwd()` 隐藏重启 `dsh web`。

## 许可证

MIT
