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

export type HlsManifestStatus =
  | {
      /** Manifest is ready to serve. */
      status: "ready";
      /** Manifest content with segment URLs. */
      manifest: string;
      /** Cache token for segment access. */
      token: string;
    }
  | {
      /** Manifest is still being generated. */
      status: "building";
    };

export type HlsThumbnailResult = {
  /** VTT content with thumbnail URLs. */
  vtt: string;
  /** Cache token for thumbnail access. */
  token: string;
};

export type HlsProgressStatus = "idle" | "building" | "ready" | "error";

export type HlsProgressResult = {
  /** Current progress status. */
  status: HlsProgressStatus;
  /** Progress percentage from 0-100. */
  percent: number;
};

/** Root cache folder for HLS artifacts. */
const HLS_CACHE_DIR = ".tenas-cache/hls";
/** Supported output quality labels for HLS. */
const HLS_QUALITIES = ["1080p", "720p", "source"] as const;
/** Cache subfolder for thumbnail outputs. */
const HLS_THUMBNAIL_DIR = "thumbnails";
/** Prefix for generated thumbnail filenames. */
const HLS_THUMBNAIL_PREFIX = "thumb_";
/** Seconds between thumbnail captures. */
const HLS_THUMBNAIL_INTERVAL_SECONDS = 4;
/** Target thumbnail width in pixels. */
const HLS_THUMBNAIL_WIDTH = 160;

/** Cached encoder resolution promise. */
let cachedVideoEncoder: Promise<string> | null = null;
/** Track in-flight HLS manifest generations per cache key + quality. */
const hlsManifestTasks = new Map<string, Promise<string>>();
/** Track progress for ongoing HLS manifest generations. */
const hlsManifestProgress = new Map<string, HlsProgressResult>();
/** Track in-flight HLS thumbnail generations per cache key. */
const hlsThumbnailTasks = new Map<string, Promise<string>>();

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

/** Resolve the thumbnail cache directory. */
function resolveThumbnailCacheDir(input: { baseDir: string }) {
  return path.join(input.baseDir, HLS_THUMBNAIL_DIR);
}

/** Resolve the cache directory for a given quality. */
function resolveQualityCacheDir(input: { baseDir: string; quality: HlsQuality }) {
  return path.join(input.baseDir, input.quality);
}

