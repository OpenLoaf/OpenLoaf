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
  "ol-glass-toolbar ring-1 ring-border/70 cursor-default [&_*]:!cursor-default";

/** Icon button active state — visible contrast for selected tool. */
export const BOARD_ICON_BTN_ACTIVE =
  "bg-foreground/10 text-ol-blue dark:bg-foreground/15";

/** Icon button hover state — muted background following design system. */
export const BOARD_ICON_BTN_HOVER =
  "hover:bg-foreground/8 dark:hover:bg-foreground/10";

/** Panel item active state (same as icon button). */
export const BOARD_PANEL_ITEM_ACTIVE = BOARD_ICON_BTN_ACTIVE;

/** Panel item hover state. */
export const BOARD_PANEL_ITEM_HOVER =
  "hover:bg-foreground/8 dark:hover:bg-foreground/10";

/** Design-system-aligned pen colors (TE palette). */
export const BOARD_PEN_COLORS = [
  "#0f0e12", // neutral dark (TE black)
  "#f05a24", // orange (TE primary)
  "#0071bb", // blue (TE blue)
  "#b81d13", // red (TE red)
  "#006837", // green (TE green)
] as const;

/** Primary text color. */
export const BOARD_TEXT_PRIMARY = "text-ol-text-primary";

/** Secondary text color. */
export const BOARD_TEXT_SECONDARY = "text-ol-text-secondary";

/** Auxiliary text color. */
export const BOARD_TEXT_AUXILIARY = "text-ol-text-auxiliary";

/** Divider class for board separators. */
export const BOARD_DIVIDER_CLASS = "bg-ol-divider";

/** Border class for board panels. */
export const BOARD_BORDER_CLASS = "border-ol-divider";

/** Connector style button — idle state. */
export const BOARD_CONNECTOR_BTN_IDLE =
  "text-ol-text-auxiliary";

/** Connector style button — active state. */
export const BOARD_CONNECTOR_BTN_ACTIVE =
  "bg-ol-text-primary text-white shadow-[0_0_0_1px_rgba(15,23,42,0.2)] dark:bg-foreground dark:text-background";

/** Connector style button — hover state. */
export const BOARD_CONNECTOR_BTN_HOVER =
  "hover:bg-muted/58 hover:text-ol-text-secondary dark:hover:bg-muted/46 dark:hover:text-foreground";

/** Connector color swatch border. */
export const BOARD_CONNECTOR_SWATCH_BORDER =
  "border-ol-divider";

/** Connector color swatch active ring. */
export const BOARD_CONNECTOR_SWATCH_ACTIVE_RING =
  "ring-2 ring-ol-blue ring-offset-2 ring-offset-background";

/** Advanced settings card border. */
export const BOARD_SETTINGS_CARD_BORDER =
  "border-ol-divider";

/** Advanced settings label text. */
export const BOARD_SETTINGS_LABEL = "text-ol-text-auxiliary";

/** Advanced settings tabs list background. */
export const BOARD_SETTINGS_TABS_BG =
  "bg-ol-surface-muted";

/** Advanced settings tabs trigger active state. */
export const BOARD_SETTINGS_TABS_ACTIVE =
  "data-[state=active]:bg-background data-[state=active]:text-ol-blue";

/** Advanced settings dropdown hover. */
export const BOARD_SETTINGS_DROPDOWN_HOVER =
  "hover:bg-ol-surface-muted";

/** Advanced settings dropdown item active. */
export const BOARD_SETTINGS_DROPDOWN_ITEM_ACTIVE =
  "bg-ol-blue-bg-hover text-ol-blue";

/* ── Toolbar Item Semantic Colors ── */

/** Toolbar item — blue (primary / info actions). */
export const BOARD_TOOLBAR_ITEM_BLUE =
  "text-ol-blue hover:bg-ol-blue-bg";

/** Toolbar item — green (download / save actions). */
export const BOARD_TOOLBAR_ITEM_GREEN =
  "text-ol-green hover:bg-ol-green-bg";

/** Toolbar item — amber (toggle / warning actions). */
export const BOARD_TOOLBAR_ITEM_AMBER =
  "text-ol-amber hover:bg-ol-amber-bg";

/** Toolbar item — red (destructive actions). */
export const BOARD_TOOLBAR_ITEM_RED =
  "text-ol-red hover:bg-ol-red-bg";

/** Toolbar item — purple (style / color actions). */
export const BOARD_TOOLBAR_ITEM_PURPLE =
  "text-ol-purple hover:bg-ol-purple-bg";

/* ── Generation Node Style Constants ── */

