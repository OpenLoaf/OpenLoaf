"use client";

import type * as React from "react";
import type { DesktopBreakpoint } from "./desktop-breakpoints";

export type DesktopItemKind = "icon" | "widget";

export type DesktopWidgetSize = "1x1" | "2x2" | "4x2";

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
  widgetKey: "clock" | "flip-clock" | "quick-actions" | "3d-folder";
  /** Widget size in grid units (MVP uses presets). */
  size: DesktopWidgetSize;
  /** Widget layout constraints for resizing. */
  constraints: DesktopWidgetConstraints;
  /** Flip clock settings (when widgetKey is flip-clock). */
  flipClock?: DesktopFlipClockSettings;
  /** Folder selection reference (when widgetKey is 3d-folder). */
  folderUri?: string;
}

export type DesktopItem = DesktopIconItem | DesktopWidgetItem;
