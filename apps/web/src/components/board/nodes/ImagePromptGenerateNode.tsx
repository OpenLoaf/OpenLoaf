import type { CanvasNodeDefinition, CanvasNodeViewProps } from "../engine/types";
import { useEffect, useMemo } from "react";
import { z } from "zod";
import { ChevronDown, Play, RotateCcw, Square, Sparkles } from "lucide-react";

import { useBoardContext } from "../core/BoardProvider";
import { buildChatModelOptions, normalizeChatModelSource } from "@/lib/provider-models";
import { useBasicConfig } from "@/hooks/use-basic-config";
import { useSettingsValues } from "@/hooks/use-settings";
import { useCloudModels } from "@/hooks/use-cloud-models";

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
5. **纯中文**：专业视觉语言，无口语化。`;

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
  const { actions, engine, imagePromptRuntime } = useBoardContext();
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

  const isRunning = imagePromptRuntime.isRunning(element.id);
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
                actions.stopImagePromptGenerateNode(element.id);
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
                actions.runImagePromptGenerateNode({
                  nodeId: element.id,
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
