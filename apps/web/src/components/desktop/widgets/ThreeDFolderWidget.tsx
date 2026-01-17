"use client";

import * as React from "react";
import { skipToken, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AnimatedFolder } from "@/components/ui/3d-folder";
import { useProjects } from "@/hooks/use-projects";
import { getPreviewEndpoint } from "@/lib/image/uri";
import type { ProjectNode } from "@tenas-ai/api/services/projectTreeService";
import { trpc } from "@/utils/trpc";
import {
  CODE_EXTS,
  DOC_EXTS,
  IMAGE_EXTS,
  MARKDOWN_EXTS,
  PDF_EXTS,
  SPREADSHEET_EXTS,
  getEntryVisual,
  isTextFallbackExt,
} from "@/components/project/filesystem/components/FileSystemEntryVisual";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { useTabs } from "@/hooks/use-tabs";
import {
  buildUriFromRoot,
  getDisplayPathFromUri,
  getEntryExt,
  getRelativePathFromUri,
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
  /** File uri for preview. */
  uri?: string;
  /** File extension for preview. */
  ext?: string;
  /** Project id for preview. */
  projectId?: string;
  /** Root uri for preview resolution. */
  rootUri?: string;
  /** Optional file icon node when no image preview exists. */
  icon?: React.ReactNode;
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
  /** Project root uri for viewer resolution. */
  rootUri: string;
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
  return { projectId, relativePath, fileUri, rootUri: root.rootUri };
}

export interface ThreeDFolderWidgetProps {
  /** Optional folder display title override. */
  title?: string;
  /** Selected folder reference. */
  folderUri?: string;
  /** Optional preview projects override. */
  projects?: FolderProject[];
  /** Optional hover state override from parent boundary. */
  hovered?: boolean;
}

/** Render the 3D folder widget preview. */
export default function ThreeDFolderWidget({
  title,
  folderUri,
  projects,
  hovered,
}: ThreeDFolderWidgetProps) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id ?? "";
  const activeTabId = useTabs((state) => state.activeTabId);
  const pushStackItem = useTabs((state) => state.pushStackItem);
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
      resolvedFolder?.fileUri && workspaceId
        ? {
            workspaceId,
            projectId: resolvedFolder.projectId,
            uri: resolvedFolder.fileUri,
            includeHidden: false,
          }
        : skipToken
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
        const ext = getEntryExt(entry);
        return {
          id: entry.uri,
          image: getPreviewEndpoint(relativePath, { projectId: resolvedFolder.projectId }),
          title: entry.name,
          uri: entry.uri,
          ext,
          projectId: resolvedFolder.projectId,
          rootUri: resolvedFolder.rootUri,
        };
      });
    }
    // 中文注释：无图片时使用文件图标占位展示。
    if (fileEntries.length > 0) {
      return fileEntries.slice(0, 3).map((entry) => ({
        id: entry.uri,
        image: "",
        title: entry.name,
        icon: getEntryVisual({
          kind: "file",
          name: entry.name,
          ext: getEntryExt(entry),
          sizeClassName: "h-12 w-12",
          thumbnailIconClassName: "h-12 w-12 p-2 text-muted-foreground",
        }),
        uri: entry.uri,
        ext: getEntryExt(entry),
        projectId: resolvedFolder.projectId,
        rootUri: resolvedFolder.rootUri,
      }));
    }
    return projects ?? FALLBACK_PROJECTS;
  }, [fileEntries, imageEntries, projects, resolvedFolder]);

  const resolvedHover = hovered ?? false;
  const handleProjectOpen = React.useCallback(
    (project: FolderProject) => {
      if (!activeTabId) {
        toast.error("未找到当前标签页");
        return;
      }
      if (!project.uri) return;

      const ext = (project.ext ?? "").toLowerCase();
      const name = project.title;
      const uri = project.uri;
      const baseParams = {
        uri,
        openUri: uri,
        name,
        ext,
        projectId: project.projectId,
        rootUri: project.rootUri,
      };

      if (IMAGE_EXTS.has(ext)) {
        pushStackItem(activeTabId, {
          id: uri,
          component: "image-viewer",
          title: name,
          params: baseParams,
        });
        return;
      }
      if (MARKDOWN_EXTS.has(ext)) {
        pushStackItem(activeTabId, {
          id: uri,
          component: "markdown-viewer",
          title: name,
          params: { ...baseParams, __customHeader: true },
        });
        return;
      }
      if (CODE_EXTS.has(ext) || isTextFallbackExt(ext)) {
        pushStackItem(activeTabId, {
          id: uri,
          component: "code-viewer",
          title: name,
          params: baseParams,
        });
        return;
      }
      if (PDF_EXTS.has(ext)) {
        if (!project.projectId || !project.rootUri) {
          toast.error("未找到项目路径");
          return;
        }
        const relativePath = getRelativePathFromUri(project.rootUri, uri);
        if (!relativePath) {
          toast.error("无法解析PDF路径");
          return;
        }
        pushStackItem(activeTabId, {
          id: uri,
          component: "pdf-viewer",
          title: name,
          params: {
            ...baseParams,
            uri: relativePath,
            __customHeader: true,
          },
        });
        return;
      }
      if (DOC_EXTS.has(ext)) {
        pushStackItem(activeTabId, {
          id: uri,
          component: "doc-viewer",
          title: name,
          params: { ...baseParams, __customHeader: true },
        });
        return;
      }
      if (SPREADSHEET_EXTS.has(ext)) {
        pushStackItem(activeTabId, {
          id: uri,
          component: "sheet-viewer",
          title: name,
          params: { ...baseParams, __customHeader: true },
        });
        return;
      }
      pushStackItem(activeTabId, {
        id: uri,
        component: "file-viewer",
        title: name,
        params: baseParams,
      });
    },
    [activeTabId, pushStackItem]
  );

  return (
    <div className="flex h-full w-full items-center justify-center min-h-[360px]">
      <div className="relative h-full w-full">
        <AnimatedFolder
          title={resolvedTitle}
          projects={previewProjects}
          hovered={resolvedHover}
          interactive={true}
          onProjectOpen={handleProjectOpen}
          className="w-full bg-transparent border-transparent shadow-none [&>div:nth-child(2)]:mb-1 [&>h3]:mt-1 [&>p]:hidden [&>div:last-child]:hidden"
        />
      </div>
    </div>
  );
}
