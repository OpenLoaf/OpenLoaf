"use client";

import { useEffect } from "react";
import { create } from "zustand";
import type { AiModel } from "@tenas-saas/sdk";
import { fetchImageModels, fetchVideoModels } from "@/lib/saas-media";

type MediaKind = "image" | "video";

type RefreshMediaModelOptions = {
  /** Force bypass server cache. */
  force?: boolean;
  /** Only refresh selected kinds when provided. */
  kinds?: MediaKind[];
};

type MediaModelState = {
  /** Image model list. */
  imageModels: AiModel[];
  /** Video model list. */
  videoModels: AiModel[];
  /** Last updated-at value for image models. */
  imageUpdatedAt: string;
  /** Last updated-at value for video models. */
  videoUpdatedAt: string;
  /** Loading flag to avoid duplicate requests. */
  loading: boolean;
  /** Whether the list has been loaded at least once. */
  loaded: boolean;
  /** Load once if not loaded. */
  load: () => Promise<void>;
  /** Force refresh model list. */
  refresh: (options?: RefreshMediaModelOptions) => Promise<void>;
};

type MediaModelResponse = {
  /** Response success flag. */
  success: boolean;
  /** Response payload. */
  data?: {
    /** Model list payload. */
    data?: AiModel[];
    /** Model list updated-at. */
    updatedAt?: string;
  };
};

type ParsedMediaModelPayload = {
  models: AiModel[];
  updatedAt: string;
};

type MediaModelWithDisplayName = AiModel & {
  displayName?: string;
};

/** Normalize media model list for UI display. */
function normalizeMediaModels(models: AiModel[]): AiModel[] {
  return models.map((item) => {
    const model = item as MediaModelWithDisplayName;
    const normalizedName =
      typeof model.name === "string" && model.name.trim()
        ? model.name
        : typeof model.displayName === "string" && model.displayName.trim()
          ? model.displayName
          : item.id;
    // 逻辑：优先保留 SDK 标准 name；当 SaaS 仅返回 displayName 时回填，避免界面退化为 id。
    return { ...item, name: normalizedName };
  });
}

function resolveModelPayload(payload: unknown): ParsedMediaModelPayload {
  const response = payload as MediaModelResponse | null;
  if (!response || response.success !== true) return { models: [], updatedAt: "" };
  const list = response.data?.data;
  return {
    models: Array.isArray(list) ? normalizeMediaModels(list) : [],
    updatedAt: typeof response.data?.updatedAt === "string" ? response.data.updatedAt : "",
  };
}

const useMediaModelStore = create<MediaModelState>((set, get) => ({
  imageModels: [],
  videoModels: [],
  imageUpdatedAt: "",
  videoUpdatedAt: "",
  loading: false,
  loaded: false,
  load: async () => {
    if (get().loading || get().loaded) return;
    await get().refresh();
  },
  refresh: async (options = {}) => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const kinds = options.kinds?.length ? new Set(options.kinds) : new Set<MediaKind>(["image", "video"]);
      const [imagePayload, videoPayload] = await Promise.all([
        kinds.has("image") ? fetchImageModels({ force: options.force }) : Promise.resolve(null),
        kinds.has("video") ? fetchVideoModels({ force: options.force }) : Promise.resolve(null),
      ]);
      const imageResolved = kinds.has("image")
        ? resolveModelPayload(imagePayload)
        : { models: get().imageModels, updatedAt: get().imageUpdatedAt };
      const videoResolved = kinds.has("video")
        ? resolveModelPayload(videoPayload)
        : { models: get().videoModels, updatedAt: get().videoUpdatedAt };
      set({
        imageModels: imageResolved.models,
        videoModels: videoResolved.models,
        imageUpdatedAt: imageResolved.updatedAt,
        videoUpdatedAt: videoResolved.updatedAt,
        loaded: true,
        loading: false,
      });
    } catch {
      set((prev) => ({
        imageModels: prev.imageModels,
        videoModels: prev.videoModels,
        imageUpdatedAt: prev.imageUpdatedAt,
        videoUpdatedAt: prev.videoUpdatedAt,
        loaded: true,
        loading: false,
      }));
    }
  },
}));

/** React hook for media model lists. */
export function useMediaModels() {
  const imageModels = useMediaModelStore((state) => state.imageModels);
  const videoModels = useMediaModelStore((state) => state.videoModels);
  const imageUpdatedAt = useMediaModelStore((state) => state.imageUpdatedAt);
  const videoUpdatedAt = useMediaModelStore((state) => state.videoUpdatedAt);
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
    imageUpdatedAt,
    videoUpdatedAt,
    loaded,
    loading,
    refresh,
  };
}
