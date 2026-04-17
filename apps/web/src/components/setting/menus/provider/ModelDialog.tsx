/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useTranslation } from "react-i18next";
import { Input } from "@openloaf/ui/input";
import type { ModelTag } from "@openloaf/api/common";
import { cn } from "@/lib/utils";
import { FormDialog } from "@/components/ui/FormDialog";
import {
  toggleSelection,
} from "@/components/setting/menus/provider/use-provider-management";

// 能力标签仅保留媒体输入三件套 —— 与聊天模型选择器 (ModelCheckboxItem)
// 展示口径统一。chat/reasoning/tool_call 等元能力由对话时自动识别。
const SELECTABLE_MODEL_TAGS: readonly ModelTag[] = [
  "image_input",
  "video_analysis",
  "audio_analysis",
];

// 选中态用饱和色，未选中态用淡色底 —— 与 ModelCheckboxItem 的色系对齐
// （图片蓝 / 视频紫 / 音频琥珀），light + dark 两套。
const TAG_TONE_CLASSES: Record<string, { selected: string; unselected: string }> = {
  image_input: {
    selected:
      "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:border-blue-500 dark:hover:bg-blue-600",
    unselected:
      "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30 dark:hover:bg-blue-500/25",
  },
  video_analysis: {
    selected:
      "bg-violet-600 text-white border-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:border-violet-500 dark:hover:bg-violet-600",
    unselected:
      "bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30 dark:hover:bg-violet-500/25",
  },
  audio_analysis: {
    selected:
      "bg-amber-500 text-white border-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:border-amber-500 dark:hover:bg-amber-600",
    unselected:
      "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 dark:hover:bg-amber-500/25",
  },
};

export type ModelDialogProps = {
  /** Dialog visibility. */
  open: boolean;
  /** Editing model id. */
  editingModelId: string | null;
  /** Draft model id. */
  draftModelId: string;
  /** Draft model name. */
  draftModelName: string;
  /** Draft tag list. */
  draftModelTags: ModelTag[];
  /** Draft context size. */
  draftModelContextK: string;
  /** Validation error. */
  modelError: string | null;
  /** Close dialog callback. */
  onOpenChange: (open: boolean) => void;
  /** Update draft model id. */
  onDraftModelIdChange: (value: string) => void;
  /** Update draft model name. */
  onDraftModelNameChange: (value: string) => void;
  /** Update draft model tags. */
  onDraftModelTagsChange: (value: ModelTag[]) => void;
  /** Update context size. */
  onDraftModelContextKChange: (value: string) => void;
  /** Submit callback. */
  onSubmit: () => Promise<void> | void;
};

/**
 * Render custom model dialog.
 */
export function ModelDialog({
  open,
  editingModelId,
  draftModelId,
  draftModelName,
  draftModelTags,
  draftModelContextK,
  modelError,
  onOpenChange,
  onDraftModelIdChange,
  onDraftModelNameChange,
  onDraftModelTagsChange,
  onDraftModelContextKChange,
  onSubmit,
}: ModelDialogProps) {
  const { t } = useTranslation('settings');
  const { t: tAi } = useTranslation('ai');
  const modelTagOptions = SELECTABLE_MODEL_TAGS.map((value) => ({
    value,
    label: tAi(`modelTagsShort.${value}`, { defaultValue: value, nsSeparator: false }),
  }));
  const isEditing = Boolean(editingModelId);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? t('provider.editModel') : t('provider.newModel')}
      onSubmit={onSubmit}
      contentClassName="max-h-[80vh] w-full max-w-4xl overflow-y-auto"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <div className="text-sm font-medium">{t('provider.modelId')}</div>
          <Input
            autoFocus
            value={draftModelId}
            placeholder={t('provider.modelIdPlaceholder')}
            disabled={isEditing}
            onChange={(event) => onDraftModelIdChange(event.target.value)}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <div className="text-sm font-medium">{t('provider.modelName')}</div>
          <Input
            value={draftModelName}
            placeholder={t('provider.modelNamePlaceholder')}
            onChange={(event) => onDraftModelNameChange(event.target.value)}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <div className="text-sm font-medium">{t('provider.capabilityTags')}</div>
          <div className="flex flex-wrap gap-2">
            {modelTagOptions.map((option) => {
              const selected = draftModelTags.includes(option.value);
              const tone = TAG_TONE_CLASSES[option.value];
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    onDraftModelTagsChange(toggleSelection(draftModelTags, option.value))
                  }
                  className={cn(
                    "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                    tone ? (selected ? tone.selected : tone.unselected) : "bg-secondary text-foreground border-transparent",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 md:col-span-2">
          <div className="text-sm font-medium">{t('provider.contextLength')}</div>
          <Input
            value={draftModelContextK}
            placeholder={t('provider.contextLengthPlaceholder')}
            onChange={(event) => onDraftModelContextKChange(event.target.value)}
          />
        </div>

        {modelError ? <div className="text-sm text-destructive md:col-span-2">{modelError}</div> : null}
      </div>
    </FormDialog>
  );
}
