/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  Eye,
  Monitor,
  PencilLine,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { skipToken, useMutation, useQuery } from "@tanstack/react-query";
import { Puck, Render, createUsePuck, type Data } from "@measured/puck";
import { trpc } from "@/utils/trpc";
import ProjectTitle from "../ProjectTitle";
import { Button } from "@openloaf/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@openloaf/ui/dropdown-menu";
import { homePagePuckConfig } from "@/lib/puck-home-config";
import pageDefaultData from "@/lib/page-default.json";

interface ProjectIndexHeaderProps {
  /** Whether the project data is loading. */
  isLoading: boolean;
  /** Current project id. */
  projectId?: string;
  /** Current project title. */
  projectTitle: string;
  /** Current icon for project title. */
  titleIcon?: string;
  /** Current title value from cache. */
  currentTitle?: string;
  /** Whether the title is being updated. */
  isUpdating: boolean;
  /** Update title callback. */
  onUpdateTitle: (nextTitle: string) => void;
  /** Update icon callback. */
  onUpdateIcon: (nextIcon: string) => void;
  /** Whether the homepage is read-only. */
  isReadOnly: boolean;
  /** Toggle read-only mode. */
  onSetReadOnly: (nextReadOnly: boolean) => void;
  /** Controls slot for Puck header actions. */
  controlsSlotRef: React.RefObject<HTMLDivElement | null>;
  /** Whether to show editing controls. */
  showControls: boolean;
}

interface ProjectIndexProps {
  /** Whether the page data is loading. */
  isLoading: boolean;
  /** Whether the tab is currently active. */
  isActive: boolean;
  /** Current project id. */
  projectId?: string;
  /** Current project title. */
  projectTitle: string;
  /** Whether the homepage is read-only. */
  readOnly: boolean;
  /** Notify parent about dirty state. */
  onDirtyChange: (dirty: boolean) => void;
  /** Notify parent when publish succeeds. */
  onPublishSuccess: () => void;
  /** Controls slot for Puck header actions. */
  controlsSlotRef: React.RefObject<HTMLDivElement | null>;
}

/** Default homepage data template. */
const defaultHomeData = pageDefaultData as Data;

/** Build homepage data when no saved content exists. */
function buildDefaultHomeData(projectTitle: string): Data {
  const nextData = JSON.parse(JSON.stringify(defaultHomeData)) as Data;
  const safeTitle = projectTitle.trim() || "Project Home";
  // 中文注释：没有保存内容时，用项目名填充标题。
  const heading = nextData.content.find((item) => item.type === "Heading");
  if (heading && typeof heading.props === "object") {
    (heading.props as { text?: string }).text = safeTitle;
  }
  if (nextData.root && typeof nextData.root.props === "object") {
    (nextData.root.props as { title?: string }).title = safeTitle;
  }
  return nextData;
}

/** Clone homepage data to avoid mutation side effects. */
function cloneHomeData(data: Data): Data {
  return JSON.parse(JSON.stringify(data)) as Data;
}

/** Serialize homepage data for dirty comparison. */
function serializeHomeData(data: Data): string {
  return JSON.stringify(data);
}

const usePuckStore = createUsePuck();

/** Render Puck controls into the project header. */
function PuckHeaderPortal({
  targetRef,
  onPublish,
  puckRootRef,
}: {
  targetRef: React.RefObject<HTMLDivElement | null>;
  onPublish: (data: Data) => void;
  puckRootRef: React.RefObject<HTMLDivElement | null>;
}) {
  const appState = usePuckStore(
    (store) => store.appState as { data: Data }
  );
  const history = usePuckStore(
    (store) =>
      store.history as {
        back: () => void;
        forward: () => void;
        hasPast: boolean;
        hasFuture: boolean;
      }
  );
  /** Portal target node in the project header. */
  const [target, setTarget] = React.useState<HTMLDivElement | null>(null);

  React.useEffect(() => {
    // 中文注释：等头部 slot 挂载后再渲染 portal。
    setTarget(targetRef.current);
  }, [targetRef]);

  /** Get a Puck control button by title. */
  const getPuckControlButton = React.useCallback(
    (title: string) => {
      const scope = puckRootRef.current ?? document;
      return scope.querySelector(`button[title="${title}"]`) as
        | HTMLButtonElement
        | null;
    },
    [puckRootRef]
  );

  /** Trigger a Puck control button by title. */
  const triggerPuckControl = React.useCallback(
    (title: string) => {
      const button = getPuckControlButton(title);
      if (!button || button.disabled) return;
      button.click();
    },
    [getPuckControlButton]
  );

  const zoomOutDisabled =
    getPuckControlButton("Zoom viewport out")?.disabled ?? true;
  const zoomInDisabled =
    getPuckControlButton("Zoom viewport in")?.disabled ?? true;
  const smallViewportDisabled =
    getPuckControlButton("Switch to Small viewport")?.disabled ?? true;
  const mediumViewportDisabled =
    getPuckControlButton("Switch to Medium viewport")?.disabled ?? true;
  const largeViewportDisabled =
    getPuckControlButton("Switch to Large viewport")?.disabled ?? true;

  if (!target) return null;

  return createPortal(
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onPublish(appState.data)}
        aria-label="保存"
        title="保存"
      >
        保存
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={history.back}
        disabled={!history.hasPast}
        aria-label="撤回"
        title="撤回"
      >
        <Undo2 className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={history.forward}
        disabled={!history.hasFuture}
        aria-label="前进"
        title="前进"
      >
        <Redo2 className="size-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" title="视口">
            <Monitor className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => triggerPuckControl("Switch to Small viewport")}
            disabled={smallViewportDisabled}
            aria-label="小视口"
          >
            <Smartphone className="size-4" />
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => triggerPuckControl("Switch to Medium viewport")}
            disabled={mediumViewportDisabled}
            aria-label="中视口"
          >
            <Tablet className="size-4" />
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => triggerPuckControl("Switch to Large viewport")}
            disabled={largeViewportDisabled}
            aria-label="大视口"
          >
            <Monitor className="size-4" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => triggerPuckControl("Zoom viewport out")}
        disabled={zoomOutDisabled}
        aria-label="缩小"
        title="缩小"
      >
        <ZoomOut className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => triggerPuckControl("Zoom viewport in")}
        disabled={zoomInDisabled}
        aria-label="放大"
        title="放大"
      >
        <ZoomIn className="size-4" />
      </Button>
    </div>,
    target
  );
}

