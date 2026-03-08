/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
export type IncrementalComponentManifest = {
  version: string;
};

export type IncrementalRemoteManifest<
  TComponent extends IncrementalComponentManifest = IncrementalComponentManifest,
> = {
  schemaVersion: number;
  server?: TComponent;
  web?: TComponent;
  electron?: { minVersion?: string };
};

export type BetaGateResult<
  TComponent extends IncrementalComponentManifest = IncrementalComponentManifest,
> = {
  manifest: IncrementalRemoteManifest<TComponent>;
  skipped: boolean;
  reason?: string;
};

/** Return a manifest that keeps metadata but drops updateable components. */
function stripUpdateComponents<TComponent extends IncrementalComponentManifest>(
  manifest: IncrementalRemoteManifest<TComponent>,
): IncrementalRemoteManifest<TComponent> {
  return {
    schemaVersion: manifest.schemaVersion,
    electron: manifest.electron,
  };
}

/** Pick the component with the higher version; return undefined if both are absent. */
function pickHigherVersion<TComponent extends IncrementalComponentManifest>(
  a: TComponent | undefined,
  b: TComponent | undefined,
): TComponent | undefined {
  if (!a) return b;
  if (!b) return a;
  return compareVersions(a.version, b.version) >= 0 ? a : b;
}

/** Merge electron metadata, taking the higher minVersion from either source. */
function mergeElectronMeta(
  a?: { minVersion?: string },
  b?: { minVersion?: string },
): { minVersion?: string } | undefined {
  const aMin = a?.minVersion;
  const bMin = b?.minVersion;
  if (!aMin && !bMin) return a ?? b;
  if (!aMin) return b;
  if (!bMin) return a;
  return compareVersions(aMin, bMin) >= 0 ? a : b;
}

type ParsedSemver = {
  core: number[];
  prerelease: Array<string | number> | null;
};

/** Parse semver-like strings (supports prerelease identifiers). */
function parseSemver(raw: string): ParsedSemver | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const [corePart, prereleasePart] = trimmed.split("-", 2);
  const coreItems = corePart.split(".");
  if (coreItems.some((item) => item.length === 0)) return null;
  const core = coreItems.map((item) => Number(item));
  if (core.some((item) => Number.isNaN(item))) return null;
  const prerelease = prereleasePart
    ? prereleasePart.split(".").map((item) => {
        if (/^\d+$/.test(item)) return Number(item);
        return item;
      })
    : null;
  return { core, prerelease };
}

/** Compare semver-like versions (prerelease < release). */
export function compareVersions(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;

  const len = Math.max(pa.core.length, pb.core.length);
  for (let i = 0; i < len; i += 1) {
    const na = pa.core[i] ?? 0;
    const nb = pb.core[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }

  if (!pa.prerelease && !pb.prerelease) return 0;
  if (!pa.prerelease) return 1;
  if (!pb.prerelease) return -1;

  const preLen = Math.max(pa.prerelease.length, pb.prerelease.length);
  for (let i = 0; i < preLen; i += 1) {
    const aId = pa.prerelease[i];
    const bId = pb.prerelease[i];
    if (aId === undefined) return -1;
    if (bId === undefined) return 1;
    if (aId === bId) continue;
    const aNum = typeof aId === "number";
    const bNum = typeof bId === "number";
    if (aNum && bNum) {
      return aId < bId ? -1 : 1;
    }
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    return String(aId) < String(bId) ? -1 : 1;
  }
  return 0;
}

/** Decide whether remote version is newer than current. */
export function isRemoteNewer(
  current?: string | null,
  remote?: string | null,
): boolean {
  if (!remote) return false;
  const parsedRemote = parseSemver(remote);
  if (!parsedRemote) return false;
  const parsedCurrent = current ? parseSemver(current) : null;
  // 中文注释：当前版本缺失时允许更新，避免被未知版本阻塞。
  if (!parsedCurrent) return true;
  return compareVersions(remote, current) > 0;
}

/** Decide whether bundled version should override updated version. */
export function shouldUseBundled(
  bundled?: string | null,
  updated?: string | null,
): boolean {
  if (!bundled || !updated) return false;
  // 版本相同时优先使用打包版本，确保 Web 和 Server 来自同一次构建。
  return compareVersions(bundled, updated) >= 0;
}

/**
 * Gate beta manifest updates against the stable manifest.
 *
 * Strategy: for each component (server, web), independently pick whichever
 * version is higher between beta and stable. This ensures beta users always
 * get the best available version — even when beta lags behind stable for one
 * component while leading for another.
 */
export function gateBetaManifest<
  TComponent extends IncrementalComponentManifest,
>(args: {
  beta: IncrementalRemoteManifest<TComponent>;
  stable?: IncrementalRemoteManifest<TComponent> | null;
}): BetaGateResult<TComponent> {
  const { beta } = args;
  const stable = args.stable ?? null;

  const hasBetaComponent = Boolean(beta.server || beta.web);
  const hasStableComponent = Boolean(stable?.server || stable?.web);

  // 双方都无组件 → 跳过
  if (!hasBetaComponent && !hasStableComponent) {
    return {
      manifest: stripUpdateComponents(beta),
      skipped: true,
      reason: "beta-not-found",
    };
  }

  // beta 无组件但 stable 有 → 回退到 stable 组件
  if (!hasBetaComponent && hasStableComponent) {
    return {
      manifest: {
        ...beta,
        server: stable!.server,
        web: stable!.web,
        electron: stable!.electron ?? beta.electron,
      },
      skipped: false,
      reason: "beta-empty-fallback-to-stable",
    };
  }

  // 有 stable 可比 → 逐组件取高版本，electron.minVersion 也取高
  if (stable && hasStableComponent) {
    return {
      manifest: {
        ...beta,
        server: pickHigherVersion(beta.server, stable.server),
        web: pickHigherVersion(beta.web, stable.web),
        electron: mergeElectronMeta(beta.electron, stable.electron),
      },
      skipped: false,
      reason: "beta-merged-with-stable",
    };
  }

  // 无 stable 可比 → 直接用 beta
  return { manifest: beta, skipped: false, reason: "beta-only" };
}
