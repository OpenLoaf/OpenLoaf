import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import ffmpeg from "fluent-ffmpeg";
import { getProjectRootPath } from "@tenas-ai/api/services/vfsService";

export type HlsManifestResult = {
  /** Manifest content with segment URLs. */
  manifest: string;
  /** Cache token for segment access. */
  token: string;
};

const HLS_CACHE_DIR = ".tenas-cache/hls";

/** Normalize a relative path string. */
function normalizeRelativePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}

/** Return true when a path attempts to traverse parents. */
function hasParentTraversal(value: string): boolean {
  return value.split("/").some((segment) => segment === "..");
}

/** Resolve an absolute file path under a project root. */
function resolveProjectFilePath(input: { path: string; projectId: string }) {
  const rootPath = getProjectRootPath(input.projectId);
  if (!rootPath) return null;
  const relativePath = normalizeRelativePath(input.path);
  if (!relativePath || hasParentTraversal(relativePath)) return null;
  const absPath = path.resolve(rootPath, relativePath);
  const rootResolved = path.resolve(rootPath);
  // 逻辑：限制在项目根目录内，避免路径穿越。
  if (absPath !== rootResolved && !absPath.startsWith(rootResolved + path.sep)) {
    return null;
  }
  return { rootPath, absPath, relativePath };
}

/** Build a stable cache key for HLS outputs. */
function buildCacheKey(input: { relativePath: string; stat: { size: number; mtimeMs: number } }) {
  const payload = JSON.stringify({
    path: input.relativePath,
    size: input.stat.size,
    mtime: input.stat.mtimeMs,
  });
  return createHash("sha256").update(payload).digest("hex");
}

/** Ensure HLS assets are generated for the given source. */
async function ensureHlsAssets(input: {
  sourcePath: string;
  cacheDir: string;
  sourceStat: { size: number; mtimeMs: number };
}) {
  const manifestPath = path.join(input.cacheDir, "index.m3u8");
  const manifestStat = await fs.stat(manifestPath).catch(() => null);
  if (manifestStat && manifestStat.mtimeMs >= input.sourceStat.mtimeMs) {
    return manifestPath;
  }
  await fs.mkdir(input.cacheDir, { recursive: true });
  // 逻辑：重新生成 HLS 时覆盖旧文件，保证片段与清单一致。
  await new Promise<void>((resolve, reject) => {
    ffmpeg(input.sourcePath)
      .outputOptions([
        "-y",
        "-preset",
        "veryfast",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-movflags",
        "faststart",
        "-hls_time",
        "4",
        "-hls_playlist_type",
        "vod",
        "-hls_segment_filename",
        path.join(input.cacheDir, "segment_%03d.ts"),
      ])
      .output(manifestPath)
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .run();
  });
  return manifestPath;
}

/** Build a token for segment lookup. */
function buildToken(input: { projectId: string; cacheKey: string }) {
  return `${input.projectId}::${input.cacheKey}`;
}

/** Parse a segment token into project id and cache key. */
export function parseSegmentToken(token: string): { projectId: string; cacheKey: string } | null {
  const parts = token.split("::");
  if (parts.length !== 2) return null;
  const [projectId, cacheKey] = parts.map((value) => value.trim());
  if (!projectId || !cacheKey) return null;
  return { projectId, cacheKey };
}

/** Load HLS manifest content and rewrite segment urls. */
export async function getHlsManifest(input: {
  path: string;
  projectId: string;
}): Promise<HlsManifestResult | null> {
  const resolved = resolveProjectFilePath({ path: input.path, projectId: input.projectId });
  if (!resolved) return null;
  const sourceStat = await fs.stat(resolved.absPath).catch(() => null);
  if (!sourceStat || !sourceStat.isFile()) return null;

  const cacheKey = buildCacheKey({
    relativePath: resolved.relativePath,
    stat: { size: sourceStat.size, mtimeMs: sourceStat.mtimeMs },
  });
  const cacheDir = path.join(resolved.rootPath, HLS_CACHE_DIR, cacheKey);
  const manifestPath = await ensureHlsAssets({
    sourcePath: resolved.absPath,
    cacheDir,
    sourceStat: { size: sourceStat.size, mtimeMs: sourceStat.mtimeMs },
  });

  const token = buildToken({ projectId: input.projectId, cacheKey });
  const raw = await fs.readFile(manifestPath, "utf-8");
  const prefix = `/media/hls/segment/`;
  const lines = raw.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    return `${prefix}${trimmed}?token=${encodeURIComponent(token)}`;
  });
  return { manifest: lines.join("\n"), token };
}

/** Load a cached HLS segment by token and name. */
export async function getHlsSegment(input: {
  token: string;
  name: string;
}): Promise<Uint8Array | null> {
  const parsed = parseSegmentToken(input.token);
  if (!parsed) return null;
  const rootPath = getProjectRootPath(parsed.projectId);
  if (!rootPath) return null;
  if (!input.name || input.name.includes("/") || input.name.includes("\\")) return null;
  if (input.name.includes("..")) return null;
  const segmentPath = path.join(rootPath, HLS_CACHE_DIR, parsed.cacheKey, input.name);
  const buffer = await fs.readFile(segmentPath).catch(() => null);
  if (!buffer) return null;
  return new Uint8Array(buffer);
}
