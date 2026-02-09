"use client";

export type ModelSourceKey = "local" | "cloud";

export type StoredModelSelection = {
  /** Last manually selected model id. */
  lastModelId: string;
  /** Auto toggle state for the source. */
  isAuto: boolean;
};

export type StoredModelSelections = Record<ModelSourceKey, StoredModelSelection>;

export const MODEL_SELECTION_STORAGE_KEY = "tenas.chat-model-selection";
export const CHAT_MODEL_SELECTION_EVENT = "tenas:chat-model-selection";

function createDefaultStoredSelection(): StoredModelSelection {
  return {
    lastModelId: "",
    isAuto: true,
  };
}

function createDefaultStoredSelections(): StoredModelSelections {
  return {
    local: createDefaultStoredSelection(),
    cloud: createDefaultStoredSelection(),
  };
}

function normalizeStoredSelection(value: unknown): StoredModelSelection {
  if (!value || typeof value !== "object") {
    return createDefaultStoredSelection();
  }
  const record = value as Record<string, unknown>;
  return {
    lastModelId: typeof record.lastModelId === "string" ? record.lastModelId : "",
    isAuto: typeof record.isAuto === "boolean" ? record.isAuto : true,
  };
}

function normalizeStoredSelections(value: unknown): StoredModelSelections {
  if (!value || typeof value !== "object") {
    return createDefaultStoredSelections();
  }
  const record = value as Record<string, unknown>;
  return {
    local: normalizeStoredSelection(record.local),
    cloud: normalizeStoredSelection(record.cloud),
  };
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