/** Project index panel. */
const ProjectIndex = React.memo(function ProjectIndex({
  isLoading,
  isActive,
  projectId,
  projectTitle,
  readOnly,
  onDirtyChange,
  onPublishSuccess,
  controlsSlotRef,
}: ProjectIndexProps) {
  const homePageQuery = useQuery(
    trpc.project.getHomePage.queryOptions(
      projectId
        ? {
            projectId,
          }
        : skipToken
    )
  );
  const publishHomePage = useMutation(
    trpc.project.publishHomePage.mutationOptions()
  );
  /** Fallback homepage data when there is no publish record. */
  const fallbackData = React.useMemo(
    () => buildDefaultHomeData(projectTitle),
    [projectTitle]
  );
  /** Published homepage data baseline. */
  const [baseData, setBaseData] = React.useState<Data | null>(null);
  /** Draft homepage data used during editing. */
  const [draftData, setDraftData] = React.useState<Data | null>(null);
  /** Whether draft differs from the published baseline. */
  const [isDirty, setIsDirty] = React.useState(false);
  /** Cached baseline JSON for dirty comparison. */
  const baseJsonRef = React.useRef<string>("");
  /** Root node for the Puck editor. */
  const puckRootRef = React.useRef<HTMLDivElement | null>(null);
  /** Sync iframe theme with app theme. */
  const syncFrameTheme = React.useCallback(() => {
    const root = puckRootRef.current;
    if (!root) return;
    const frame = root.querySelector("iframe");
    if (!frame?.contentDocument) return;
    const frameRoot = frame.contentDocument.documentElement;
    const isDark = document.documentElement.classList.contains("dark");
    const nextClasses = new Set(
      frameRoot.className.split(" ").filter((value) => value.length > 0)
    );
    nextClasses.delete("dark");
    nextClasses.delete("light");
    nextClasses.add(isDark ? "dark" : "light");
    frameRoot.className = Array.from(nextClasses).join(" ");
  }, []);

  React.useEffect(() => {
    setBaseData(null);
    setDraftData(null);
    baseJsonRef.current = "";
    setIsDirty(false);
    onDirtyChange(false);
  }, [projectId, onDirtyChange]);

  React.useEffect(() => {
    if (!projectId) return;
    if (homePageQuery.isLoading) return;
    const nextData =
      (homePageQuery.data?.data as Data | null) ?? fallbackData;
    setBaseData(nextData);
    setDraftData(cloneHomeData(nextData));
    baseJsonRef.current = serializeHomeData(nextData);
    if (isDirty) {
      setIsDirty(false);
      onDirtyChange(false);
    }
  }, [
    projectId,
    homePageQuery.isLoading,
    homePageQuery.data?.data,
    fallbackData,
    isDirty,
    onDirtyChange,
  ]);

  React.useEffect(() => {
    if (!readOnly || !isDirty || !baseData) return;
    // 中文注释：退出编辑后回滚未发布内容。
    setDraftData(cloneHomeData(baseData));
    baseJsonRef.current = serializeHomeData(baseData);
    setIsDirty(false);
    onDirtyChange(false);
  }, [readOnly, isDirty, baseData, onDirtyChange]);

  const showLoading = isLoading || (!!projectId && homePageQuery.isLoading);

  const handleChange = React.useCallback(
    (nextData: Data) => {
      setDraftData(nextData);
      const nextJson = serializeHomeData(nextData);
      const nextDirty = nextJson !== baseJsonRef.current;
      if (nextDirty !== isDirty) {
        // 中文注释：实时标记是否存在未发布改动。
        setIsDirty(nextDirty);
        onDirtyChange(nextDirty);
      }
    },
    [isDirty, onDirtyChange]
  );

  const handlePublish = React.useCallback(
    (nextData: Data) => {
      if (!projectId) return;
      publishHomePage.mutate(
        { projectId, data: nextData },
        {
          onSuccess: () => {
            // 中文注释：发布成功后刷新基准数据并切回只读模式。
            setBaseData(nextData);
            setDraftData(cloneHomeData(nextData));
            baseJsonRef.current = serializeHomeData(nextData);
            setIsDirty(false);
            onDirtyChange(false);
            onPublishSuccess();
          },
        }
      );
    },
    [projectId, publishHomePage, onDirtyChange, onPublishSuccess]
  );

  React.useEffect(() => {
    if (readOnly) return;
    const root = puckRootRef.current;
    if (!root) return;
    // 中文注释：监听主题切换并同步到 Puck iframe 根节点。
    const handleThemeChange = () => syncFrameTheme();
    let frame: HTMLIFrameElement | null = null;
    /** Attach load listener for the current iframe. */
    const attachFrame = (nextFrame: HTMLIFrameElement | null) => {
      if (frame === nextFrame) return;
      if (frame) {
        frame.removeEventListener("load", handleThemeChange);
      }
      frame = nextFrame;
      if (frame) {
        frame.addEventListener("load", handleThemeChange);
      }
    };
    const themeObserver = new MutationObserver(handleThemeChange);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    const iframeObserver = new MutationObserver(() => {
      const nextFrame = root.querySelector("iframe");
      attachFrame(nextFrame);
      if (!nextFrame) return;
      handleThemeChange();
    });
    iframeObserver.observe(root, { childList: true, subtree: true });
    attachFrame(root.querySelector("iframe"));
    handleThemeChange();
    return () => {
      themeObserver.disconnect();
      iframeObserver.disconnect();
      attachFrame(null);
    };
  }, [readOnly, syncFrameTheme]);

  if (showLoading) {
    return null;
  }

  const resolvedBaseData = baseData ?? fallbackData;
  const resolvedDraftData = draftData ?? cloneHomeData(resolvedBaseData);

  return (
    <div className="h-full space-y-3 flex-1 min-h-0">
      {isActive ? (
        readOnly ? (
          <div className="allow-text-select h-full w-full overflow-auto">
            <Render
              config={homePagePuckConfig}
              data={resolvedBaseData}
              metadata={{ projectId, projectTitle }}
            />
          </div>
        ) : (
          <div
            ref={puckRootRef}
            className="allow-text-select puck-fit puck-theme puck-hide-controls h-full w-full"
          >
            <Puck
              config={homePagePuckConfig}
              data={resolvedDraftData}
              onChange={handleChange}
              onPublish={handlePublish}
              metadata={{ projectId, projectTitle }}
              overrides={{
                header: () => (
                  <PuckHeaderPortal
                    targetRef={controlsSlotRef}
                    onPublish={handlePublish}
                    puckRootRef={puckRootRef}
                  />
                ),
              }}
            />
          </div>
        )
      ) : null}
    </div>
  );
});

