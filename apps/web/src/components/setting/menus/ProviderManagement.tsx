"use client";

import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, ChevronUp, Copy, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { SettingsGroup } from "./SettingsGroup";
import { useSettingsValues } from "@/hooks/use-settings";
import {
  getModelLabel,
  getProviderDefinition,
  getProviderModels,
  getProviderOptions,
} from "@/lib/model-registry";
import { resolvePriceTier, type IOType, type ModelDefinition, type ModelTag } from "@teatime-ai/api/common";

type ProviderSettingValue = {
  /** Provider id. */
  providerId: string;
  /** API base URL. */
  apiUrl: string;
  /** Raw auth config. */
  authConfig: Record<string, unknown>;
  /** Enabled model ids. */
  modelIds: string[];
  /** Custom model definitions. */
  customModels?: ModelDefinition[];
};

type ProviderEntry = ProviderSettingValue & {
  key: string;
};

const PROVIDER_OPTIONS = getProviderOptions();
const PROVIDER_LABEL_BY_ID = Object.fromEntries(
  PROVIDER_OPTIONS.map((provider) => [provider.id, provider.label]),
) as Record<string, string>;
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
 * Mask auth config for list display.
 */
function formatAuthConfigDisplay(authConfig: Record<string, unknown> | undefined) {
  if (!authConfig || typeof authConfig !== "object") return "-";
  const apiKey = authConfig.apiKey;
  if (typeof apiKey === "string") return truncateDisplay(maskKey(apiKey));
  const accessKeyId = authConfig.accessKeyId;
  const secretAccessKey = authConfig.secretAccessKey;
  if (typeof accessKeyId === "string" || typeof secretAccessKey === "string") {
    const maskedAk = typeof accessKeyId === "string" ? truncateDisplay(accessKeyId, 16) : "";
    const maskedSk = typeof secretAccessKey === "string" ? maskKey(secretAccessKey) : "";
    return `AK:${maskedAk} / SK:${maskedSk}`;
  }
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(authConfig)) {
    // 中文注释：包含 key 的字段使用掩码，避免明文泄露。
    if (typeof value === "string" && key.toLowerCase().includes("key")) {
      masked[key] = maskKey(value);
    } else {
      masked[key] = value;
    }
  }
  return truncateDisplay(JSON.stringify(masked), 48);
}

// 标签显示文案映射。
const MODEL_TAG_LABELS: Record<ModelTag, string> = {
  text_to_image: "文生图",
  image_to_image: "图生图",
  image_edit: "图片编辑",
  text_generation: "文本生成",
  video_generation: "视频生成",
  asr: "语音识别",
  tts: "语音输出",
  tool_call: "工具调用",
};

// IO label mapping for UI.
const IO_LABELS: Record<IOType, string> = {
  text: "文本",
  image: "图片",
  audio: "音频",
  video: "视频",
};

const IO_OPTIONS = Object.entries(IO_LABELS).map(([value, label]) => ({
  value: value as IOType,
  label,
}));

const MODEL_TAG_OPTIONS = Object.entries(MODEL_TAG_LABELS).map(([value, label]) => ({
  value: value as ModelTag,
  label,
}));

/**
 * Format price label for a model definition.
 */
function formatModelPriceLabel(definition?: ModelDefinition): string {
  if (!definition) return "-";
  // 逻辑：按 1M tokens 输出价格结构，匹配当前定价策略。
  const tier = resolvePriceTier(definition, 0);
  if (!tier) return "-";
  const symbol = definition.currencySymbol ?? "";
  const pricePrefix = symbol ? `${symbol}` : "";
  return `输入 ${pricePrefix}${tier.input} / 缓存 ${pricePrefix}${tier.inputCache} / 输出 ${pricePrefix}${tier.output}`;
}

/**
 * Render IO tags for a model.
 */
