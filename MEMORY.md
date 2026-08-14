# 会话记忆：DeepSeek Harness 桌面版 上线准备进度

> 保存时间：2026-08-14。此文件随仓库走，跨会话/跨平台可访问。事实以本会话工具结果为准。
> 更新：2026-08-14（Windows 实测报 directory picker 错误 → 已定位并修复，见「六」）。

## 一、项目全景

- **目标**：给 deepseek-harness 做跨平台桌面版，并准备正式上线。
- **项目目录**：`/home/liu/deepseek-harness/desktop/`
- **GitHub 仓库**：https://github.com/pinlo7/deepseek-harness-desktop
- **已发布版本**：`v0.1.4`（正式 release，**unsigned** 测试版）
- **技术栈**：Electron `43.4.0`（内置 Node `24.18.1`）+ `@deepseek-ai/dsh@0.1.0-rc.6`

## 二、架构（一句话）

**Electron 壳 + `ELECTRON_RUN_AS_NODE` 内嵌 dsh 宿主 + 零改动官方 Web UI。**

- `main.js`：单实例锁 / 系统托盘 / 关闭窗口常驻不杀宿主 / 首次运行自动初始化 `desktop` profile / spawn 宿主
- 宿主用 `spawn(process.execPath, ['--expose-internals', dshBin, '--profile', 'desktop', '--host', '127.0.0.1', '--port', '0'], { env: ELECTRON_RUN_AS_NODE })`
- 宿主只绑 `127.0.0.1` + 随机端口，外部不可达
- `$DSH_HOME` 与 CLI 共享（Linux/macOS `~/.dsh`，Windows `%USERPROFILE%\.dsh`）

## 三、已完成（全部经本会话验证）

| 里程碑 | 证据 |
|---|---|
| Electron 壳加载 dsh 宿主 + UI 渲染 | Linux 本机截图确认，持续运行稳定 |
| 三平台 CI 构建全绿 | Windows / macOS / Linux 均成功 |
| 三平台运行时 smoke test 全绿 | 打包产物真实 boot 宿主打印 `dsh web:`，`--expose-internals` 在 Win/mac 确认生效 |
| macOS 双架构 | x64 + arm64 的 dmg/zip 均产出 |
| electron-updater 自动更新 | 端到端验证：旧构建检测到 v0.1.4 并开始下载 |
| 发布 | v0.1.4 三平台安装包已发布（GitHub Releases） |

## 四、关键文件

- `main.js` — 主进程
- `preload.js` — 预加载桥（M2 IPC bridge 预留位）
- `smoke.js` — 打包产物 boot smoke test（CI 用）
- `electron-builder.yml` — 打包配置（`asarUnpack: node_modules/**`、publish=github、mac 双架构）
- `.github/workflows/build.yml` — 三平台 CI（tag 触发 publish，含签名 secrets 传递）
- `profiles/desktop/` — desktop profile 模板（bundles=base+web-app）
- `RELEASE.md` — 发布/签名/检查清单
- `README.md` — 架构说明

## 五、踩过的坑（重要，勿回退）

1. **Electron 内置 Node 版本**：Electron 33 内置 Node 20，不满足 dsh 要求的 Node ≥22 → 升级 Electron 43（Node 24.18）。
2. **`--expose-internals` 被 utilityProcess 剥离**：dsh 的 HMR 服务需 Node 内部 ESM loader，`node-addon-require-builtin` native 二进制按系统 Node ABI 编译、Electron 里加载失败。**必须用 `ELECTRON_RUN_AS_NODE` 子进程**（utilityProcess 即使传 execArgv 也访问不到 internal 模块）。
3. **electron-builder 漏打包 peer 依赖**：18 个 `@deepseek-ai/dsh-*` 包（`cordis-plugin-group`、`dsh-timeout`、`dsh-scope`、`dsh-fs`、`dsh-spill` 等）是 peerDependencies，npm dev 自动装但 electron-builder 不打包，AppImage FUSE 隔离环境暴露缺失。已全部显式 pin 进 `package.json` dependencies。
4. **macOS 只出 arm64**：`macos-latest` 是 Apple Silicon，需显式 `arch: [x64, arm64]`。
5. **sharp 的 `.so`（libvips）**：需 asarUnpack，最终整个 `node_modules` 解包。
6. **Windows 打开工作区报 `directory picker failed: win32 folder dialog worker exited before reporting a result`**：dsh 的 native 目录选择器（`@deepseek-ai/dsh-host-directory-picker-native`）spawn worker 用 **koffi**（N-API FFI，napi≥8，prebuilt 在 `@koromix/koffi-*` optionalDeps 里）驱动 Win32 文件夹对话框；部分 Windows 机器上 worker 未报告即退出（上游 discussions #197/#30，koffi 原生崩溃）。本机（Win11 26200 x64）dev/打包两条路径均无法复现（worker 正常弹框），判定为环境特异。**修复：desktop profile 在 Windows 上固定纯 JS 的 browse 后端**（`directory-picker` 行 disabled + insert `dsh-host-directory-picker-browse` + `dsh-client-ui-directory-picker-browse`），mac/Linux 保持 native。验证：`ELECTRON_RUN_AS_NODE=1 "DeepSeek Harness.exe" --expose-internals <dsh>/lib/bin.js --profile desktop --dump-config` 可见 auto 禁用、browse 启用。
   - **遗留风险**：`dsh-fs-local` 的 `writeFileAtomic` 在 Windows 也走 koffi（advapi32 DACL 复制）——若用户机器 koffi 全面崩溃，跑对话写文件仍会报错；用户实测若遇到再按 #30 改 fs-local 默认实现。
   - **npm install 注意**：npm 11 的 allow-scripts 会拦 koffi/electron 等的 install 脚本（`npm approve-scripts` 可解）；本机 npm install 需 `--cache <工作区路径>`（沙箱挡 %LOCALAPPDATA% cache）+ 全权限（spawn EPERM）。
   - **electron-builder 本地构建**：无 VS 工具链时 node-pty rebuild 失败 → 加 `--config.npmRebuild=false`（node-pty prebuilds 随包、koffi prebuilt 随 optionalDeps，dir 包已验证两者都在 app.asar.unpacked）。

