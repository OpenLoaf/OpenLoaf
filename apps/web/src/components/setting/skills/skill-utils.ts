/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import {
  buildFileUriFromRoot,
  buildUriFromRoot,
} from "@/components/project/filesystem/utils/file-system-utils";
import { useLayoutState } from "@/hooks/use-layout-state";
import { queryClient, trpc } from "@/utils/trpc";
import { toast } from "sonner";

/** Normalize a local path string for URI building. */
export function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

/** Convert a local path into file:// uri. */
export function toFileUri(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("file://")) return trimmed;
  const normalized = normalizePath(trimmed);
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }
  if (normalized.startsWith("/")) {
    return `file://${encodeURI(normalized)}`;
  }
  return `file:///${encodeURI(normalized)}`;
}

/** Resolve the skill folder uri from a skill file path. */
export function resolveSkillFolderUri(
  skillPath: string,
  baseRootUri?: string,
): string | undefined {
  if (!skillPath) return undefined;
  if (skillPath.startsWith("file://")) {
    try {
      const url = new URL(skillPath);
      const filePath = decodeURIComponent(url.pathname);
      const dirPath = normalizePath(filePath).replace(/\/[^/]*$/, "");
      return dirPath ? toFileUri(dirPath) : skillPath;
    } catch {
      return skillPath;
    }
  }
  const normalizedSkillPath = normalizePath(skillPath).replace(/\/+$/, "");
  const lastSlashIndex = normalizedSkillPath.lastIndexOf("/");
  const directoryPath =
    lastSlashIndex >= 0 ? normalizedSkillPath.slice(0, lastSlashIndex) : "";
  const isAbsolutePath =
    normalizedSkillPath.startsWith("/") || /^[A-Za-z]:\//.test(normalizedSkillPath);
  if (!directoryPath) {
    return baseRootUri ?? toFileUri(normalizedSkillPath);
  }
  if (baseRootUri) {
    try {
      const rootUrl = new URL(baseRootUri);
      const rootPath = normalizePath(decodeURIComponent(rootUrl.pathname)).replace(/\/$/, "");
      if (directoryPath.startsWith(rootPath)) {
        const relative = directoryPath.slice(rootPath.length).replace(/^\/+/, "");
        return relative ? buildUriFromRoot(baseRootUri, relative) : baseRootUri;
      }
    } catch {
      // ignore and fallback to file uri
    }
  }
  if (!isAbsolutePath && baseRootUri) {
    return buildUriFromRoot(baseRootUri, directoryPath.replace(/^\/+/, ""));
  }
  return toFileUri(directoryPath);
}

/** Resolve skill file uri for preview. */
export function resolveSkillUri(skillPath: string, rootUri?: string): string | undefined {
  if (!skillPath) return undefined;
  if (skillPath.startsWith("file://")) return skillPath;
  if (!rootUri) return toFileUri(skillPath);
  try {
    const rootUrl = new URL(rootUri);
    const rootPath = normalizePath(decodeURIComponent(rootUrl.pathname)).replace(/\/$/, "");
    const normalizedSkillPath = normalizePath(skillPath);
    if (normalizedSkillPath.startsWith(rootPath)) {
      const relative = normalizedSkillPath.slice(rootPath.length).replace(/^\/+/, "");
      if (!relative) return rootUri;
      if (rootUri.startsWith("file://")) {
        return buildFileUriFromRoot(rootUri, relative);
      }
      return buildUriFromRoot(rootUri, relative);
    }
  } catch {
    return toFileUri(skillPath);
  }
  return toFileUri(skillPath);
}

/** Open a specific skill's folder preview in the stack by skill name. */
export async function openSkillInStack(skillName: string, projectId?: string) {
  const { pushStackItem } = useLayoutState.getState();

  const queryOptions = projectId
    ? trpc.settings.getSkills.queryOptions({ projectId })
    : trpc.settings.getSkills.queryOptions();
  const skills = await queryClient.fetchQuery({
    ...queryOptions,
    staleTime: 5 * 60 * 1000,
  }) as Array<{
    name: string;
    originalName: string;
    path: string;
    scope: "global" | "project";
    ignoreKey: string;
  }>;

  const skill = skills.find((s) => s.originalName === skillName || s.name === skillName);
  if (!skill) {
    pushStackItem({
      id: "skill-settings",
      sourceKey: "skill-settings",
      component: "skill-settings",
      title: "技能",
      ...(projectId ? { params: { projectId } } : {}),
    });
    return;
  }

  const rootUri = resolveSkillFolderUri(skill.path);
  if (!rootUri) return;
  const currentUri = resolveSkillUri(skill.path, rootUri);
  const stackKey = skill.ignoreKey.trim() || skill.path || skill.name;
  const titlePrefix = skill.scope === "global" ? "全局" : "项目";

  pushStackItem({
    id: `skill:${skill.scope}:${stackKey}`,
    sourceKey: `skill:${skill.scope}:${stackKey}`,
    component: "folder-tree-preview",
    title: `${titlePrefix} · ${skill.name}`,
    params: {
      rootUri,
      currentUri,
      currentEntryKind: "file",
      projectId: skill.scope === "project" ? projectId : undefined,
      projectTitle: skill.name,
      __skillFolderPath: skill.path.replace(/[/\\]SKILL\.md$/i, ''),
    },
  });
}

/** Download a skill folder as a zip archive. Shows a loading toast during packaging. */
export async function exportSkillAsZip(skillFolderPath: string): Promise<boolean> {
  const toastId = toast.loading("正在打包技能…");
  try {
    const result = await queryClient.fetchQuery(
      trpc.settings.exportSkill.queryOptions({ skillFolderPath }),
    );
    if (!result.ok || !result.contentBase64 || !result.fileName) {
      toast.dismiss(toastId);
      return false;
    }

    toast.dismiss(toastId);

    // Electron: use native save dialog
    const electronApi = window.openloafElectron;
    if (electronApi?.saveFile) {
      const res = await electronApi.saveFile({
        contentBase64: result.contentBase64,
        suggestedName: result.fileName,
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      });
      return res.ok;
    }

    // Web fallback: trigger download via blob
    const binary = atob(result.contentBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    toast.dismiss(toastId);
    throw err;
  }
}

/** Resolve skills root uri from a single skill path. */
export function resolveSkillsRootUri(skillPath: string): string | undefined {
  if (!skillPath) return undefined;
  const normalizedPath = normalizePath(skillPath).replace(/\/+$/, "");
  const lastSlashIndex = normalizedPath.lastIndexOf("/");
  if (lastSlashIndex < 0) return undefined;
  const skillDirPath = normalizedPath.slice(0, lastSlashIndex);
  const parentSlashIndex = skillDirPath.lastIndexOf("/");
  if (parentSlashIndex < 0) return undefined;
  return toFileUri(skillDirPath.slice(0, parentSlashIndex));
}
