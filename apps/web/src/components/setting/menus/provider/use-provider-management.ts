import { useMemo, useState } from "react";
import { useSettingsValues } from "@/hooks/use-settings";
import { queryClient, trpc } from "@/utils/trpc";
import {
  getProviderDefinition,
  getProviderModels,
  getProviderOptions,
} from "@/lib/model-registry";
import {
  resolvePriceTier,
  type IOType,
  type ModelDefinition,
  type ModelTag,
} from "@teatime-ai/api/common";

type ProviderSettingValue = {
  /** Provider id. */
  providerId: string;
  /** API base URL. */
  apiUrl: string;
  /** Raw auth config. */
  authConfig: Record<string, unknown>;
  /** Enabled model definitions keyed by model id. */
  models: Record<string, ModelDefinition>;
};

type ProviderEntry = ProviderSettingValue & {
  key: string;
  /** Custom models merged from stored map. */
  customModels: ModelDefinition[];
};

const PROVIDER_OPTIONS = getProviderOptions();
const PROVIDER_LABEL_BY_ID = Object.fromEntries(
  PROVIDER_OPTIONS.map((provider) => [provider.id, provider.label]),
) as Record<string, string>;
/** Category name for S3 providers stored in settings. */
const S3_PROVIDER_CATEGORY = "s3Provider";

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
    id: "tencent-cos",
    label: "Tencent COS",
    endpoint: "https://{bucket}.cos.{region}.myqcloud.com",
    region: "ap-guangzhou",
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
  /** Force path-style addressing. */
  forcePathStyle?: boolean;
  /** Public base URL for CDN or custom domain. */
  publicBaseUrl?: string;
  /** Access key id. */
  accessKeyId: string;
  /** Secret access key. */
  secretAccessKey: string;
};

type S3ProviderEntry = S3ProviderValue & {
  /** Stable entry id from config. */
  id: string;
  /** Entry key used as display name. */
  key: string;
};

// 标签显示文案映射。
const MODEL_TAG_LABELS: Record<ModelTag, string> = {
  text_to_image: "文生图",
  image_to_image: "图生图",
  image_to_text: "图片理解",
  image_edit: "图片编辑",
  text_generation: "文本生成",
  video_generation: "视频生成",
  web_search: "网络搜索",
  asr: "语音识别",
  tts: "语音输出",
  code: "代码生成",
  tool_call: "工具调用",
};

// IO label mapping for UI.
const IO_LABELS: Record<IOType, string> = {
  text: "文本",
  image: "图片",
  imageUrl: "图片链接",
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
    // 包含 key 的字段使用掩码，避免明文泄露。
    if (typeof value === "string" && key.toLowerCase().includes("key")) {
      masked[key] = maskKey(value);
    } else {
      masked[key] = value;
    }
  }
  return truncateDisplay(JSON.stringify(masked), 48);
}

/**
 * Format price label for a model definition.
 */
function formatModelPriceLabel(definition?: ModelDefinition): string {
  if (!definition) return "-";
  // 逻辑：按 1M tokens 输出价格结构，匹配当前定价策略。
  const tier = resolvePriceTier(definition, 0);
  if (!tier) return "-";
  if (!Number.isFinite(tier.input) || !Number.isFinite(tier.output) || !Number.isFinite(tier.inputCache)) {
    return "-";
  }
  const symbol = definition.currencySymbol ?? "";
  const pricePrefix = symbol ? `${symbol}` : "";
  return `输入 ${pricePrefix}${tier.input} / 缓存 ${pricePrefix}${tier.inputCache} / 输出 ${pricePrefix}${tier.output}`;
}

/** Normalize model map from settings payload. */
function normalizeModelMap(value: unknown): Record<string, ModelDefinition> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const models: Record<string, ModelDefinition> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object") continue;
    const rawId = typeof (raw as { id?: unknown }).id === "string" ? (raw as { id: string }).id : "";
    const modelId = (rawId || key).trim();
    if (!modelId) continue;
    models[modelId] = { ...(raw as ModelDefinition), id: modelId };
  }
  return models;
}

/** Merge provider registry models with custom models. */
function mergeProviderModels(providerId: string, customModels: ModelDefinition[]) {
  const baseModels = getProviderModels(providerId);
  const merged = new Map<string, ModelDefinition>();
  baseModels.forEach((model) => merged.set(model.id, model));
  customModels.forEach((model) => {
    if (merged.has(model.id)) return;
    merged.set(model.id, {
      ...model,
      // 自定义模型强制绑定当前 providerId。
      providerId,
    });
  });
  return Array.from(merged.values());
}

