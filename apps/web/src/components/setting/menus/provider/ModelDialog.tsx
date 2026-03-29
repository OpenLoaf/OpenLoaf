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
import { Button } from "@openloaf/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { Input } from "@openloaf/ui/input";
import { AI_MODEL_TAGS } from "@openloaf-saas/sdk";
import type { ModelTag } from "@openloaf/api/common";
import {
  toggleSelection,
} from "@/components/setting/menus/provider/use-provider-management";

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
  const { t: tc } = useTranslation('common');
  const { t: tAi } = useTranslation('ai');
  const modelTagOptions = AI_MODEL_TAGS.map((value) => ({
    value: value as ModelTag,
    label: tAi(`modelTags.${value}`, { defaultValue: value, nsSeparator: false }),
  }));
  const isEditing = Boolean(editingModelId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] w-full max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('provider.editModel') : t('provider.newModel')}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <div className="text-sm font-medium">{t('provider.modelId')}</div>
            <Input
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
              {modelTagOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={draftModelTags.includes(option.value) ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    onDraftModelTagsChange(toggleSelection(draftModelTags, option.value))
                  }
                >
                  {option.label}
                </Button>
              ))}
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-3xl">
            {tc('cancel')}
          </Button>
          <Button onClick={onSubmit} className="rounded-3xl">{tc('save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
