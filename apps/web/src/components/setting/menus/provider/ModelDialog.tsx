import { Button } from "@openloaf/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { Input } from "@openloaf/ui/input";
import type { ModelTag } from "@openloaf/api/common";
import {
  MODEL_TAG_OPTIONS,
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
  const isEditing = Boolean(editingModelId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] w-full max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑模型" : "新建模型"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <div className="text-sm font-medium">模型 ID</div>
            <Input
              value={draftModelId}
              placeholder="例如：custom-chat-1"
              disabled={isEditing}
              onChange={(event) => onDraftModelIdChange(event.target.value)}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <div className="text-sm font-medium">模型名称</div>
            <Input
              value={draftModelName}
              placeholder="例如：自定义对话模型"
              onChange={(event) => onDraftModelNameChange(event.target.value)}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <div className="text-sm font-medium">能力标签</div>
            <div className="flex flex-wrap gap-2">
              {MODEL_TAG_OPTIONS.map((option) => (
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
            <div className="text-sm font-medium">上下文长度 (K)</div>
            <Input
              value={draftModelContextK}
              placeholder="例如：128"
              onChange={(event) => onDraftModelContextKChange(event.target.value)}
            />
          </div>

          {modelError ? <div className="text-sm text-destructive md:col-span-2">{modelError}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={onSubmit}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
