import { BaseAiRouter, aiSchemas, t, shieldedProcedure } from "@tenas-ai/api";
import { runProviderRequest } from "@/ai/models/providerRequestRunner";
import { getModelDefinition, getProviderDefinition } from "@/ai/models/modelRegistry";
import { loadProjectImageBuffer } from "@/ai/services/image/attachmentResolver";
import { resolveImageInputBuffer, uploadImagesToS3 } from "@/ai/services/image/imageStorage";
import { fetchQwenVideoResult, fetchVolcengineVideoResult } from "@/ai/services/video/videoGeneration";
import {
  resolveVideoSaveDirectory,
  saveGeneratedVideoFromUrl,
} from "@/ai/services/video/videoStorage";
import { getProviderSettings, type ProviderSettingEntry } from "@/modules/settings/settingsService";

/** Default provider id for AI media tasks. */
const VOLCENGINE_PROVIDER_ID = "volcengine";
/** Default model ids for each AI task kind. */
const VOLCENGINE_MODEL_IDS = {
  textToImage: "jimeng_t2i_v40",
  inpaint: "jimeng_image2image_dream_inpaint",
  materialExtract: "i2i_material_extraction",
  videoGenerate: "jimeng_ti2v_v30_pro",
} as const;

const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

type ParsedChatModelId = {
  /** Provider profile id. */
  profileId: string;
  /** Model id. */
  modelId: string;
};

/** Resolve provider entry that enables the target model. */
function resolveProviderEntry(
  entries: ProviderSettingEntry[],
  providerId: string,
  modelId: string,
) {
  return entries.find(
    (entry) => entry.providerId === providerId && Boolean(entry.models[modelId]),
  );
}

/** Parse chat model id to provider profile id and model id. */
function parseChatModelId(chatModelId: string): ParsedChatModelId | null {
  const separatorIndex = chatModelId.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= chatModelId.length - 1) return null;
  const profileId = chatModelId.slice(0, separatorIndex).trim();
  const modelId = chatModelId.slice(separatorIndex + 1).trim();
  if (!profileId || !modelId) return null;
  return { profileId, modelId };
}

/** Resolve parameters with defaults and required checks. */
function resolveVideoParameters(input: {
  /** Raw parameters from request. */
  parameters?: Record<string, string | number | boolean>;
  /** Parameter definitions for model. */
  definitions?: { key: string; request: boolean; default?: string | number | boolean }[];
}) {
  const raw = input.parameters ?? {};
  const definitions = input.definitions ?? [];
  if (definitions.length === 0) return raw;
  const resolved: Record<string, string | number | boolean> = {};
  for (const definition of definitions) {
    const value = raw[definition.key];
    const hasValue =
      value !== undefined && value !== null && !(typeof value === "string" && !value.trim());
    if (hasValue) {
      resolved[definition.key] = value;
      continue;
    }
    if (definition.default !== undefined) {
      resolved[definition.key] = definition.default;
      continue;
    }
    if (definition.request) {
      throw new Error(`缺少必填参数: ${definition.key}`);
    }
  }
  return resolved;
}

type VideoTaskStatus =
  | "in_queue"
  | "generating"
  | "done"
  | "not_found"
  | "expired"
  | "failed";

/** Normalize video task status to API union. */
function normalizeVideoTaskStatus(status?: string | null): VideoTaskStatus {
  const normalized = (status ?? "").trim().toLowerCase();
  if (!normalized) return "failed";
  if (normalized === "done" || normalized === "success" || normalized === "succeeded") {
    return "done";
  }
  if (
    normalized === "running" ||
    normalized === "generating" ||
    normalized === "processing"
  ) {
    return "generating";
  }
  if (
    normalized === "queued" ||
    normalized === "queue" ||
    normalized === "pending" ||
    normalized === "in_queue"
  ) {
    return "in_queue";
  }
  if (normalized === "not_found") return "not_found";
  if (normalized === "expired") return "expired";
  if (
    normalized === "failed" ||
    normalized === "error" ||
    normalized === "canceled" ||
    normalized === "cancelled"
  ) {
    return "failed";
  }
  return "failed";
}

