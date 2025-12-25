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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { SettingsGroup } from "./SettingsGroup";
import { useSettingsValues } from "@/hooks/use-settings";
import {
  MODEL_CATALOG_BY_PROVIDER,
  PROVIDER_OPTIONS,
  getDefaultApiUrl,
  getDefaultModelIds,
  getDefaultProviderName,
  getModelLabel,
  getModelSummary,
  resolveModelDefinitions,
  type ProviderId,
  type ModelDefinition,
} from "@teatime-ai/api/common";

type KeyEntry = {
  provider: ProviderId;
  apiUrl: string;
  apiKey: string;
  modelIds: string[];
  modelDefinitions: ModelDefinition[];
};

type ProviderEntry = KeyEntry & {
  key: string;
};

/** Provider id for Volcengine. */
const VOLCENGINE_PROVIDER_ID = "volcengine";
/** Category name for S3 providers stored in settings. */
const S3_PROVIDER_CATEGORY = "provdier";

type S3ProviderOption = {
  /** Provider id stored in settings. */
  id: string;
  /** Display label for UI. */
  label: string;
  /** Default endpoint suggestion. */
  endpoint: string;
  /** Default region suggestion. */
  region: string;
};

/** Common S3 providers displayed in the selector. */
const S3_PROVIDER_OPTIONS: S3ProviderOption[] = [
  {
    id: "aws-s3",
    label: "AWS S3",
    endpoint: "https://s3.amazonaws.com",
    region: "us-east-1",
  },
  {
    id: "cloudflare-r2",
    label: "Cloudflare R2",
    endpoint: "https://<accountid>.r2.cloudflarestorage.com",
    region: "auto",
  },
  {
    id: "minio",
    label: "MinIO",
    endpoint: "http://localhost:9000",
    region: "us-east-1",
  },
  {
    id: "wasabi",
    label: "Wasabi",
    endpoint: "https://s3.wasabisys.com",
    region: "us-east-1",
  },
  {
    id: "backblaze-b2",
    label: "Backblaze B2",
    endpoint: "https://s3.us-west-004.backblazeb2.com",
    region: "us-west-004",
  },
];

/** Lookup map for S3 provider labels. */
const S3_PROVIDER_LABEL_BY_ID = Object.fromEntries(
  S3_PROVIDER_OPTIONS.map((provider) => [provider.id, provider.label]),
) as Record<string, string>;

type S3ProviderValue = {
  /** Provider id. */
  providerId: string;
  /** Provider label for display. */
  providerLabel: string;
  /** Endpoint URL. */
  endpoint: string;
  /** Region name. */
  region: string;
  /** Bucket name. */
  bucket: string;
  /** Access key id. */
  accessKeyId: string;
  /** Secret access key. */
  secretAccessKey: string;
};

type S3ProviderEntry = S3ProviderValue & {
  /** Entry key used as display name. */
  key: string;
};

/**
 * Mask the API key to show the first and last 6 characters.
 */
function maskKey(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const head = trimmed.slice(0, 6);
  const tail = trimmed.slice(-6);
  if (trimmed.length <= 12) return trimmed;
  const maskedMiddle = "*".repeat(trimmed.length - 12);
  return `${head}${maskedMiddle}${tail}`;
}

/**
 * Truncate display text without affecting stored value.
 */
function truncateDisplay(value: string, maxLength = 32) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

/**
 * Copy text into clipboard.
 */
async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    // 兼容旧浏览器的降级方案。
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

/**
 * Parse Volcengine key pair from a single string.
 */
function parseVolcengineKey(value: string) {
  const [accessKeyId, secretAccessKey] = value.split(":");
  return {
    accessKeyId: accessKeyId?.trim() ?? "",
    secretAccessKey: secretAccessKey?.trim() ?? "",
  };
}

/**
 * Compose Volcengine key pair into a single string.
 */
function formatVolcengineKey(accessKeyId: string, secretAccessKey: string) {
  return `${accessKeyId.trim()}:${secretAccessKey.trim()}`;
}

/**
 * Render masked key content for list display.
 */
function formatApiKeyDisplay(provider: ProviderId, apiKey: string) {
  if (provider !== VOLCENGINE_PROVIDER_ID) return truncateDisplay(maskKey(apiKey));
  const { accessKeyId, secretAccessKey } = parseVolcengineKey(apiKey);
  const maskedAk = accessKeyId ? truncateDisplay(accessKeyId, 16) : "";
  const maskedSk = secretAccessKey ? maskKey(secretAccessKey) : "";
  return `AK:${maskedAk} / SK:${maskedSk}`;
}

