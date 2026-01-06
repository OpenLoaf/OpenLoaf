import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  IO_OPTIONS,
  MODEL_TAG_OPTIONS,
  toggleSelection,
} from "@/components/setting/menus/provider/use-provider-management";

export type ModelDialogProps = {
  /** Dialog visibility. */
  open: boolean;
  /** Draft model id. */
  draftModelId: string;
  /** Draft input types. */
  draftModelInput: string[];
  /** Draft output types. */
  draftModelOutput: string[];
  /** Draft tag list. */
  draftModelTags: string[];
  /** Draft context size. */
  draftModelContextK: string;
  /** Draft currency symbol. */
  draftModelCurrencySymbol: string;
  /** Draft input price. */
  draftModelInputPrice: string;
  /** Draft cached input price. */
  draftModelInputCachePrice: string;
  /** Draft output price. */
  draftModelOutputPrice: string;
  /** Validation error. */
  modelError: string | null;
  /** Close dialog callback. */
  onOpenChange: (open: boolean) => void;
  /** Update draft model id. */
  onDraftModelIdChange: (value: string) => void;
  /** Update draft model input. */
  onDraftModelInputChange: (value: string[]) => void;
  /** Update draft model output. */
  onDraftModelOutputChange: (value: string[]) => void;
  /** Update draft model tags. */
  onDraftModelTagsChange: (value: string[]) => void;
  /** Update context size. */
  onDraftModelContextKChange: (value: string) => void;
  /** Update currency symbol. */
  onDraftModelCurrencySymbolChange: (value: string) => void;
  /** Update input price. */
  onDraftModelInputPriceChange: (value: string) => void;
  /** Update cached input price. */
  onDraftModelInputCachePriceChange: (value: string) => void;
  /** Update output price. */
  onDraftModelOutputPriceChange: (value: string) => void;
  /** Submit callback. */
  onSubmit: () => void;
};

/**
 * Render custom model dialog.
 */
export function ModelDialog({
  open,
  draftModelId,
  draftModelInput,
  draftModelOutput,
  draftModelTags,
  draftModelContextK,
  draftModelCurrencySymbol,
  draftModelInputPrice,
  draftModelInputCachePrice,
  draftModelOutputPrice,
  modelError,
  onOpenChange,
  onDraftModelIdChange,
  onDraftModelInputChange,
  onDraftModelOutputChange,
  onDraftModelTagsChange,
  onDraftModelContextKChange,
  onDraftModelCurrencySymbolChange,
  onDraftModelInputPriceChange,
  onDraftModelInputCachePriceChange,
  onDraftModelOutputPriceChange,
  onSubmit,
}: ModelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] w-full max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新建模型</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <div className="text-sm font-medium">模型 ID</div>
            <Input
              value={draftModelId}
              placeholder="例如：custom-chat-1"
              onChange={(event) => onDraftModelIdChange(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">输入类型</div>
            <div className="flex flex-wrap gap-2">
              {IO_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={draftModelInput.includes(option.value) ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    onDraftModelInputChange(toggleSelection(draftModelInput, option.value))
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">输出类型</div>
            <div className="flex flex-wrap gap-2">
              {IO_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={draftModelOutput.includes(option.value) ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    onDraftModelOutputChange(toggleSelection(draftModelOutput, option.value))
                  }
                >
                  {option.label}
                </Button>
              ))}
            </div>
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

          <div className="grid grid-cols-2 gap-3 md:col-span-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">上下文长度 (K)</div>
              <Input
                value={draftModelContextK}
                placeholder="例如：128"
                onChange={(event) => onDraftModelContextKChange(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">币种</div>
              <Input
                value={draftModelCurrencySymbol}
                placeholder="例如：¥ 或 $"
                onChange={(event) => onDraftModelCurrencySymbolChange(event.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 md:col-span-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">输入价格</div>
              <Input
                value={draftModelInputPrice}
                placeholder="例如：1.2"
                onChange={(event) => onDraftModelInputPriceChange(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">缓存输入</div>
              <Input
                value={draftModelInputCachePrice}
                placeholder="例如：0.2"
                onChange={(event) => onDraftModelInputCachePriceChange(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">输出价格</div>
              <Input
                value={draftModelOutputPrice}
                placeholder="例如：2.5"
                onChange={(event) => onDraftModelOutputPriceChange(event.target.value)}
              />
            </div>
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
