"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Eye, PencilLine, Search, Trash2 } from "lucide-react";
import { SettingsGroup } from "./SettingsGroup";

type AgentKind = "master" | "sub";

type AgentRow = {
  id: string;
  displayName: string;
  kind: AgentKind;
  description: string;
  model: string;
  tools: string[];
  subAgents: string[];
};

type AgentPanelState = { mode: "view" | "edit"; id: string } | null;

const INITIAL_AGENTS: AgentRow[] = [
  {
    id: "agent_master_default",
    displayName: "默认 MasterAgent",
    kind: "master",
    description: "对话编排器：负责委派、合并流式输出与持久化（占位）",
    model: "gpt-4o-mini",
    tools: ["system", "db", "browser", "subAgent"],
    subAgents: ["browser"],
  },
  {
    id: "agent_sub_browser",
    displayName: "BrowserSubAgent",
    kind: "sub",
    description: "网页/浏览器相关任务（占位）",
    model: "gpt-4o-mini",
    tools: ["web_fetch", "open_url", "subAgent"],
    subAgents: [],
  },
];

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

function Tags({
  values,
  emptyLabel,
}: {
  values: string[];
  emptyLabel?: string;
}) {
  if (!values.length)
    return emptyLabel ? <Tag className="bg-background">{emptyLabel}</Tag> : null;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <Tag key={value} className="bg-background">
          {value}
        </Tag>
      ))}
    </div>
  );
}

function kindLabel(kind: AgentKind) {
  return kind === "master" ? "MasterAgent" : "SubAgent";
}

