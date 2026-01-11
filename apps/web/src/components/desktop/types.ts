"use client";

import type * as React from "react";

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
  /** Gridstack layout. */
  layout: DesktopItemLayout;
}

export interface DesktopIconItem extends DesktopItemBase {
  kind: "icon";
  /** Icon element. */
  icon: React.ReactNode;
}

export interface DesktopWidgetItem extends DesktopItemBase {
  kind: "widget";
  /** Widget implementation key (built-in for MVP). */
  widgetKey: "clock" | "flip-clock" | "quick-actions";
  /** Widget size in grid units (MVP uses presets). */
  size: DesktopWidgetSize;
  /** Widget layout constraints for resizing. */
  constraints: DesktopWidgetConstraints;
}

export type DesktopItem = DesktopIconItem | DesktopWidgetItem;
