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

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, FolderOpen, Layers } from "lucide-react";
import type { ProjectNode } from "@openloaf/api/services/projectTreeService";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@openloaf/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@openloaf/ui/command";

interface ChatProjectSelectorProps {
  /** Current project id. */
  projectId?: string;
  /** Current workspace id (used when no project is selected). */
  workspaceId?: string;
  /** Workspace display name. */
  workspaceName?: string;
  /** Flat list of all selectable projects. */
  projects: ProjectNode[];
  /** Called when user selects a project (or clears to workspace scope). */
  onProjectChange: (projectId: string | undefined) => void;
  /** When true, selector is read-only (conversation already started). */
  disabled?: boolean;
}

/** Flatten a project tree into a flat list (depth-first). */
function flattenProjects(nodes: ProjectNode[], depth = 0): Array<ProjectNode & { depth: number }> {
  const result: Array<ProjectNode & { depth: number }> = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    if (node.children?.length) {
      result.push(...flattenProjects(node.children, depth + 1));
    }
  }
  return result;
}

export function ChatProjectSelector({
  projectId,
  workspaceId,
  workspaceName,
  projects,
  onProjectChange,
  disabled = false,
}: ChatProjectSelectorProps) {
  const [open, setOpen] = useState(false);

  const flatProjects = useMemo(() => flattenProjects(projects), [projects]);

  const selectedProject = useMemo(
    () => flatProjects.find((p) => p.projectId === projectId),
    [flatProjects, projectId],
  );

  const { t } = useTranslation('ai');

  const displayLabel = selectedProject?.title ?? workspaceName ?? t('projectSelector.workspace');

  // No projects to select — show workspace label only (read-only)
  if (flatProjects.length === 0) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 max-w-[160px]",
          "text-[12px] font-medium leading-none",
          "text-muted-foreground/60 select-none",
        )}
      >
        <Layers className="w-3 h-3 shrink-0" />
        <span className="truncate">{displayLabel}</span>
      </span>
    );
  }

  return (
    <Popover open={disabled ? false : open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 max-w-[160px]",
            "text-[12px] font-medium leading-none",
            "transition-colors duration-150",
            "outline-none select-none",
            disabled
              ? "text-muted-foreground/60 cursor-default"
              : "text-muted-foreground hover:text-foreground cursor-pointer",
          )}
        >
          {selectedProject?.icon ? (
            <span className="text-[12px] leading-none shrink-0">{selectedProject.icon}</span>
          ) : selectedProject ? (
            <FolderOpen className="w-3 h-3 shrink-0" />
          ) : (
            <Layers className="w-3 h-3 shrink-0" />
          )}
          <span className="truncate">{displayLabel}</span>
          {!disabled && <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-0"
        align="start"
        side="top"
        sideOffset={6}
      >
        <Command>
          <CommandInput placeholder={t('projectSelector.searchProject')} className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="py-3 text-xs text-center text-muted-foreground">
              {t('projectSelector.noProjectFound')}
            </CommandEmpty>

            {/* Workspace scope option (clear project selection) */}
            {workspaceId && (
              <CommandGroup heading={t('projectSelector.workspace')}>
                <CommandItem
                  value={`workspace:${workspaceId}`}
                  onSelect={() => {
                    onProjectChange(undefined);
                    setOpen(false);
                  }}
                  className="text-xs gap-2"
                >
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{workspaceName ?? t('projectSelector.workspace')}</span>
                  {!projectId && (
                    <span className="ml-auto text-[10px] text-muted-foreground">{t('projectSelector.current')}</span>
                  )}
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup heading={t('projectSelector.projects')}>
              {flatProjects.map((p) => (
                <CommandItem
                  key={p.projectId}
                  value={`${p.projectId}:${p.title}`}
                  onSelect={() => {
                    onProjectChange(p.projectId);
                    setOpen(false);
                  }}
                  className="text-xs gap-2"
                  style={{ paddingLeft: p.depth > 0 ? `${8 + p.depth * 12}px` : undefined }}
                >
                  {p.icon ? (
                    <span className="text-[13px] leading-none shrink-0">{p.icon}</span>
                  ) : (
                    <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">{p.title}</span>
                  {p.projectId === projectId && (
                    <span className="ml-auto text-[10px] text-muted-foreground">{t('projectSelector.current')}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
