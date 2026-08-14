# DeepSeek Harness Desktop

跨平台桌面版 DeepSeek Harness：一个薄 Electron 壳，内嵌 `dsh` 宿主进程，复用官方 Web 前端，零改动。

**官方  deepseek-harness**：

👉 **https://github.com/deepseek-ai/deepseek-harness**

## 下载安装

所有平台安装包发布在 **GitHub Releases**：

👉 **https://github.com/pinlo7/deepseek-harness-desktop/releases**

| 平台 | 安装包 | 说明 |
|---|---|---|
| Windows | `DeepSeek-Harness-Setup-<version>.exe` | NSIS 安装向导，双击安装 |
| macOS | `DeepSeek-Harness-<version>-arm64.dmg` / `-x64.dmg` | Apple Silicon / Intel，拖入 Applications |
| Linux | `dsh-desktop_<version>_amd64.deb` / `.AppImage` | Debian 系 / 通用 |

> ⚠️ **未签名提示**：当前版本为 **unsigned**（未配置代码签名证书）。Windows 首次安装时 SmartScreen 会提示「Windows 已保护你的电脑」→ 点「更多信息」→「仍要运行」；macOS 需在「系统设置 → 隐私与安全性」中允许来自未识别开发者。正式签名版将在配置签名证书后随新版本发布。

## 快速开始

1. 从 [Releases](https://github.com/pinlo7/deepseek-harness-desktop/releases) 下载对应平台安装包并安装。
2. 打开应用（Windows 开始菜单搜「DeepSeek Harness」）。首次启动会自动初始化 `desktop` profile（与 CLI 共享 `$DSH_HOME` 配置：Linux/macOS `~/.dsh`，Windows `%USERPROFILE%\.dsh`）。
3. 在界面设置里配置 API Key，开始对话。
4. 关闭窗口会隐藏到**系统托盘**，宿主与当前会话保持运行；托盘菜单「Quit」或 `Cmd/Ctrl+Q` 真正退出。
5. 有新版本时应用会自动检查更新（electron-updater），下载完成后通知重启。

## 架构

```
Electron 主进程 (main.js)
  · 单实例锁 / 系统托盘 / 关闭窗口常驻不杀宿主
  · spawn 宿主：ELECTRON_RUN_AS_NODE + --expose-internals
        │
        ▼
dsh 宿主（同 Electron 二进制，纯 Node 模式）
  · 跑 @deepseek-ai/dsh，boot desktop profile
  · 监听 127.0.0.1 随机端口，打印 "dsh web: http://127.0.0.1:<port>"
        │
        ▼
BrowserWindow 加载该 loopback URL → 官方 Web UI 原样渲染
```

### 关键设计决策

- **宿主随包分发**：`@deepseek-ai/dsh` 作为 production dependency，`asarUnpack` 整棵 `node_modules`，宿主用 `ELECTRON_RUN_AS_NODE` 跑解包后的 `bin.js`，目标机器无需安装 Node。
- **`--expose-internals`**：dsh 的 loader 用 Node 内部 ESM loader 提供 HMR 服务；`node-addon-require-builtin` 的 native 二进制按系统 Node ABI 编译、无法在 Electron 里加载，所以改走 `--expose-internals`（Electron 的 `utilityProcess` 会剥离该标志的效果，故必须用 `ELECTRON_RUN_AS_NODE` 子进程而非 utilityProcess）。
- **`desktop` profile**：首次运行自动从内置模板初始化到 `$DSH_HOME/profiles/desktop`，bundles 与 `web` 相同（`dsh-base` + `dsh-web-app`），为后续桌面专属 bundle 预留接口。

## 已知问题与修复

### Windows 打开工作区报错（v0.1.4，v0.1.5 已修复）

**症状**：点「打开工作区」报 `directory picker failed: win32 folder dialog worker exited before reporting a result`。

**原因**：dsh 原生目录选择器（`@deepseek-ai/dsh-host-directory-picker-native`）spawn worker 用 koffi（N-API FFI）驱动 Win32 文件夹对话框；部分 Windows 机器上 koffi 原生崩溃导致 worker 未报告即退出（上游讨论：[#197](https://github.com/deepseek-ai/deepseek-harness/discussions/197)、[#30](https://github.com/deepseek-ai/deepseek-harness/discussions/30)）。

**修复（v0.1.5）**：desktop profile 在 Windows 上固定使用纯 JS 的 **browse** 目录选择后端（网页文件夹选择器，零原生代码）；macOS/Linux 保持系统原生选择器。

**旧版本手动修复**：编辑 `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml`（Linux/macOS 为 `~/.dsh/profiles/desktop/cordis.patch.yml`），写入：

```yaml
- id: directory-picker
  disabled: true
- insert:
    - id: directory-picker-browse
      name: '@deepseek-ai/dsh-host-directory-picker-browse'
    - id: directory-picker-browse-client
      name: '@deepseek-ai/dsh-client-ui-directory-picker-browse'
```

保存后重启应用。

## 开发

```sh
npm install        # 安装依赖（含 Electron 43 与 @deepseek-ai/dsh）
npm start          # 运行桌面版
```

## 打包

```sh
npm run dist:linux   # AppImage + deb
npm run dist:win     # NSIS 安装包
npm run dist:mac     # dmg + zip
```

产物输出到 `dist/`。三平台 CI 见 `.github/workflows/build.yml`（打 tag `v*` 或手动触发）。

## 发布与更新

- 打 `v*` tag 触发 CI 三平台构建并发布到 GitHub Releases（生成 `latest*.yml`）。
- 打包版启动时会自动检查更新（electron-updater），下载完成后通知重启。
- 签名/公证配置与完整发布流程见 [`RELEASE.md`](RELEASE.md)。
- 版本历史与变更见 [Releases 页面](https://github.com/pinlo7/deepseek-harness-desktop/releases)。

## 版本历史

| 版本 | 日期 | 内容 |
|---|---|---|
| v0.1.5 | 2026-08-14 | 修复 Windows 打开工作区报 `directory picker failed`（Windows 固定 browse 选择器后端） |
| v0.1.4 | 2026-08-13 | 三平台安装包发布；electron-updater 自动更新端到端验证通过 |
| v0.1.3 | — | 修正 Windows 冷启动冒烟测试超时 |

## 说明

- 宿主只绑定 `127.0.0.1` + 随机端口，外部网络不可达。
- 需要登录模型时，在界面设置里配置 API Key（与 CLI 版共享 `$DSH_HOME` 配置）。
