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
const HLS_QUALITIES = ["1080p", "720p", "source"] as const;

export type HlsQuality = (typeof HLS_QUALITIES)[number];

/** Normalize a relative path string. */
function normalizeRelativePath(input: string): string {
  return input.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}

/** Return true when a path attempts to traverse parents. */
function hasParentTraversal(value: string): boolean {
  return value.split("/").some((segment) => segment === "..");
}

/** Return true when the value is a supported HLS quality. */
export function isHlsQuality(value?: string): value is HlsQuality {
  return Boolean(value && HLS_QUALITIES.includes(value as HlsQuality));
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

/** Resolve the cache directory for a given quality. */
function resolveQualityCacheDir(input: { baseDir: string; quality: HlsQuality }) {
  return path.join(input.baseDir, input.quality);
}

/** Build ffmpeg output options for a given quality. */
function buildHlsOutputOptions(input: { cacheDir: string; quality: HlsQuality }) {
  const options: string[] = [
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
  ];
  if (input.quality === "1080p") {
    // 逻辑：输出 1080p 时强制缩放到高度 1080。
    options.splice(1, 0, "-vf", "scale=-2:1080");
  }
  if (input.quality === "720p") {
    // 逻辑：输出 720p 时强制缩放到高度 720。
    options.splice(1, 0, "-vf", "scale=-2:720");
  }
  return options;
}

/** Build a master playlist for multi-quality HLS. */
function buildMasterPlaylist(input: { path: string; projectId: string }) {
  const makeUrl = (quality: HlsQuality) => {
    const query = new URLSearchParams({
      path: input.path,
      projectId: input.projectId,
      quality,
    });
    return `/media/hls/manifest?${query.toString()}`;
  };
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,NAME=\"1080P\"`,
    makeUrl("1080p"),
    `#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,NAME=\"720P\"`,
    makeUrl("720p"),
    `#EXT-X-STREAM-INF:BANDWIDTH=8000000,NAME=\"原画\"`,
    makeUrl("source"),
  ];
  return lines.join("\n");
}

/** Ensure HLS assets are generated for the given source. */
async function ensureHlsAssets(input: {
  sourcePath: string;
  baseCacheDir: string;
  quality: HlsQuality;
  sourceStat: { size: number; mtimeMs: number };
}) {
  const qualityCacheDir = resolveQualityCacheDir({
    baseDir: input.baseCacheDir,
    quality: input.quality,
  });
  const manifestPath = path.join(qualityCacheDir, "index.m3u8");
  const manifestStat = await fs.stat(manifestPath).catch(() => null);
  if (manifestStat && manifestStat.mtimeMs >= input.sourceStat.mtimeMs) {
    return manifestPath;
  }
  await fs.mkdir(qualityCacheDir, { recursive: true });
  // 逻辑：重新生成 HLS 时覆盖旧文件，保证片段与清单一致。
  await new Promise<void>((resolve, reject) => {
    ffmpeg(input.sourcePath)
      .outputOptions(
        buildHlsOutputOptions({ cacheDir: qualityCacheDir, quality: input.quality })
      )
      .output(manifestPath)
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .run();
  });
  return manifestPath;
}

/** Build a token for segment lookup. */
function buildToken(input: { projectId: string; cacheKey: string; quality: HlsQuality }) {
  return `${input.projectId}::${input.cacheKey}::${input.quality}`;
}

/** Parse a segment token into project id and cache key. */
export function parseSegmentToken(
  token: string
): { projectId: string; cacheKey: string; quality: HlsQuality } | null {
  const parts = token.split("::");
  if (parts.length !== 3) return null;
  const [projectId, cacheKey, qualityRaw] = parts.map((value) => value.trim());
  if (!projectId || !cacheKey || !qualityRaw) return null;
  if (!isHlsQuality(qualityRaw)) return null;
  return { projectId, cacheKey, quality: qualityRaw };
}

/** Load HLS manifest content and rewrite segment urls. */
export async function getHlsManifest(input: {
  path: string;
  projectId: string;
  quality?: HlsQuality;
}): Promise<HlsManifestResult | null> {
  const resolved = resolveProjectFilePath({ path: input.path, projectId: input.projectId });
  if (!resolved) return null;
  const sourceStat = await fs.stat(resolved.absPath).catch(() => null);
  if (!sourceStat || !sourceStat.isFile()) return null;

  const cacheKey = buildCacheKey({
    relativePath: resolved.relativePath,
    stat: { size: sourceStat.size, mtimeMs: sourceStat.mtimeMs },
  });
  const baseCacheDir = path.join(resolved.rootPath, HLS_CACHE_DIR, cacheKey);

  if (!input.quality) {
    return {
      manifest: buildMasterPlaylist({
        path: resolved.relativePath,
        projectId: input.projectId,
      }),
      token: "",
    };
  }

  const manifestPath = await ensureHlsAssets({
    sourcePath: resolved.absPath,
    baseCacheDir,
    quality: input.quality,
    sourceStat: { size: sourceStat.size, mtimeMs: sourceStat.mtimeMs },
  });

  const token = buildToken({ projectId: input.projectId, cacheKey, quality: input.quality });
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
  const segmentPath = path.join(
    rootPath,
    HLS_CACHE_DIR,
    parsed.cacheKey,
    parsed.quality,
    input.name
  );
  const buffer = await fs.readFile(segmentPath).catch(() => null);
  if (!buffer) return null;
  return new Uint8Array(buffer);
}