export function AgentManagement() {
  const [agents, setAgents] = useState<AgentRow[]>(INITIAL_AGENTS);
  const [panel, setPanel] = useState<AgentPanelState>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editDraft, setEditDraft] = useState<
    Pick<AgentRow, "displayName" | "model">
  >({ displayName: "", model: "" });

  const panelAgent = useMemo(
    () => (panel ? agents.find((agent) => agent.id === panel.id) : undefined),
    [agents, panel],
  );

  const deletingAgent = useMemo(
    () => (deleteId ? agents.find((agent) => agent.id === deleteId) : undefined),
    [agents, deleteId],
  );

  useEffect(() => {
    if (panel && !panelAgent) {
      setPanel(null);
      setEditDraft({ displayName: "", model: "" });
    }
  }, [panel, panelAgent]);

  useEffect(() => {
    if (deleteId && !deletingAgent) setDeleteId(null);
  }, [deleteId, deletingAgent]);

  const filteredAgents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = agents
      .filter((agent) => {
        if (!normalizedQuery) return true;
        const haystack = [
          agent.displayName,
          agent.id,
          agent.description,
          agent.model,
          agent.tools.join(" "),
          agent.subAgents.join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(normalizedQuery);
      });
    filtered.sort((a, b) => {
      return a.displayName.localeCompare(b.displayName);
    });
    return filtered;
  }, [agents, query]);

  const openView = (id: string) => setPanel({ mode: "view", id });

  const openEdit = (id: string) => {
    const agent = agents.find((item) => item.id === id);
    if (!agent) return;
    setEditDraft({ displayName: agent.displayName, model: agent.model });
    setPanel({ mode: "edit", id });
  };

  const closePanel = () => {
    setPanel(null);
    setEditDraft({ displayName: "", model: "" });
  };

  const cancelEdit = () => {
    if (!panel) return;
    setPanel({ ...panel, mode: "view" });
    setEditDraft({ displayName: "", model: "" });
  };

  const saveEdit = () => {
    if (!panel || panel.mode !== "edit") return;

    const nextDisplayName = editDraft.displayName.trim();
    const nextModel = editDraft.model.trim();
    if (!nextDisplayName || !nextModel) return;

    setAgents((prev) =>
      prev.map((item) =>
        item.id === panel.id
          ? { ...item, displayName: nextDisplayName, model: nextModel }
          : item,
      ),
    );
    setPanel({ mode: "view", id: panel.id });
    setEditDraft({ displayName: "", model: "" });
  };

  const isEditDirty = Boolean(
    panel?.mode === "edit" &&
      panelAgent &&
      (editDraft.displayName.trim() !== panelAgent.displayName ||
        editDraft.model.trim() !== panelAgent.model),
  );

  return (
    <>
      <SettingsGroup title="Agent 管理">
        <div className="space-y-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">{agents.length} 个</div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索 Agent（名称 / ID / 模型 / 工具）"
                className="pl-9"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-border">
            <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-border bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
              <div>Agent</div>
              <div className="text-right">操作</div>
            </div>

            <div className="divide-y divide-border">
              {filteredAgents.map((agent) => {
                const isSelected = panel?.id === agent.id;
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
                        <Tag className="bg-background">
                          {agent.tools.length} 工具
                        </Tag>
                        <Tag className="bg-background">
                          {agent.subAgents.length ? (
                            <>{agent.subAgents.length} 子 Agent</>
                          ) : (
                            "无子 Agent"
                          )}
                        </Tag>
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
                        onClick={() => openView(agent.id)}
                        aria-label="View agent"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9"
                        onClick={() => openEdit(agent.id)}
                        aria-label="Edit agent"
                      >
                        <PencilLine className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(agent.id)}
                        aria-label="Delete agent"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {filteredAgents.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">
                  {agents.length === 0 ? "暂无 Agent。" : "无匹配结果。"}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </SettingsGroup>

      <Dialog
        open={Boolean(panel)}
        onOpenChange={(open) => {
          if (!open) closePanel();
        }}
      >
        <DialogContent className="sm:max-w-[620px]">
          <DialogHeader>
            <DialogTitle>
              {panel?.mode === "edit" ? "编辑 Agent" : "查看 Agent"}
            </DialogTitle>
          </DialogHeader>

          {panelAgent ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Tag className="bg-background">{kindLabel(panelAgent.kind)}</Tag>
                <Tag className="bg-background font-mono text-[11px] text-foreground/80">
                  {panelAgent.model}
                </Tag>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="显示名称">
                  {panel?.mode === "edit" ? (
                    <Input
                      value={editDraft.displayName}
                      onChange={(event) =>
                        setEditDraft((prev) => ({
                          ...prev,
                          displayName: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <Input value={panelAgent.displayName} readOnly />
                  )}
                </Field>

                <Field label="模型">
                  {panel?.mode === "edit" ? (
                    <Input
                      value={editDraft.model}
                      onChange={(event) =>
                        setEditDraft((prev) => ({
                          ...prev,
                          model: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <Input value={panelAgent.model} readOnly className="font-mono" />
                  )}
                </Field>
              </div>

              <Field label="描述">
                <div className="text-sm text-muted-foreground">
                  {panelAgent.description || "—"}
                </div>
              </Field>

              <Separator />

              <Field label="工具">
                <Tags values={panelAgent.tools} emptyLabel="无" />
              </Field>

              <Field label="子 Agent">
                <Tags values={panelAgent.subAgents} emptyLabel="无" />
              </Field>

              <Separator />

              <Field label="ID">
                <Input value={panelAgent.id} readOnly className="font-mono" />
              </Field>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              该 Agent 已被删除或不存在。
            </div>
          )}

          <DialogFooter>
            {panelAgent ? (
              panel?.mode === "edit" ? (
                <>
                  <Button variant="ghost" onClick={cancelEdit}>
                    取消
                  </Button>
                  <Button
                    onClick={saveEdit}
                    disabled={
                      !isEditDirty ||
                      !editDraft.displayName.trim() ||
                      !editDraft.model.trim()
                    }
                  >
                    保存
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => openEdit(panelAgent.id)}>
                    编辑
                  </Button>
                  <Button variant="destructive" onClick={() => setDeleteId(panelAgent.id)}>
                    删除
                  </Button>
                </>
              )
            ) : (
              <Button variant="outline" onClick={closePanel}>
                关闭
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>删除 Agent</DialogTitle>
          </DialogHeader>

          {deletingAgent ? (
            <div className="space-y-2 text-sm">
              <div>
                确认删除{" "}
                <span className="font-medium">{deletingAgent.displayName}</span>{" "}
                吗？
              </div>
              <div className="text-xs text-muted-foreground">
                当前仅影响本地 UI 列表，不会写入数据库。
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">该 Agent 不存在或已删除。</div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={!deletingAgent}
              onClick={() => {
                if (!deletingAgent) return;
                setAgents((prev) => prev.filter((agent) => agent.id !== deletingAgent.id));
                setDeleteId(null);
                if (panel?.id === deletingAgent.id) closePanel();
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
