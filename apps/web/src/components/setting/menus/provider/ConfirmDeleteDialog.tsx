import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmDeleteDialogProps = {
  /** Dialog title. */
  title: string;
  /** Confirmation description. */
  description: string;
  /** Whether dialog is open. */
  open: boolean;
  /** Close dialog callback. */
  onClose: () => void;
  /** Confirm action callback. */
  onConfirm: () => Promise<void> | void;
};

/**
 * Render confirm delete dialog.
 */
export function ConfirmDeleteDialog({
  title,
  description,
  open,
  onClose,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[80vh] w-full max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">{description}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await onConfirm();
            }}
          >
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
