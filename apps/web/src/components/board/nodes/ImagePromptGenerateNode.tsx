import type {
  CanvasConnectorTemplateDefinition,
  CanvasNodeDefinition,
  CanvasNodeViewProps,
} from "../engine/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Copy, Play, RotateCcw, Square } from "lucide-react";
import { generateId } from "ai";

import { useBoardContext } from "../core/BoardProvider";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSettingsValues } from "@/hooks/use-settings";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { createChatSessionId } from "@/lib/chat-session-id";
import { getWebClientId } from "@/lib/chat/streamClientId";
import { getClientTimeZone } from "@/utils/time-zone";
import type { TenasUIMessage } from "@tenas-ai/api/types/message";
import type { ImageNodeProps } from "./ImageNode";
import type { ModelTag } from "@tenas-ai/api/common";
import { getWorkspaceIdFromCookie } from "../core/boardSession";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tenas-ai/ui/select";
import { IMAGE_GENERATE_NODE_TYPE } from "./ImageGenerateNode";
import {
  filterModelOptionsByTags,
  runChatSseRequest,
} from "./lib/image-generation";
import { resolveBoardFolderScope, resolveProjectPathFromBoardUri } from "../core/boardFilePath";
import { NodeFrame } from "./NodeFrame";

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

/** Maximum height for prompt output before scrolling. */
const IMAGE_PROMPT_GENERATE_RESULT_MAX_HEIGHT = 180;
/** Minimum height for image prompt node. */
const IMAGE_PROMPT_GENERATE_MIN_HEIGHT = 0;

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

/** Required tags for image prompt models. */
const REQUIRED_TAGS: ModelTag[] = ["image_input", "text_generation"];
/** Excluded tags for image prompt models. */
const EXCLUDED_TAGS: ModelTag[] = ["image_edit", "image_generation", "code"];

