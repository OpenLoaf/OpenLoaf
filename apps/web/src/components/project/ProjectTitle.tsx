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

import { useEffect, useRef, useState } from "react";
import { Copy, Loader2, SmilePlus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { Popover, PopoverContent, PopoverTrigger } from "@openloaf/ui/popover";
import { Button } from "@openloaf/ui/button";
import { EmojiPicker } from "@openloaf/ui/emoji-picker";

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
  const { t } = useTranslation("workspace");
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

  const inferNameMutation = useMutation(
    trpc.settings.inferProjectName.mutationOptions({
      onSuccess: (data) => {
        onUpdateTitle(data.title);
        if (data.icon) onUpdateIcon(data.icon);
        toast.success(t("project.aiNameSuccess"));
      },
      onError: () => {
        toast.error(t("project.aiNameFailed"));
      },
    }),
  );

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
                aria-label={t("project.aiName")}
                title={t("project.aiName")}
                disabled={!projectId || isUpdating || inferNameMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (projectId) inferNameMutation.mutate({ projectId });
                }}
              >
                {inferNameMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
              </Button>
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
                    toast.success(t("project.copyTitleSuccess"));
                  } catch {
                    toast.error(t("project.copyTitleFailed"));
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