function renderIoTags(types: IOType[]) {
  return (
    <div className="flex flex-wrap gap-1">
      {types.map((io) => (
        <span
          key={io}
          className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
        >
          {IO_LABELS[io] ?? io}
        </span>
      ))}
    </div>
  );
}

/**
 * Render model tags for a model.
 */
function renderModelTags(tags: ModelTag[]) {
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
        >
          {MODEL_TAG_LABELS[tag] ?? tag}
        </span>
      ))}
    </div>
  );
}

function renderModelTagsCompact(tags: ModelTag[]) {
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground"
        >
          {MODEL_TAG_LABELS[tag] ?? tag}
        </span>
      ))}
    </div>
  );
}

/** Normalize custom model definitions from settings payload. */
function normalizeCustomModels(value: unknown): ModelDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ModelDefinition => {
    return Boolean(item && typeof item === "object" && "id" in item);
  });
}

/** Merge provider registry models with custom models. */
function mergeProviderModels(providerId: string, customModels: ModelDefinition[]) {
  const baseModels = getProviderModels(providerId);
  const merged = new Map<string, ModelDefinition>();
  baseModels.forEach((model) => merged.set(model.id, model));
  customModels.forEach((model) =>
    merged.set(model.id, {
      ...model,
      // 中文注释：自定义模型强制绑定当前 providerId。
      providerId,
    }),
  );
  return Array.from(merged.values());
}

/** Resolve model definition from merged models list. */
function resolveMergedModelDefinition(
  providerId: string,
  modelId: string,
  customModels: ModelDefinition[],
) {
  const models = mergeProviderModels(providerId, customModels);
  return models.find((model) => model.id === modelId);
}

/** Toggle item in selection list. */
function toggleSelection<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function getProviderCapabilities(providerId: string, customModels: ModelDefinition[]): ModelTag[] {
  const models = mergeProviderModels(providerId, customModels);
  const uniqueTags = new Set<ModelTag>();
  models.forEach((model) => {
    model.tags.forEach((tag) => uniqueTags.add(tag));
  });
  return Array.from(uniqueTags);
}

/**
 * Normalize auth config for input display.
 */
type AuthMode = "apiKey" | "accessKey";

/**
 * Resolve auth mode from provider definition or stored auth config.
 */
function resolveAuthMode(
  providerId: string,
  authConfig?: Record<string, unknown>
): AuthMode {
  const providerAuthConfig = getProviderDefinition(providerId)?.authConfig ?? {};
  const hasAccessKey =
    typeof authConfig?.accessKeyId === "string" ||
    typeof authConfig?.secretAccessKey === "string" ||
    "accessKeyId" in providerAuthConfig ||
    "secretAccessKey" in providerAuthConfig;
  return hasAccessKey ? "accessKey" : "apiKey";
}

/**
 * Normalize auth config into editor fields.
 */
function normalizeAuthFields(authConfig?: Record<string, unknown>) {
  if (!authConfig || typeof authConfig !== "object") {
    return { apiKey: "", accessKeyId: "", secretAccessKey: "" };
  }
  return {
    apiKey: typeof authConfig.apiKey === "string" ? authConfig.apiKey : "",
    accessKeyId: typeof authConfig.accessKeyId === "string" ? authConfig.accessKeyId : "",
    secretAccessKey:
      typeof authConfig.secretAccessKey === "string" ? authConfig.secretAccessKey : "",
  };
}

/**
 * Resolve default provider name from registry.
 */
function getDefaultProviderName(providerId: string) {
  return getProviderDefinition(providerId)?.label ?? providerId;
}

/**
 * Resolve default API URL from registry.
 */
function getDefaultApiUrl(providerId: string) {
  return getProviderDefinition(providerId)?.apiUrl ?? "";
}

/**
 * Resolve default model id from registry.
 */
