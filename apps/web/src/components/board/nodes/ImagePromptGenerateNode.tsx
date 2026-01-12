import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../engine/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { ChevronDown, Play, RotateCcw, Square, Sparkles } from "lucide-react";
import { generateId } from "ai";

import { useBoardContext } from "../core/BoardProvider";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSettingsValues } from "@/hooks/use-settings";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { createChatSessionId } from "@/lib/chat-session-id";
import { getWebClientId } from "@/lib/chat/streamClientId";
import { resolveServerUrl } from "@/utils/server-url";
import type { TenasUIMessage } from "@tenas-ai/api/types/message";
import type { ImageNodeProps } from "./ImageNode";
import {
  buildTenasFileUrl,
  getRelativePathFromUri,
  parseTenasFileUrl,
} from "@/components/project/filesystem/utils/file-system-utils";
import { BOARD_ASSETS_DIR_NAME } from "@/lib/file-name";
import { getWorkspaceIdFromCookie } from "../core/boardStorage";
import { toast } from "sonner";

/** Node type identifier for image prompt generation. */
export const IMAGE_PROMPT_GENERATE_NODE_TYPE = "image_prompt_generate";
/** Default prompt for image understanding in text generation. */
export const IMAGE_PROMPT_TEXT = `你是一位顶级图像视觉分析师，精通**所有类型图片**的详细结构化描述，用于AI图像生成（如Midjourney/DALL-E）。根据提供的图片，输出**高度详细的中文描述**，**智能适配图片类型**。

### 支持类型（自动识别，无需指定）：
- **人物**：肖像、人物、模特、名人、自拍
- **美食**：食物、料理、甜点、餐桌
- **动物/宠物**：猫狗、野生动物、宠物照
- **风光**：山水、城市、建筑、日落、云海
- **物品**：静物、产品、日用品、艺术品
- **表情包/Meme**：卡通、搞笑图、表情
- **文字/扫描**：文档、海报、书籍、OCR内容
- **抽象/艺术**：画作、设计、图案、数字艺术
- **其他**：车辆、室内、运动、事件等任意类型

### 输出格式（严格逐字使用此模板）：
[主体物体/场景]，[数量/规模/类型描述]，[姿态/布局/分布]。  
[环境/背景描述]，[氛围效果如光影、天气、粒子]。  
[光线/色彩描述]，照亮/突出[具体细节]。  
细节包括[列出4-6个关键特征：材质、纹理、颜色、形状、装饰]。  
[构图视角]视角，[前景/中景/背景三层分明描述]。  
整体色调：[主色+2-3个辅助色]，[明暗对比/饱和度]。  
[动态感/空间感/情绪氛围总结]，[独特卖点或视觉焦点]。

### 核心要求：
1. **长度**：50-200字，信息密集。
2. **超详细**：材质（如丝绸、光滑金属）、光影（如柔和侧光、逆光轮廓）、微细节（如汗珠、纹路）。
3. **智能适配**：人物强调表情/服装，美食强调质感/摆盘，文字强调内容/字体。
4. **图像生成优化**：分层构图、色彩精确、氛围强烈。
5. **纯中文**：专业视觉语言，无口语化。输出纯文本，禁止输出markdown格式，代码块，标签，序号等。`;

/** Prefix used for board-relative tenas-file paths. */
const BOARD_RELATIVE_URI_PREFIX = "tenas-file://./";

type BoardFolderScope = {
  /** Project id for resolving absolute file urls. */
  projectId: string;
  /** Relative folder path under the project root. */
  relativeFolderPath: string;
};

/** Normalize a relative path string. */
function normalizeRelativePath(value: string) {
  return value.replace(/^\/+/, "");
}

/** Return true when the relative path attempts to traverse parents. */
function hasParentTraversal(value: string) {
  return value.split("/").some((segment) => segment === "..");
}

