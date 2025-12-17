"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Eye, PencilLine, Search, Trash2 } from "lucide-react";
import type { AgentRow } from "./AgentManagement";

function Tag({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function AgentList({
  agents,
  selectedId,
  query,
  onQueryChange,
  onView,
  onEdit,
  onDelete,
}: {
  agents: AgentRow[];
  selectedId: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索 Agent（名称 / ID / 模型 / 工具）"
          className="pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
          <div>Agent</div>
          <div className="text-right">操作</div>
        </div>

        <div className="divide-y divide-border">
          {agents.map((agent) => {
            const isSelected = selectedId === agent.id;
            return (
              <div
                key={agent.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 transition-colors",
                  isSelected ? "bg-muted/20" : "bg-background hover:bg-muted/15",
                )}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 truncate text-sm font-medium">
                      {agent.displayName}
                    </div>
                    <Tag className="bg-background font-mono text-[11px] text-foreground/80">
                      {agent.model}
                    </Tag>
                    <Tag className="bg-background">{agent.tools.length} 工具</Tag>
                    {agent.subAgents.length ? (
                      <Tag className="bg-background">{agent.subAgents.length} 子 Agent</Tag>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-2">
                    {agent.description}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    onClick={() => onView(agent.id)}
                    aria-label="View agent"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    onClick={() => onEdit(agent.id)}
                    aria-label="Edit agent"
                  >
                    <PencilLine className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    onClick={() => onDelete(agent.id)}
                    aria-label="Delete agent"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}

          {agents.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">无匹配结果。</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
