"use client";

import type {
  DesktopIconKey,
  DesktopItem,
  DesktopItemLayout,
  DesktopWidgetConstraints,
} from "./types";
import { buildChildUri } from "@/components/project/filesystem/utils/file-system-utils";
import {
  DESKTOP_BREAKPOINTS,
  createLayoutByBreakpoint,
  type DesktopBreakpoint,
} from "./desktop-breakpoints";
import { getDesktopIconByKey } from "./widgets/DesktopIconWidget";

type DesktopFileGrid = {
  breakpoints: typeof DESKTOP_BREAKPOINTS;
};

type DesktopFileItem = {
  id: string;
  kind: "icon" | "widget";
  title: string;
  widgetKey?:
    | "clock"
    | "flip-clock"
    | "quick-actions"
    | "calendar"
    | "chat-history"
    | "email-inbox"
    | "3d-folder"
    | "video"
    | "web-stack"
    | "dynamic";
  size?: "1x1" | "2x2" | "4x2" | "4x3" | "5x6";
  constraints?: DesktopWidgetConstraints;
  variant?: string;
  pinned?: boolean;
  iconKey?: DesktopIconKey;
  params?: Record<string, unknown>;
  layout?: DesktopItemLayout;
  layoutByBreakpoint: Record<DesktopBreakpoint, DesktopItemLayout>;
  customizedBreakpoints?: DesktopBreakpoint[];
};

const THREE_D_FOLDER_CONSTRAINTS: DesktopWidgetConstraints = {
  defaultW: 4,
  defaultH: 3,
  minW: 1,
  minH: 1,
  maxW: 12,
  maxH: 20,
};

type DesktopFilePayload = {
  version: 1;
  updatedAt: string;
  grid: DesktopFileGrid;
  items: DesktopFileItem[];
};

const DESKTOP_FILE_NAME = "desktop.tenas";

/** Resolve a fallback layout from a layout map. */
function resolveFallbackLayout(layouts: Record<DesktopBreakpoint, DesktopItemLayout>) {
  return layouts.lg ?? layouts.md ?? layouts.sm ?? { x: 0, y: 0, w: 1, h: 1 };
}

/** Build the desktop persistence file uri under the project root. */
export function getDesktopFileUri(rootUri: string): string {
  const metaDir = buildChildUri(rootUri, ".tenas");
  return buildChildUri(metaDir, DESKTOP_FILE_NAME);
}

/** Build the desktop persistence file uri under the workspace root. */
export function getWorkspaceDesktopFileUri(rootUri: string): string {
  const metaDir = buildChildUri(rootUri, ".tenas");
  return buildChildUri(metaDir, DESKTOP_FILE_NAME);
}

/** Convert desktop items into a serializable payload. */
export function serializeDesktopItems(items: DesktopItem[]): DesktopFilePayload {
  const payloadItems: DesktopFileItem[] = items.map((item) => {
    const layoutByBreakpoint = {
      ...createLayoutByBreakpoint(item.layout),
      ...(item.layoutByBreakpoint ?? {}),
    };
    if (item.kind === "icon") {
      return {
        id: item.id,
        kind: "icon",
        title: item.title,
        iconKey: item.iconKey,
        pinned: item.pinned,
        layoutByBreakpoint,
        customizedBreakpoints: item.customizedBreakpoints?.length
          ? item.customizedBreakpoints
          : undefined,
      };
    }

    const params =
      item.widgetKey === "flip-clock"
        ? { showSeconds: item.flipClock?.showSeconds ?? true }
        : item.widgetKey === "3d-folder"
          ? { folderUri: item.folderUri }
          : item.widgetKey === "video"
            ? { videoFileRef: item.videoFileRef }
            : item.widgetKey === "web-stack"
              ? {
                  webUrl: item.webUrl,
                  webTitle: item.webTitle,
                  webDescription: item.webDescription,
                  webLogo: item.webLogo,
                  webPreview: item.webPreview,
                  webMetaStatus: item.webMetaStatus,
                }
              : item.widgetKey === "dynamic"
                ? { dynamicWidgetId: item.dynamicWidgetId, dynamicProjectId: item.dynamicProjectId }
                : undefined;

    return {
      id: item.id,
      kind: "widget",
      title: item.title,
      widgetKey: item.widgetKey,
      size: item.size,
      constraints: item.constraints,
      variant: item.variant,
      pinned: item.pinned,
      params,
      layoutByBreakpoint,
      customizedBreakpoints: item.customizedBreakpoints?.length
        ? item.customizedBreakpoints
        : undefined,
    };
  });

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    grid: { breakpoints: DESKTOP_BREAKPOINTS },
    items: payloadItems,
  };
}

