"use client";

import type { ReactNode } from "react";
import { Button } from "@tenas-ai/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tenas-ai/ui/dialog";
import { Input } from "@tenas-ai/ui/input";
import { Separator } from "@tenas-ai/ui/separator";
import { cn } from "@/lib/utils";
import type { AgentPanelState, AgentRow } from "./AgentManagement";

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

function Tags({ values, emptyLabel }: { values: string[]; emptyLabel?: string }) {
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

function kindLabel(_: AgentRow["kind"]) {
  return "Master";
}

export function AgentDetailsDialog({
  panel,
  agent,
  draft,
  onChangeDraft,
  onClose,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  panel: AgentPanelState;
  agent: AgentRow | undefined;
  draft: Pick<AgentRow, "displayName" | "model">;
  onChangeDraft: (next: Pick<AgentRow, "displayName" | "model">) => void;
  onClose: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const open = Boolean(panel);
  const isEditing = panel?.mode === "edit";
  const isDirty = Boolean(
    isEditing &&
      agent &&
      (draft.displayName.trim() !== agent.displayName ||
        draft.model.trim() !== agent.model),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑 Agent" : "查看 Agent"}</DialogTitle>
        </DialogHeader>

        {agent ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Tag className="bg-background">{kindLabel(agent.kind)}</Tag>
              <Tag className="bg-background font-mono text-[11px] text-foreground/80">
                {agent.model}
              </Tag>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="显示名称">
                {isEditing ? (
                  <Input
                    value={draft.displayName}
                    onChange={(event) =>
                      onChangeDraft({
                        ...draft,
                        displayName: event.target.value,
                      })
                    }
                  />
                ) : (
                  <Input value={agent.displayName} readOnly />
                )}
              </Field>

              <Field label="模型">
                {isEditing ? (
                  <Input
                    value={draft.model}
                    onChange={(event) =>
                      onChangeDraft({ ...draft, model: event.target.value })
                    }
                  />
                ) : (
                  <Input value={agent.model} readOnly className="font-mono" />
                )}
              </Field>
            </div>

            <Field label="描述">
              <div className="text-sm text-muted-foreground">
                {agent.description || "—"}
              </div>
            </Field>

            <Separator />

            <Field label="工具">
              <Tags values={agent.tools} emptyLabel="无" />
            </Field>

          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            该 Agent 已被删除或不存在。
          </div>
        )}

        <DialogFooter>
          {agent ? (
            isEditing ? (
              <>
                <Button variant="ghost" onClick={onCancelEdit}>
                  取消
                </Button>
                <Button
                  onClick={onSave}
                  disabled={
                    !isDirty || !draft.displayName.trim() || !draft.model.trim()
                  }
                >
                  保存
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={onEdit}>
                  编辑
                </Button>
                <Button variant="destructive" onClick={onDelete}>
                  删除
                </Button>
              </>
            )
          ) : (
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAgentDialog({
  open,
  agent,
  onClose,
  onConfirm,
}: {
  open: boolean;
  agent: AgentRow | undefined;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>删除 Agent</DialogTitle>
        </DialogHeader>

        {agent ? (
          <div className="space-y-2 text-sm">
            <div>
              确认删除 <span className="font-medium">{agent.displayName}</span> 吗？
            </div>
            <div className="text-xs text-muted-foreground">
              当前仅影响本地 UI 列表，不会写入数据库。
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">该 Agent 不存在或已删除。</div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="destructive" disabled={!agent} onClick={onConfirm}>
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