/** Connector templates offered by the image prompt node. */
const IMAGE_PROMPT_GENERATE_CONNECTOR_TEMPLATES: CanvasConnectorTemplateDefinition[] = [
  {
    id: IMAGE_GENERATE_NODE_TYPE,
    label: "图片生成",
    description: "基于提示词与图片生成新图",
    size: [320, 260],
    icon: (
      <img
        src="/board/converted_small.svg"
        alt=""
        aria-hidden="true"
        className="h-4 w-4"
        draggable={false}
      />
    ),
    createNode: () => ({
      type: IMAGE_GENERATE_NODE_TYPE,
      props: {},
    }),
  },
];

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
    return filterModelOptionsByTags(modelOptions, {
      required: REQUIRED_TAGS,
      excluded: EXCLUDED_TAGS,
    });
  }, [modelOptions]);

  /** Board folder scope used for resolving relative asset uris. */
  const boardFolderScope = useMemo(
    () => resolveBoardFolderScope(fileContext),
    [fileContext?.boardFolderUri, fileContext?.projectId, fileContext?.rootUri]
  );
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
  const resolvedInputPath = resolveProjectPathFromBoardUri({
    uri: inputImageOriginalSrc.trim(),
    boardFolderScope,
    currentProjectId: boardFolderScope?.projectId ?? fileContext?.projectId,
    rootUri: fileContext?.rootUri,
  });
  const hasValidInput = Boolean(inputImageId && resolvedInputPath);
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

  /** Run an image prompt generation request via /ai/execute. */
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
      const rawImageUrl = imageProps?.originalSrc ?? "";
      const imageUrl = resolveProjectPathFromBoardUri({
        uri: rawImageUrl,
        boardFolderScope,
        currentProjectId: boardFolderScope?.projectId ?? fileContext?.projectId,
        rootUri: fileContext?.rootUri,
      });
      const mediaType = imageProps?.mimeType || "application/octet-stream";
      if (!imageUrl) {
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
          timezone: getClientTimeZone(),
          workspaceId: resolvedWorkspaceId || undefined,
          projectId: boardFolderScope?.projectId ?? fileContext?.projectId ?? undefined,
          boardId: fileContext?.boardId ?? undefined,
          trigger: "board-image-prompt",
          chatModelId,
          chatModelSource: input.chatModelSource,
          intent: "image",
          responseMode: "stream",
        };
        let streamedText = "";
        await runChatSseRequest({
          payload,
          signal: controller.signal,
          onEvent: (event) => {
            const parsed = event as any;
            const delta =
              parsed?.type === "text-delta" && typeof parsed?.delta === "string"
                ? parsed.delta
                : parsed?.type === "text" && typeof parsed?.text === "string"
                  ? parsed.text
                  : typeof parsed?.data?.text === "string"
                    ? parsed.data.text
                    : "";
            if (!delta) return;
            streamedText += delta;
            // 逻辑：节点被删除时终止写入，避免无效更新。
            if (!engine.doc.getElementById(nodeId)) {
              controller.abort();
              setIsRunning(false);
              return false;
            }
            engine.doc.updateNodeProps(nodeId, { resultText: streamedText });
          },
        });
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
      fileContext?.boardFolderUri,
      fileContext?.boardId,
      fileContext?.projectId,
      fileContext?.rootUri,
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
    "relative flex h-full w-full min-h-0 min-w-0 flex-col gap-2 rounded-xl border border-slate-300/80 bg-white/90 p-3 text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.12)] backdrop-blur-lg",
    "bg-[radial-gradient(180px_circle_at_top_right,rgba(126,232,255,0.45),rgba(255,255,255,0)_60%),radial-gradient(220px_circle_at_15%_85%,rgba(186,255,236,0.35),rgba(255,255,255,0)_65%)]",
    "dark:border-slate-700/90 dark:bg-slate-900/80 dark:text-slate-100 dark:shadow-[0_12px_30px_rgba(0,0,0,0.5)]",
    "dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.6),rgba(15,23,42,0)_48%),radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),rgba(15,23,42,0)_42%)]",
    selected ? "ring-1 ring-slate-300 dark:ring-slate-600" : "",
    viewStatus === "running"
      ? "tenas-thinking-border tenas-thinking-border-on border-transparent"
      : "",
    viewStatus === "error"
      ? "border-rose-400/80 bg-rose-50/60 dark:border-rose-400/70 dark:bg-rose-950/30"
      : "",
  ].join(" ");

  const handleCopyResult = useCallback(async () => {
    if (!resultText) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(resultText);
      } else {
        // 逻辑：兼容不支持 Clipboard API 的环境。
        const textarea = document.createElement("textarea");
        textarea.value = resultText;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast.success("已复制提示词");
    } catch {
      toast.error("复制失败");
    }
  }, [resultText]);

  return (
    <NodeFrame
      onPointerDown={(event) => {
        // 逻辑：点击节点本体保持选中。
        event.stopPropagation();
        onSelect();
      }}
    >
      <div className={containerClassName}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-8 w-8 items-center justify-center overflow-visible text-slate-500 dark:text-slate-300">
            <img
              src="/board/converted_small.svg"
              alt=""
              aria-hidden="true"
              className="absolute -left-10 -top-10 h-24 w-24 max-h-none max-w-none"
              draggable={false}
            />
          </span>
          <div className="min-w-0 ml-1">
            <div className="text-[12px] font-semibold leading-4">图生文</div>
            <div className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              描述：根据图片生成文字内容
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
                {viewStatus === "error" || resultText ? (
                  <RotateCcw size={12} />
                ) : (
                  <Play size={12} />
                )}
                {viewStatus === "error" ? "重试" : resultText ? "重新生成" : "运行"}
              </span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <div className="text-[11px] text-slate-500 dark:text-slate-400">模型</div>
        <div className="min-w-0 flex-1">
          <Select
            value={effectiveModelId}
            onValueChange={(value) => {
              onUpdate({ chatModelId: value });
            }}
            disabled={candidates.length === 0 || isRunning}
          >
            <SelectTrigger className="h-7 w-full px-2 text-[11px] shadow-none">
              <SelectValue placeholder="无可用模型" />
            </SelectTrigger>
            <SelectContent className="text-[11px]">
              {candidates.length ? null : (
                <SelectItem value="__none__" disabled className="text-[11px]">
                  无可用模型
                </SelectItem>
              )}
              {candidates.map((option) => (
                <SelectItem
                  key={option.id}
                  value={option.id}
                  className="text-[11px]"
                >
                  {option.providerName}:{option.modelDefinition?.name || option.modelId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {resultText ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              图片内容
            </div>
            <button
              type="button"
              className="rounded-md px-1.5 py-0.5 text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={handleCopyResult}
            >
              <span className="inline-flex items-center gap-1">
                <Copy size={10} />
              </span>
            </button>
          </div>
          <div
            data-board-scroll
            className="show-scrollbar rounded-md border border-slate-200/70 p-2 text-[12px] leading-5 text-slate-700 dark:border-slate-700/70 dark:text-slate-200 overflow-y-auto"
            style={{ maxHeight: IMAGE_PROMPT_GENERATE_RESULT_MAX_HEIGHT }}
          >
            <pre className="whitespace-pre-wrap break-words font-sans">
              {resultText}
            </pre>
          </div>
        </div>
      ) : null}
      </div>
    </NodeFrame>
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
      resizable: false,
      connectable: "anchors",
      minSize: { w: 260, h: IMAGE_PROMPT_GENERATE_MIN_HEIGHT },
    },
    connectorTemplates: () => IMAGE_PROMPT_GENERATE_CONNECTOR_TEMPLATES,
  };
