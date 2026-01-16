"use client";

import * as React from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { AnimatedFolder } from "@/components/ui/3d-folder";
import { useProjects } from "@/hooks/use-projects";
import { getPreviewEndpoint } from "@/lib/image/uri";
import type { ProjectNode } from "@tenas-ai/api/services/projectTreeService";
import { trpc } from "@/utils/trpc";
import { IMAGE_EXTS } from "@/components/project/filesystem/components/FileSystemEntryVisual";
import {
  buildUriFromRoot,
  getDisplayPathFromUri,
  getEntryExt,
  normalizeProjectRelativePath,
  parseScopedProjectPath,
  type FileSystemEntry,
} from "@/components/project/filesystem/utils/file-system-utils";

type FolderProject = {
  /** Project id for the preview card. */
  id: string;
  /** Preview image url. */
  image: string;
  /** Preview title. */
  title: string;
};

/** Default preview cards for the widget. */
const FALLBACK_PROJECTS: FolderProject[] = [];

/** Resolve a friendly folder title based on the selected URI. */
function resolveFolderTitle(folderUri?: string) {
  if (!folderUri) return "Folder";
  const displayPath = getDisplayPathFromUri(folderUri);
  const parts = displayPath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "Folder";
}

type ResolvedFolderInfo = {
  /** Project id from scoped path. */
  projectId: string;
  /** Relative path under project root. */
  relativePath: string;
  /** Folder uri in file:// scheme. */
  fileUri: string;
};

/** Flatten project tree into root entries. */
function flattenProjectTree(nodes?: ProjectNode[]): ProjectNode[] {
  const results: ProjectNode[] = [];
  const walk = (items?: ProjectNode[]) => {
    items?.forEach((item) => {
      results.push(item);
      if (item.children?.length) {
        walk(item.children);
      }
    });
  };
  walk(nodes);
  return results;
}

/** Resolve scoped folder reference into file uri metadata. */
function resolveFolderInfo(folderUri: string, roots: ProjectNode[]): ResolvedFolderInfo | null {
  const parsed = parseScopedProjectPath(folderUri);
  const projectId = parsed?.projectId ?? "";
  const relativePath = parsed?.relativePath ?? "";
  if (!projectId) return null;
  const root = roots.find((item) => item.projectId === projectId);
  if (!root?.rootUri) return null;
  const fileUri = buildUriFromRoot(root.rootUri, relativePath);
  if (!fileUri) return null;
  return { projectId, relativePath, fileUri };
}

export interface ThreeDFolderWidgetProps {
  /** Optional folder display title override. */
  title?: string;
  /** Selected folder reference. */
  folderUri?: string;
  /** Optional preview projects override. */
  projects?: FolderProject[];
}

/** Render the 3D folder widget preview. */
export default function ThreeDFolderWidget({
  title,
  folderUri,
  projects,
}: ThreeDFolderWidgetProps) {
  const resolvedTitle = React.useMemo(() => {
    // 中文注释：优先使用外部传入的标题，其次从目录路径提取显示名。
    if (title && title.trim().length > 0) return title.trim();
    return resolveFolderTitle(folderUri);
  }, [folderUri, title]);

  const projectsQuery = useProjects();
  const projectRoots = React.useMemo(
    () => flattenProjectTree(projectsQuery.data),
    [projectsQuery.data]
  );
  const resolvedFolder = React.useMemo(() => {
    if (!folderUri) return null;
    return resolveFolderInfo(folderUri, projectRoots);
  }, [folderUri, projectRoots]);

  const listQuery = useQuery(
    trpc.fs.list.queryOptions(
      resolvedFolder?.fileUri ? { uri: resolvedFolder.fileUri, includeHidden: false } : skipToken
    )
  );
  const folderEntries = (listQuery.data?.entries ?? []) as FileSystemEntry[];
  const imageEntries = React.useMemo(
    () =>
      folderEntries.filter(
        (entry) => entry.kind === "file" && IMAGE_EXTS.has(getEntryExt(entry))
      ),
    [folderEntries]
  );
  const fileEntries = React.useMemo(
    () =>
      folderEntries.filter(
        (entry) => entry.kind === "file" && !IMAGE_EXTS.has(getEntryExt(entry))
      ),
    [folderEntries]
  );

  const previewProjects = React.useMemo<FolderProject[]>(() => {
    if (!resolvedFolder) return projects ?? FALLBACK_PROJECTS;
    // 中文注释：有图片时优先展示图片，数量不足时不补文件。
    if (imageEntries.length > 0) {
      return imageEntries.slice(0, 3).map((entry) => {
        const entryPath = [resolvedFolder.relativePath, entry.name].filter(Boolean).join("/");
        const relativePath = normalizeProjectRelativePath(entryPath);
        return {
          id: entry.uri,
          image: getPreviewEndpoint(relativePath, { projectId: resolvedFolder.projectId }),
          title: entry.name,
        };
      });
    }
    // 中文注释：无图片时用文件名占位展示。
    if (fileEntries.length > 0) {
      return fileEntries.slice(0, 3).map((entry) => ({
        id: entry.uri,
        image: "",
        title: entry.name,
      }));
    }
    return projects ?? FALLBACK_PROJECTS;
  }, [fileEntries, imageEntries, projects, resolvedFolder]);

  return (
    <div className="flex h-full w-full items-center justify-center min-h-[360px]">
      <AnimatedFolder
        title={resolvedTitle}
        projects={previewProjects}
        className="w-full bg-transparent border-transparent hover:border-transparent shadow-none hover:shadow-none [&>div:nth-child(2)]:mb-1 [&>h3]:mt-1 [&>p]:hidden [&>div:last-child]:hidden"
      />
    </div>
  );
}
