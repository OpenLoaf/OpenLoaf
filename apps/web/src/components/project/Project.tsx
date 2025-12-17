"use client";

import * as ScrollArea from "@radix-ui/react-scroll-area";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Copy, SmilePlus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { useWorkspace } from "@/components/workspace/workspaceContext";
import { Skeleton } from "@/components/ui/skeleton";
import { useTabActive } from "@/components/layout/TabActiveContext";
import { useTabs } from "@/hooks/use-tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { usePage } from "@/hooks/use-page";
import ProjectIntro from "./ProjectIntro";
import ProjectCanvas from "./ProjectCanvas";
import ProjectTasks from "./ProjectTasks";
import ProjectMaterials from "./ProjectMaterials";
import ProjectSkills from "./ProjectSkills";
import ProjectTest from "./ProjectTest";
import ProjectTabs, { type ProjectTabValue } from "./ProjectTabs";

interface ProjectPageProps {
  tabId?: string;
  pageId?: string;
  [key: string]: any;
}

function updateTreeNode(pages: any[], pageId: string, patch: any) {
  let changed = false;
  const nextPages = pages.map((page) => {
    const next: any = { ...page };
    if (next.id === pageId) {
      for (const [key, value] of Object.entries(patch)) {
        if (next[key] !== value) changed = true;
        next[key] = value;
      }
    }
    if (Array.isArray(next.children) && next.children.length > 0) {
      const nextChildren = updateTreeNode(next.children, pageId, patch);
      if (nextChildren !== next.children) {
        changed = true;
        next.children = nextChildren;
      }
    }
    return next;
  });
  return changed ? nextPages : pages;
}

function ProjectTitleSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="size-5 rounded-sm" />
      <Skeleton className="h-6 w-[35vw] max-w-[180px]" />
    </div>
  );
}