export class AiRouterImpl extends BaseAiRouter {
  /** AI tRPC 端点实现：调用 Dreamina 能力。 */
  public static createRouter() {
    return t.router({
      textToImage: shieldedProcedure
        .input(aiSchemas.textToImage.input)
        .output(aiSchemas.textToImage.output)
        .mutation(async ({ input }) => {
          const result = await runProviderRequest({
            providerId: VOLCENGINE_PROVIDER_ID,
            modelId: VOLCENGINE_MODEL_IDS.textToImage,
            input: { kind: "textToImage", payload: input },
          });
          return { taskId: result.taskId };
        }),
      inpaint: shieldedProcedure
        .input(aiSchemas.inpaint.input)
        .output(aiSchemas.inpaint.output)
        .mutation(async ({ input }) => {
          const result = await runProviderRequest({
            providerId: VOLCENGINE_PROVIDER_ID,
            modelId: VOLCENGINE_MODEL_IDS.inpaint,
            input: { kind: "inpaint", payload: input },
          });
          return { taskId: result.taskId };
        }),
      materialExtract: shieldedProcedure
        .input(aiSchemas.materialExtract.input)
        .output(aiSchemas.materialExtract.output)
        .mutation(async ({ input }) => {
          const result = await runProviderRequest({
            providerId: VOLCENGINE_PROVIDER_ID,
            modelId: VOLCENGINE_MODEL_IDS.materialExtract,
            input: { kind: "materialExtract", payload: input },
          });
          return { taskId: result.taskId };
        }),
      videoGenerate: shieldedProcedure
        .input(aiSchemas.videoGenerate.input)
        .output(aiSchemas.videoGenerate.output)
        .mutation(async ({ input }) => {
          const providers = await getProviderSettings();
          const chatModelIdRaw = typeof input.chatModelId === "string" ? input.chatModelId : "";
          const parsedChatModelId = chatModelIdRaw ? parseChatModelId(chatModelIdRaw) : null;
          const fallbackProviderEntry = resolveProviderEntry(
            providers,
            VOLCENGINE_PROVIDER_ID,
            VOLCENGINE_MODEL_IDS.videoGenerate,
          );
          const providerEntry = parsedChatModelId
            ? providers.find((entry) => entry.id === parsedChatModelId.profileId)
            : fallbackProviderEntry;
          if (!providerEntry) {
            throw new Error("未找到可用的服务商模型配置");
          }
          const providerId = providerEntry.providerId;
          const modelId = parsedChatModelId?.modelId ?? VOLCENGINE_MODEL_IDS.videoGenerate;
          const modelDefinition =
            providerEntry.models[modelId] ?? getModelDefinition(providerId, modelId);
          const features = modelDefinition?.parameters?.features ?? [];
          const allowsPrompt = features.includes("prompt");
          const imageUrlOnly = features.includes("image_url_only");
          const maxImages = features.includes("last_frame_support") ? 2 : 1;
          const parameters = resolveVideoParameters({
            parameters: input.parameters,
            definitions: modelDefinition?.parameters?.fields,
          });

          const imageUrls = Array.isArray(input.imageUrls) ? input.imageUrls : [];
          const remoteUrls: string[] = [];
          const binaryDataBase64: string[] = Array.isArray(input.binaryDataBase64)
            ? [...input.binaryDataBase64]
            : [];
          let normalizedImageUrls: string[] | undefined;
          let normalizedBinaryData: string[] | undefined;

          if (imageUrlOnly) {
            const sessionId = input.workspaceId || input.projectId || "video";
            const resolvedInputs: Array<{ buffer: Buffer; mediaType: string; baseName: string }> =
              [];
            for (const imageUrl of imageUrls) {
              if (!imageUrl) continue;
              if (SCHEME_REGEX.test(imageUrl)) {
                remoteUrls.push(imageUrl);
                continue;
              }
              const resolved = await resolveImageInputBuffer({
                data: imageUrl,
                fallbackName: "image",
                projectId: input.projectId,
                workspaceId: input.workspaceId,
              });
              resolvedInputs.push(resolved);
            }
            for (const base64 of binaryDataBase64) {
              if (!base64) continue;
              const resolved = await resolveImageInputBuffer({
                data: `data:image/png;base64,${base64}`,
                fallbackName: "image",
              });
              resolvedInputs.push(resolved);
            }
            const uploadedUrls = await uploadImagesToS3({
              images: resolvedInputs,
              sessionId,
            });
            normalizedImageUrls =
              remoteUrls.length > 0 ? [...remoteUrls, ...uploadedUrls] : uploadedUrls;
            normalizedImageUrls = normalizedImageUrls.length > 0 ? normalizedImageUrls : undefined;
            normalizedBinaryData = undefined;
          } else {
            for (const imageUrl of imageUrls) {
              if (!imageUrl) continue;
              if (SCHEME_REGEX.test(imageUrl)) {
                remoteUrls.push(imageUrl);
                continue;
              }
              const loaded = await loadProjectImageBuffer({
                path: imageUrl,
                projectId: input.projectId,
                workspaceId: input.workspaceId,
              });
              if (loaded) {
                binaryDataBase64.push(loaded.buffer.toString("base64"));
              }
            }
            normalizedImageUrls = remoteUrls.length > 0 ? remoteUrls : undefined;
            normalizedBinaryData =
              binaryDataBase64.length > 0 ? binaryDataBase64 : undefined;
          }
          const imageCount =
            (normalizedImageUrls?.length ?? 0) + (normalizedBinaryData?.length ?? 0);
          if (imageCount > maxImages) {
            throw new Error(`最多支持 ${maxImages} 张图片输入`);
          }

          const result = await runProviderRequest({
            providerId,
            modelId,
            input: {
              kind: "videoGenerate",
              payload: {
                prompt: allowsPrompt ? input.prompt : undefined,
                imageUrls: normalizedImageUrls,
                binaryDataBase64: normalizedBinaryData,
                seed: input.seed,
                frames: input.frames,
                aspectRatio: input.aspectRatio,
                parameters,
              },
            },
          });
          return { taskId: result.taskId };
        }),
      videoGenerateResult: shieldedProcedure
        .input(aiSchemas.videoGenerateResult.input)
        .output(aiSchemas.videoGenerateResult.output)
        .mutation(async ({ input }) => {
          const providers = await getProviderSettings();
          const chatModelIdRaw =
            typeof input.chatModelId === "string" ? input.chatModelId.trim() : "";
          const parsedChatModelId = chatModelIdRaw ? parseChatModelId(chatModelIdRaw) : null;
          const fallbackProviderEntry = resolveProviderEntry(
            providers,
            VOLCENGINE_PROVIDER_ID,
            VOLCENGINE_MODEL_IDS.videoGenerate,
          );
          const providerEntry = parsedChatModelId
            ? providers.find((entry) => entry.id === parsedChatModelId.profileId)
            : fallbackProviderEntry;
          if (!providerEntry) {
            throw new Error("未找到可用的服务商模型配置");
          }
          const providerId = providerEntry.providerId;
          const providerDefinition = getProviderDefinition(providerId);
          const modelId = parsedChatModelId?.modelId ?? VOLCENGINE_MODEL_IDS.videoGenerate;

          const result =
            providerId === "qwen"
              ? await fetchQwenVideoResult({
                  provider: providerEntry,
                  providerDefinition,
                  taskId: input.taskId,
                })
              : await fetchVolcengineVideoResult({
                  provider: providerEntry,
                  providerDefinition,
                  modelId,
                  taskId: input.taskId,
                });
          const normalizedStatus = normalizeVideoTaskStatus(result.status);
          if (normalizedStatus !== "done") {
            return {
              status: normalizedStatus,
              videoUrl: result.videoUrl || undefined,
            };
          }
          if (!result.videoUrl) {
            return { status: "failed" };
          }

          if (!input.saveDir) {
            return {
              status: "done",
              videoUrl: result.videoUrl,
            };
          }

          const resolvedDir = await resolveVideoSaveDirectory({
            saveDir: input.saveDir,
            projectId: input.projectId ?? null,
            workspaceId: input.workspaceId ?? null,
          });
          if (!resolvedDir) {
            throw new Error("保存目录无效");
          }
          const saved = await saveGeneratedVideoFromUrl({
            url: result.videoUrl,
            directory: resolvedDir,
            fileNameBase: input.taskId,
          });
          const normalizedSaveDir = input.saveDir.trim().replace(/\\/g, "/").replace(/\/+$/, "");
          const savedPath = normalizedSaveDir
            ? `${normalizedSaveDir}/${saved.fileName}`
            : saved.fileName;
          return {
            status: "done",
            videoUrl: result.videoUrl,
            savedPath,
            fileName: saved.fileName,
          };
        }),
    });
  }
}

export const aiRouterImplementation = AiRouterImpl.createRouter();
