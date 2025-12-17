"use client";

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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { SettingsGroup } from "./SettingsGroup";

type ProviderId = "anthropic" | "deepseek" | "openai" | "xai";

type ModelEntry = {
  id: string;
  model: string;
  provider: ProviderId;
  apiKey: string;
};

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: "anthropic", label: "anthropic" },
  { id: "deepseek", label: "deepseek" },
  { id: "openai", label: "openai" },
  { id: "xai", label: "xai" },
];

function generateRowId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function ModelManagement() {
  const [entries, setEntries] = useState<ModelEntry[]>([
    {
      id: generateRowId(),
      model: "gpt-4o-mini",
      provider: "openai",
      apiKey: "********",
    },
    {
      id: generateRowId(),
      model: "claude-3-5-sonnet-latest",
      provider: "anthropic",
      apiKey: "********",
    },
  ]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftProvider, setDraftProvider] = useState<ProviderId>("openai");
  const [draftModel, setDraftModel] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [workspaceProjectRule, setWorkspaceProjectRule] =
    useState("按项目划分");
  const [defaultChatModelId, setDefaultChatModelId] = useState<string>("");
  const [chatModelQuality, setChatModelQuality] = useState<
    "high" | "medium" | "low"
  >("medium");

  const providerLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const provider of PROVIDERS) map[provider.id] = provider.label;
    return map as Record<ProviderId, string>;
  }, []);

  useEffect(() => {
    if (entries.length === 0) {
      setDefaultChatModelId("");
      return;
    }
    if (!defaultChatModelId) {
      setDefaultChatModelId(entries[0]!.id);
      return;
    }
    const exists = entries.some((entry) => entry.id === defaultChatModelId);
    if (!exists) setDefaultChatModelId(entries[0]!.id);
  }, [defaultChatModelId, entries]);

  return (
    <div className="space-y-3">
      <SettingsGroup title="模型设置">
        <div className="divide-y divide-border">
          <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">工作空间项目划分规范</div>
              <div className="text-xs text-muted-foreground">
                影响项目/会话的分类与组织方式
              </div>
            </div>

            <div className="flex flex-1 items-center gap-2">
              <Input
                value={workspaceProjectRule}
                onChange={(event) => setWorkspaceProjectRule(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">默认聊天模型</div>
              <div className="text-xs text-muted-foreground">
                新对话默认使用的模型
              </div>
            </div>

            <div className="flex flex-1 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                    disabled={entries.length === 0}
                  >
                    <span className="truncate">
                      {entries.length === 0
                        ? "暂无模型"
                        : (entries.find((e) => e.id === defaultChatModelId)
                            ?.model ?? "选择模型")}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[320px]">
                  <DropdownMenuRadioGroup
                    value={defaultChatModelId}
                    onValueChange={(next) => setDefaultChatModelId(next)}
                  >
                    {entries.map((entry) => (
                      <DropdownMenuRadioItem key={entry.id} value={entry.id}>
                        <div className="min-w-0">
                          <div className="truncate">{entry.model}</div>
                          <div className="text-xs text-muted-foreground">
                            {providerLabelById[entry.provider]}
                          </div>
                        </div>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0 sm:w-56">
              <div className="text-sm font-medium">聊天模型质量</div>
              <div className="text-xs text-muted-foreground">
                高 / 中 / 低（UI 预设）
              </div>
            </div>

            <div className="flex flex-1 items-center justify-end">
              <Tabs
                value={chatModelQuality}
                onValueChange={(next) =>
                  setChatModelQuality(next as "high" | "medium" | "low")
                }
              >
                <TabsList>
                  <TabsTrigger value="high">高</TabsTrigger>
                  <TabsTrigger value="medium">中</TabsTrigger>
                  <TabsTrigger value="low">低</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>
      </SettingsGroup>

      <div className="flex items-center justify-end">
        <Button
          size="sm"
          onClick={() => {
            setError(null);
            setDraftProvider("openai");
            setDraftModel("");
            setDraftApiKey("");
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          添加模型
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_auto] gap-3 px-4 py-3 text-sm font-semibold text-foreground/80 bg-muted/50 border-b border-border">
          <div>模型</div>
          <div>服务商</div>
          <div className="text-right">操作</div>
        </div>

        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "grid grid-cols-[2fr_1fr_auto] gap-3 items-center px-4 py-3",
                "bg-background hover:bg-muted/15 transition-colors",
              )}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{entry.model}</div>
              </div>

              <div className="text-sm">{providerLabelById[entry.provider]}</div>

              <div className="flex items-center justify-end">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => setConfirmDeleteId(entry.id)}
                  aria-label="Delete model"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {entries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">暂无模型，点击右上角添加。</div>
          ) : null}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加模型</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">供应商</div>
              <select
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                value={draftProvider}
                onChange={(event) => setDraftProvider(event.target.value as ProviderId)}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">模型</div>
              <Input
                value={draftModel}
                placeholder="例如：gpt-4o-mini"
                onChange={(event) => setDraftModel(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">密钥</div>
              <Input
                type="password"
                value={draftApiKey}
                placeholder="输入 API Key"
                onChange={(event) => setDraftApiKey(event.target.value)}
              />
            </div>

            {error ? <div className="text-sm text-destructive">{error}</div> : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                const model = draftModel.trim();
                const apiKey = draftApiKey.trim();
                if (!model) {
                  setError("请填写模型名称");
                  return;
                }
                if (!apiKey) {
                  setError("请填写密钥");
                  return;
                }

                setEntries((prev) => [
                  ...prev,
                  {
                    id: generateRowId(),
                    provider: draftProvider,
                    model,
                    apiKey,
                  },
                ]);
                setDialogOpen(false);
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirmDeleteId)} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            确认要删除这个模型配置吗？
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!confirmDeleteId) return;
                setEntries((prev) => prev.filter((row) => row.id !== confirmDeleteId));
                setConfirmDeleteId(null);
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
