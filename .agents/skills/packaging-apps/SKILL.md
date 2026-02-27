---
name: packaging-apps
description: Use when asked how to package or bundle this repo's Electron Forge/Builder app, Next.js static export, or server esbuild builds with native dependencies, including where artifacts live or how deps are shipped.
---

# Packaging Apps

## Overview
Provide repo-specific packaging guidance for Electron + web + server, including build commands, artifact locations, and native-dependency shipping.

## Quick Triage
1. Identify the target: Forge package (dev packaging) vs Builder dist (signed installers) vs server/web only.
2. Confirm whether the question is about full packaging or incremental updates (different pipeline).
3. Map the request to the source-of-truth files listed below before answering.

## Repo Build Commands (Source of Truth)
- Electron Forge package: `pnpm --filter desktop run package` (or `pnpm -C apps/desktop run package`).
- Electron Builder dist: `pnpm --filter desktop run dist:dev` or `dist:production`.
- Server build only: `pnpm --filter server run build:prod`.
- Web export only: `pnpm --filter web run build`.

## macOS Build Windows (Wine on Apple Silicon)
1. Install XQuartz and start it once, then log out and back in to register X11.
2. Ensure `wine` is available in `PATH` (Homebrew wine works).
3. Force x86_64 wine to avoid `wineserver` failures by placing a wrapper earlier in `PATH`:
   ```bash
   mkdir -p ~/bin
   cat > ~/bin/wine <<'EOF'
   #!/bin/zsh
   exec arch -x86_64 /opt/homebrew/bin/wine "$@"
   EOF
   chmod +x ~/bin/wine
   export PATH="$HOME/bin:$PATH"
   ```
4. Initialize the wine prefix:
   ```bash
   WINEDEBUG=-all wineboot --init
   ```
5. Build Windows artifacts using system wine:
   ```bash
   USE_SYSTEM_WINE=true pnpm run dist:win
   ```
6. For one-off runs without touching `PATH`, use a temporary wrapper:
   ```bash
   mkdir -p /tmp/wine-bin
   cat > /tmp/wine-bin/wine <<'EOF'
   #!/bin/zsh
   exec arch -x86_64 /opt/homebrew/bin/wine "$@"
   EOF
   chmod +x /tmp/wine-bin/wine
   PATH=/tmp/wine-bin:$PATH USE_SYSTEM_WINE=true pnpm run dist:win
   ```

## Native/External Dependencies (How They Ship)
- `apps/server/scripts/build-prod.mjs`: esbuild bundles JS, but native deps stay external (e.g. `playwright-core`).
- **Dependencies Retrieval (`.npmrc`)**: The repo requires a customized `.npmrc` setting `supportedArchitectures` (cpu=x64,arm64; os=darwin,win32,linux; libc=glibc,musl) so that `pnpm install` fetches prebuilt binaries for all architectures. This avoids missing modules when generating lockfiles or testing builds.
- Forge path: `apps/desktop/forge.config.ts`
  - `NATIVE_DEP_ROOTS` lists native/external packages to ship.
  - `hooks.postPackage` copies resolved deps into `Resources/node_modules`. This is the single source of truth for packaging `node_modules` (removed from `package.json` `extraResources` to avoid conflicts).
  - `node-pty/prebuilds` is copied into `Resources/prebuilds`.

### Forge → electron-builder 传递（关键）

打包分两阶段，原生模块需要跨阶段传递：

1. **Forge `postPackage`**：将 `node_modules/` 和 `prebuilds/` 复制到 Forge 产物 `out/{name}-{platform}-{arch}/.../Resources/`
2. **electron-builder `afterPack`**：electron-builder 重新打包时**不会**自动包含 Forge 产物中的这些目录（它只使用 `package.json` 的 `extraResources` 配置），因此 `scripts/afterPack.js` 中的 `copyForgeNativeModules()` 函数负责将 Forge 产物的 `node_modules/` 和 `prebuilds/` 复制到 electron-builder 产物。

**如果 DMG/安装包中缺少原生模块，首先检查 `afterPack.js` 的 `copyForgeNativeModules` 是否正确执行。**

## CI/CD vs Local Build (The Golden Rule)
- **Do not use macOS Wine for production Windows builds.** Due to dependency complexities and Wine instability, all production artifacts should be built via GitHub Actions (`.github/workflows/release.yml`) running on native `macos-latest`, `windows-latest`, and `ubuntu-latest` runners.
- Local macOS cross-compilation is only for quick structural checks (e.g., verifying `Resources/` contents), but resulting binaries (especially for Windows and Linux) may fail at runtime due to missing or mismatched native bindings.

