/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { getOpenLoafRootDir } from "@openloaf/config";
import { toFileUriWithoutEncoding } from "./fileUri";
import { upsertProjectRegistryEntry } from "./projectRegistryConfig";
import { PROJECT_META_DIR, PROJECT_META_FILE } from "./projectTreeService";

const TEMP_STORAGE_DIR = "temp";
const PROJECT_ID_PREFIX = "proj_";

/** Get the temp project storage root: ~/.openloaf/temp/ */
export function getTempStorageRoot(): string {
  const root = path.join(getOpenLoafRootDir(), TEMP_STORAGE_DIR);
  return root;
}

/** Create a temp project, register it, and return its id + rootPath. */
export async function createTempProject(opts?: {
  title?: string;
  sessionId?: string;
}): Promise<{ projectId: string; rootPath: string }> {
  const projectId = `${PROJECT_ID_PREFIX}${randomUUID()}`;
  const tempRoot = getTempStorageRoot();
  const projectRoot = path.join(tempRoot, projectId);
  const metaDir = path.join(projectRoot, PROJECT_META_DIR);
  await fs.mkdir(metaDir, { recursive: true });

  const now = new Date().toISOString();
  const config = {
    schema: 1,
    projectId,
    title: opts?.title || "Temp Project",
    projectType: "temp" as const,
    projects: {},
    initializedFeatures: ["canvas"],
    tempMeta: {
      sessionId: opts?.sessionId ?? null,
      createdAt: now,
    },
  };

  const metaPath = path.join(metaDir, PROJECT_META_FILE);
  const tmpPath = `${metaPath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), "utf-8");
  await fs.rename(tmpPath, metaPath);

  const rootUri = toFileUriWithoutEncoding(projectRoot);
  upsertProjectRegistryEntry(projectId, rootUri);

  return { projectId, rootPath: projectRoot };
}

/** Promote a temp project to a permanent project. */
export async function promoteTempProject(
  projectId: string,
  opts?: { title?: string },
): Promise<void> {
  const tempRoot = getTempStorageRoot();
  const projectRoot = path.join(tempRoot, projectId);
  const metaPath = path.join(projectRoot, PROJECT_META_DIR, PROJECT_META_FILE);

  let raw: string;
  try {
    raw = await fs.readFile(metaPath, "utf-8");
  } catch {
    throw new Error("Temp project not found.");
  }

  const config = JSON.parse(raw) as Record<string, unknown>;
  if (opts?.title) {
    config.title = opts.title;
  }
  config.projectType = "general";
  delete config.tempMeta;

  const tmpPath = `${metaPath}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), "utf-8");
  await fs.rename(tmpPath, metaPath);
}