/** Build ffmpeg output options for a given quality. */
function buildHlsOutputOptions(input: {
  cacheDir: string;
  quality: HlsQuality;
  videoEncoder: string;
}) {
  const options: string[] = [
    "-y",
    "-c:v",
    input.videoEncoder,
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
  if (input.videoEncoder === "libx264") {
    // 逻辑：软件编码时改用更快的 preset 降低首次生成耗时。
    options.splice(1, 0, "-preset", "ultrafast", "-crf", "28");
  }
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

/** Resolve the best available video encoder for HLS. */
async function resolveVideoEncoder() {
  if (cachedVideoEncoder) return cachedVideoEncoder;
  cachedVideoEncoder = new Promise((resolve) => {
    ffmpeg.getAvailableEncoders((error, encoders) => {
      if (error || !encoders) {
        resolve("libx264");
        return;
      }
      const encoder = encoders["h264_videotoolbox"];
      // 逻辑：优先使用硬件编码器降低 CPU 压力。
      if (encoder && encoder.type === "video") {
        resolve("h264_videotoolbox");
        return;
      }
      resolve("libx264");
    });
  });
  return cachedVideoEncoder;
}

/** Build an in-flight task key for manifest generation. */
function buildManifestTaskKey(input: { cacheKey: string; quality: HlsQuality }) {
  return `${input.cacheKey}::${input.quality}`;
}

/** Initialize progress tracking for a manifest task. */
function startManifestProgress(input: { key: string }) {
  hlsManifestProgress.set(input.key, { status: "building", percent: 0 });
}

/** Update progress tracking for a manifest task. */
function updateManifestProgress(input: { key: string; percent: number }) {
  const next = Math.max(0, Math.min(100, Math.floor(input.percent)));
  hlsManifestProgress.set(input.key, { status: "building", percent: next });
}

/** Finalize progress tracking for a manifest task. */
function finishManifestProgress(input: { key: string; ok: boolean }) {
  hlsManifestProgress.set(input.key, {
    status: input.ok ? "ready" : "error",
    percent: input.ok ? 100 : 0,
  });
}

/** Start HLS manifest generation if not already running. */
function ensureManifestTask(input: {
  key: string;
  build: () => Promise<string>;
}) {
  const existing = hlsManifestTasks.get(input.key);
  if (existing) return existing;
  startManifestProgress({ key: input.key });
  const task = input
    .build()
    .then((value) => {
      finishManifestProgress({ key: input.key, ok: true });
      return value;
    })
    .catch((error) => {
      finishManifestProgress({ key: input.key, ok: false });
      // 逻辑：生成失败时让后续请求重新触发。
      throw error;
    })
    .finally(() => {
      hlsManifestTasks.delete(input.key);
    });
  hlsManifestTasks.set(input.key, task);
  return task;
}

/** Start HLS thumbnail generation if not already running. */
function ensureThumbnailTask(input: { key: string; build: () => Promise<string> }) {
  const existing = hlsThumbnailTasks.get(input.key);
  if (existing) return existing;
  const task = input
    .build()
    .catch((error) => {
      // 逻辑：生成失败时让后续请求重新触发。
      throw error;
    })
    .finally(() => {
      hlsThumbnailTasks.delete(input.key);
    });
  hlsThumbnailTasks.set(input.key, task);
  return task;
}

/** Format seconds into VTT timestamp. */
function formatVttTimestamp(seconds: number) {
  const totalMs = Math.max(0, Math.floor(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(
    secs
  ).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

/** Probe media metadata to obtain duration in seconds. */
async function probeDurationSeconds(sourcePath: string) {
  return new Promise<number | null>((resolve) => {
    ffmpeg.ffprobe(sourcePath, (error, data) => {
      if (error) {
        resolve(null);
        return;
      }
      const duration = data?.format?.duration;
      resolve(typeof duration === "number" && Number.isFinite(duration) ? duration : null);
    });
  });
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
    // 逻辑：默认优先 720p，避免首次播放等待 1080p 转码完成。
    `#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720,NAME=\"720P\"`,
    makeUrl("720p"),
    `#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,NAME=\"1080P\"`,
    makeUrl("1080p"),
    `#EXT-X-STREAM-INF:BANDWIDTH=8000000,NAME=\"原画\"`,
    makeUrl("source"),
  ];
  return lines.join("\n");
}

/** Build a VTT payload for thumbnail previews. */
function buildThumbnailVtt(input: {
  durationSeconds: number;
  intervalSeconds: number;
  filenames: string[];
}) {
  const lines = ["WEBVTT", ""];
  const duration = Math.max(0, input.durationSeconds);
  input.filenames.forEach((filename, index) => {
    const startSeconds = index * input.intervalSeconds;
    if (startSeconds > duration) return;
    const endSeconds = Math.min(startSeconds + input.intervalSeconds, duration);
    lines.push(
      `${formatVttTimestamp(startSeconds)} --> ${formatVttTimestamp(endSeconds)}`
    );
    lines.push(filename);
    lines.push("");
  });
  return lines.join("\n");
}

/** Ensure HLS assets are generated for the given source. */
async function ensureHlsAssets(input: {
  sourcePath: string;
  baseCacheDir: string;
  quality: HlsQuality;
  sourceStat: { size: number; mtimeMs: number };
  progressKey: string;
}) {
  const qualityCacheDir = resolveQualityCacheDir({
    baseDir: input.baseCacheDir,
    quality: input.quality,
  });
  const manifestPath = path.join(qualityCacheDir, "index.m3u8");
  const manifestStat = await fs.stat(manifestPath).catch(() => null);
  if (manifestStat && manifestStat.mtimeMs >= input.sourceStat.mtimeMs) {
    finishManifestProgress({ key: input.progressKey, ok: true });
    return manifestPath;
  }
  const videoEncoder = await resolveVideoEncoder();
  const durationSeconds = await probeDurationSeconds(input.sourcePath);
  await fs.mkdir(qualityCacheDir, { recursive: true });
  // 逻辑：重新生成 HLS 时覆盖旧文件，保证片段与清单一致。
  await new Promise<void>((resolve, reject) => {
    ffmpeg(input.sourcePath)
      .outputOptions(
        buildHlsOutputOptions({
          cacheDir: qualityCacheDir,
          quality: input.quality,
          videoEncoder,
        })
      )
      .output(manifestPath)
      .on("progress", (progress) => {
        if (!durationSeconds) return;
        const timemark = progress.timemark ?? "00:00:00.000";
        const [h, m, s] = timemark.split(":");
        const seconds =
          Number(h || 0) * 3600 + Number(m || 0) * 60 + Number.parseFloat(s || "0");
        if (!Number.isFinite(seconds)) return;
        // 逻辑：基于处理时长计算真实进度。
        updateManifestProgress({
          key: input.progressKey,
          percent: (seconds / durationSeconds) * 100,
        });
      })
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .run();
  });
  return manifestPath;
}

/** Ensure thumbnail assets are generated for the given source. */
async function ensureThumbnailAssets(input: {
  sourcePath: string;
  baseCacheDir: string;
  sourceStat: { size: number; mtimeMs: number };
}) {
  const thumbnailDir = resolveThumbnailCacheDir({ baseDir: input.baseCacheDir });
  const vttPath = path.join(thumbnailDir, "thumbnails.vtt");
  const vttStat = await fs.stat(vttPath).catch(() => null);
  if (vttStat && vttStat.mtimeMs >= input.sourceStat.mtimeMs) {
    return vttPath;
  }
  await fs.mkdir(thumbnailDir, { recursive: true });
  const existing = await fs.readdir(thumbnailDir).catch(() => []);
  // 逻辑：先清理旧缩略图，避免残留影响新的 VTT。
  await Promise.all(
    existing
      .filter((name) => name === "thumbnails.vtt" || name.startsWith(HLS_THUMBNAIL_PREFIX))
      .map((name) => fs.unlink(path.join(thumbnailDir, name)).catch(() => null))
  );
  // 逻辑：重新生成缩略图时覆盖旧资源，避免内容不一致。
  await new Promise<void>((resolve, reject) => {
    ffmpeg(input.sourcePath)
      .outputOptions([
        "-y",
        "-vf",
        `fps=1/${HLS_THUMBNAIL_INTERVAL_SECONDS},scale=${HLS_THUMBNAIL_WIDTH}:-1:flags=lanczos`,
        "-q:v",
        "5",
      ])
      .output(path.join(thumbnailDir, `${HLS_THUMBNAIL_PREFIX}%04d.jpg`))
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .run();
  });

  const durationSeconds =
    (await probeDurationSeconds(input.sourcePath)) ?? HLS_THUMBNAIL_INTERVAL_SECONDS;
  const files = (await fs.readdir(thumbnailDir)).filter((name) =>
    name.startsWith(HLS_THUMBNAIL_PREFIX)
  );
  files.sort((a, b) => a.localeCompare(b));
  if (!files.length) {
    return vttPath;
  }
  const vtt = buildThumbnailVtt({
    durationSeconds,
    intervalSeconds: HLS_THUMBNAIL_INTERVAL_SECONDS,
    filenames: files,
  });
  await fs.writeFile(vttPath, vtt, "utf-8");
  return vttPath;
}

/** Build a token for segment lookup. */
function buildToken(input: { projectId: string; cacheKey: string; quality: HlsQuality }) {
  return `${input.projectId}::${input.cacheKey}::${input.quality}`;
}

/** Build a token for thumbnail lookup. */
function buildThumbnailToken(input: { projectId: string; cacheKey: string }) {
  return `${input.projectId}::${input.cacheKey}::thumbs`;
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

/** Parse a thumbnail token into project id and cache key. */
export function parseThumbnailToken(
  token: string
): { projectId: string; cacheKey: string } | null {
  const parts = token.split("::");
  if (parts.length !== 3) return null;
  const [projectId, cacheKey, marker] = parts.map((value) => value.trim());
  if (!projectId || !cacheKey || !marker) return null;
  if (marker !== "thumbs") return null;
  return { projectId, cacheKey };
}

/** Load HLS manifest content and rewrite segment urls. */
export async function getHlsManifest(input: {
  path: string;
  projectId: string;
  quality?: HlsQuality;
}): Promise<HlsManifestStatus | null> {
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
      status: "ready",
      manifest: buildMasterPlaylist({
        path: resolved.relativePath,
        projectId: input.projectId,
      }),
      token: "",
    };
  }

  const qualityCacheDir = resolveQualityCacheDir({
    baseDir: baseCacheDir,
    quality: input.quality,
  });
  const manifestPath = path.join(qualityCacheDir, "index.m3u8");
  const manifestStat = await fs.stat(manifestPath).catch(() => null);
  if (!manifestStat || manifestStat.mtimeMs < sourceStat.mtimeMs) {
    const taskKey = buildManifestTaskKey({ cacheKey, quality: input.quality });
    ensureManifestTask({
      key: taskKey,
      build: () =>
        ensureHlsAssets({
          sourcePath: resolved.absPath,
          baseCacheDir,
          quality: input.quality!,
          sourceStat: { size: sourceStat.size, mtimeMs: sourceStat.mtimeMs },
          progressKey: taskKey,
        }),
    });
    return { status: "building" };
  }

  const token = buildToken({ projectId: input.projectId, cacheKey, quality: input.quality });
  const raw = await fs.readFile(manifestPath, "utf-8");
  const prefix = `/media/hls/segment/`;
  const lines = raw.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    return `${prefix}${trimmed}?token=${encodeURIComponent(token)}`;
  });
  return { status: "ready", manifest: lines.join("\n"), token };
}

/** Load current HLS manifest generation progress. */
export async function getHlsProgress(input: {
  path: string;
  projectId: string;
  quality: HlsQuality;
}): Promise<HlsProgressResult | null> {
  const resolved = resolveProjectFilePath({ path: input.path, projectId: input.projectId });
  if (!resolved) return null;
  const sourceStat = await fs.stat(resolved.absPath).catch(() => null);
  if (!sourceStat || !sourceStat.isFile()) return null;
  const cacheKey = buildCacheKey({
    relativePath: resolved.relativePath,
    stat: { size: sourceStat.size, mtimeMs: sourceStat.mtimeMs },
  });
  const taskKey = buildManifestTaskKey({ cacheKey, quality: input.quality });
  const progress = hlsManifestProgress.get(taskKey);
  if (progress) return progress;
  return { status: "idle", percent: 0 };
}
/** Load VTT thumbnails and rewrite thumbnail urls. */
export async function getHlsThumbnails(input: {
  path: string;
  projectId: string;
}): Promise<HlsThumbnailResult | null> {
  const resolved = resolveProjectFilePath({ path: input.path, projectId: input.projectId });
  if (!resolved) return null;
  const sourceStat = await fs.stat(resolved.absPath).catch(() => null);
  if (!sourceStat || !sourceStat.isFile()) return null;

  const cacheKey = buildCacheKey({
    relativePath: resolved.relativePath,
    stat: { size: sourceStat.size, mtimeMs: sourceStat.mtimeMs },
  });
  const baseCacheDir = path.join(resolved.rootPath, HLS_CACHE_DIR, cacheKey);
  const vttPath = await ensureThumbnailTask({
    key: cacheKey,
    build: () =>
      ensureThumbnailAssets({
        sourcePath: resolved.absPath,
        baseCacheDir,
        sourceStat: { size: sourceStat.size, mtimeMs: sourceStat.mtimeMs },
      }),
  });
  const token = buildThumbnailToken({ projectId: input.projectId, cacheKey });
  const raw = await fs.readFile(vttPath, "utf-8");
  const prefix = `/media/hls/thumbnail/`;
  const lines = raw.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed === "WEBVTT") return line;
    if (trimmed.startsWith("#")) return line;
    if (trimmed.includes("-->")) return line;
    return `${prefix}${trimmed}?token=${encodeURIComponent(token)}`;
  });
  return { vtt: lines.join("\n"), token };
}

/** Load a cached HLS segment by token and name. */
export async function getHlsSegment(input: {
  token: string;
  name: string;
}): Promise<Uint8Array<ArrayBuffer> | null> {
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
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return new Uint8Array(arrayBuffer);
}

/** Load a cached thumbnail by token and name. */
export async function getHlsThumbnail(input: {
  token: string;
  name: string;
}): Promise<Uint8Array<ArrayBuffer> | null> {
  const parsed = parseThumbnailToken(input.token);
  if (!parsed) return null;
  const rootPath = getProjectRootPath(parsed.projectId);
  if (!rootPath) return null;
  if (!input.name || input.name.includes("/") || input.name.includes("\\")) return null;
  if (input.name.includes("..")) return null;
  const thumbnailPath = path.join(
    rootPath,
    HLS_CACHE_DIR,
    parsed.cacheKey,
    HLS_THUMBNAIL_DIR,
    input.name
  );
  const buffer = await fs.readFile(thumbnailPath).catch(() => null);
  if (!buffer) return null;
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  return new Uint8Array(arrayBuffer);
}
