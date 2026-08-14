# DeepSeek Harness Desktop

跨平台桌面版 DeepSeek Harness：一个薄 Electron 壳，内嵌 `dsh` 宿主进程，复用官方 Web 前端，零改动。

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

## 说明

- 宿主只绑定 `127.0.0.1` + 随机端口，外部网络不可达。
- 关闭窗口会隐藏到托盘，宿主与当前会话保持运行；托盘菜单「Quit」或 `Cmd/Ctrl+Q` 真正退出。
- 需要登录模型时，在界面设置里配置 API Key（与 CLI 版共享 `$DSH_HOME` 配置）。