/** Resolve board-relative tenas-file urls into absolute paths. */
function resolveBoardRelativeUri(
  uri: string,
  boardFolderScope: BoardFolderScope | null
) {
  if (!boardFolderScope) return uri;
  if (!uri.startsWith(BOARD_RELATIVE_URI_PREFIX)) return uri;
  const relativePath = normalizeRelativePath(uri.slice(BOARD_RELATIVE_URI_PREFIX.length));
  if (!relativePath || hasParentTraversal(relativePath)) return uri;
  // 逻辑：仅允许解析资产目录内的相对路径，避免误引用工程外文件。
  if (!relativePath.startsWith(`${BOARD_ASSETS_DIR_NAME}/`)) return uri;
  const combined = `${boardFolderScope.relativeFolderPath}/${relativePath}`;
  return buildTenasFileUrl(boardFolderScope.projectId, combined);
}

/** Resolve a prompt-ready image uri from an image node. */
function resolvePromptImageUri(
  props: ImageNodeProps,
  boardFolderScope: BoardFolderScope | null
) {
  const rawUri = props.originalSrc || "";
  if (!rawUri) return "";
  return resolveBoardRelativeUri(rawUri, boardFolderScope);
}

/** Extract SSE data payload from a single event chunk. */
function extractSseData(chunk: string): string | null {
  const lines = chunk.split("\n");
  const dataLines = lines.filter((line) => line.startsWith("data:"));
  if (dataLines.length === 0) return null;
  return dataLines
    .map((line) => line.slice(5).trimStart())
    .join("\n");
}

export type ImagePromptGenerateNodeProps = {
  /** Selected chatModelId (profileId:modelId). */
  chatModelId?: string;
  /** Generated result text. */
  resultText?: string;
  /** Error text for failed runs. */
  errorText?: string;
};

const ImagePromptGenerateNodeSchema = z.object({
  chatModelId: z.string().optional(),
  resultText: z.string().optional(),
  errorText: z.string().optional(),
});

const REQUIRED_TAGS = ["image_input", "text_generation"] as const;
const EXCLUDED_TAGS = ["image_edit", "image_generation"] as const;

function isCompatible(tags: string[] | undefined) {
  const list = Array.isArray(tags) ? tags : [];
  if (!REQUIRED_TAGS.every((tag) => list.includes(tag))) return false;
  if (EXCLUDED_TAGS.some((tag) => list.includes(tag))) return false;
  return true;
}

