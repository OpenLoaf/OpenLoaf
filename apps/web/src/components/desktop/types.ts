"use client";

import type * as React from "react";
import type { DesktopBreakpoint } from "./desktop-breakpoints";

export type DesktopItemKind = "icon" | "widget";

export type DesktopScope = "workspace" | "project";

export interface DesktopScopeSupport {
  /** Whether the item is available in workspace scope. */
  workspace: boolean;
  /** Whether the item is available in project scope. */
  project: boolean;
}

export type DesktopWidgetSize = "1x1" | "2x2" | "4x2" | "4x3" | "5x6";

export interface DesktopWidgetConstraints {
  /** Default grid width in columns. */
  defaultW: number;
  /** Default grid height in rows. */
  defaultH: number;
  /** Minimum grid width in columns. */
  minW: number;
  /** Minimum grid height in rows. */
  minH: number;
  /** Maximum grid width in columns. */
  maxW: number;
  /** Maximum grid height in rows. */
  maxH: number;
}

export interface DesktopFlipClockSettings {
  /** Whether to show seconds. */
  showSeconds: boolean;
}

export interface DesktopItemLayout {
  /** Grid column start (0-based). */
  x: number;
  /** Grid row start (0-based). */
  y: number;
  /** Grid width in columns. */
  w: number;
  /** Grid height in rows. */
  h: number;
}

export interface DesktopItemBase {
  /** Unique id for drag & drop. */
  id: string;
  /** Item kind. */
  kind: DesktopItemKind;
  /** Display title. */
  title: string;
  /** Whether the item is pinned (non-movable). */
  pinned?: boolean;
  /** Layout map for multiple breakpoints. */
  layoutByBreakpoint?: Partial<Record<DesktopBreakpoint, DesktopItemLayout>>;
  /** Gridstack layout. */
  layout: DesktopItemLayout;
  /** Breakpoints that have been manually customized by the user. */
  customizedBreakpoints?: DesktopBreakpoint[];
}

export type DesktopIconKey = "files" | "tasks" | "search" | "settings";

export interface DesktopIconItem extends DesktopItemBase {
  kind: "icon";
  /** Icon key for persistence. */
  iconKey: DesktopIconKey;
  /** Icon element. */
  icon: React.ReactNode;
}

export interface DesktopWidgetItem extends DesktopItemBase {
  kind: "widget";
  /** Widget implementation key (built-in for MVP). */
  widgetKey:
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
  /** Widget size in grid units (MVP uses presets). */
  size: DesktopWidgetSize;
  /** Widget layout constraints for resizing. */
  constraints: DesktopWidgetConstraints;
  /** Flip clock settings (when widgetKey is flip-clock). */
  flipClock?: DesktopFlipClockSettings;
  /** Folder selection reference (when widgetKey is 3d-folder). */
  folderUri?: string;
  /** Video file reference (when widgetKey is video). */
  videoFileRef?: string;
  /** Web stack url (when widgetKey is web-stack). */
  webUrl?: string;
  /** Web stack display title (when widgetKey is web-stack). */
  webTitle?: string;
  /** Web stack description (when widgetKey is web-stack). */
  webDescription?: string;
  /** Web stack logo path under .tenas/desktop (when widgetKey is web-stack). */
  webLogo?: string;
  /** Web stack preview image path under .tenas/desktop (when widgetKey is web-stack). */
  webPreview?: string;
  /** Web stack metadata status (when widgetKey is web-stack). */
  webMetaStatus?: "idle" | "loading" | "ready" | "failed";
  /** Dynamic widget id (when widgetKey is dynamic). */
  dynamicWidgetId?: string;
  /** Project id that owns the dynamic widget (when widgetKey is dynamic). */
  dynamicProjectId?: string;
}

export type DesktopItem = DesktopIconItem | DesktopWidgetItem;
