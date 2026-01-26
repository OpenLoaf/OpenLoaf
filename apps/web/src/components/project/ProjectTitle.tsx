"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, SmilePlus } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@tenas-ai/ui/popover";
import { Button } from "@tenas-ai/ui/button";
import { EmojiPicker } from "@tenas-ai/ui/emoji-picker";

interface ProjectTitleProps {
  isLoading: boolean;
  projectId?: string;
  projectTitle: string;
  titleIcon?: string;
  currentTitle?: string;
  isUpdating: boolean;
  onUpdateTitle: (nextTitle: string) => void;
  onUpdateIcon: (nextIcon: string) => void;
}

export default function ProjectTitle({
  isLoading,
  projectId,
  projectTitle,
  titleIcon,
  currentTitle,
  isUpdating,
  onUpdateTitle,
  onUpdateIcon,
}: ProjectTitleProps) {
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(currentTitle ?? projectTitle ?? "");
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isEditingTitle) return;
    setDraftTitle(currentTitle ?? projectTitle ?? "");
  }, [isEditingTitle, currentTitle, projectTitle]);

  useEffect(() => {
    if (!isEditingTitle) return;
    requestAnimationFrame(() => {
      const input = titleInputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }, [isEditingTitle]);

  const commitTitle = () => {
    setIsEditingTitle(false);
    if (!projectId) return;
    const nextTitle = draftTitle.trim() || "Untitled Page";
    const latestTitle = currentTitle ?? projectTitle ?? "";
    if (nextTitle === latestTitle) return;
    onUpdateTitle(nextTitle);
  };

  return (
    <h1 className="text-xl font-semibold flex items-center gap-2 min-w-0">
      {isLoading ? null : (
        <>
          <Popover open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0"
                disabled={!projectId || isUpdating}
                aria-label="Choose project icon"
                title="Choose project icon"
              >
                <span className="text-xl leading-none">
                  {titleIcon ?? <SmilePlus className="size-4" />}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[352px] max-w-[calc(100vw-24px)] p-0 min-h-[420px] bg-popover overflow-hidden"
              align="start"
            >
              <EmojiPicker
                width="100%"
                onSelect={(nextIcon) => {
                  setIconPickerOpen(false);
                  if (!projectId) return;
                  onUpdateIcon(nextIcon);
                }}
              />
            </PopoverContent>
          </Popover>

          {isEditingTitle ? (
            <input
              key="edit"
              ref={titleInputRef}
              value={draftTitle}
              disabled={isUpdating}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTitle();
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setDraftTitle(currentTitle ?? projectTitle ?? "");
                  setIsEditingTitle(false);
                }
              }}
              className="min-w-0 flex-1 bg-transparent outline-none text-xl md:text-xl font-semibold leading-normal"
              aria-label="Edit project title"
            />
          ) : (
            <span key="view" className="group/title flex min-w-0 items-center gap-1">
              <button
                type="button"
                className="truncate text-left"
                onClick={() => setIsEditingTitle(true)}
                aria-label="Edit project title"
                title="Click to edit"
              >
                {projectTitle}
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
                    await navigator.clipboard.writeText(projectTitle);
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
  );
}
