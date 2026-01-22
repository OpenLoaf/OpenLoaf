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

export const useFilePreviewStore = create<FilePreviewState>((set) => ({
  payload: null,
  openPreview: (payload) => set({ payload }),
  closePreview: () => set({ payload: null }),
}));

/** Open the shared file preview dialog. */
export function openFilePreview(payload: FilePreviewPayload) {
  useFilePreviewStore.getState().openPreview(payload);
}

/** Close the shared file preview dialog. */
export function closeFilePreview() {
  useFilePreviewStore.getState().closePreview();
}