## 六、当前阻塞（正式上线被卡住）

1. **代码签名/公证**（等用户）：需 Apple Developer + Windows 代码签名证书。CI 已配好 secrets 传递（`CSC_LINK`/`CSC_KEY_PASSWORD`/`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`，或 `APPLE_API_KEY` 三件套）。填好 secrets 打新 tag 即自动签名。
2. **dsh 钉 GA**（等上游）：`@deepseek-ai/dsh` 仍是 `0.1.0-rc.6`，无 GA。
3. **真实对话实测**（进行中）：Linux 已定位到"装了 0.1.0 旧版"，需重装 0.1.4；Windows 待测。
4. **Windows picker 修复待发布**：仓库已提交（`74f4923`，`profiles/desktop/cordis.patch.yml` 固定 browse），用户本机 profile 已即时 patch 并重启验证通过（dump-config 确认 auto 禁用/browse 启用、UI 200）。**待用户实测**：打开工作区（应为网页选择器）+ 跑一轮真实对话（验证 fs koffi 是否也崩）。确认 OK 后 bump 版本发 0.1.5。

## 七、下一步（按用户进展触发）

- **用户提供签名证书** → 配 GitHub Secrets → 打新 tag 出签名版。
- **用户实测反馈报错** → 贴日志修。
- **dsh 出 GA** → `npm install @deepseek-ai/dsh@latest` + 重跑 CI 验证无漂移。

## 八、Linux 本机验证（已定位问题）

```bash
# 装最新 0.1.4（覆盖旧的 0.1.0，旧版缺 peer 依赖会启动失败）
sudo dpkg -i /home/liu/deepseek-harness/desktop/dist/dsh-desktop_0.1.4_amd64.deb
dpkg -s dsh-desktop | grep Version   # 应显示 0.1.4
# 打开：应用菜单「DeepSeek Harness」或终端 dsh-desktop
```

## 九、Windows 平台测试（用户当前要做的）

1. **下载**：https://github.com/pinlo7/deepseek-harness-desktop/releases/tag/v0.1.4 → `DeepSeek-Harness-Setup-0.1.4.exe`
2. **安装**：双击运行。因为**未签名**，SmartScreen 会警告「Windows 已保护你的电脑」→ 点「更多信息」→「仍要运行」。
3. **打开**：开始菜单搜「DeepSeek Harness」。首次启动会自动初始化 desktop profile。
4. **验证**：
   - 窗口正常渲染 UI（非空白/闪退）
   - 配 API Key 后跑一轮真实对话，让它执行个 bash 命令（如 `dir` 或 `echo hi`）
   - 关闭窗口后托盘常驻，点托盘能唤回
5. **若报错**：在 PowerShell/CMD 里直接运行安装目录下的 `DeepSeek Harness.exe`（通常在 `C:\Users\<你>\AppData\Local\Programs\deepseek-harness-desktop\`），把输出贴回来。
   - 已知参考：CI smoke test 已确认 Windows 上打包产物能 boot 宿主并打印 `dsh web: http://127.0.0.1:<port>`。

## 十、GitHub 下载地址

https://github.com/pinlo7/deepseek-harness-desktop/releases/tag/v0.1.4