/** Render the image prompt generation node. */
export function ImagePromptGenerateNodeView({
  element,
  selected,
  onSelect,
  onUpdate,
}: CanvasNodeViewProps<ImagePromptGenerateNodeProps>) {
  const { engine, fileContext } = useBoardContext();
  const { basic } = useBasicConfig();
  const { providerItems } = useSettingsValues();
  const { models: cloudModels } = useCloudModels();
  const chatSource = normalizeChatModelSource(basic.chatSource);
  const modelOptions = useMemo(
    () => buildChatModelOptions(chatSource, providerItems, cloudModels),
    [chatSource, providerItems, cloudModels]
  );
  const candidates = useMemo(() => {
    return modelOptions.filter((option) => isCompatible(option.tags));
  }, [modelOptions]);

  /** Board folder scope used for resolving relative asset uris. */
  const boardFolderScope = useMemo<BoardFolderScope | null>(() => {
    if (!fileContext?.boardFolderUri) return null;
    // 逻辑：优先解析 boardFolderUri，失败时用 rootUri 计算相对路径。
    const parsed = parseTenasFileUrl(fileContext.boardFolderUri);
    if (parsed) {
      return {
        projectId: parsed.projectId,
        relativeFolderPath: parsed.relativePath,
      };
    }
    if (!fileContext.projectId || !fileContext.rootUri) return null;
    const relativeFolderPath = getRelativePathFromUri(
      fileContext.rootUri,
      fileContext.boardFolderUri
    );
    if (!relativeFolderPath) return null;
    return { projectId: fileContext.projectId, relativeFolderPath };
  }, [fileContext?.boardFolderUri, fileContext?.projectId, fileContext?.rootUri]);
  /** Session id used for image prompt runs inside this node. */
  const sessionIdRef = useRef(createChatSessionId());
  /** Abort controller for the active request. */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Runtime running flag for this node. */
  const [isRunning, setIsRunning] = useState(false);
  /** Workspace id used for SSE payload metadata. */
  const resolvedWorkspaceId = useMemo(() => getWorkspaceIdFromCookie(), []);
  const errorText = element.props.errorText ?? "";
  const resultText = element.props.resultText ?? "";
  // 逻辑：输入以“连线关系”为准，避免节点 props 与画布连接状态不一致。
  let inputImageId = "";
  let inputImageOriginalSrc = "";
  for (const item of engine.doc.getElements()) {
    if (item.kind !== "connector") continue;
    if (!item.target || !("elementId" in item.target)) continue;
    if (item.target.elementId !== element.id) continue;
    if (!item.source || !("elementId" in item.source)) continue;
    const sourceElementId = item.source.elementId;
    const source = sourceElementId ? engine.doc.getElementById(sourceElementId) : null;
    if (source && source.kind === "node" && source.type === "image") {
      inputImageId = source.id;
      inputImageOriginalSrc =
        typeof (source.props as any)?.originalSrc === "string"
          ? ((source.props as any).originalSrc as string)
          : "";
      break;
    }
  }
  const hasValidInput = Boolean(
    inputImageId && inputImageOriginalSrc.trim().startsWith("tenas-file://")
  );
  const selectedModelId = (element.props.chatModelId ?? "").trim();
  const defaultModelId =
    typeof basic.modelDefaultChatModelId === "string"
      ? basic.modelDefaultChatModelId.trim()
      : "";

  const effectiveModelId = useMemo(() => {
    if (selectedModelId) return selectedModelId;
    if (defaultModelId && candidates.some((item) => item.id === defaultModelId)) {
      return defaultModelId;
    }
    return candidates[0]?.id ?? "";
  }, [candidates, defaultModelId, selectedModelId]);

  useEffect(() => {
    // 逻辑：当默认模型可用时自动写入节点，避免用户每次重复选择。
    if (!effectiveModelId) return;
    if (selectedModelId) return;
    onUpdate({ chatModelId: effectiveModelId });
  }, [effectiveModelId, onUpdate, selectedModelId]);

  /** Stop the current image prompt request. */
  const stopImagePromptGenerate = useCallback(() => {
    // 逻辑：先结束运行态再中止请求，避免 UI 卡死。
    setIsRunning(false);
    if (!abortControllerRef.current) return;
    abortControllerRef.current.abort();
    abortControllerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (!abortControllerRef.current) return;
      // 逻辑：节点卸载时中止请求，避免泄露连接。
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    };
  }, []);

  /** Run an image prompt generation request via /chat/sse. */
  const runImagePromptGenerate = useCallback(
    async (input: { chatModelId?: string; chatModelSource?: "local" | "cloud" }) => {
      const nodeId = element.id;
      const node = engine.doc.getElementById(nodeId);
      if (!node || node.kind !== "node" || node.type !== IMAGE_PROMPT_GENERATE_NODE_TYPE) {
        return;
      }

      const chatModelId = (input.chatModelId ?? (node.props as any)?.chatModelId ?? "").trim();
      if (!chatModelId) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: "请选择支持「图片输入 + 文本生成」的模型",
        });
        return;
      }

      // 逻辑：输入以“连线关系”为准，避免节点 props 与画布连接状态不一致。
      let imageProps: ImageNodeProps | null = null;
      for (const item of engine.doc.getElements()) {
        if (item.kind !== "connector") continue;
        if (!item.target || !("elementId" in item.target)) continue;
        if (item.target.elementId !== nodeId) continue;
        if (!item.source || !("elementId" in item.source)) continue;
        const sourceElementId = item.source.elementId;
        const source = sourceElementId ? engine.doc.getElementById(sourceElementId) : null;
        if (source && source.kind === "node" && source.type === "image") {
          imageProps = source.props as ImageNodeProps;
          break;
        }
      }
      const imageUrl = imageProps ? resolvePromptImageUri(imageProps, boardFolderScope) : "";
      const mediaType = imageProps?.mimeType || "application/octet-stream";
      const isRelativeTenas = imageUrl.startsWith(BOARD_RELATIVE_URI_PREFIX);
      if (!imageUrl || isRelativeTenas || !imageUrl.startsWith("tenas-file://")) {
        engine.doc.updateNodeProps(nodeId, {
          errorText: "当前图片缺少可用的地址，无法生成提示词",
        });
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 逻辑：开始生成前先清空错误与结果，保证流式从头写入。
      setIsRunning(true);
      engine.doc.updateNodeProps(nodeId, {
        errorText: "",
        resultText: "",
        chatModelId,
      });

      try {
        const sessionId = sessionIdRef.current;
        const messageId = generateId();
        const userMessage: TenasUIMessage = {
          id: messageId,
          role: "user",
          parentMessageId: null,
          parts: [
            { type: "file", url: imageUrl, mediaType },
            { type: "text", text: IMAGE_PROMPT_TEXT },
          ],
        };
        const payload = {
          sessionId,
          messages: [userMessage],
          clientId: getWebClientId() || undefined,
          workspaceId: resolvedWorkspaceId || undefined,
          projectId: boardFolderScope?.projectId ?? fileContext?.projectId ?? undefined,
          trigger: "board-image-prompt",
          chatModelId,
          chatModelSource: input.chatModelSource,
        };
        const response = await fetch(`${resolveServerUrl()}/chat/sse`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`SSE request failed: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamedText = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            const data = extractSseData(chunk);
            if (!data) continue;
            if (data === "[DONE]") {
              await reader.cancel();
              return;
            }
            let parsed: any;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }
            const delta =
              parsed?.type === "text-delta" && typeof parsed?.delta === "string"
                ? parsed.delta
                : parsed?.type === "text" && typeof parsed?.text === "string"
                  ? parsed.text
                  : typeof parsed?.data?.text === "string"
                    ? parsed.data.text
                    : "";
            if (!delta) continue;
            streamedText += delta;
            // 逻辑：节点被删除时终止写入，避免无效更新。
            if (!engine.doc.getElementById(nodeId)) {
              controller.abort();
              setIsRunning(false);
              return;
            }
            engine.doc.updateNodeProps(nodeId, { resultText: streamedText });
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          engine.doc.updateNodeProps(nodeId, {
            errorText: "生成提示词失败",
          });
          toast.error("生成提示词失败");
        }
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsRunning(false);
      }
    },
    [
      boardFolderScope,
      element.id,
      engine,
      fileContext?.projectId,
      resolvedWorkspaceId,
    ]
  );

  const viewStatus = useMemo(() => {
    // 逻辑：运行态以 SSE 请求为准，不写入节点，避免刷新后卡死。
    if (isRunning) return "running";
    if (!hasValidInput) return "needs_input";
    if (candidates.length === 0) return "needs_model";
    if (errorText) return "error";
    if (resultText) return "done";
    return "idle";
  }, [candidates.length, errorText, hasValidInput, isRunning, resultText]);

  const containerClassName = [
    "relative h-full w-full rounded-sm border box-border p-2.5",
    "border-slate-300 bg-white",
    "dark:border-slate-700 dark:bg-slate-900",
    "text-slate-900 dark:text-slate-100",
    selected
      ? "dark:border-sky-400 dark:shadow-[0_6px_14px_rgba(0,0,0,0.35)]"
      : "",
    viewStatus === "running"
      ? "tenas-thinking-border tenas-thinking-border-on border-transparent"
      : "",
    viewStatus === "error"
      ? "border-rose-400/80 bg-rose-50/60 dark:border-rose-400/70 dark:bg-rose-950/30"
      : "",
  ].join(" ");

  return (
    <div
      className={containerClassName}
      onPointerDown={(event) => {
        // 逻辑：点击节点本体保持选中。
        event.stopPropagation();
        onSelect();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <Sparkles size={14} />
          </span>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold leading-4">图片提示词</div>
            <div className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              {viewStatus === "running"
                ? "生成中…"
                : viewStatus === "done"
                  ? "已完成"
                  : viewStatus === "error"
                    ? "生成失败"
                    : viewStatus === "needs_model"
                      ? "需要配置模型"
                      : viewStatus === "needs_input"
                        ? "需要连接图片输入"
                        : "待运行"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {viewStatus === "running" ? (
            <button
              type="button"
              className="rounded-md border border-slate-200/80 bg-background px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 dark:border-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-800"
              onPointerDown={(event) => {
                event.stopPropagation();
                stopImagePromptGenerate();
              }}
            >
              <span className="inline-flex items-center gap-1">
                <Square size={12} />
                停止
              </span>
            </button>
          ) : hasValidInput ? (
            <button
              type="button"
              disabled={
                candidates.length === 0 ||
                !effectiveModelId ||
                engine.isLocked() ||
                element.locked
              }
              className="rounded-md border border-slate-200/80 bg-background px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700/80 dark:text-slate-200 dark:hover:bg-slate-800"
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelect();
                runImagePromptGenerate({
                  chatModelId: effectiveModelId,
                  chatModelSource: chatSource,
                });
              }}
            >
              <span className="inline-flex items-center gap-1">
                {viewStatus === "error" ? <RotateCcw size={12} /> : <Play size={12} />}
                {viewStatus === "error" ? "重试" : "运行"}
              </span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">模型</div>
          <div className="relative min-w-0 flex-1">
            <select
              value={effectiveModelId}
              disabled={candidates.length === 0 || isRunning}
              onChange={(event) => {
                const next = event.target.value;
                onUpdate({ chatModelId: next });
              }}
              className="w-full appearance-none rounded-md border border-slate-200/80 bg-background px-2 py-1 pr-6 text-[11px] text-slate-700 outline-none dark:border-slate-700/80 dark:text-slate-200"
            >
              {candidates.length ? null : <option value="">无可用模型</option>}
              {candidates.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.providerName}:{option.modelId}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-1 top-1.5 text-slate-400"
            />
          </div>
        </div>
      </div>

      <div className="mt-2 h-[calc(100%-76px)] overflow-auto rounded-md border border-slate-200/70 bg-slate-50 p-2 text-[11px] leading-4 text-slate-700 dark:border-slate-700/70 dark:bg-slate-800 dark:text-slate-200">
        {viewStatus === "needs_input" ? (
          <div className="text-slate-500 dark:text-slate-400">
            请先连接一个可用的图片节点（需要可访问的图片地址）
          </div>
        ) : viewStatus === "needs_model" ? (
          <div className="text-rose-500 dark:text-rose-300">
            未找到同时支持「图片输入 + 文本生成」的模型，请先去设置中配置。
          </div>
        ) : viewStatus === "error" ? (
          <div className="text-rose-500 dark:text-rose-300">
            {errorText || "无法生成。"}
          </div>
        ) : resultText ? (
          <pre className="whitespace-pre-wrap break-words font-sans">{resultText}</pre>
        ) : (
          <div className="text-slate-500 dark:text-slate-400">
            结果将保留在此节点中
          </div>
        )}
      </div>
    </div>
  );
}

export const ImagePromptGenerateNodeDefinition: CanvasNodeDefinition<ImagePromptGenerateNodeProps> =
  {
    type: IMAGE_PROMPT_GENERATE_NODE_TYPE,
    schema: ImagePromptGenerateNodeSchema,
    defaultProps: {
      resultText: "",
    },
    view: ImagePromptGenerateNodeView,
    capabilities: {
      resizable: true,
      connectable: "auto",
      minSize: { w: 260, h: 180 },
    },
  };
