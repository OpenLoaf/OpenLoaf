"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, SmilePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { EmojiPicker } from "@/components/ui/emoji-picker";

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
  const [draftTitle, setDraftTitle] = useState(currentTitle ?? "");
  const titleEditableRef = useRef<HTMLSpanElement | null>(null);
  const titleClickPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (isEditingTitle) return;
    setDraftTitle(currentTitle ?? "");
  }, [isEditingTitle, currentTitle]);

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
    if (!projectId) return;
    const nextTitle =
      (titleEditableRef.current?.innerText ?? draftTitle).trim() || "Untitled Page";
    const latestTitle = currentTitle ?? "";
    if (nextTitle === latestTitle) return;
    onUpdateTitle(nextTitle);
  };

  /** Clear the current title back to default. */
  const handleDeleteTitle = () => {
    if (!projectId || isUpdating) return;
    onUpdateTitle("Untitled Page");
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
            <span
              ref={titleEditableRef}
              contentEditable={!isUpdating}
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
                  setDraftTitle(currentTitle ?? "");
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
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 opacity-0 group-hover/title:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-foreground"
                aria-label="Delete title"
                title="Delete title"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDeleteTitle();
                }}
                disabled={!projectId || isUpdating}
              >
                <Trash2 className="size-4" />
              </Button>
            </span>
          )}
        </>
      )}
    </h1>
  );
}
