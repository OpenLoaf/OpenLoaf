import type {
  CanvasConnectorTemplateDefinition,
  CanvasNodeDefinition,
  CanvasNodeViewProps,
} from "../engine/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Play, RotateCcw, Square, Sparkles } from "lucide-react";
import { generateId } from "ai";

import { useBoardContext } from "../core/BoardProvider";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSettingsValues } from "@/hooks/use-settings";
import { useCloudModels } from "@/hooks/use-cloud-models";
import { createChatSessionId } from "@/lib/chat-session-id";
import { getWebClientId } from "@/lib/chat/streamClientId";
import type { TenasUIMessage } from "@tenas-ai/api/types/message";
import type { ImageNodeProps } from "./ImageNode";
import type { ModelTag } from "@tenas-ai/api/common";
import { getWorkspaceIdFromCookie } from "../core/boardStorage";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAutoResizeNode } from "./lib/use-auto-resize-node";
import { IMAGE_GENERATE_NODE_TYPE } from "./ImageGenerateNode";
import {
  BOARD_RELATIVE_URI_PREFIX,
  filterModelOptionsByTags,
  resolveBoardFolderScope,
  resolveBoardRelativeUri,
  runChatSseRequest,
} from "./lib/image-generation";

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
    icon: <Sparkles size={14} />,
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
  const { containerRef } = useAutoResizeNode({
    engine,
    elementId: element.id,
    minHeight: IMAGE_PROMPT_GENERATE_MIN_HEIGHT,
  });
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
      const rawImageUrl = imageProps?.originalSrc ?? "";
      const imageUrl = rawImageUrl
        ? resolveBoardRelativeUri(rawImageUrl, boardFolderScope)
        : "";
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

  /** Short status label for the badge and header. */
  const statusLabel =
    viewStatus === "running"
      ? "生成中…"
      : viewStatus === "done"
        ? "已完成"
        : viewStatus === "error"
          ? "生成失败"
          : viewStatus === "needs_model"
            ? "需要配置模型"
            : viewStatus === "needs_input"
              ? "需要连接图片输入"
              : "待运行";

  const containerClassName = [
    "relative flex w-full flex-col gap-2 rounded-xl border border-slate-200/80 bg-background/95 p-3 text-slate-700 backdrop-blur",
    "bg-[radial-gradient(180px_circle_at_top_right,rgba(126,232,255,0.45),rgba(255,255,255,0)_60%),radial-gradient(220px_circle_at_15%_85%,rgba(186,255,236,0.35),rgba(255,255,255,0)_65%)]",
    "dark:border-slate-700/80 dark:text-slate-200",
    "dark:bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.6),rgba(15,23,42,0)_48%),radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),rgba(15,23,42,0)_42%)]",
    selected ? "ring-1 ring-slate-300 dark:ring-slate-600" : "",
    viewStatus === "running"
      ? "tenas-thinking-border tenas-thinking-border-on border-transparent"
      : "",
    viewStatus === "error"
      ? "border-rose-400/80 bg-rose-50/60 dark:border-rose-400/70 dark:bg-rose-950/30"
      : "",
  ].join(" ");

  /** Status hint text shown beneath controls. */
  const statusHint = useMemo(() => {
    if (viewStatus === "needs_input") {
      return { tone: "warn", text: "需要连接一张可用图片后才能生成提示词。" };
    }
    if (viewStatus === "needs_model") {
      return {
        tone: "warn",
        text: "未找到支持「图片输入 + 文本生成」的模型，请先在设置中配置。",
      };
    }
    if (viewStatus === "error") {
      return { tone: "error", text: errorText || "生成提示词失败，请重试。" };
    }
    if (viewStatus === "running") {
      return { tone: "info", text: "正在生成提示词，请稍等…" };
    }
    if (viewStatus === "done") return null;
    return { tone: "info", text: "准备就绪，点击运行即可生成提示词。" };
  }, [errorText, viewStatus]);

  return (
    <div
      ref={containerRef}
      className={containerClassName}
      onPointerDown={(event) => {
        // 逻辑：点击节点本体保持选中。
        event.stopPropagation();
        onSelect();
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            <Sparkles size={14} />
          </span>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold leading-4">图片提示词</div>
            <div className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              {statusLabel}
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
                  {option.providerName}:{option.modelId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {statusHint ? (
        <div
          className={[
            "rounded-md border px-2 py-1 text-[11px] leading-4",
            statusHint.tone === "error"
              ? "border-rose-200/70 bg-rose-50 text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
              : statusHint.tone === "warn"
                ? "border-amber-200/70 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
                : "border-sky-200/70 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200",
          ].join(" ")}
        >
          {statusHint.text}
        </div>
      ) : null}

      {resultText ? (
        <div className="rounded-md border border-slate-200/70 p-2 text-[11px] leading-4 text-slate-700 dark:border-slate-700/70 dark:text-slate-200">
          <pre className="whitespace-pre-wrap break-words font-sans">{resultText}</pre>
        </div>
      ) : null}
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
      resizable: false,
      connectable: "anchors",
      minSize: { w: 260, h: IMAGE_PROMPT_GENERATE_MIN_HEIGHT },
    },
    connectorTemplates: () => IMAGE_PROMPT_GENERATE_CONNECTOR_TEMPLATES,
  };
