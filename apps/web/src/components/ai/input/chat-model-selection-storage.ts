"use client";

export type ModelSourceKey = "local" | "cloud";

export type StoredModelSelection = {
  /** Last manually selected model id. */
  lastModelId: string;
  /** Auto toggle state for the source. */
  isAuto: boolean;
  /** Preferred model ids for multi-select display. */
  preferredModelIds?: string[];
};

export type StoredModelSelections = Record<ModelSourceKey, StoredModelSelection> & {
  media?: MediaModelSelection;
};

export type MediaModelSelection = {
  /** Selected image generation model id (empty = Auto). */
  imageModelId: string;
  /** Selected video generation model id (empty = Auto). */
  videoModelId: string;
  /** Preferred image model ids for multi-select display. */
  preferredImageModelIds?: string[];
  /** Preferred video model ids for multi-select display. */
  preferredVideoModelIds?: string[];
};

export const MODEL_SELECTION_STORAGE_KEY = "openloaf.chat-model-selection";
export const CHAT_MODEL_SELECTION_EVENT = "openloaf:chat-model-selection";
export const CHAT_MODEL_SELECTION_TAB_PARAMS_KEY = "chatModelSelections";

export function createDefaultStoredSelection(): StoredModelSelection {
  return {
    lastModelId: "",
    isAuto: true,
  };
}

export function createDefaultMediaModelSelection(): MediaModelSelection {
  return { imageModelId: "", videoModelId: "" };
}

export function createDefaultStoredSelections(): StoredModelSelections {
  return {
    local: createDefaultStoredSelection(),
    cloud: createDefaultStoredSelection(),
    media: createDefaultMediaModelSelection(),
  };
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeStoredSelection(value: unknown): StoredModelSelection {
  if (!value || typeof value !== "object") {
    return createDefaultStoredSelection();
  }
  const record = value as Record<string, unknown>;
  return {
    lastModelId: typeof record.lastModelId === "string" ? record.lastModelId : "",
    isAuto: typeof record.isAuto === "boolean" ? record.isAuto : true,
    preferredModelIds: normalizeStringArray(record.preferredModelIds),
  };
}

function normalizeMediaModelSelection(value: unknown): MediaModelSelection {
  if (!value || typeof value !== "object") {
    return createDefaultMediaModelSelection();
  }
  const record = value as Record<string, unknown>;
  return {
    imageModelId: typeof record.imageModelId === "string" ? record.imageModelId : "",
    videoModelId: typeof record.videoModelId === "string" ? record.videoModelId : "",
    preferredImageModelIds: normalizeStringArray(record.preferredImageModelIds),
    preferredVideoModelIds: normalizeStringArray(record.preferredVideoModelIds),
  };
}

export function normalizeStoredSelections(value: unknown): StoredModelSelections {
  if (!value || typeof value !== "object") {
    return createDefaultStoredSelections();
  }
  const record = value as Record<string, unknown>;
  return {
    local: normalizeStoredSelection(record.local),
    cloud: normalizeStoredSelection(record.cloud),
    media: normalizeMediaModelSelection(record.media),
  };
}

function arraysEqual(a?: string[], b?: string[]): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/** Compare two stored model selection payloads. */
export function areStoredSelectionsEqual(
  left: StoredModelSelections,
  right: StoredModelSelections
) {
  return (
    left.local.lastModelId === right.local.lastModelId &&
    left.local.isAuto === right.local.isAuto &&
    arraysEqual(left.local.preferredModelIds, right.local.preferredModelIds) &&
    left.cloud.lastModelId === right.cloud.lastModelId &&
    left.cloud.isAuto === right.cloud.isAuto &&
    arraysEqual(left.cloud.preferredModelIds, right.cloud.preferredModelIds) &&
    (left.media?.imageModelId ?? "") === (right.media?.imageModelId ?? "") &&
    (left.media?.videoModelId ?? "") === (right.media?.videoModelId ?? "") &&
    arraysEqual(left.media?.preferredImageModelIds, right.media?.preferredImageModelIds) &&
    arraysEqual(left.media?.preferredVideoModelIds, right.media?.preferredVideoModelIds)
  );
}

export function readStoredSelections(): StoredModelSelections {
  if (typeof window === "undefined") {
    return createDefaultStoredSelections();
  }
  const raw = window.localStorage.getItem(MODEL_SELECTION_STORAGE_KEY);
  if (!raw) {
    return createDefaultStoredSelections();
  }
  try {
    return normalizeStoredSelections(JSON.parse(raw));
  } catch {
    return createDefaultStoredSelections();
  }
}

export function writeStoredSelections(value: StoredModelSelections) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODEL_SELECTION_STORAGE_KEY, JSON.stringify(value));
}

export function notifyChatModelSelectionChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_MODEL_SELECTION_EVENT));
}
