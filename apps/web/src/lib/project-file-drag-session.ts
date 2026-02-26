/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

export type ProjectFileDragSession = {
  /** The session id. */
  id: string;
  /** The project id of the drag source. */
  projectId: string;
  /** The root uri of the project. */
  rootUri?: string;
  /** The project-relative entry uris. */
  entryUris: string[];
  /** The scoped file refs used by chat input. */
  fileRefs: string[];
  /** The local paths used by native drag. */
  localPaths: string[];
  /** The timestamp when the session was created. */
  createdAt: number;
};

// 当前活跃的 drag session。
let activeSession: ProjectFileDragSession | null = null;
// 用于自动清理 drag session 的定时器。
let activeSessionTimer: number | null = null;

/** Normalize a local path string for comparison. */
function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

/** Resolve a local path from a File object in Electron. */
function resolveFilePathFromFile(file: File): string | null {
  const candidate = (file as File & { path?: string }).path;
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (trimmed) return normalizePath(trimmed);
  }
  if (typeof window !== "undefined" && window.openloafElectron?.getPathForFile) {
    try {
      const resolved = window.openloafElectron.getPathForFile(file);
      if (resolved) return normalizePath(String(resolved));
    } catch {
      // 中文注释：bridge 取路径失败时回退到 file.path。
    }
  }
  return null;
}

/** Collect drop paths from a DataTransfer payload. */
function collectDropPaths(dataTransfer: DataTransfer): string[] {
  const paths = new Set<string>();
  // 中文注释：优先读取 File 列表。
  const files = Array.from(dataTransfer.files ?? []);
  for (const file of files) {
    const resolved = resolveFilePathFromFile(file);
    if (resolved) paths.add(resolved);
  }
  // 中文注释：补充读取 text/uri-list 与 text/plain。
  const rawText = [
    dataTransfer.getData("text/uri-list"),
    dataTransfer.getData("text/plain"),
  ]
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));
  for (const raw of rawText) {
    let resolved = raw;
    if (raw.startsWith("file://")) {
      try {
        const url = new URL(raw);
        resolved = decodeURIComponent(url.pathname);
      } catch {
        continue;
      }
    }
    if (!resolved) continue;
    paths.add(normalizePath(resolved));
  }
  return Array.from(paths);
}

/** Store the active drag session and schedule cleanup. */
export function setProjectFileDragSession(
  session: ProjectFileDragSession,
  ttlMs = 30_000
) {
  // 中文注释：写入 session 时统一规范化路径，减少比对误差。
  activeSession = {
    ...session,
    localPaths: session.localPaths.map((item) => normalizePath(item)),
  };
  if (activeSessionTimer !== null) {
    window.clearTimeout(activeSessionTimer);
    activeSessionTimer = null;
  }
  if (typeof window !== "undefined") {
    activeSessionTimer = window.setTimeout(() => {
      clearProjectFileDragSession("timeout");
    }, ttlMs);
  }
}

/** Get the current drag session. */
export function getProjectFileDragSession(): ProjectFileDragSession | null {
  return activeSession;
}

/** Clear the current drag session. */
export function clearProjectFileDragSession(reason?: string) {
  // 中文注释：主动清理 session，避免后续拖拽误判。
  activeSession = null;
  if (activeSessionTimer !== null) {
    window.clearTimeout(activeSessionTimer);
    activeSessionTimer = null;
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("openloaf:project-file-drag-session-clear", {
        detail: { reason: reason ?? "" },
      })
    );
  }
}

/** Match the current drag session against a DataTransfer payload. */
export function matchProjectFileDragSession(
  dataTransfer: DataTransfer
): ProjectFileDragSession | null {
  const session = activeSession;
  if (!session) return null;
  const dropPaths = collectDropPaths(dataTransfer);
  if (dropPaths.length === 0) return null;
  const sessionPaths = new Set(session.localPaths.map((item) => normalizePath(item)));
  const matches = dropPaths.every((item) => sessionPaths.has(normalizePath(item)));
  return matches ? session : null;
}