/** Glass container base for generation nodes (neutral fallback). */
export const BOARD_GENERATE_NODE_BASE =
  "ol-glass-node";

/** Semantic glass base — image generation (subtle tint). */
export const BOARD_GENERATE_NODE_BASE_IMAGE =
  "ol-glass-node bg-card/95 dark:bg-card/95";
/** Semantic glass base — image prompt (subtle tint). */
export const BOARD_GENERATE_NODE_BASE_PROMPT =
  "ol-glass-node bg-card/95 dark:bg-card/95";
/** Semantic glass base — video generation (subtle tint). */
export const BOARD_GENERATE_NODE_BASE_VIDEO =
  "ol-glass-node bg-card/95 dark:bg-card/95";

/** Semantic border — image generation (neutral idle). */
export const BOARD_GENERATE_BORDER_IMAGE = "border-border/50";
/** Semantic border — video generation (neutral idle). */
export const BOARD_GENERATE_BORDER_VIDEO = "border-border/50";
/** Semantic border — image prompt (neutral idle). */
export const BOARD_GENERATE_BORDER_PROMPT = "border-border/50";

/** Selected state — image generation. */
export const BOARD_GENERATE_SELECTED_IMAGE =
  "border-ol-blue/60 ring-2 ring-ol-blue/15";
/** Selected state — video generation. */
export const BOARD_GENERATE_SELECTED_VIDEO =
  "border-ol-purple/60 ring-2 ring-ol-purple/15";
/** Selected state — image prompt. */
export const BOARD_GENERATE_SELECTED_PROMPT =
  "border-ol-amber/60 ring-2 ring-ol-amber/15";

/** Error state for generation nodes. */
export const BOARD_GENERATE_ERROR =
  "border-ol-red bg-ol-red-bg/60";

/** Primary button — image generation (blue). */
export const BOARD_GENERATE_BTN_IMAGE =
  "bg-ol-blue-bg text-ol-blue hover:bg-ol-blue-bg-hover";
/** Primary button — video generation (purple). */
export const BOARD_GENERATE_BTN_VIDEO =
  "bg-ol-purple-bg text-ol-purple hover:bg-ol-purple-bg-hover";
/** Primary button — image prompt (amber). */
export const BOARD_GENERATE_BTN_PROMPT =
  "bg-ol-amber-bg text-ol-amber hover:bg-ol-amber-bg-hover";

/** Status pill — image generation. */
export const BOARD_GENERATE_PILL_IMAGE =
  "bg-ol-blue-bg text-ol-blue";
/** Status pill — video generation. */
export const BOARD_GENERATE_PILL_VIDEO =
  "bg-ol-purple-bg text-ol-purple";
/** Status pill — image prompt. */
export const BOARD_GENERATE_PILL_PROMPT =
  "bg-ol-amber-bg text-ol-amber";

/** Semantic dot — image generation. */
export const BOARD_GENERATE_DOT_IMAGE = "bg-ol-blue";
/** Semantic dot — video generation. */
export const BOARD_GENERATE_DOT_VIDEO = "bg-ol-purple";
/** Semantic dot — image prompt. */
export const BOARD_GENERATE_DOT_PROMPT = "bg-ol-amber";

/** Flat input field for generation nodes. */
export const BOARD_GENERATE_INPUT =
  "border-transparent bg-ol-surface-input text-ol-text-primary placeholder:text-ol-text-auxiliary focus-visible:border-ol-focus-border focus-visible:ring-1 focus-visible:ring-ol-focus-ring";

/** Node base — chat node (neutral). */
export const BOARD_GENERATE_NODE_BASE_CHAT =
  "ol-glass-node bg-card/95 dark:bg-card/95";

/** Semantic border — chat node (neutral idle). */
export const BOARD_GENERATE_BORDER_CHAT = "border-border/50";

/** Selected state — chat node. */
export const BOARD_GENERATE_SELECTED_CHAT =
  "border-ol-green/60 ring-2 ring-ol-green/15";

/** Primary button — chat node (teal). */
export const BOARD_GENERATE_BTN_CHAT =
  "bg-ol-green-bg text-ol-green hover:bg-ol-green-bg-hover";

/** Status pill — chat node. */
export const BOARD_GENERATE_PILL_CHAT =
  "bg-ol-green-bg text-ol-green";

/** Semantic dot — chat node. */
export const BOARD_GENERATE_DOT_CHAT = "bg-ol-green";

/** Inset area for results / nested content. */
export const BOARD_GENERATE_INSET =
  "bg-ol-surface-inset border border-transparent";