function getDefaultModelIds(providerId: string) {
  const models = getProviderModels(providerId);
  const first = models[0];
  return first ? [first.id] : [];
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
      const entry = item.value as Partial<ProviderSettingValue>;
      if (!entry.providerId || !entry.apiUrl || !entry.authConfig) continue;
      const customModels = normalizeCustomModels(entry.customModels);
      list.push({
        key: item.key,
        providerId: entry.providerId,
        apiUrl: entry.apiUrl,
        authConfig: entry.authConfig as Record<string, unknown>,
        modelIds: Array.isArray(entry.modelIds) ? entry.modelIds : [],
        customModels,
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

  const [draftProvider, setDraftProvider] = useState<string>(
    PROVIDER_OPTIONS[0]?.id ?? "",
  );
  const [draftName, setDraftName] = useState("");
  const [draftApiUrl, setDraftApiUrl] = useState("");
  const [draftAuthMode, setDraftAuthMode] = useState<AuthMode>("apiKey");
  const [draftApiKey, setDraftApiKey] = useState("");
  const [draftAccessKeyId, setDraftAccessKeyId] = useState("");
  const [draftSecretAccessKey, setDraftSecretAccessKey] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [showSecretAccessKey, setShowSecretAccessKey] = useState(false);
  const [draftModelIds, setDraftModelIds] = useState<string[]>([]);
  /** Track custom models added in the editor. */
  const [draftCustomModels, setDraftCustomModels] = useState<ModelDefinition[]>([]);
  /** Track model keyword filter. */
  const [draftModelFilter, setDraftModelFilter] = useState("");
  /** Track focused model id in selector. */
  const [focusedModelId, setFocusedModelId] = useState<string | null>(null);
  /** Track create model dialog visibility. */
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  /** Track draft model id. */
  const [draftModelId, setDraftModelId] = useState("");
  /** Track draft model input types. */
  const [draftModelInput, setDraftModelInput] = useState<IOType[]>([]);
  /** Track draft model output types. */
  const [draftModelOutput, setDraftModelOutput] = useState<IOType[]>([]);
  /** Track draft model tags. */
  const [draftModelTags, setDraftModelTags] = useState<ModelTag[]>([]);
  /** Track draft model context window. */
  const [draftModelContextK, setDraftModelContextK] = useState("0");
  /** Track draft model currency symbol. */
  const [draftModelCurrencySymbol, setDraftModelCurrencySymbol] = useState("");
  /** Track draft model input price. */
  const [draftModelInputPrice, setDraftModelInputPrice] = useState("");
  /** Track draft model cached input price. */
  const [draftModelInputCachePrice, setDraftModelInputCachePrice] = useState("");
  /** Track draft model output price. */
  const [draftModelOutputPrice, setDraftModelOutputPrice] = useState("");
  /** Track draft model validation errors. */
  const [modelError, setModelError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  /** Track expanded provider rows. */
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});

  const providerLabelById = PROVIDER_LABEL_BY_ID;

  /**
   * Open the editor dialog and hydrate the draft fields.
   */
  function openEditor(entry?: ProviderEntry) {
    setError(null);
    const provider = entry?.providerId ?? PROVIDER_OPTIONS[0]?.id ?? "";
    const providerDefinition = getProviderDefinition(provider);
    const providerModels = getProviderModels(provider);
    const authMode = resolveAuthMode(provider, entry?.authConfig);
    const authFields = normalizeAuthFields(entry?.authConfig);
    const customModels = entry?.customModels ?? [];
    setEditingKey((entry as ProviderEntry | undefined)?.key ?? null);
    setDraftProvider(provider);
    setDraftName(entry?.key ?? providerDefinition?.label ?? provider);
    setDraftApiUrl(entry?.apiUrl ?? providerDefinition?.apiUrl ?? "");
    setDraftAuthMode(authMode);
    setDraftApiKey(authFields.apiKey);
    setDraftAccessKeyId(authFields.accessKeyId);
    setDraftSecretAccessKey(authFields.secretAccessKey);
    setShowAuth(false);
    setShowSecretAccessKey(false);
    setDraftCustomModels(customModels);
    setDraftModelIds(entry?.modelIds ?? (providerModels[0] ? [providerModels[0]!.id] : []));
    setDialogOpen(true);
  }

  /**
   * Submit the draft to create or update an entry.
   */
  async function submitDraft() {
    const name = draftName.trim();
    const apiUrl = draftApiUrl.trim();
    const normalizedName = name.toLowerCase();
    if (!name) {
      setError("请填写名称");
      return;
    }
    if (!apiUrl) {
      setError("请填写 API URL");
      return;
    }
    let authConfig: Record<string, unknown> | null = null;
    if (draftAuthMode === "accessKey") {
      const accessKeyId = draftAccessKeyId.trim();
      const secretAccessKey = draftSecretAccessKey.trim();
      if (!accessKeyId || !secretAccessKey) {
        setError("请填写 AccessKeyID 和 SecretAccessKey");
        return;
      }
      authConfig = { accessKeyId, secretAccessKey };
    } else {
      const apiKey = draftApiKey.trim();
      if (!apiKey) {
        setError("请填写 API Key");
        return;
      }
      authConfig = { apiKey };
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

    const providerModels = mergeProviderModels(draftProvider, draftCustomModels);
    const modelIdSet = new Set(providerModels.map((model) => model.id));
    const modelIds = draftModelIds.filter((modelId) => modelIdSet.has(modelId));
    if (modelIds.length === 0) {
      setError("模型定义缺失");
      return;
    }
    // 中文注释：模型 ID 以定义为准，确保存储字段同步。
    const entryValue: ProviderSettingValue = {
      providerId: draftProvider,
      apiUrl,
      authConfig,
      modelIds,
      customModels: draftCustomModels,
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
   * Open create model dialog and reset fields.
   */
  function openModelDialog() {
    setModelError(null);
    setDraftModelId("");
    setDraftModelInput([]);
    setDraftModelOutput([]);
    setDraftModelTags([]);
    setDraftModelContextK("0");
    setDraftModelCurrencySymbol("");
    setDraftModelInputPrice("");
    setDraftModelInputCachePrice("");
    setDraftModelOutputPrice("");
    setModelDialogOpen(true);
  }

  /**
   * Submit model draft and append to custom list.
   */
  function submitModelDraft() {
    const modelId = draftModelId.trim();
    if (!modelId) {
      setModelError("请填写模型 ID");
      return;
    }
    const existing = modelOptions.some((model) => model.id === modelId);
    if (existing) {
      setModelError("模型 ID 已存在");
      return;
    }
    if (draftModelInput.length === 0 || draftModelOutput.length === 0) {
      setModelError("请至少选择输入与输出");
      return;
    }
    if (draftModelTags.length === 0) {
      setModelError("请至少选择一个能力标签");
      return;
    }
    const maxContextK = Number.parseFloat(draftModelContextK);
    if (!Number.isFinite(maxContextK) || maxContextK < 0) {
      setModelError("请输入有效的上下文长度");
      return;
    }
    const inputPrice = Number.parseFloat(draftModelInputPrice || "0");
    const inputCachePrice = Number.parseFloat(draftModelInputCachePrice || "0");
    const outputPrice = Number.parseFloat(draftModelOutputPrice || "0");
    if (
      !Number.isFinite(inputPrice) ||
      !Number.isFinite(inputCachePrice) ||
      !Number.isFinite(outputPrice)
    ) {
      setModelError("请输入有效的价格");
      return;
    }
    const currencySymbol = draftModelCurrencySymbol.trim();
    const newModel: ModelDefinition = {
      id: modelId,
      familyId: modelId,
      providerId: draftProvider,
      input: draftModelInput,
      output: draftModelOutput,
      tags: draftModelTags,
      maxContextK,
      priceStrategyId: "tiered_token",
      priceTiers: [
        {
          minContextK: 0,
          input: inputPrice,
          inputCache: inputCachePrice,
          output: outputPrice,
        },
      ],
      currencySymbol: currencySymbol || undefined,
    };
    setDraftCustomModels((prev) => [...prev, newModel]);
    setDraftModelIds((prev) => Array.from(new Set([...prev, modelId])));
    setModelDialogOpen(false);
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
    () => mergeProviderModels(draftProvider, draftCustomModels),
    [draftProvider, draftCustomModels],
  );
  const filteredModelOptions = useMemo(() => {
    const keyword = draftModelFilter.trim().toLowerCase();
    if (!keyword) return modelOptions;
    return modelOptions.filter((model) => model.id.toLowerCase().includes(keyword));
  }, [draftModelFilter, modelOptions]);
  const focusedModel =
    (focusedModelId && modelOptions.find((model) => model.id === focusedModelId)) ||
    (draftModelIds[0] && modelOptions.find((model) => model.id === draftModelIds[0])) ||
    modelOptions[0] ||
    null;

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
        <div className="hidden md:grid grid-cols-[1fr_4fr_2fr_2fr_auto] gap-3 px-4 py-3 text-sm font-semibold text-foreground/80 bg-muted/50 border-b border-border">
          <div>AI 服务商</div>
          <div>能力</div>
          <div>API URL</div>
          <div>认证信息</div>
          <div className="text-right">操作</div>
        </div>

        <div className="divide-y divide-border">
          {entries.map((entry) => {
            const isExpanded = Boolean(expandedProviders[entry.key]);
            const entryCustomModels = entry.customModels ?? [];
            const capabilities = getProviderCapabilities(entry.providerId, entryCustomModels);
            return (
              <Fragment key={entry.key}>
                <div
                  className={cn(
                    "group grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[1fr_4fr_2fr_2fr_auto] md:items-center",
                    "bg-background hover:bg-muted/15 transition-colors",
                  )}
                >
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-xs text-muted-foreground md:hidden">AI 服务商</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() =>
                        setExpandedProviders((prev) => ({
                          ...prev,
                          [entry.key]: !prev[entry.key],
                        }))
                      }
                      aria-label={isExpanded ? "收起模型列表" : "展开模型列表"}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                    <span>{entry.key}</span>
                  </div>

                  <div className="text-sm text-muted-foreground break-words whitespace-normal">
                    <div className="text-xs text-muted-foreground md:hidden">能力</div>
                    {capabilities.length > 0 ? renderModelTagsCompact(capabilities) : "-"}
                  </div>

                  <div className="min-w-0 flex items-center gap-2">
                    <div className="w-full">
                      <div className="text-xs text-muted-foreground md:hidden">API URL</div>
                      <div className="text-sm truncate">{truncateDisplay(entry.apiUrl)}</div>
                    </div>
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
                    <div className="text-xs text-muted-foreground md:hidden">认证信息</div>
                    {formatAuthConfigDisplay(entry.authConfig)}
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
                {isExpanded ? (
                  <div className="px-4 pb-4">
                    <div className="hidden md:grid grid-cols-[200px_1fr_1fr_1fr_1.2fr] gap-3 px-1 py-2 text-xs font-semibold text-muted-foreground">
                      <div>模型</div>
                      <div>能力</div>
                      <div>输入</div>
                      <div>输出</div>
                      <div>价格</div>
                    </div>
                    <div className="divide-y divide-border/60">
                      {entry.modelIds.map((modelId) => {
                        const modelDefinition = resolveMergedModelDefinition(
                          entry.providerId,
                          modelId,
                          entryCustomModels,
                        );
                        if (!modelDefinition) return null;
                        return (
                          <div
                            key={`${entry.key}-${modelId}`}
                            className="grid grid-cols-1 gap-3 px-1 py-3 text-sm md:grid-cols-[200px_1fr_1fr_1fr_1.2fr]"
                          >
                            <div>
                              <div className="text-xs text-muted-foreground md:hidden">模型</div>
                              <div className="text-foreground">
                                {getModelLabel(modelDefinition)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground md:hidden">能力</div>
                              {renderModelTagsCompact(modelDefinition.tags)}
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground md:hidden">输入</div>
                              {renderIoTags(modelDefinition.input)}
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground md:hidden">输出</div>
                              {renderIoTags(modelDefinition.output)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <div className="text-xs text-muted-foreground md:hidden">价格</div>
                              {formatModelPriceLabel(modelDefinition)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </Fragment>
            );
          })}

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
        <div className="hidden md:grid grid-cols-[160px_140px_1.4fr_120px_160px_200px_auto] gap-3 px-4 py-3 text-sm font-semibold text-foreground/80 bg-muted/50 border-b border-border">
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
                "group grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[160px_140px_1.4fr_120px_160px_200px_auto] md:items-center",
                "bg-background hover:bg-muted/15 transition-colors",
              )}
            >
              <div className="text-sm">
                <div className="text-xs text-muted-foreground md:hidden">名称</div>
                {entry.key}
              </div>
              <div className="text-sm text-muted-foreground">
                <div className="text-xs text-muted-foreground md:hidden">服务商</div>
                {entry.providerLabel}
              </div>
              <div className="text-sm truncate">
                <div className="text-xs text-muted-foreground md:hidden">Endpoint</div>
                {truncateDisplay(entry.endpoint)}
              </div>
              <div className="text-sm text-muted-foreground">
                <div className="text-xs text-muted-foreground md:hidden">Region</div>
                {entry.region || "-"}
              </div>
              <div className="text-sm text-muted-foreground">
                <div className="text-xs text-muted-foreground md:hidden">Bucket</div>
                {entry.bucket}
              </div>
              <div className="min-w-0 text-sm font-mono truncate">
                <div className="text-xs text-muted-foreground md:hidden">认证信息</div>
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
                    disabled={Boolean(editingKey)}
                  >
                    <span className="truncate">
                      {providerLabelById[draftProvider] ?? draftProvider}
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                {editingKey ? null : (
                  <DropdownMenuContent align="start" className="w-[320px]">
                    <DropdownMenuRadioGroup
                      value={draftProvider}
                      onValueChange={(next) => {
                        const provider = next;
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
                        const nextAuthMode = resolveAuthMode(provider);
                        setDraftAuthMode(nextAuthMode);
                        setDraftApiKey("");
                        setDraftAccessKeyId("");
                        setDraftSecretAccessKey("");
                        setDraftCustomModels([]);
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
                )}
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
              <div className="rounded-md border border-border">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <Input
                    value={draftModelFilter}
                    placeholder="搜索模型"
                    onChange={(event) => setDraftModelFilter(event.target.value)}
                  />
                </div>
                <div className="grid grid-cols-[1.1fr_1fr] gap-3 p-3">
                  <div className="flex h-64 flex-col gap-2 pr-1">
                    <div className="flex-1 overflow-auto space-y-1">
                      {filteredModelOptions.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          暂无可选模型
                        </div>
                      ) : (
                        filteredModelOptions.map((model) => (
                          <div
                            key={model.id}
                            className={cn(
                              "flex items-center justify-between rounded-md border border-transparent px-2 py-2 text-sm transition-colors",
                              draftModelIds.includes(model.id)
                                ? "bg-muted/60 border-border"
                                : "hover:bg-muted/30"
                            )}
                            onMouseEnter={() => setFocusedModelId(model.id)}
                            onFocus={() => setFocusedModelId(model.id)}
                          >
                            <div className="flex-1">
                              <div className="text-foreground">{getModelLabel(model)}</div>
                              <div className="mt-1">{renderModelTagsCompact(model.tags)}</div>
                            </div>
                            <Switch
                              checked={draftModelIds.includes(model.id)}
                              onCheckedChange={(checked) => {
                                setDraftModelIds((prev) => {
                                  if (checked) return Array.from(new Set([...prev, model.id]));
                                  return prev.filter((id) => id !== model.id);
                                });
                              }}
                            />
                          </div>
                        ))
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="justify-start"
                      onClick={openModelDialog}
                    >
                      新建模型
                    </Button>
                  </div>
                  <div className="h-64 overflow-auto rounded-md border border-border bg-muted/20 p-3 text-sm">
                    {focusedModel ? (
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-foreground">
                          {getModelLabel(focusedModel)}
                        </div>
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">输入</div>
                          {renderIoTags(focusedModel.input)}
                        </div>
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">输出</div>
                          {renderIoTags(focusedModel.output)}
                        </div>
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">能力</div>
                          {renderModelTags(focusedModel.tags)}
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">价格</div>
                          <div className="text-xs text-muted-foreground">
                            {formatModelPriceLabel(focusedModel)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">暂无模型详情</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">认证信息</div>
              {draftAuthMode === "accessKey" ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">AccessKeyID</div>
                    <Input
                      value={draftAccessKeyId}
                      placeholder="输入 AccessKeyID"
                      onChange={(event) => setDraftAccessKeyId(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs text-muted-foreground">SecretAccessKey</div>
                    <div className="relative">
                      <Input
                        type={showSecretAccessKey ? "text" : "password"}
                        value={draftSecretAccessKey}
                        placeholder="输入 SecretAccessKey"
                        onChange={(event) => setDraftSecretAccessKey(event.target.value)}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                        onClick={() => setShowSecretAccessKey((prev) => !prev)}
                        aria-label={
                          showSecretAccessKey ? "隐藏 SecretAccessKey" : "显示 SecretAccessKey"
                        }
                      >
                        {showSecretAccessKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    type={showAuth ? "text" : "password"}
                    value={draftApiKey}
                    placeholder="输入 API Key"
                    onChange={(event) => setDraftApiKey(event.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                    onClick={() => setShowAuth((prev) => !prev)}
                    aria-label={showAuth ? "隐藏 API Key" : "显示 API Key"}
                  >
                    {showAuth ? (
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

      <Dialog open={modelDialogOpen} onOpenChange={setModelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建模型</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">模型 ID</div>
              <Input
                value={draftModelId}
                placeholder="例如：custom-chat-1"
                onChange={(event) => setDraftModelId(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">输入类型</div>
              <div className="flex flex-wrap gap-2">
                {IO_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={draftModelInput.includes(option.value) ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setDraftModelInput((prev) => toggleSelection(prev, option.value))
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">输出类型</div>
              <div className="flex flex-wrap gap-2">
                {IO_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={draftModelOutput.includes(option.value) ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setDraftModelOutput((prev) => toggleSelection(prev, option.value))
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">能力标签</div>
              <div className="flex flex-wrap gap-2">
                {MODEL_TAG_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={draftModelTags.includes(option.value) ? "default" : "outline"}
                    size="sm"
                    onClick={() =>
                      setDraftModelTags((prev) => toggleSelection(prev, option.value))
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">上下文长度 (K)</div>
                <Input
                  value={draftModelContextK}
                  placeholder="例如：128"
                  onChange={(event) => setDraftModelContextK(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">币种</div>
                <Input
                  value={draftModelCurrencySymbol}
                  placeholder="例如：¥ 或 $"
                  onChange={(event) => setDraftModelCurrencySymbol(event.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">输入价格</div>
                <Input
                  value={draftModelInputPrice}
                  placeholder="例如：1.2"
                  onChange={(event) => setDraftModelInputPrice(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">缓存输入</div>
                <Input
                  value={draftModelInputCachePrice}
                  placeholder="例如：0.2"
                  onChange={(event) => setDraftModelInputCachePrice(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">输出价格</div>
                <Input
                  value={draftModelOutputPrice}
                  placeholder="例如：2.5"
                  onChange={(event) => setDraftModelOutputPrice(event.target.value)}
                />
              </div>
            </div>

            {modelError ? <div className="text-sm text-destructive">{modelError}</div> : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setModelDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={submitModelDraft}>保存</Button>
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
