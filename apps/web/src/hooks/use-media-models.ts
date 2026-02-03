"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { MediaModelDefinition } from "@tenas-ai/api/common";
import { fetchImageModels, fetchVideoModels } from "@/lib/saas-media";

type MediaModelState = {
  /** Image model list. */
  imageModels: MediaModelDefinition[];
  /** Video model list. */
  videoModels: MediaModelDefinition[];
  /** Loading flag to avoid duplicate requests. */
  loading: boolean;
  /** Whether the list has been loaded at least once. */
  loaded: boolean;
  /** Load once if not loaded. */
  load: () => Promise<void>;
  /** Force refresh model list. */
  refresh: () => Promise<void>;
};

type MediaModelResponse = {
  /** Response success flag. */
  success: boolean;
  /** Response payload. */
  data?: {
    /** Model list payload. */
    data?: MediaModelDefinition[];
  };
};

function resolveModelList(payload: unknown): MediaModelDefinition[] {
  const response = payload as MediaModelResponse | null;
  if (!response || response.success !== true) return [];
  const list = response.data?.data;
  return Array.isArray(list) ? list : [];
}

const useMediaModelStore = create<MediaModelState>((set, get) => ({
  imageModels: [],
  videoModels: [],
  loading: false,
  loaded: false,
  load: async () => {
    if (get().loading || get().loaded) return;
    await get().refresh();
  },
  refresh: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const [imagePayload, videoPayload] = await Promise.all([
        fetchImageModels(),
        fetchVideoModels(),
      ]);
      set({
        imageModels: resolveModelList(imagePayload),
        videoModels: resolveModelList(videoPayload),
        loaded: true,
        loading: false,
      });
    } catch {
      set({ imageModels: [], videoModels: [], loaded: true, loading: false });
    }
  },
}));

/** React hook for media model lists. */
export function useMediaModels() {
  const imageModels = useMediaModelStore((state) => state.imageModels);
  const videoModels = useMediaModelStore((state) => state.videoModels);
  const loaded = useMediaModelStore((state) => state.loaded);
  const loading = useMediaModelStore((state) => state.loading);
  const load = useMediaModelStore((state) => state.load);
  const refresh = useMediaModelStore((state) => state.refresh);

  useEffect(() => {
    if (loaded) return;
    void load();
  }, [loaded, load]);

  return {
    imageModels,
    videoModels,
    loaded,
    loading,
    refresh,
  };
}
