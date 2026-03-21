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
  const { t } = useTranslation('common');
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[80vh] w-full max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">{description}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="rounded-3xl">
            {t('cancel')}
          </Button>
          <Button
            onClick={async () => {
              await onConfirm();
            }}
            className="bg-destructive text-white hover:bg-destructive/90 rounded-3xl shadow-none transition-colors duration-150"
          >
            {t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
