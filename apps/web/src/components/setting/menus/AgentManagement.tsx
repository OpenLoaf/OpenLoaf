"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

type DialogState =
  | { type: "view"; id: string }
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
  if (!values.length) return emptyLabel ? <Tag>{emptyLabel}</Tag> : <EmptyDash />;
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <Tag key={value}>{value}</Tag>
      ))}
    </div>
  );
}

function kindLabel(kind: AgentKind) {
  return kind === "master" ? "MasterAgent" : "SubAgent";
}

export function AgentManagement() {
  const [agents, setAgents] = useState<AgentRow[]>([
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
  ]);

  const [dialog, setDialog] = useState<DialogState>(null);
  const selectedAgent = useMemo(
    () => (dialog ? agents.find((a) => a.id === dialog.id) : undefined),
    [agents, dialog],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Pick<AgentRow, "displayName" | "model">>({
    displayName: "",
    model: "",
  });

  const openEdit = (id: string) => {
    const agent = agents.find((a) => a.id === id);
    if (!agent) return;
    setEditDraft({ displayName: agent.displayName, model: agent.model });
    setEditingId(id);
  };

  const sortedAgents = useMemo(() => {
    const weight: Record<AgentKind, number> = { master: 0, sub: 1 };
    return [...agents].sort((a, b) => {
      const kindDiff = weight[a.kind] - weight[b.kind];
      if (kindDiff !== 0) return kindDiff;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [agents]);

  return (
    <div className="space-y-6">
      <SettingsGroup title="Agent 管理">
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            从用户视角：你关心的是“这个 Agent 叫什么、用什么模型、能用哪些工具、会委派哪些子 Agent”。
            当前为 UI 占位：仅本地编辑显示名称/模型，其他字段只读。
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {sortedAgents.map((agent) => {
              const isEditing = editingId === agent.id;

              return (
                <Card key={agent.id} className="py-0">
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="text-base leading-tight">
                          {agent.displayName}
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-2">
                          <Tag>{kindLabel(agent.kind)}</Tag>
                          <div className="text-xs text-muted-foreground">
                            {agent.description}
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDialog({ type: "view", id: agent.id })}
                        >
                          查看
                        </Button>
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingId(null);
                                setEditDraft({ displayName: "", model: "" });
                              }}
                            >
                              取消
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                setAgents((prev) =>
                                  prev.map((item) =>
                                    item.id === agent.id
                                      ? { ...item, ...editDraft }
                                      : item,
                                  ),
                                );
                                setEditingId(null);
                                setEditDraft({ displayName: "", model: "" });
                              }}
                            >
                              保存
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEdit(agent.id)}
                          >
                            编辑
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Field label="显示名称">
                        <Input
                          value={isEditing ? editDraft.displayName : agent.displayName}
                          disabled={!isEditing}
                          onChange={(e) =>
                            setEditDraft((prev) => ({
                              ...prev,
                              displayName: e.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="模型">
                        <Input
                          value={isEditing ? editDraft.model : agent.model}
                          disabled={!isEditing}
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, model: e.target.value }))
                          }
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      <Field label="工具">
                        <Tags values={agent.tools} />
                      </Field>
                      <Field label="子 Agent">
                        <Tags values={agent.subAgents} emptyLabel="无" />
                      </Field>
                    </div>

                    <Separator />

                    <Field label="ID">
                      <Input value={agent.id} readOnly className="font-mono" />
                    </Field>
                  </CardContent>

                  <CardFooter className="justify-end gap-2 pt-4">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setDialog({ type: "delete", id: agent.id })}
                    >
                      删除
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
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
                <Label>类型</Label>
                <Tags values={[kindLabel(selectedAgent.kind)]} />
              </div>

              <div className="space-y-2">
                <Label>描述</Label>
                <Input value={selectedAgent.description} readOnly />
              </div>

              <div className="space-y-2">
                <Label>工具</Label>
                <Tags values={selectedAgent.tools} />
              </div>

              <div className="space-y-2">
                <Label>子 Agent</Label>
                <Tags values={selectedAgent.subAgents} emptyLabel="无" />
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
