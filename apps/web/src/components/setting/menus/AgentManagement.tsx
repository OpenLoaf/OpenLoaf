"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { SettingsGroup } from "./SettingsGroup";

type AgentRow = {
  id: string;
  displayName: string;
  model: string;
  tools: string[];
  subAgents: string[];
};

type DialogState =
  | { type: "view"; id: string }
  | { type: "edit"; id: string }
  | { type: "delete"; id: string }
  | null;

function Tag({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

function EmptyDash() {
  return <span className="text-xs text-muted-foreground">—</span>;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

export function AgentManagement() {
  const [agents, setAgents] = useState<AgentRow[]>([
    {
      id: "agent_master_default",
      displayName: "默认 MasterAgent",
      model: "gpt-4o-mini",
      tools: ["system", "db", "browser", "subAgent"],
      subAgents: ["browser"],
    },
    {
      id: "agent_sub_browser",
      displayName: "BrowserSubAgent",
      model: "gpt-4o-mini",
      tools: ["web_fetch", "open_url", "subAgent"],
      subAgents: [],
    },
  ]);

  const [dialog, setDialog] = useState<DialogState>(null);
  const selectedAgent = useMemo(
    () => (dialog ? agents.find((a) => a.id === dialog.id) : undefined),
    [agents, dialog],
  );

  const [editDraft, setEditDraft] = useState<
    Pick<AgentRow, "displayName" | "model">
  >({ displayName: "", model: "" });

  const openEdit = (id: string) => {
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;
    setEditDraft({ displayName: agent.displayName, model: agent.model });
    setDialog({ type: "edit", id });
  };

  const columns =
    "grid-cols-[minmax(140px,1.2fr)_minmax(120px,1fr)_minmax(220px,2fr)_minmax(160px,1.3fr)_minmax(168px,0.9fr)]";

  return (
    <div className="space-y-6">
      <SettingsGroup title="Agent 管理">
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            UI 占位：后续接入数据库与权限控制。当前仅展示可编辑字段的表单布局。
          </div>

          <div className="rounded-lg border border-border">
            <div
              className={cn(
                "hidden sm:grid",
                columns,
                "gap-3 border-b border-border bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground",
              )}
            >
              <div>显示名称</div>
              <div>模型</div>
              <div>工具</div>
              <div>子 Agent</div>
              <div className="text-right">操作</div>
            </div>

            <div className="divide-y divide-border">
              {agents.map((agent) => (
                <div key={agent.id} className="p-3">
                  <div className={cn("hidden sm:grid", columns, "gap-3")}>
                    <div className="min-w-0">
                      <Input value={agent.displayName} readOnly className="h-8" />
                    </div>
                    <div className="min-w-0">
                      <Input value={agent.model} readOnly className="h-8" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {agent.tools.length ? (
                        agent.tools.map((tool) => <Tag key={tool}>{tool}</Tag>)
                      ) : (
                        <EmptyDash />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {agent.subAgents.length ? (
                        agent.subAgents.map((name) => <Tag key={name}>{name}</Tag>)
                      ) : (
                        <EmptyDash />
                      )}
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDialog({ type: "view", id: agent.id })}
                      >
                        查看
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(agent.id)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDialog({ type: "delete", id: agent.id })}
                      >
                        删除
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3 sm:hidden">
                    <Field label="显示名称">
                      <Input value={agent.displayName} readOnly />
                    </Field>
                    <Field label="模型">
                      <Input value={agent.model} readOnly />
                    </Field>
                    <Field label="工具">
                      <div className="flex flex-wrap gap-2">
                        {agent.tools.length ? (
                          agent.tools.map((tool) => <Tag key={tool}>{tool}</Tag>)
                        ) : (
                          <EmptyDash />
                        )}
                      </div>
                    </Field>
                    <Field label="子 Agent">
                      <div className="flex flex-wrap gap-2">
                        {agent.subAgents.length ? (
                          agent.subAgents.map((name) => <Tag key={name}>{name}</Tag>)
                        ) : (
                          <EmptyDash />
                        )}
                      </div>
                    </Field>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDialog({ type: "view", id: agent.id })}
                      >
                        查看
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(agent.id)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDialog({ type: "delete", id: agent.id })}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SettingsGroup>

      <Dialog open={dialog?.type === "view"} onOpenChange={() => setDialog(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>查看 Agent</DialogTitle>
          </DialogHeader>

          {selectedAgent ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>显示名称</Label>
                  <Input value={selectedAgent.displayName} readOnly />
                </div>
                <div className="space-y-2">
                  <Label>模型</Label>
                  <Input value={selectedAgent.model} readOnly />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>工具</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedAgent.tools.length ? (
                    selectedAgent.tools.map((tool) => <Tag key={tool}>{tool}</Tag>)
                  ) : (
                    <EmptyDash />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>子 Agent</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedAgent.subAgents.length ? (
                    selectedAgent.subAgents.map((name) => <Tag key={name}>{name}</Tag>)
                  ) : (
                    <EmptyDash />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>ID</Label>
                <Input value={selectedAgent.id} readOnly className="font-mono" />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.type === "edit"} onOpenChange={() => setDialog(null)}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>编辑 Agent</DialogTitle>
          </DialogHeader>

          {selectedAgent ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>显示名称</Label>
                  <Input
                    value={editDraft.displayName}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        displayName: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>模型</Label>
                  <Input
                    value={editDraft.model}
                    onChange={(e) =>
                      setEditDraft((prev) => ({
                        ...prev,
                        model: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>工具（只读，占位）</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedAgent.tools.length ? (
                    selectedAgent.tools.map((tool) => <Tag key={tool}>{tool}</Tag>)
                  ) : (
                    <EmptyDash />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>子 Agent（只读，占位）</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedAgent.subAgents.length ? (
                    selectedAgent.subAgents.map((name) => <Tag key={name}>{name}</Tag>)
                  ) : (
                    <EmptyDash />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>ID（只读）</Label>
                <Input value={selectedAgent.id} readOnly className="font-mono" />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button
              onClick={() => {
                if (!selectedAgent) return;
                setAgents((prev) =>
                  prev.map((agent) =>
                    agent.id === selectedAgent.id
                      ? { ...agent, ...editDraft }
                      : agent,
                  ),
                );
                setDialog(null);
              }}
            >
              保存（本地）
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.type === "delete"} onOpenChange={() => setDialog(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>删除 Agent</DialogTitle>
          </DialogHeader>

          {selectedAgent ? (
            <div className="space-y-2 text-sm">
              <div>
                确认删除 <span className="font-medium">{selectedAgent.displayName}</span>{" "}
                吗？
              </div>
              <div className="text-xs text-muted-foreground">
                当前仅影响本地 UI 列表，不会写入数据库。
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!selectedAgent) return;
                setAgents((prev) => prev.filter((a) => a.id !== selectedAgent.id));
                setDialog(null);
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