/** Parse a desktop payload and restore runtime items. */
export function deserializeDesktopItems(raw: string): DesktopItem[] | null {
  try {
    const payload = JSON.parse(raw) as DesktopFilePayload;
    if (!payload || payload.version !== 1 || !Array.isArray(payload.items)) {
      return null;
    }

    const validBps = new Set<string>(["sm", "md", "lg"]);
    const parseCustomizedBps = (raw: unknown): DesktopBreakpoint[] | undefined => {
      if (!Array.isArray(raw)) return undefined;
      const filtered = raw.filter((v): v is DesktopBreakpoint => validBps.has(v));
      return filtered.length > 0 ? filtered : undefined;
    };

    return payload.items
      .map((item): DesktopItem | null => {
        if (!item || !item.id || !item.kind) return null;
        const layoutByBreakpoint =
          item.layoutByBreakpoint ?? (item.layout ? createLayoutByBreakpoint(item.layout) : null);
        if (!layoutByBreakpoint) return null;
        const fallbackLayout = resolveFallbackLayout(layoutByBreakpoint);
        if (item.kind === "icon") {
          const iconKey: DesktopIconKey = item.iconKey ?? "files";
          return {
            id: item.id,
            kind: "icon",
            title: item.title,
            iconKey,
            icon: getDesktopIconByKey(iconKey),
            pinned: item.pinned,
            layout: fallbackLayout,
            layoutByBreakpoint,
            customizedBreakpoints: parseCustomizedBps(item.customizedBreakpoints),
          };
        }

        if (!item.widgetKey || !item.constraints || !item.size) return null;
        const params = item.params ?? {};
        const constraints =
          item.widgetKey === "3d-folder" ? THREE_D_FOLDER_CONSTRAINTS : item.constraints;
        // 逻辑：向后兼容 flip-clock showSeconds → variant 映射。
        let variant = item.variant;
        if (!variant && item.widgetKey === "flip-clock") {
          variant = params.showSeconds === false ? "hm" : "hms";
        }
        return {
          id: item.id,
          kind: "widget",
          title: item.title,
          widgetKey: item.widgetKey,
          size: item.size,
          constraints,
          variant,
          pinned: item.pinned,
          folderUri:
            item.widgetKey === "3d-folder" && typeof params.folderUri === "string"
              ? params.folderUri
              : undefined,
          videoFileRef:
            item.widgetKey === "video" && typeof params.videoFileRef === "string"
              ? params.videoFileRef
              : undefined,
          webUrl:
            item.widgetKey === "web-stack" && typeof params.webUrl === "string"
              ? params.webUrl
              : undefined,
          webTitle:
            item.widgetKey === "web-stack" && typeof params.webTitle === "string"
              ? params.webTitle
              : undefined,
          webDescription:
            item.widgetKey === "web-stack" && typeof params.webDescription === "string"
              ? params.webDescription
              : undefined,
          webLogo:
            item.widgetKey === "web-stack" && typeof params.webLogo === "string"
              ? params.webLogo
              : undefined,
          webPreview:
            item.widgetKey === "web-stack" && typeof params.webPreview === "string"
              ? params.webPreview
              : undefined,
          webMetaStatus:
            item.widgetKey === "web-stack" &&
            (params.webMetaStatus === "idle" ||
              params.webMetaStatus === "loading" ||
              params.webMetaStatus === "ready" ||
              params.webMetaStatus === "failed")
              ? params.webMetaStatus
              : undefined,
          flipClock:
            item.widgetKey === "flip-clock"
              ? { showSeconds: params.showSeconds !== false }
              : undefined,
          dynamicWidgetId:
            item.widgetKey === "dynamic" && typeof params.dynamicWidgetId === "string"
              ? params.dynamicWidgetId
              : undefined,
          dynamicProjectId:
            item.widgetKey === "dynamic" && typeof params.dynamicProjectId === "string"
              ? params.dynamicProjectId
              : undefined,
          layout: fallbackLayout,
          layoutByBreakpoint,
          customizedBreakpoints: parseCustomizedBps(item.customizedBreakpoints),
        };
      })
      .filter((item): item is DesktopItem => Boolean(item));
  } catch {
    return null;
  }
}