/**
 * Resolve S3 provider option by id.
 */
function resolveS3ProviderOption(providerId: string) {
  return S3_PROVIDER_OPTIONS.find((option) => option.id === providerId);
}

/**
 * Get default S3 provider name.
 */
function getDefaultS3ProviderName(providerId: string) {
  return resolveS3ProviderOption(providerId)?.label ?? "S3";
}

/**
 * Get default S3 endpoint.
 */
function getDefaultS3Endpoint(providerId: string) {
  return resolveS3ProviderOption(providerId)?.endpoint ?? "";
}

/**
 * Get default S3 region.
 */
function getDefaultS3Region(providerId: string) {
  return resolveS3ProviderOption(providerId)?.region ?? "";
}

/**
 * Render S3 credential snippet for list display.
 */
function formatS3CredentialDisplay(accessKeyId: string, secretAccessKey: string) {
  const maskedAk = accessKeyId ? truncateDisplay(accessKeyId, 16) : "";
  const maskedSk = secretAccessKey ? maskKey(secretAccessKey) : "";
  return `AK:${maskedAk} / SK:${maskedSk}`;
}

export function ProviderManagement() {
  const { items, setValue, removeValue } = useSettingsValues();
  const entries = useMemo(() => {
    const list: ProviderEntry[] = [];
    for (const item of items) {
      if ((item.category ?? "general") !== "provider") continue;
      if (!item.value || typeof item.value !== "object") continue;
      const entry = item.value as Partial<KeyEntry>;
      if (!entry.provider || !entry.apiUrl || !entry.apiKey) continue;
      list.push({
        key: item.key,
        provider: entry.provider as ProviderId,
        apiUrl: entry.apiUrl,
        apiKey: entry.apiKey,
        modelIds: Array.isArray(entry.modelIds) ? entry.modelIds : [],
        modelDefinitions: Array.isArray(entry.modelDefinitions)
          ? (entry.modelDefinitions as ModelDefinition[])
          : [],
      });
    }
    return list;
  }, [items]);
  /** Build list of S3 provider entries from settings. */
  const s3Entries = useMemo(() => {
    const list: S3ProviderEntry[] = [];
    for (const item of items) {
      if ((item.category ?? "general") !== S3_PROVIDER_CATEGORY) continue;
      if (!item.value || typeof item.value !== "object") continue;
      const entry = item.value as Partial<S3ProviderValue>;
      if (
        !entry.providerId ||
        !entry.endpoint ||
        !entry.bucket ||
        !entry.accessKeyId ||
        !entry.secretAccessKey
      ) {
        continue;
      }
      list.push({
        key: item.key,
        providerId: entry.providerId,
        providerLabel:
          (typeof entry.providerLabel === "string" && entry.providerLabel) ||
          S3_PROVIDER_LABEL_BY_ID[entry.providerId] ||
          entry.providerId,
        endpoint: entry.endpoint,
        region: entry.region ?? "",
        bucket: entry.bucket,
        accessKeyId: entry.accessKeyId,
        secretAccessKey: entry.secretAccessKey,
      });
    }
    return list;
  }, [items]);
  /** Track S3 dialog visibility. */
  const [s3DialogOpen, setS3DialogOpen] = useState(false);
  /** Track the S3 entry being edited. */
  const [editingS3Key, setEditingS3Key] = useState<string | null>(null);
  /** Track S3 delete confirmation target. */
  const [confirmS3DeleteId, setConfirmS3DeleteId] = useState<string | null>(null);
  /** Track selected S3 provider id. */
  const [draftS3ProviderId, setDraftS3ProviderId] = useState(
    S3_PROVIDER_OPTIONS[0]?.id ?? "aws-s3",
  );
  /** Track S3 display name. */
  const [draftS3Name, setDraftS3Name] = useState("");
  /** Track S3 endpoint URL. */
  const [draftS3Endpoint, setDraftS3Endpoint] = useState("");
  /** Track S3 region. */
  const [draftS3Region, setDraftS3Region] = useState("");
  /** Track S3 bucket name. */
  const [draftS3Bucket, setDraftS3Bucket] = useState("");
  /** Track S3 access key id. */
  const [draftS3AccessKeyId, setDraftS3AccessKeyId] = useState("");
  /** Track S3 secret access key. */
  const [draftS3SecretAccessKey, setDraftS3SecretAccessKey] = useState("");
  /** Track S3 secret key visibility. */
  const [showS3SecretKey, setShowS3SecretKey] = useState(false);
  /** Track S3 validation errors. */
  const [s3Error, setS3Error] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [draftProvider, setDraftProvider] = useState<ProviderId>("openai");
  const [draftName, setDraftName] = useState("");
  const [draftApiUrl, setDraftApiUrl] = useState("");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [draftAccessKeyId, setDraftAccessKeyId] = useState("");
  const [draftSecretAccessKey, setDraftSecretAccessKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [draftModelIds, setDraftModelIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const providerLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const provider of PROVIDER_OPTIONS) map[provider.id] = provider.label;
    return map as Record<ProviderId, string>;
  }, []);

  /**
   * Open the editor dialog and hydrate the draft fields.
   */
  function openEditor(entry?: ProviderEntry) {
    setError(null);
    const provider = entry?.provider ?? "openai";
    setEditingKey((entry as ProviderEntry | undefined)?.key ?? null);
    setDraftProvider(provider);
    setDraftName(entry?.key ?? getDefaultProviderName(provider));
    setDraftApiUrl(entry?.apiUrl ?? getDefaultApiUrl(provider));
    setDraftApiKey(entry?.apiKey ?? "");
    const parsedKey = parseVolcengineKey(entry?.apiKey ?? "");
    setDraftAccessKeyId(parsedKey.accessKeyId);
    setDraftSecretAccessKey(parsedKey.secretAccessKey);
    setShowApiKey(false);
    setDraftModelIds(entry?.modelIds ?? getDefaultModelIds(provider));
    setDialogOpen(true);
  }

  /**
   * Submit the draft to create or update an entry.
   */
  async function submitDraft() {
    const name = draftName.trim();
    const apiUrl = draftApiUrl.trim();
    const apiKey =
      draftProvider === VOLCENGINE_PROVIDER_ID
        ? formatVolcengineKey(draftAccessKeyId, draftSecretAccessKey)
        : draftApiKey.trim();
    const normalizedName = name.toLowerCase();
    if (!name) {
      setError("请填写名称");
      return;
    }
    if (!apiUrl) {
      setError("请填写 API URL");
      return;
    }
    // 中文注释：火山引擎使用 AK/SK 双字段校验。
    if (draftProvider === VOLCENGINE_PROVIDER_ID) {
      if (!draftAccessKeyId.trim() || !draftSecretAccessKey.trim()) {
        setError("请填写 AccessKeyID 和 SecretAccessKey");
        return;
      }
    } else {
      if (!apiKey) {
        setError("请填写 API KEY");
        return;
      }
    }
    if (draftModelIds.length === 0) {
      setError("请选择模型");
      return;
    }
    const nameExists = entries.some((entry) => {
      if (editingKey && entry.key === editingKey) return false;
      return entry.key.toLowerCase() === normalizedName;
    });
    if (nameExists) {
      setError("名称已存在，请更换");
      return;
    }

    const modelDefinitions = resolveModelDefinitions(draftProvider, draftModelIds);
    if (modelDefinitions.length === 0) {
      setError("模型定义缺失");
      return;
    }
    // 中文注释：模型 ID 以定义为准，确保存储字段同步。
    const entryValue: KeyEntry = {
      provider: draftProvider,
      apiUrl,
      apiKey,
      modelIds: modelDefinitions.map((model) => model.id),
      modelDefinitions,
    };

    if (!editingKey) {
      await setValue(name, entryValue, "provider");
      setDialogOpen(false);
      return;
    }

    const shouldReuseKey = editingKey === name;
    const nextKey = shouldReuseKey ? editingKey : name;
    if (!shouldReuseKey) await removeValue(editingKey, "provider");
    await setValue(nextKey, entryValue, "provider");
    setDialogOpen(false);
  }

  /**
   * Open the S3 editor dialog and hydrate the draft fields.
   */
  function openS3Editor(entry?: S3ProviderEntry) {
    setS3Error(null);
    const providerId = entry?.providerId ?? S3_PROVIDER_OPTIONS[0]?.id ?? "aws-s3";
    setEditingS3Key(entry?.key ?? null);
    setDraftS3ProviderId(providerId);
    setDraftS3Name(entry?.key ?? getDefaultS3ProviderName(providerId));
    setDraftS3Endpoint(entry?.endpoint ?? getDefaultS3Endpoint(providerId));
    setDraftS3Region(entry?.region ?? getDefaultS3Region(providerId));
    setDraftS3Bucket(entry?.bucket ?? "");
    setDraftS3AccessKeyId(entry?.accessKeyId ?? "");
    setDraftS3SecretAccessKey(entry?.secretAccessKey ?? "");
    setShowS3SecretKey(false);
    setS3DialogOpen(true);
  }

  /**
   * Submit the S3 draft to create or update an entry.
   */
  async function submitS3Draft() {
    const name = draftS3Name.trim();
    const endpoint = draftS3Endpoint.trim();
    const region = draftS3Region.trim();
    const bucket = draftS3Bucket.trim();
    const accessKeyId = draftS3AccessKeyId.trim();
    const secretAccessKey = draftS3SecretAccessKey.trim();
    if (!name) {
      setS3Error("请填写名称");
      return;
    }
    if (!endpoint) {
      setS3Error("请填写 Endpoint");
      return;
    }
    if (!bucket) {
      setS3Error("请填写 Bucket");
      return;
    }
    // 统一校验关键鉴权字段，避免保存不可用配置。
    if (!accessKeyId || !secretAccessKey) {
      setS3Error("请填写 AccessKeyID 和 SecretAccessKey");
      return;
    }
    const normalizedName = name.toLowerCase();
    const nameExists = s3Entries.some((entry) => {
      if (editingS3Key && entry.key === editingS3Key) return false;
      return entry.key.toLowerCase() === normalizedName;
    });
    if (nameExists) {
      setS3Error("名称已存在，请更换");
      return;
    }

    const entryValue: S3ProviderValue = {
      providerId: draftS3ProviderId,
      providerLabel:
        S3_PROVIDER_LABEL_BY_ID[draftS3ProviderId] ?? getDefaultS3ProviderName(draftS3ProviderId),
      endpoint,
      region,
      bucket,
      accessKeyId,
      secretAccessKey,
    };

    if (!editingS3Key) {
      await setValue(name, entryValue, S3_PROVIDER_CATEGORY);
      setS3DialogOpen(false);
      return;
    }

    const shouldReuseKey = editingS3Key === name;
    const nextKey = shouldReuseKey ? editingS3Key : name;
    if (!shouldReuseKey) await removeValue(editingS3Key, S3_PROVIDER_CATEGORY);
    await setValue(nextKey, entryValue, S3_PROVIDER_CATEGORY);
    setS3DialogOpen(false);
  }

  const modelOptions = useMemo(
    () => MODEL_CATALOG_BY_PROVIDER[draftProvider]?.getModels() ?? [],
    [draftProvider],
  );

  return (
    <div className="space-y-3">
      <SettingsGroup
        title="AI 服务商"
        action={
          <Button variant="outline" onClick={() => openEditor()}>
            添加
          </Button>
        }
      >
        <div className="text-xs text-muted-foreground">
          配置模型服务商的 API URL 与认证信息。
        </div>
      </SettingsGroup>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[160px_260px_1.5fr_0.8fr_auto] gap-3 px-4 py-3 text-sm font-semibold text-foreground/80 bg-muted/50 border-b border-border">
          <div>AI 服务商</div>
          <div>模型</div>
          <div>API URL</div>
          <div>认证信息</div>
          <div className="text-right">操作</div>
        </div>

        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <div
              key={entry.key}
              className={cn(
                "group grid grid-cols-[160px_260px_1.5fr_0.8fr_auto] gap-3 items-center px-4 py-3",
                "bg-background hover:bg-muted/15 transition-colors",
              )}
            >
              <div className="text-sm">{entry.key}</div>

              <div className="text-sm text-muted-foreground break-words whitespace-normal">
                <div className="flex flex-col gap-1">
                  {entry.modelDefinitions.map((model) => (
                    <span key={model.id}>{getModelLabel(model)}</span>
                  ))}
                </div>
              </div>

              <div className="min-w-0 flex items-center gap-2">
                <div className="text-sm truncate">{truncateDisplay(entry.apiUrl)}</div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-5 w-5 opacity-0 text-muted-foreground/70 transition-opacity group-hover:opacity-100"
                  onClick={async () => {
                    await copyToClipboard(entry.apiUrl);
                    setCopiedKey(entry.key);
                    window.setTimeout(() => {
                      setCopiedKey((prev) => (prev === entry.key ? null : prev));
                    }, 1200);
                  }}
                  aria-label="复制 API URL"
                >
                  {copiedKey === entry.key ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>

              <div className="min-w-0 text-sm font-mono truncate">
                {formatApiKeyDisplay(entry.provider, entry.apiKey)}
              </div>

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
                  onClick={() => setConfirmDeleteId(entry.key)}
                  aria-label="Delete key"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {entries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              暂无 AI 服务商，点击右上角添加。
            </div>
          ) : null}
        </div>
      </div>

      <SettingsGroup
        title="S3 存储服务商"
        action={
          <Button variant="outline" onClick={() => openS3Editor()}>
            添加
          </Button>
        }
      >
        <div className="text-xs text-muted-foreground">
          配置对象存储服务商的 Endpoint 与访问凭证。
        </div>
      </SettingsGroup>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[160px_140px_1.4fr_120px_160px_200px_auto] gap-3 px-4 py-3 text-sm font-semibold text-foreground/80 bg-muted/50 border-b border-border">
          <div>名称</div>
          <div>服务商</div>
          <div>Endpoint</div>
          <div>Region</div>
          <div>Bucket</div>
          <div>认证信息</div>
          <div className="text-right">操作</div>
        </div>

        <div className="divide-y divide-border">
          {s3Entries.map((entry) => (
            <div
              key={entry.key}
              className={cn(
                "group grid grid-cols-[160px_140px_1.4fr_120px_160px_200px_auto] gap-3 items-center px-4 py-3",
                "bg-background hover:bg-muted/15 transition-colors",
              )}
            >
              <div className="text-sm">{entry.key}</div>
              <div className="text-sm text-muted-foreground">
                {entry.providerLabel}
              </div>
              <div className="text-sm truncate">{truncateDisplay(entry.endpoint)}</div>
              <div className="text-sm text-muted-foreground">
                {entry.region || "-"}
              </div>
              <div className="text-sm text-muted-foreground">{entry.bucket}</div>
              <div className="min-w-0 text-sm font-mono truncate">
                {formatS3CredentialDisplay(entry.accessKeyId, entry.secretAccessKey)}
              </div>
              <div className="flex items-center justify-end gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => openS3Editor(entry)}
                  aria-label="Edit S3 entry"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => setConfirmS3DeleteId(entry.key)}
                  aria-label="Delete S3 entry"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {s3Entries.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              暂无 S3 存储服务商，点击右上角添加。
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingKey ? "编辑服务商" : "添加服务商"}</DialogTitle>
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
                      const nextDefaultModels = getDefaultModelIds(provider);
                      setDraftProvider(provider);
                      if (!draftApiUrl.trim() || draftApiUrl.trim() === currentDefault) {
                        setDraftApiUrl(nextDefault);
                      }
                      if (!draftName.trim() || draftName.trim() === currentDefaultName) {
                        setDraftName(nextDefaultName);
                      }
                      if (provider === VOLCENGINE_PROVIDER_ID) {
                        setDraftApiKey("");
                        setDraftAccessKeyId("");
                        setDraftSecretAccessKey("");
                      }
                      setDraftModelIds((prev) => {
                        if (prev.length === 0) return nextDefaultModels;
                        const nextSet = new Set(nextDefaultModels);
                        const intersect = prev.filter((id) => nextSet.has(id));
                        return intersect.length > 0 ? intersect : nextDefaultModels;
                      });
                    }}
                  >
                    {PROVIDER_OPTIONS.map((p) => (
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
              <div className="text-sm font-medium">模型</div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {getModelSummary(modelOptions, draftModelIds)}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[320px]">
                  {modelOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      暂无可选模型
                    </div>
                  ) : (
                    modelOptions.map((model) => (
                      <DropdownMenuCheckboxItem
                        key={model.id}
                        checked={draftModelIds.includes(model.id)}
                        onSelect={(event) => {
                          event.preventDefault();
                        }}
                        onCheckedChange={(checked) => {
                          setDraftModelIds((prev) => {
                            if (checked) return Array.from(new Set([...prev, model.id]));
                            return prev.filter((id) => id !== model.id);
                          });
                        }}
                      >
                        {getModelLabel(model)}
                      </DropdownMenuCheckboxItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">认证信息</div>
              {draftProvider === VOLCENGINE_PROVIDER_ID ? (
                <div className="space-y-2">
                  <Input
                    value={draftAccessKeyId}
                    placeholder="AccessKeyID"
                    onChange={(event) => setDraftAccessKeyId(event.target.value)}
                  />
                  <div className="relative">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={draftSecretAccessKey}
                      placeholder="SecretAccessKey"
                      onChange={(event) => setDraftSecretAccessKey(event.target.value)}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                      onClick={() => setShowApiKey((prev) => !prev)}
                      aria-label={showApiKey ? "隐藏 SecretAccessKey" : "显示 SecretAccessKey"}
                    >
                      {showApiKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={draftApiKey}
                    placeholder="输入 API KEY"
                    onChange={(event) => setDraftApiKey(event.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                    onClick={() => setShowApiKey((prev) => !prev)}
                    aria-label={showApiKey ? "隐藏 API KEY" : "显示 API KEY"}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}
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

      <Dialog open={s3DialogOpen} onOpenChange={setS3DialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingS3Key ? "编辑 S3 服务商" : "添加 S3 服务商"}</DialogTitle>
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
                      {S3_PROVIDER_LABEL_BY_ID[draftS3ProviderId] ??
                        draftS3ProviderId}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[320px]">
                  <DropdownMenuRadioGroup
                    value={draftS3ProviderId}
                    onValueChange={(next) => {
                      const providerId = next;
                      const currentDefaultEndpoint = getDefaultS3Endpoint(draftS3ProviderId);
                      const nextDefaultEndpoint = getDefaultS3Endpoint(providerId);
                      const currentDefaultName = getDefaultS3ProviderName(draftS3ProviderId);
                      const nextDefaultName = getDefaultS3ProviderName(providerId);
                      const currentDefaultRegion = getDefaultS3Region(draftS3ProviderId);
                      const nextDefaultRegion = getDefaultS3Region(providerId);
                      setDraftS3ProviderId(providerId);
                      // 保留用户填写内容，仅在与默认值一致时自动切换。
                      if (
                        !draftS3Endpoint.trim() ||
                        draftS3Endpoint.trim() === currentDefaultEndpoint
                      ) {
                        setDraftS3Endpoint(nextDefaultEndpoint);
                      }
                      if (
                        !draftS3Name.trim() ||
                        draftS3Name.trim() === currentDefaultName
                      ) {
                        setDraftS3Name(nextDefaultName);
                      }
                      if (
                        !draftS3Region.trim() ||
                        draftS3Region.trim() === currentDefaultRegion
                      ) {
                        setDraftS3Region(nextDefaultRegion);
                      }
                    }}
                  >
                    {S3_PROVIDER_OPTIONS.map((provider) => (
                      <DropdownMenuRadioItem key={provider.id} value={provider.id}>
                        {provider.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">名称</div>
              <Input
                value={draftS3Name}
                placeholder="例如：AWS-S3"
                onChange={(event) => setDraftS3Name(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Endpoint</div>
              <Input
                value={draftS3Endpoint}
                placeholder="例如：https://s3.amazonaws.com"
                onChange={(event) => setDraftS3Endpoint(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Region</div>
              <Input
                value={draftS3Region}
                placeholder="例如：us-east-1（可选）"
                onChange={(event) => setDraftS3Region(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Bucket</div>
              <Input
                value={draftS3Bucket}
                placeholder="例如：teatime-bucket"
                onChange={(event) => setDraftS3Bucket(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">AccessKeyID</div>
              <Input
                value={draftS3AccessKeyId}
                placeholder="输入 AccessKeyID"
                onChange={(event) => setDraftS3AccessKeyId(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">SecretAccessKey</div>
              <div className="relative">
                <Input
                  type={showS3SecretKey ? "text" : "password"}
                  value={draftS3SecretAccessKey}
                  placeholder="输入 SecretAccessKey"
                  onChange={(event) => setDraftS3SecretAccessKey(event.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                  onClick={() => setShowS3SecretKey((prev) => !prev)}
                  aria-label={showS3SecretKey ? "隐藏 SecretAccessKey" : "显示 SecretAccessKey"}
                >
                  {showS3SecretKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {s3Error ? <div className="text-sm text-destructive">{s3Error}</div> : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setS3DialogOpen(false)}>
              取消
            </Button>
            <Button onClick={submitS3Draft}>保存</Button>
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
              onClick={async () => {
                if (!confirmDeleteId) return;
                await removeValue(confirmDeleteId, "provider");
                setConfirmDeleteId(null);
              }}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmS3DeleteId)}
        onOpenChange={(open) => !open && setConfirmS3DeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            确认要删除这个 S3 服务商配置吗？
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmS3DeleteId(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!confirmS3DeleteId) return;
                await removeValue(confirmS3DeleteId, S3_PROVIDER_CATEGORY);
                setConfirmS3DeleteId(null);
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