## Artifact Map

## Incremental Update Rules (Runtime)
- Current version source (per component):
  1) `~/.openloaf/updates/local-manifest.json`
  2) bundled `Resources/server.package.json` / `Resources/web.package.json`
- Update only when `remote > current` (semver with prerelease rules).
- Beta channel: if beta missing or older than stable, skip updates.
- Startup cleanup: if bundled version is newer than updated version, remove that component’s `updates/<component>/current` and clear manifest entry.
- Source-of-truth files:
  - `apps/desktop/src/main/incrementalUpdate.ts`
  - `apps/desktop/src/main/incrementalUpdatePolicy.ts`
  - `apps/desktop/src/main/updateConfig.ts`

## Adding or Changing Native Deps (Checklist)
1. If the server code externalizes a package, confirm it exists under `Resources/node_modules`.
2. 在 Forge 的 `NATIVE_DEP_ROOTS`（`forge.config.ts`）中添加新依赖。**不需要**修改 `package.json` 的 `extraResources`，`afterPack.js` 会自动从 Forge 产物传递。
3. If the dependency expects `./prebuilds/...`, ensure it is copied to `Resources/prebuilds`.
4. Repackage and verify in **both** `out/` (Forge 产物) 和 `dist/` (electron-builder 产物) 的 `Resources/` 目录。

## Verification
- 需要检查**两个**产物目录的 `Resources/`：
  - **Forge 产物**：`apps/desktop/out/OpenLoaf-darwin-arm64/OpenLoaf.app/Contents/Resources/`
  - **Builder 产物**（最终 DMG/ZIP 来源）：`apps/desktop/dist/mac-arm64/OpenLoaf.app/Contents/Resources/`
- 确认以下内容都存在：
  - `server.mjs`, `seed.db`, `out/` — 来自 `extraResources` 配置
  - `node_modules/sharp/`, `node_modules/@img/`, `node_modules/libsql/` 等 — 来自 `afterPack.js` 的 Forge→Builder 传递
  - `prebuilds/<platform>` — 同上

## Common Failure Patterns
- `Cannot find module './prebuilds/.../pty.node'`: missing `Resources/prebuilds` (node-pty).
- `Cannot find module 'playwright-core'`: missing `Resources/node_modules` or `NODE_PATH` not set.
- Web loads blank: `apps/web/out` missing or not copied to `Resources/out`.
- About shows `vbundled`: `Resources/server.package.json` / `web.package.json` missing (Forge `extraResource` flattens basenames).
  - Fix: copy and rename in `apps/desktop/forge.config.ts` `postPackage` hook.
- `SQLITE_ERROR: no such table ...` right after install (Windows): DB seed copy failed and `~/.openloaf/openloaf.db` is empty (0 bytes) or path joined incorrectly for `file:C:\...`.
  - Fix: ensure `apps/desktop/src/main/services/prodServices.ts` treats Windows absolute/UNC paths as absolute in `resolveFilePathFromDatabaseUrl` and re-initializes when DB file is 0 bytes.
  - Quick workaround: delete `~/.openloaf/openloaf.db` and copy `Resources/seed.db` to `~/.openloaf/openloaf.db`, then relaunch.
- App cannot quit after confirmation (Windows titlebar overlay): sync confirm blocks close event, leaving the window in a closing state.
  - Fix: switch to async `dialog.showMessageBox` and centralize quit flow in `apps/desktop/src/main/windows/mainWindow.ts`, re-focus window on cancel, and schedule a force-exit timeout.
- `wineserver: Can't check in server_mach_port` (macOS build for Windows): start XQuartz, log out/in, and force x86_64 wine via wrapper + `USE_SYSTEM_WINE=true`.
- `Cannot find module 'sharp'`（打包后运行时报错）：原生模块未从 Forge 产物传递到 electron-builder 产物。
  - 检查 `afterPack.js` 的 `copyForgeNativeModules()` 日志是否输出 `[afterPack] copied node_modules/ from Forge output`。
  - 检查 `dist/mac-arm64/OpenLoaf.app/Contents/Resources/node_modules/sharp/` 是否存在。
  - 如果 Forge 产物路径不匹配（产品名或架构变更），需更新 `afterPack.js` 中的路径拼接逻辑。

## Source Files to Read First
- `apps/desktop/package.json`
- `apps/desktop/forge.config.ts`
- `apps/server/scripts/build-prod.mjs`
- `apps/web/next.config.js`
- `apps/desktop/src/main/services/prodServices.ts`
- `apps/desktop/src/main/windows/mainWindow.ts`
- `apps/desktop/README.md`
