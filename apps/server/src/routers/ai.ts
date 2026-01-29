import { BaseAiRouter, aiSchemas, t, shieldedProcedure } from "@tenas-ai/api";
import { runProviderRequest } from "@/ai/models/providerRequestRunner";
import { getProviderDefinition } from "@/ai/models/modelRegistry";
import { loadProjectImageBuffer } from "@/ai/services/image/attachmentResolver";
import { fetchVolcengineVideoResult } from "@/ai/services/video/videoGeneration";
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
          const imageUrls = Array.isArray(input.imageUrls) ? input.imageUrls : [];
          const remoteUrls: string[] = [];
          const binaryDataBase64: string[] = Array.isArray(input.binaryDataBase64)
            ? [...input.binaryDataBase64]
            : [];
          for (const imageUrl of imageUrls) {
            if (!imageUrl || SCHEME_REGEX.test(imageUrl)) {
              if (imageUrl) remoteUrls.push(imageUrl);
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
          const normalizedImageUrls = remoteUrls.length > 0 ? remoteUrls : undefined;
          const normalizedBinaryData =
            binaryDataBase64.length > 0 ? binaryDataBase64 : undefined;
          const result = await runProviderRequest({
            providerId: VOLCENGINE_PROVIDER_ID,
            modelId: VOLCENGINE_MODEL_IDS.videoGenerate,
            input: {
              kind: "videoGenerate",
              payload: {
                ...input,
                imageUrls: normalizedImageUrls,
                binaryDataBase64: normalizedBinaryData,
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
          const providerEntry = resolveProviderEntry(
            providers,
            VOLCENGINE_PROVIDER_ID,
            VOLCENGINE_MODEL_IDS.videoGenerate,
          );
          if (!providerEntry) {
            throw new Error("未找到可用的服务商模型配置");
          }
          const providerDefinition = getProviderDefinition(VOLCENGINE_PROVIDER_ID);

          const result = await fetchVolcengineVideoResult({
            provider: providerEntry,
            providerDefinition,
            modelId: VOLCENGINE_MODEL_IDS.videoGenerate,
            taskId: input.taskId,
          });
          if (result.status !== "done") {
            return {
              status: result.status || "failed",
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
