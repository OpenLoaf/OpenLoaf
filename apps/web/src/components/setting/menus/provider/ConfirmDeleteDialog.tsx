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
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={title}
      description={description}
      confirmLabel={t('delete')}
      variant="destructive"
      onCancel={onClose}
      onConfirm={onConfirm}
    />
  );
}