/** Resolve custom models not present in the registry list. */
function resolveCustomModelsFromMap(providerId: string, models: Record<string, ModelDefinition>) {
  const registryModelIds = new Set(getProviderModels(providerId).map((model) => model.id));
  return Object.values(models).filter((model) => !registryModelIds.has(model.id));
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
    // 兼容配置缺失 tags 的情况，避免渲染报错。
    (model.tags ?? []).forEach((tag) => uniqueTags.add(tag));
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
function resolveAuthMode(providerId: string, authConfig?: Record<string, unknown>): AuthMode {
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

export function useProviderManagement() {
  const { providerItems, s3ProviderItems, setValue, removeValue, refresh } = useSettingsValues();
  const entries = useMemo(() => {
    const list: ProviderEntry[] = [];
    for (const item of providerItems) {
      if ((item.category ?? "general") !== "provider") continue;
      if (!item.value || typeof item.value !== "object") continue;
      const entry = item.value as Partial<ProviderSettingValue>;
      if (!entry.providerId || !entry.apiUrl || !entry.authConfig) continue;
      const models = normalizeModelMap(entry.models);
      const customModels = resolveCustomModelsFromMap(entry.providerId, models);
      list.push({
        key: item.key,
        providerId: entry.providerId,
        apiUrl: entry.apiUrl,
        authConfig: entry.authConfig as Record<string, unknown>,
        models,
        customModels,
      });
    }
    return list;
  }, [providerItems]);
  /** Build list of S3 provider entries from settings. */
  const s3Entries = useMemo(() => {
    const list: S3ProviderEntry[] = [];
    for (const item of s3ProviderItems) {
      if ((item.category ?? "general") !== S3_PROVIDER_CATEGORY) continue;
      if (!item.value || typeof item.value !== "object") continue;
      const entry = item.value as Partial<S3ProviderValue>;
      if (
        !entry.providerId ||
        !entry.bucket ||
        !entry.accessKeyId ||
        !entry.secretAccessKey
      ) {
        continue;
      }
      list.push({
        id: item.id ?? item.key,
        key: item.key,
        providerId: entry.providerId,
        providerLabel:
          (typeof entry.providerLabel === "string" && entry.providerLabel) ||
          S3_PROVIDER_LABEL_BY_ID[entry.providerId] ||
          entry.providerId,
        endpoint: entry.endpoint ?? "",
        region: entry.region ?? "",
        bucket: entry.bucket,
        forcePathStyle: Boolean(entry.forcePathStyle),
        publicBaseUrl: entry.publicBaseUrl ?? "",
        accessKeyId: entry.accessKeyId,
        secretAccessKey: entry.secretAccessKey,
      });
    }
    return list;
  }, [s3ProviderItems]);
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
  /** Track S3 force path style. */
  const [draftS3ForcePathStyle, setDraftS3ForcePathStyle] = useState(false);
  /** Track S3 public base URL. */
  const [draftS3PublicBaseUrl, setDraftS3PublicBaseUrl] = useState("");
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

  const [draftProvider, setDraftProvider] = useState<string>(PROVIDER_OPTIONS[0]?.id ?? "");
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
    const entryModelIds = entry?.models ? Object.keys(entry.models) : [];
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
    setDraftModelIds(
      entryModelIds.length > 0
        ? entryModelIds
        : providerModels[0]
          ? [providerModels[0].id]
          : [],
    );
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
    const models = modelIds.reduce<Record<string, ModelDefinition>>((acc, modelId) => {
      const model = providerModels.find((item) => item.id === modelId);
      if (model) acc[modelId] = model;
      return acc;
    }, {});
    // 模型 ID 以定义为准，确保存储字段同步。
    const entryValue: ProviderSettingValue = {
      providerId: draftProvider,
      apiUrl,
      authConfig,
      models,
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
   * Delete provider entry.
   */
  async function deleteProvider(key: string) {
    await removeValue(key, "provider");
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
    if (!Number.isFinite(inputPrice) || !Number.isFinite(inputCachePrice) || !Number.isFinite(outputPrice)) {
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
    setDraftS3ForcePathStyle(Boolean(entry?.forcePathStyle));
    setDraftS3PublicBaseUrl(entry?.publicBaseUrl ?? "");
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
    const publicBaseUrl = draftS3PublicBaseUrl.trim();
    const accessKeyId = draftS3AccessKeyId.trim();
    const secretAccessKey = draftS3SecretAccessKey.trim();
    if (!name) {
      setS3Error("请填写名称");
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
      forcePathStyle: draftS3ForcePathStyle,
      publicBaseUrl: publicBaseUrl || undefined,
      accessKeyId,
      secretAccessKey,
    };

    if (!editingS3Key) {
      await setValue(name, entryValue, S3_PROVIDER_CATEGORY);
      await refresh();
      await queryClient.invalidateQueries({
        queryKey: trpc.workspace.getActive.queryOptions().queryKey,
      });
      setS3DialogOpen(false);
      return;
    }

    const shouldReuseKey = editingS3Key === name;
    const nextKey = shouldReuseKey ? editingS3Key : name;
    if (!shouldReuseKey) await removeValue(editingS3Key, S3_PROVIDER_CATEGORY);
    await setValue(nextKey, entryValue, S3_PROVIDER_CATEGORY);
    await refresh();
    await queryClient.invalidateQueries({
      queryKey: trpc.workspace.getActive.queryOptions().queryKey,
    });
    setS3DialogOpen(false);
  }

  /**
   * Delete S3 provider entry.
   */
  async function deleteS3Provider(key: string) {
    await removeValue(key, S3_PROVIDER_CATEGORY);
    await refresh();
    await queryClient.invalidateQueries({
      queryKey: trpc.workspace.getActive.queryOptions().queryKey,
    });
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

  return {
    entries,
    s3Entries,
    dialogOpen,
    setDialogOpen,
    modelDialogOpen,
    setModelDialogOpen,
    s3DialogOpen,
    setS3DialogOpen,
    editingKey,
    setEditingKey,
    editingS3Key,
    confirmDeleteId,
    setConfirmDeleteId,
    confirmS3DeleteId,
    setConfirmS3DeleteId,
    draftProvider,
    setDraftProvider,
    draftName,
    setDraftName,
    draftApiUrl,
    setDraftApiUrl,
    draftAuthMode,
    setDraftAuthMode,
    draftApiKey,
    setDraftApiKey,
    draftAccessKeyId,
    setDraftAccessKeyId,
    draftSecretAccessKey,
    setDraftSecretAccessKey,
    showAuth,
    setShowAuth,
    showSecretAccessKey,
    setShowSecretAccessKey,
    draftModelIds,
    setDraftModelIds,
    draftCustomModels,
    setDraftCustomModels,
    draftModelFilter,
    setDraftModelFilter,
    focusedModelId,
    setFocusedModelId,
    draftModelId,
    setDraftModelId,
    draftModelInput,
    setDraftModelInput,
    draftModelOutput,
    setDraftModelOutput,
    draftModelTags,
    setDraftModelTags,
    draftModelContextK,
    setDraftModelContextK,
    draftModelCurrencySymbol,
    setDraftModelCurrencySymbol,
    draftModelInputPrice,
    setDraftModelInputPrice,
    draftModelInputCachePrice,
    setDraftModelInputCachePrice,
    draftModelOutputPrice,
    setDraftModelOutputPrice,
    draftS3ProviderId,
    setDraftS3ProviderId,
    draftS3Name,
    setDraftS3Name,
    draftS3Endpoint,
    setDraftS3Endpoint,
    draftS3Region,
    setDraftS3Region,
    draftS3Bucket,
    setDraftS3Bucket,
    draftS3ForcePathStyle,
    setDraftS3ForcePathStyle,
    draftS3PublicBaseUrl,
    setDraftS3PublicBaseUrl,
    draftS3AccessKeyId,
    setDraftS3AccessKeyId,
    draftS3SecretAccessKey,
    setDraftS3SecretAccessKey,
    showS3SecretKey,
    setShowS3SecretKey,
    s3Error,
    error,
    modelError,
    copiedKey,
    setCopiedKey,
    expandedProviders,
    setExpandedProviders,
    providerLabelById,
    modelOptions,
    filteredModelOptions,
    focusedModel,
    openEditor,
    submitDraft,
    deleteProvider,
    openModelDialog,
    submitModelDraft,
    openS3Editor,
    submitS3Draft,
    deleteS3Provider,
    S3_PROVIDER_LABEL_BY_ID,
    S3_PROVIDER_OPTIONS,
    PROVIDER_OPTIONS,
  };
}

export {
  copyToClipboard,
  formatAuthConfigDisplay,
  formatModelPriceLabel,
  formatS3CredentialDisplay,
  getDefaultApiUrl,
  getDefaultModelIds,
  getDefaultProviderName,
  getDefaultS3Endpoint,
  getDefaultS3ProviderName,
  getDefaultS3Region,
  getProviderCapabilities,
  IO_LABELS,
  IO_OPTIONS,
  MODEL_TAG_LABELS,
  MODEL_TAG_OPTIONS,
  resolveAuthMode,
  resolveMergedModelDefinition,
  S3_PROVIDER_CATEGORY,
  toggleSelection,
  truncateDisplay,
};

export type {
  AuthMode,
  ProviderEntry,
  ProviderSettingValue,
  S3ProviderEntry,
  S3ProviderValue,
};
