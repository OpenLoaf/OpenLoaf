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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { SettingsGroup } from "./SettingsGroup";

type ProviderId = "anthropic" | "deepseek" | "openai" | "xai" | "custom";

type KeyEntry = {
  id: string;
  provider: ProviderId;
  apiUrl: string;
  apiKey: string;
};

const STORAGE_KEY = "teatime:key-entries";

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: "openai", label: "openai" },
  { id: "anthropic", label: "anthropic" },
  { id: "deepseek", label: "deepseek" },
  { id: "xai", label: "xai" },
  { id: "custom", label: "自定义" },
];

/**
 * 生成表格行 ID（优先使用浏览器原生 UUID）。
 */
function generateRowId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * 将 API Key 显示为掩码，避免误暴露。
 */
function maskKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "********";
  return `****${trimmed.slice(-4)}`;
}

/**
 * 从 localStorage 读取并做最小化校验（MVP）。
 */
function loadEntriesFromStorage(): KeyEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is KeyEntry => {
        if (!item || typeof item !== "object") return false;
        const it = item as Partial<KeyEntry>;
        return (
          typeof it.id === "string" &&
          typeof it.provider === "string" &&
          typeof it.apiUrl === "string" &&
          typeof it.apiKey === "string"
        );
      })
      .map((it) => ({
        id: it.id,
        provider: (it.provider as ProviderId) ?? "custom",
        apiUrl: it.apiUrl,
        apiKey: it.apiKey,
      }));
  } catch {
    return [];
  }
}

/**
 * 保存到 localStorage（MVP）。
 */
function saveEntriesToStorage(entries: KeyEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function KeyManagement() {
  const [entries, setEntries] = useState<KeyEntry[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [draftProvider, setDraftProvider] = useState<ProviderId>("openai");
  const [draftApiUrl, setDraftApiUrl] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const providerLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const provider of PROVIDERS) map[provider.id] = provider.label;
    return map as Record<ProviderId, string>;
  }, []);

  useEffect(() => {
    setEntries(loadEntriesFromStorage());
  }, []);

  useEffect(() => {
    saveEntriesToStorage(entries);
  }, [entries]);

  /**
   * 打开“新增/编辑”弹窗，并初始化草稿数据。
   */
  function openEditor(entry?: KeyEntry) {
    setError(null);
    setEditingId(entry?.id ?? null);
    setDraftProvider(entry?.provider ?? "openai");
    setDraftApiUrl(entry?.apiUrl ?? "");
    setDraftApiKey(entry?.apiKey ?? "");
    setDialogOpen(true);
  }

  /**
   * 提交草稿：新增或更新条目。
   */
  function submitDraft() {
    const apiUrl = draftApiUrl.trim();
    const apiKey = draftApiKey.trim();
    if (!apiUrl) {
      setError("请填写 API URL");
      return;
    }
    if (!apiKey) {
      setError("请填写 API KEY");
      return;
    }

    if (!editingId) {
      setEntries((prev) => [
        ...prev,
        {
          id: generateRowId(),
          provider: draftProvider,
          apiUrl,
          apiKey,
        },
      ]);
      setDialogOpen(false);
      return;
    }

    setEntries((prev) =>
      prev.map((row) =>
        row.id === editingId
          ? { ...row, provider: draftProvider, apiUrl, apiKey }
          : row,
      ),
    );
    setDialogOpen(false);
  }

  return (
    <div className="space-y-3">
      <SettingsGroup
        title="密钥"
        action={
          <Button size="sm" onClick={() => openEditor()}>
            <Plus className="h-4 w-4" />
            添加密钥
          </Button>
        }
      >
        <div className="text-xs text-muted-foreground">
          配置不同服务商的 API URL 与 API KEY（MVP：仅保存在本地浏览器）。
        </div>
      </SettingsGroup>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[180px_2fr_1fr_auto] gap-3 px-4 py-3 text-sm font-semibold text-foreground/80 bg-muted/50 border-b border-border">
          <div>服务商</div>
          <div>API URL</div>
          <div>API KEY</div>
          <div className="text-right">操作</div>
        </div>

        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "grid grid-cols-[180px_2fr_1fr_auto] gap-3 items-center px-4 py-3",
                "bg-background hover:bg-muted/15 transition-colors",
              )}
            >
              <div className="text-sm font-medium">
                {providerLabelById[entry.provider]}
              </div>

              <div className="min-w-0">
                <div className="text-sm truncate">{entry.apiUrl}</div>
              </div>

              <div className="text-sm font-mono">{maskKey(entry.apiKey)}</div>

              <div className="flex items-center justify-end gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => openEditor(entry)}
                  aria-label="Edit key"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => setConfirmDeleteId(entry.id)}
                  aria-label="Delete key"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {entries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              暂无密钥，点击右上角添加。
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑密钥" : "添加密钥"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">服务商</div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {providerLabelById[draftProvider]}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[320px]">
                  <DropdownMenuRadioGroup
                    value={draftProvider}
                    onValueChange={(next) =>
                      setDraftProvider(next as ProviderId)
                    }
                  >
                    {PROVIDERS.map((p) => (
                      <DropdownMenuRadioItem key={p.id} value={p.id}>
                        {p.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">API URL</div>
              <Input
                value={draftApiUrl}
                placeholder="例如：https://api.openai.com/v1"
                onChange={(event) => setDraftApiUrl(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">API KEY</div>
              <Input
                type="password"
                value={draftApiKey}
                placeholder="输入 API KEY"
                onChange={(event) => setDraftApiKey(event.target.value)}
              />
            </div>

            {error ? <div className="text-sm text-destructive">{error}</div> : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={submitDraft}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            确认要删除这个密钥配置吗？
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!confirmDeleteId) return;
                setEntries((prev) =>
                  prev.filter((row) => row.id !== confirmDeleteId),
                );
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