export default function ProjectPage({ pageId, tabId }: ProjectPageProps) {
  const { workspace: activeWorkspace } = useWorkspace();
  const tabActive = useTabActive();
  const setTabLeftWidthPercent = useTabs((s) => s.setTabLeftWidthPercent);
  const appliedWidthRef = useRef(false);
  const queryClient = useQueryClient();

  const { data: pageData, isLoading, invalidatePage, invalidatePageTree } =
    usePage(pageId);

  const [activeTab, setActiveTab] = useState<ProjectTabValue>("intro");

  const pageTitle = pageData?.title || "Untitled Page";
  const titleIcon = pageData?.icon ?? undefined;

  const pageQueryKey =
    activeWorkspace && pageId
      ? trpc.page.findUniquePage.queryOptions({ where: { id: pageId } }).queryKey
      : undefined;
  const pageTreeQueryKey = activeWorkspace?.id
    ? trpc.pageCustom.getAll.queryOptions({ workspaceId: activeWorkspace.id })
        .queryKey
    : undefined;

  const updatePage = useMutation(
    trpc.page.updateOnePage.mutationOptions({
      onMutate: async (variables: any) => {
        const patch: any = {};
        if (variables?.data?.icon !== undefined) patch.icon = variables.data.icon;
        if (variables?.data?.title !== undefined) patch.title = variables.data.title;
        if (!pageId || Object.keys(patch).length === 0) return;

        const previousPage = pageQueryKey
          ? queryClient.getQueryData(pageQueryKey)
          : undefined;
        const previousPageTree = pageTreeQueryKey
          ? queryClient.getQueryData(pageTreeQueryKey)
          : undefined;

        if (pageQueryKey) {
          queryClient.setQueryData(pageQueryKey, (oldData: any) => {
            if (!oldData) return oldData;
            return { ...oldData, ...patch };
          });
        }

        if (pageTreeQueryKey) {
          queryClient.setQueryData(pageTreeQueryKey, (oldData: any) => {
            if (!Array.isArray(oldData)) return oldData;
            return updateTreeNode(oldData, pageId, patch);
          });
        }

        return { previousPage, previousPageTree };
      },
      onError: (_error, _variables, context) => {
        if (pageQueryKey && context?.previousPage !== undefined) {
          queryClient.setQueryData(pageQueryKey, context.previousPage);
        }
        if (pageTreeQueryKey && context?.previousPageTree !== undefined) {
          queryClient.setQueryData(pageTreeQueryKey, context.previousPageTree);
        }
      },
      onSettled: async () => {
        await invalidatePage();
        await invalidatePageTree();
      },
    })
  );

  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(pageData?.title ?? "");
  const titleEditableRef = useRef<HTMLSpanElement | null>(null);
  const titleClickPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (isEditingTitle) return;
    setDraftTitle(pageData?.title ?? "");
  }, [isEditingTitle, pageData?.title]);

  useEffect(() => {
    if (!isEditingTitle) return;
    requestAnimationFrame(() => {
      const el = titleEditableRef.current;
      if (!el) return;
      el.innerText = draftTitle;
      el.focus();

      const clickPoint = titleClickPointRef.current;
      titleClickPointRef.current = null;

      const selection = window.getSelection();
      if (!selection) return;

      let range: Range | null = null;
      const anyDocument = document as any;
      if (clickPoint && typeof anyDocument.caretRangeFromPoint === "function") {
        range = anyDocument.caretRangeFromPoint(clickPoint.x, clickPoint.y);
      } else if (
        clickPoint &&
        typeof anyDocument.caretPositionFromPoint === "function"
      ) {
        const pos = anyDocument.caretPositionFromPoint(clickPoint.x, clickPoint.y);
        if (pos?.offsetNode) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
        }
      }

      selection.removeAllRanges();
      if (range && el.contains(range.startContainer)) {
        selection.addRange(range);
        return;
      }

      const endRange = document.createRange();
      endRange.selectNodeContents(el);
      endRange.collapse(false);
      selection.addRange(endRange);
    });
  }, [isEditingTitle, draftTitle]);

  const commitTitle = () => {
    setIsEditingTitle(false);
    if (!pageId) return;
    const nextTitle =
      (titleEditableRef.current?.innerText ?? draftTitle).trim() ||
      "Untitled Page";
    const currentTitle = pageData?.title ?? "";
    if (nextTitle === currentTitle) return;
    updatePage.mutate({
      where: { id: pageId },
      data: { title: nextTitle },
    });
  };

  useEffect(() => {
    appliedWidthRef.current = false;
  }, [pageId, tabId]);

  useEffect(() => {
    if (!tabActive) return;
    if (appliedWidthRef.current) return;
    if (!tabId) return;
    setTabLeftWidthPercent(tabId, 70);
    appliedWidthRef.current = true;
  }, [tabActive, tabId, setTabLeftWidthPercent]);

  return (
    <div className="flex h-full w-full flex-col min-h-0">
      <div className="flex items-center justify-between py-0 w-full min-w-0">
        <h1 className="text-xl font-semibold flex items-center gap-2 min-w-0 ml-2">
          {isLoading ? (
            <ProjectTitleSkeleton />
          ) : (
            <>
              <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    disabled={!pageId || updatePage.isPending}
                    aria-label="Choose project icon"
                    title="Choose project icon"
                  >
                    <span className="text-xl leading-none">
                      {titleIcon ?? <SmilePlus className="size-4" />}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[352px] max-w-[calc(100vw-24px)] p-0"
                  align="start"
                >
                  <EmojiPicker
                    width="100%"
                    onSelect={(nextIcon) => {
                      setIconPickerOpen(false);
                      if (!pageId) return;
                      updatePage.mutate({
                        where: { id: pageId },
                        data: { icon: nextIcon },
                      });
                    }}
                  />
                </PopoverContent>
              </Popover>
              {isEditingTitle ? (
                <span
                  ref={titleEditableRef}
                  contentEditable={!updatePage.isPending}
                  suppressContentEditableWarning
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitTitle();
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      titleClickPointRef.current = null;
                      setDraftTitle(pageData?.title ?? "");
                      setIsEditingTitle(false);
                    }
                  }}
                  onInput={(e) => setDraftTitle(e.currentTarget.innerText)}
                  className="min-w-0 flex-1 whitespace-nowrap overflow-hidden text-ellipsis outline-none text-xl md:text-xl font-semibold leading-normal"
                  aria-label="Edit project title"
                  role="textbox"
                />
              ) : (
                <span className="group/title flex min-w-0 items-center gap-1">
                  <button
                    type="button"
                    className="truncate text-left"
                    onMouseDown={(e) => {
                      titleClickPointRef.current = { x: e.clientX, y: e.clientY };
                    }}
                    onClick={() => setIsEditingTitle(true)}
                    aria-label="Edit project title"
                    title="Click to edit"
                  >
                    {pageTitle}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground"
                    aria-label="Copy title"
                    title="Copy title"
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      try {
                        await navigator.clipboard.writeText(pageTitle);
                        toast.success("已复制标题");
                      } catch {
                        toast.error("复制失败");
                      }
                    }}
                  >
                    <Copy className="size-4" />
                  </Button>
                </span>
              )}
            </>
          )}
        </h1>

        <ProjectTabs value={activeTab} onValueChange={setActiveTab} />
      </div>

      <ScrollArea.Root className="flex-1 min-h-0 w-full">
        <ScrollArea.Viewport className="w-full h-full min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 w-full">
            <div
              id={`project-panel-${activeTab}`}
              role="tabpanel"
              aria-labelledby={`project-tab-${activeTab}`}
              className="w-full h-full min-h-0"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full h-full"
                >
                  {activeTab === "intro" ? (
                    <ProjectIntro isLoading={isLoading} pageTitle={pageTitle} />
                  ) : null}
                  {activeTab === "canvas" ? (
                    <ProjectCanvas
                      isLoading={isLoading}
                      pageId={pageId}
                      pageTitle={pageTitle}
                    />
                  ) : null}
                  {activeTab === "tasks" ? (
                    <ProjectTasks isLoading={isLoading} pageId={pageId} />
                  ) : null}
                  {activeTab === "materials" ? (
                    <ProjectMaterials isLoading={isLoading} pageId={pageId} />
                  ) : null}
                  {activeTab === "skills" ? (
                    <ProjectSkills isLoading={isLoading} pageId={pageId} />
                  ) : null}
                  {activeTab === "test" ? (
                    <ProjectTest pageId={pageId} />
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar orientation="vertical" style={{ right: "-7px" }}>
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
        <ScrollArea.Corner />
      </ScrollArea.Root>
    </div>
  );
}
