"use client";

import { create } from "zustand";

export type PanelSide = "left" | "right";

export type SnapshotLayer = {
  id: string;
  component: string;
  params: Record<string, any>;
  leftWidth?: number;
  hidden?: boolean;
  createdAt: number;
};

type PanelSnapshotState = {
  layers: SnapshotLayer[];
  hiddenAll: boolean;
  baseLeftWidth?: number;
};

type SnapshotLayerInput = {
  component: string;
  params?: Record<string, any>;
  leftWidth?: number;
};

type PanelSnapshotsStore = {
  byKey: Record<string, PanelSnapshotState>;

  pushSnapshot: (key: string, layer: SnapshotLayerInput) => SnapshotLayer;
  closeTopSnapshot: (key: string) => void;
  closeSnapshot: (key: string, layerId: string) => void;
  moveSnapshotUp: (key: string, layerId: string) => void;
  moveSnapshotDown: (key: string, layerId: string) => void;
  toggleSnapshotHidden: (key: string, layerId: string) => void;
  setAllSnapshotsHidden: (key: string, hidden: boolean) => void;
  setHiddenAll: (key: string, hiddenAll: boolean) => void;
  setTopLeftWidth: (key: string, leftWidth: number) => void;
};

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `snapshot-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const makePanelSnapshotKey = (tabId: string, side: PanelSide) =>
  `${tabId}:${side}`;

const ensureState = (
  state: Record<string, PanelSnapshotState>,
  key: string
): PanelSnapshotState => state[key] ?? { layers: [], hiddenAll: false };

export const usePanelSnapshots = create<PanelSnapshotsStore>()((set) => ({
  byKey: {},

  pushSnapshot: (key, layer) => {
    const created: SnapshotLayer = {
      id: generateId(),
      component: layer.component,
      params: layer.params ?? {},
      leftWidth: layer.leftWidth,
      hidden: false,
      createdAt: Date.now(),
    };

    set((state) => {
      const current = ensureState(state.byKey, key);
      const baseLeftWidth =
        current.layers.length === 0 ? layer.leftWidth : current.baseLeftWidth;

      return {
        byKey: {
          ...state.byKey,
          [key]: {
            ...current,
            baseLeftWidth,
            hiddenAll: false,
            layers: [...current.layers, created],
          },
        },
      };
    });

    return created;
  },

  closeTopSnapshot: (key) => {
    set((state) => {
      const current = state.byKey[key];
      if (!current || current.layers.length === 0) return state;

      const nextLayers = current.layers.slice(0, -1);

      return {
        byKey: {
          ...state.byKey,
          [key]: {
            ...current,
            layers: nextLayers,
          },
        },
      };
    });
  },

  closeSnapshot: (key, layerId) => {
    set((state) => {
      const current = state.byKey[key];
      if (!current || current.layers.length === 0) return state;

      const nextLayers = current.layers.filter((l) => l.id !== layerId);
      if (nextLayers.length === current.layers.length) return state;

      return {
        byKey: {
          ...state.byKey,
          [key]: {
            ...current,
            layers: nextLayers,
          },
        },
      };
    });
  },

  moveSnapshotUp: (key, layerId) => {
    set((state) => {
      const current = state.byKey[key];
      if (!current || current.layers.length < 2) return state;

      const index = current.layers.findIndex((l) => l.id === layerId);
      if (index === -1 || index === current.layers.length - 1) return state;

      const nextLayers = [...current.layers];
      const tmp = nextLayers[index];
      nextLayers[index] = nextLayers[index + 1];
      nextLayers[index + 1] = tmp;

      return {
        byKey: {
          ...state.byKey,
          [key]: {
            ...current,
            layers: nextLayers,
          },
        },
      };
    });
  },

  moveSnapshotDown: (key, layerId) => {
    set((state) => {
      const current = state.byKey[key];
      if (!current || current.layers.length < 2) return state;

      const index = current.layers.findIndex((l) => l.id === layerId);
      if (index <= 0) return state;

      const nextLayers = [...current.layers];
      const tmp = nextLayers[index];
      nextLayers[index] = nextLayers[index - 1];
      nextLayers[index - 1] = tmp;

      return {
        byKey: {
          ...state.byKey,
          [key]: {
            ...current,
            layers: nextLayers,
          },
        },
      };
    });
  },

  toggleSnapshotHidden: (key, layerId) => {
    set((state) => {
      const current = state.byKey[key];
      if (!current || current.layers.length === 0) return state;

      const index = current.layers.findIndex((l) => l.id === layerId);
      if (index === -1) return state;

      const target = current.layers[index];
      const nextTarget = { ...target, hidden: !target.hidden };

      const nextLayers = [...current.layers];
      nextLayers[index] = nextTarget;

      return {
        byKey: {
          ...state.byKey,
          [key]: {
            ...current,
            layers: nextLayers,
          },
        },
      };
    });
  },

  setAllSnapshotsHidden: (key, hidden) => {
    set((state) => {
      const current = state.byKey[key];
      if (!current || current.layers.length === 0) return state;

      const nextLayers = current.layers.map((layer) =>
        layer.hidden === hidden ? layer : { ...layer, hidden }
      );

      return {
        byKey: {
          ...state.byKey,
          [key]: {
            ...current,
            layers: nextLayers,
          },
        },
      };
    });
  },

  setHiddenAll: (key, hiddenAll) => {
    set((state) => {
      const current = ensureState(state.byKey, key);
      return {
        byKey: {
          ...state.byKey,
          [key]: {
            ...current,
            hiddenAll,
          },
        },
      };
    });
  },

  setTopLeftWidth: (key, leftWidth) => {
    set((state) => {
      const current = state.byKey[key];
      if (!current || current.layers.length === 0) return state;

      const top = current.layers[current.layers.length - 1];
      const nextTop =
        top.leftWidth === leftWidth ? top : { ...top, leftWidth };

      const nextLayers = [...current.layers];
      nextLayers[nextLayers.length - 1] = nextTop;

      return {
        byKey: {
          ...state.byKey,
          [key]: {
            ...current,
            layers: nextLayers,
          },
        },
      };
    });
  },
}));
