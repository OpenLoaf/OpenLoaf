/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Board (canvas) style system constants.
 *
 * Container-level glass effects (backdrop-blur, translucent bg, shadow) are
 * retained as a canvas-specific exception. Internal elements (buttons, text,
 * dividers, interactions) must align with the project design system.
 *
 * Reference: apps/web/src/components/email/email-style-system.ts
 */

/** Glass-effect toolbar container (canvas-specific exception). */
export const BOARD_TOOLBAR_SURFACE_CLASS =
  "bg-card/90 ring-1 ring-border/70 shadow-[0_10px_26px_rgba(15,23,42,0.18)] backdrop-blur-md cursor-default [&_*]:!cursor-default";

/** Icon button active state — blue selection following design system. */
export const BOARD_ICON_BTN_ACTIVE =
  "bg-[#d3e3fd] text-[#1a73e8] dark:bg-sky-800/60 dark:text-sky-50";

/** Icon button hover state — muted background following design system. */
export const BOARD_ICON_BTN_HOVER =
  "hover:bg-[hsl(var(--muted)/0.58)] dark:hover:bg-[hsl(var(--muted)/0.46)]";

/** Panel item active state (same as icon button). */
export const BOARD_PANEL_ITEM_ACTIVE = BOARD_ICON_BTN_ACTIVE;

/** Panel item hover state. */
export const BOARD_PANEL_ITEM_HOVER =
  "hover:bg-[hsl(var(--muted)/0.58)] dark:hover:bg-[hsl(var(--muted)/0.46)]";

/** Design-system-aligned pen colors (semantic palette). */
export const BOARD_PEN_COLORS = [
  "#202124", // neutral dark
  "#1a73e8", // blue (primary)
  "#f9ab00", // amber (in-progress)
  "#d93025", // red (urgent)
  "#188038", // green (complete)
] as const;

/** Primary text color. */
export const BOARD_TEXT_PRIMARY = "text-[#202124] dark:text-slate-50";

/** Secondary text color. */
export const BOARD_TEXT_SECONDARY = "text-[#3c4043] dark:text-slate-300";

/** Auxiliary text color. */
export const BOARD_TEXT_AUXILIARY = "text-[#5f6368] dark:text-slate-400";

/** Divider class for board separators. */
export const BOARD_DIVIDER_CLASS = "bg-[#e3e8ef] dark:bg-slate-700";

/** Border class for board panels. */
export const BOARD_BORDER_CLASS = "border-[#e3e8ef] dark:border-slate-700";

/** Connector style button — idle state. */
export const BOARD_CONNECTOR_BTN_IDLE =
  "text-[#5f6368] dark:text-slate-400";

/** Connector style button — active state. */
export const BOARD_CONNECTOR_BTN_ACTIVE =
  "bg-[#202124] text-white shadow-[0_0_0_1px_rgba(15,23,42,0.2)] dark:bg-slate-100 dark:text-slate-900";

/** Connector style button — hover state. */
export const BOARD_CONNECTOR_BTN_HOVER =
  "hover:bg-[hsl(var(--muted)/0.58)] hover:text-[#3c4043] dark:hover:bg-[hsl(var(--muted)/0.46)] dark:hover:text-slate-100";

/** Connector color swatch border. */
export const BOARD_CONNECTOR_SWATCH_BORDER =
  "border-[#e3e8ef] dark:border-slate-600";

/** Connector color swatch active ring. */
export const BOARD_CONNECTOR_SWATCH_ACTIVE_RING =
  "ring-2 ring-[#1a73e8] ring-offset-2 ring-offset-background dark:ring-sky-400";

/** Advanced settings card border. */
export const BOARD_SETTINGS_CARD_BORDER =
  "border-[#e3e8ef] dark:border-slate-700/80";

/** Advanced settings label text. */
export const BOARD_SETTINGS_LABEL = "text-[#5f6368] dark:text-slate-300";

/** Advanced settings tabs list background. */
export const BOARD_SETTINGS_TABS_BG =
  "bg-[#f1f3f4] dark:bg-slate-800/80";

/** Advanced settings tabs trigger active state. */
export const BOARD_SETTINGS_TABS_ACTIVE =
  "data-[state=active]:bg-white data-[state=active]:text-[#1a73e8] dark:data-[state=active]:bg-slate-900 dark:data-[state=active]:text-sky-300";

/** Advanced settings dropdown hover. */
export const BOARD_SETTINGS_DROPDOWN_HOVER =
  "hover:bg-[#f1f3f4] dark:hover:bg-slate-800";

/** Advanced settings dropdown item active. */
export const BOARD_SETTINGS_DROPDOWN_ITEM_ACTIVE =
  "bg-[#d3e3fd] text-[#1a73e8] dark:bg-sky-800/60 dark:text-sky-50";
