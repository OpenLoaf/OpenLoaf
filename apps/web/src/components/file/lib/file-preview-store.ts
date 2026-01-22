"use client";

import { create } from "zustand";
import type { FilePreviewPayload } from "./file-preview-types";

export type FilePreviewState = {
  /** Current preview payload. */
  payload: FilePreviewPayload | null;
  /** Open the preview dialog. */
  openPreview: (payload: FilePreviewPayload) => void;
  /** Close the preview dialog. */
  closePreview: () => void;
};

export const useFilePreviewStore = create<FilePreviewState>((set, get) => ({
  payload: null,
  openPreview: (payload) => set({ payload }),
  closePreview: () => {
    // 逻辑：关闭时先通知触发方清理本地预览状态，避免再次打开。
    const payload = get().payload;
    payload?.onClose?.();
    set({ payload: null });
  },
}));

/** Open the shared file preview dialog. */
export function openFilePreview(payload: FilePreviewPayload) {
  useFilePreviewStore.getState().openPreview(payload);
}

/** Close the shared file preview dialog. */
export function closeFilePreview() {
  useFilePreviewStore.getState().closePreview();
}
