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
  return compareVersions(bundled, updated) > 0;
}

/**
 * Gate beta manifest updates against the stable manifest.
 * Returns a sanitized manifest and whether updates should be skipped.
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
  if (!hasBetaComponent) {
    return {
      manifest: stripUpdateComponents(beta),
      skipped: true,
      reason: "beta-not-found",
    };
  }

  if (stable) {
    const stableHasServer = Boolean(stable.server);
    const stableHasWeb = Boolean(stable.web);

    // 中文注释：beta 缺组件或版本落后时直接跳过本次更新。
    if ((stableHasServer && !beta.server) || (stableHasWeb && !beta.web)) {
      return {
        manifest: stripUpdateComponents(beta),
        skipped: true,
        reason: "beta-missing-component",
      };
    }

    if (
      stable.server &&
      beta.server &&
      compareVersions(beta.server.version, stable.server.version) < 0
    ) {
      return {
        manifest: stripUpdateComponents(beta),
        skipped: true,
        reason: "beta-older-than-stable-server",
      };
    }

    if (
      stable.web &&
      beta.web &&
      compareVersions(beta.web.version, stable.web.version) < 0
    ) {
      return {
        manifest: stripUpdateComponents(beta),
        skipped: true,
        reason: "beta-older-than-stable-web",
      };
    }
  }

  return { manifest: beta, skipped: false };
}
