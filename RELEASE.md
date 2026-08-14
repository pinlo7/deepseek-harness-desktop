# Release 流程

## 版本管理

语义化版本（`package.json` 的 `version`），发布前 bump：

```sh
npm version patch   # 或 minor / major
git push --follow-tags
```

push 带 `v*` tag 会触发 CI：三平台构建 → 上传 GitHub Releases → 生成 `latest*.yml`，已安装的客户端通过 electron-updater 收到更新。

## 三平台 CI 验证（不发布）

GitHub Actions 手动触发 `build-desktop` workflow，或本地：

```sh
npm run dist:linux   # AppImage + deb（需 Linux）
npm run dist:win     # NSIS（需 Windows）
npm run dist:mac     # dmg + zip（需 macOS）
```

## 代码签名 / 公证（正式分发必需）

在仓库 Settings → Secrets 配置（`build.yml` 已把这些 secrets 传入 electron-builder，配好即自动签名+公证）：

| 平台 | Secret | 说明 |
|---|---|---|
| Windows / macOS | `CSC_LINK` + `CSC_KEY_PASSWORD` | 代码签名证书（PFX/p12 base64）+ 密码 |
| macOS 公证 | `APPLE_ID` + `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID` | Apple ID 公证（方式二） |
| macOS 公证（推荐） | `APPLE_API_KEY` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER` | App Store Connect API Key（更安全） |

不配这些 secrets 时 CI 产出 unsigned 构建（`CSC_IDENTITY_AUTO_DISCOVERY: 'false'` 已防止 CI 上误发现本机证书）。配好后重新打 tag 即可产出签名版。

## 依赖 GA

当前 `@deepseek-ai/dsh` 为 `0.1.0-rc.6`（pre-release）。上游 GA 后：

```sh
npm install @deepseek-ai/dsh@latest
```

并在 CI 全量重跑一轮，确认 rc→GA 无行为漂移。

## 上线检查清单

- [ ] 三平台 CI 构建全绿
- [ ] 各平台安装包安装 + 启动 + 一轮真实对话实测
- [ ] macOS 签名 + notarize（否则 Gatekeeper 拦截）
- [ ] Windows 签名（否则 SmartScreen 警告）
- [ ] dsh 依赖钉到 GA 版本
- [ ] 打第一个 `v1.0.0` tag 发布
