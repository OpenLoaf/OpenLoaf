# Tenas Electron

Electron 40 桌面外壳，使用 Electron Forge (webpack) 开发 + electron-builder 打包分发。

## 开发

```bash
# 首次或 native 依赖变动后执行（自动构建 speech/calendar helper）
pnpm run predesktop

# 启动开发模式（需先在另一个终端启动 web + server）
pnpm run desktop
```

## 构建脚本

所有 `dist:*` 脚本通过 `scripts/dist.mjs` 包装，自动检测宿主 arch 并设置正确的 `extraMetadata.main`（`.webpack/{arch}/main/index.js`）。

| 脚本 | 用途 | macOS | Windows | Linux |
|------|------|:-----:|:-------:|:-----:|
| `package` | 构建 server + web + electron-forge 打包 | `.app` | `.exe` | binary |
| `dist:dev` | 完整打包 + 出安装包（本地测试，无签名） | DMG/ZIP | NSIS | AppImage |
| `dist:production` | 完整打包 + 签名 + 公证 | DMG/ZIP | NSIS | AppImage |
| `dist:all:dev` | 全平台打包（本地测试，无签名） | DMG/ZIP | NSIS | AppImage |
| `dist:all` | 全平台打包（签名 + 公证） | DMG/ZIP | NSIS | AppImage |
| `dist:resign` | 跳过 server/web 重新构建，直接重签名打包 | DMG/ZIP | NSIS | AppImage |

```bash
# 本地快速验证打包
pnpm run dist:dev

# 正式发布
pnpm run dist:production

# 全平台打包（本地测试）
pnpm run dist:all:dev

# 全平台打包（签名 + 公证）
pnpm run dist:all

# 只重签名（不重新构建 server/web）
pnpm run dist:resign
```

> 注意：全平台打包需要目标平台对应的原生依赖（如 sharp/@img/@libsql 预编译包）。
> 建议在 macOS / Windows / Linux 各自的 Runner 上分别执行，避免跨平台依赖缺失导致运行时问题。

## Electron 自动更新（R2）

Electron 本体更新使用 `electron-updater` 的 generic provider，更新源由 `TENAS_ELECTRON_UPDATE_URL` 指定（见 `resources/runtime.env`）。

发布流程（概念）：

1) 运行 `pnpm run dist:production` 生成安装包与 `latest*.yml` 元数据  
2) 将 `dist/` 下对应平台的安装包与元数据上传到 R2 的更新目录  
3) 客户端启动后自动检查并下载更新

## 产物目录

### macOS
| 路径 | 说明 |
|------|------|
| `out/Tenas-darwin-arm64/` | electron-forge package 产物（未签名 `.app`） |
| `dist/mac-arm64/Tenas.app` | electron-builder 最终产物 |
| `dist/Tenas-*.dmg` | DMG 安装包 |
| `dist/Tenas-*-mac.zip` | ZIP 包 |

### Windows
| 路径 | 说明 |
|------|------|
| `out/Tenas-win32-x64/` | electron-forge package 产物 |
| `dist/win-unpacked/` | electron-builder 解压产物 |
| `dist/Tenas Setup *.exe` | NSIS 安装包 |

### Linux
| 路径 | 说明 |
|------|------|
| `out/Tenas-linux-x64/` | electron-forge package 产物 |
| `dist/Tenas-*.AppImage` | AppImage 包 |

## 打包后 Resources 目录结构

```
{Resources}/
  app.asar                  # Electron 主进程代码（webpack 打包）
  server.mjs                # Server 端 esbuild 产物
  server.package.json       # Server 版本信息
  seed.db                   # 初始数据库
  out/                      # Next.js 静态导出
  web.package.json          # Web 版本信息
  runtime.env               # 运行时环境变量
  icon.png                  # 应用图标（通用）
  *.zh.md                   # AI Agent prompt 文件
  node_modules/             # 原生/外部模块（跨平台共享）
    sharp/                  #   图片处理（仅 lib/ + package.json）
    @img/                   #   sharp 原生绑定（按宿主平台自动选择）
    detect-libc/            #   sharp 运行时依赖
    semver/                 #   sharp 运行时依赖
    @libsql/                #   SQLite 原生绑定（按宿主平台自动选择）
    playwright-core/        #   浏览器自动化

  # === 以下为平台特定资源（按 mac/win/linux 节区自动选择） ===

  # macOS:
  icon.icns                     # macOS 图标
  speech/macos/tenas-speech     # 语音识别 helper
  calendar/macos/tenas-calendar # 日历 helper
  prebuilds/darwin-arm64/       # node-pty 原生绑定

  # Windows:
  icon.ico                          # Windows 图标
  speech/windows/tenas-speech.exe   # 语音识别 helper
  calendar/windows/tenas-calendar.exe # 日历 helper
  prebuilds/win32-x64/              # node-pty 原生绑定

  # Linux:
  prebuilds/linux-x64/              # node-pty 原生绑定
```

## 跨平台打包架构

`extraResources` 采用分层设计：

- **顶层**（共享）：server.mjs、seed.db、out/、.md prompt 文件、npm 模块（sharp/@img/@libsql 等）
- **`mac` 节区**：icon.icns、speech/calendar macOS binary、node-pty darwin-arm64 prebuild
- **`win` 节区**：icon.ico、speech/calendar Windows exe、node-pty win32-x64 prebuild
- **`linux` 节区**：node-pty linux-x64 prebuild

`@img` 和 `@libsql` 的原生绑定由 pnpm 按宿主平台自动安装（如 macOS 上安装 `@img/sharp-darwin-arm64`，Windows 上安装 `@img/sharp-win32-x64`），因此放在共享层即可。

## macOS 签名优化

- **extraResources 过滤**：从源头精确过滤，仅打包运行时必要文件
- **signIgnore**：跳过非二进制文件（.js/.json/.html/.css/.md 等）的签名
- **afterPack 钩子**（`scripts/afterPack.js`）：签名前按平台裁剪多余文件

## 日志

启动日志位于 `~/Library/Application Support/Tenas/startup.log`（macOS）：

```bash
tail -f ~/Library/Application\ Support/Tenas/startup.log
```