/** Project index header. */
const ProjectIndexHeader = React.memo(function ProjectIndexHeader({
  isLoading,
  projectId,
  projectTitle,
  titleIcon,
  currentTitle,
  isUpdating,
  onUpdateTitle,
  onUpdateIcon,
  isReadOnly,
  onSetReadOnly,
  controlsSlotRef,
  showControls,
}: ProjectIndexHeaderProps) {
  const ToggleIcon = isReadOnly ? PencilLine : Eye;
  const toggleLabel = isReadOnly ? "编辑" : "取消";
  const toggleTitle = isReadOnly ? "编辑首页" : "取消编辑";

  return (
    <div className="flex items-center justify-between w-full min-w-0">
      <ProjectTitle
        isLoading={isLoading}
        projectId={projectId}
        projectTitle={projectTitle}
        titleIcon={titleIcon}
        currentTitle={currentTitle}
        isUpdating={isUpdating}
        onUpdateTitle={onUpdateTitle}
        onUpdateIcon={onUpdateIcon}
      />
      {isLoading ? null : (
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!projectId}
            onClick={() => onSetReadOnly(!isReadOnly)}
            aria-label={toggleTitle}
            title={toggleTitle}
          >
            {isReadOnly ? <ToggleIcon className="size-4" /> : null}
            {toggleLabel}
          </Button>
          {showControls ? (
            <div ref={controlsSlotRef} className="flex items-center gap-2" />
          ) : null}
        </div>
      )}
    </div>
  );
});

export { ProjectIndexHeader };
export default ProjectIndex;
