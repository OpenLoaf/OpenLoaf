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
import { useSetting } from "@/hooks/use-settings";
import { WebSettingDefs } from "@/lib/setting-defs";

type ProviderId = "anthropic" | "deepseek" | "openai" | "xai" | "custom";

type ProviderTypeId = "modelProvider";

type KeyEntry = {
  id: string;
  provider: ProviderId;
  name: string;
  type: ProviderTypeId;
  apiUrl: string;
  apiKey: string;
};

const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
  { id: "openai", label: "openai" },
  { id: "anthropic", label: "anthropic" },
  { id: "deepseek", label: "deepseek" },
  { id: "xai", label: "xai" },
  { id: "custom", label: "自定义" },
];

/**
 * Generate a row id, preferring the browser UUID API when available.
 */
function generateRowId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * Mask the API key to show the first and last 6 characters.
 */
function maskKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `${trimmed.slice(0, 6)}-${trimmed.slice(-6)}`;
}

/**
 * Provide the default API URL for known providers.
 */
function getDefaultApiUrl(provider: ProviderId) {
  const defaults: Record<ProviderId, string> = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com/v1",
    deepseek: "https://api.deepseek.com/v1",
    xai: "https://api.x.ai/v1",
    custom: "",
  };
  return defaults[provider];
}

/**
 * Provide the default display name for a provider.
 */
function getDefaultProviderName(provider: ProviderId) {
  const defaults: Record<ProviderId, string> = {
    openai: "OPENAI",
    anthropic: "ANTHROPIC",
    deepseek: "DEEPSEEK",
    xai: "XAI",
    custom: "自定义",
  };
  return defaults[provider];
}

export function ProviderManagement() {
  const { value: entriesRaw, setValue: setEntriesValue } = useSetting(
    WebSettingDefs.KeyEntries,
  );
  const entries = Array.isArray(entriesRaw) ? (entriesRaw as KeyEntry[]) : [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [draftProvider, setDraftProvider] = useState<ProviderId>("openai");
  const [draftName, setDraftName] = useState("");
  const [draftApiUrl, setDraftApiUrl] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const providerLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const provider of PROVIDERS) map[provider.id] = provider.label;
    return map as Record<ProviderId, string>;
  }, []);

  /**
   * Open the editor dialog and hydrate the draft fields.
   */
  function openEditor(entry?: KeyEntry) {
    setError(null);
    setEditingId(entry?.id ?? null);
    const provider = entry?.provider ?? "openai";
    setDraftProvider(provider);
    setDraftName(entry?.name ?? getDefaultProviderName(provider));
    setDraftApiUrl(entry?.apiUrl ?? getDefaultApiUrl(provider));
    setDraftApiKey("");
    setDialogOpen(true);
  }

  /**
   * Submit the draft to create or update an entry.
   */
  function submitDraft() {
    const name = draftName.trim();
    const apiUrl = draftApiUrl.trim();
    const apiKey = draftApiKey.trim();
    if (!name) {
      setError("请填写名称");
      return;
    }
    if (!apiUrl) {
      setError("请填写 API URL");
      return;
    }
    if (!apiKey) {
      setError("请填写 API KEY");
      return;
    }

    if (!editingId) {
      void setEntriesValue([
        ...entries,
        {
          id: generateRowId(),
          provider: draftProvider,
          name,
          type: "modelProvider",
          apiUrl,
          apiKey,
        },
      ]);
      setDialogOpen(false);
      return;
    }

    void setEntriesValue(
      entries.map((row) =>
        row.id === editingId
          ? {
              ...row,
              provider: draftProvider,
              name,
              type: "modelProvider",
              apiUrl,
              apiKey,
            }
          : row,
      ),
    );
    setDialogOpen(false);
  }

  return (
    <div className="space-y-3">
      <SettingsGroup
        title="服务商"
        action={
          <Button size="sm" onClick={() => openEditor()}>
            <Plus className="h-4 w-4" />
            添加服务商
          </Button>
        }
      >
        <div className="text-xs text-muted-foreground">
          配置模型服务商的 API URL 与 API KEY。
        </div>
      </SettingsGroup>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[180px_180px_160px_2fr_1fr_auto] gap-3 px-4 py-3 text-sm font-semibold text-foreground/80 bg-muted/50 border-b border-border">
          <div>服务商</div>
          <div>名称</div>
          <div>类型</div>
          <div>API URL</div>
          <div>API KEY</div>
          <div className="text-right">操作</div>
        </div>

        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "grid grid-cols-[180px_180px_160px_2fr_1fr_auto] gap-3 items-center px-4 py-3",
                "bg-background hover:bg-muted/15 transition-colors",
              )}
            >
              <div className="text-sm font-medium">
                {providerLabelById[entry.provider]}
              </div>

              <div className="text-sm">{entry.name}</div>

              <div className="text-sm text-muted-foreground">
                {(entry.type ?? "modelProvider") === "modelProvider"
                  ? "模型服务商"
                  : entry.type}
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
              暂无服务商，点击右上角添加。
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "编辑服务商" : "添加服务商"}</DialogTitle>
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
                onValueChange={(next) => {
                  const provider = next as ProviderId;
                  const currentDefault = getDefaultApiUrl(draftProvider);
                  const nextDefault = getDefaultApiUrl(provider);
                  const currentDefaultName = getDefaultProviderName(draftProvider);
                  const nextDefaultName = getDefaultProviderName(provider);
                  setDraftProvider(provider);
                  if (!draftApiUrl.trim() || draftApiUrl.trim() === currentDefault) {
                    setDraftApiUrl(nextDefault);
                  }
                  if (!draftName.trim() || draftName.trim() === currentDefaultName) {
                    setDraftName(nextDefaultName);
                  }
                }}
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
              <div className="text-sm font-medium">名称</div>
              <Input
                value={draftName}
                placeholder="例如：OPENAI"
                onChange={(event) => setDraftName(event.target.value)}
              />
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
            确认要删除这个服务商配置吗？
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!confirmDeleteId) return;
                void setEntriesValue(
                  entries.filter((row) => row.id !== confirmDeleteId),
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
