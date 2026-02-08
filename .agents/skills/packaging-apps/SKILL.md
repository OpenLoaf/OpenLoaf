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

## Artifact Map
- Server bundle: `apps/server/dist/server.mjs` and `apps/server/dist/seed.db`.
- Web export: `apps/web/out/` (Next `output: \"export\"`).
- Forge package output: `apps/desktop/out/<platform>/.../Resources/`.
- Builder output: `apps/desktop/dist/<platform>/`.
- Version metadata in Resources:
  - `server.package.json` and `web.package.json` (for bundled version display/compare).

## Native/External Dependencies (How They Ship)
- `apps/server/scripts/build-prod.mjs`: esbuild bundles JS, but native deps stay external (e.g. `playwright-core`).
- Forge path: `apps/desktop/forge.config.ts`
  - `NATIVE_DEP_ROOTS` lists native/external packages to ship.
  - `hooks.postPackage` copies resolved deps into `Resources/node_modules`.
  - `node-pty/prebuilds` is copied into `Resources/prebuilds`.
- Builder path: `apps/desktop/package.json` → `build.extraResources` lists `node_modules/*` and `prebuilds` per platform.
- Runtime resolution: `apps/desktop/src/main/index.ts` and `apps/desktop/src/main/services/prodServices.ts` set `NODE_PATH` and resolve `process.resourcesPath`.

## Incremental Update Rules (Runtime)
- Current version source (per component):
  1) `~/.tenas/updates/local-manifest.json`
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
2. Add new native deps to `NATIVE_DEP_ROOTS` (Forge) and `build.extraResources` (Builder) as needed.
3. If the dependency expects `./prebuilds/...`, ensure it is copied to `Resources/prebuilds`.
4. Repackage and verify in the packaged `Resources/` directory.

## Verification
- Inspect packaged `Resources/` to confirm:
  - `server.mjs`, `seed.db`, `out/` exist
  - `node_modules/<native>` exists
  - `prebuilds/<platform>` exists
- Typical check (macOS example):
  - `apps/desktop/out/Tenas-darwin-arm64/Tenas.app/Contents/Resources/`

## Common Failure Patterns
- `Cannot find module './prebuilds/.../pty.node'`: missing `Resources/prebuilds` (node-pty).
- `Cannot find module 'playwright-core'`: missing `Resources/node_modules` or `NODE_PATH` not set.
- Web loads blank: `apps/web/out` missing or not copied to `Resources/out`.
- About shows `vbundled`: `Resources/server.package.json` / `web.package.json` missing (Forge `extraResource` flattens basenames).
  - Fix: copy and rename in `apps/desktop/forge.config.ts` `postPackage` hook.

## Source Files to Read First
- `apps/desktop/package.json`
- `apps/desktop/forge.config.ts`
- `apps/server/scripts/build-prod.mjs`
- `apps/web/next.config.js`
- `apps/desktop/src/main/services/prodServices.ts`
- `apps/desktop/README.md`
