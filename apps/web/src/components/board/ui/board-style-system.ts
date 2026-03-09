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
  "bg-card/90 dark:bg-sidebar ring-1 ring-border/70 shadow-[0_10px_26px_rgba(15,23,42,0.18)] backdrop-blur-md cursor-default [&_*]:!cursor-default";

/** Icon button active state — subtle tinted background following design system. */
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
export const BOARD_TEXT_PRIMARY = "text-[#202124] dark:text-neutral-50";

/** Secondary text color. */
export const BOARD_TEXT_SECONDARY = "text-[#3c4043] dark:text-neutral-300";

/** Auxiliary text color. */
export const BOARD_TEXT_AUXILIARY = "text-[#5f6368] dark:text-neutral-400";

/** Divider class for board separators. */
export const BOARD_DIVIDER_CLASS = "bg-[#e3e8ef] dark:bg-neutral-700";

/** Border class for board panels. */
export const BOARD_BORDER_CLASS = "border-[#e3e8ef] dark:border-neutral-700";

/** Connector style button — idle state. */
export const BOARD_CONNECTOR_BTN_IDLE =
  "text-[#5f6368] dark:text-neutral-400";

/** Connector style button — active state. */
export const BOARD_CONNECTOR_BTN_ACTIVE =
  "bg-[#202124] text-white shadow-[0_0_0_1px_rgba(15,23,42,0.2)] dark:bg-neutral-100 dark:text-neutral-900";

/** Connector style button — hover state. */
export const BOARD_CONNECTOR_BTN_HOVER =
  "hover:bg-[hsl(var(--muted)/0.58)] hover:text-[#3c4043] dark:hover:bg-[hsl(var(--muted)/0.46)] dark:hover:text-neutral-100";

/** Connector color swatch border. */
export const BOARD_CONNECTOR_SWATCH_BORDER =
  "border-[#e3e8ef] dark:border-neutral-600";

/** Connector color swatch active ring. */
export const BOARD_CONNECTOR_SWATCH_ACTIVE_RING =
  "ring-2 ring-[#1a73e8] ring-offset-2 ring-offset-background dark:ring-sky-400";

/** Advanced settings card border. */
export const BOARD_SETTINGS_CARD_BORDER =
  "border-[#e3e8ef] dark:border-neutral-700/80";

/** Advanced settings label text. */
export const BOARD_SETTINGS_LABEL = "text-[#5f6368] dark:text-neutral-300";

/** Advanced settings tabs list background. */
export const BOARD_SETTINGS_TABS_BG =
  "bg-[#f1f3f4] dark:bg-neutral-800/80";

/** Advanced settings tabs trigger active state. */
export const BOARD_SETTINGS_TABS_ACTIVE =
  "data-[state=active]:bg-white data-[state=active]:text-[#1a73e8] dark:data-[state=active]:bg-neutral-900 dark:data-[state=active]:text-sky-300";

/** Advanced settings dropdown hover. */
export const BOARD_SETTINGS_DROPDOWN_HOVER =
  "hover:bg-[#f1f3f4] dark:hover:bg-neutral-800";

/** Advanced settings dropdown item active. */
export const BOARD_SETTINGS_DROPDOWN_ITEM_ACTIVE =
  "bg-[#d3e3fd] text-[#1a73e8] dark:bg-sky-800/60 dark:text-sky-50";

/* ── Toolbar Item Semantic Colors ── */

/** Toolbar item — blue (primary / info actions). */
export const BOARD_TOOLBAR_ITEM_BLUE =
  "text-[#1a73e8] hover:bg-[#e8f0fe] dark:text-sky-300 dark:hover:bg-sky-900/40";

/** Toolbar item — green (download / save actions). */
export const BOARD_TOOLBAR_ITEM_GREEN =
  "text-[#188038] hover:bg-[#e6f4ea] dark:text-emerald-300 dark:hover:bg-emerald-900/40";

/** Toolbar item — amber (toggle / warning actions). */
export const BOARD_TOOLBAR_ITEM_AMBER =
  "text-[#e37400] hover:bg-[#fef7e0] dark:text-amber-300 dark:hover:bg-amber-900/40";

/** Toolbar item — red (destructive actions). */
export const BOARD_TOOLBAR_ITEM_RED =
  "text-[#d93025] hover:bg-[#fce8e6] dark:text-rose-300 dark:hover:bg-rose-900/40";

/** Toolbar item — purple (style / color actions). */
export const BOARD_TOOLBAR_ITEM_PURPLE =
  "text-[#9334e6] hover:bg-[#f3e8fd] dark:text-violet-300 dark:hover:bg-violet-900/40";

/* ── Generation Node Style Constants ── */

/** Glass container base for generation nodes (neutral fallback). */
export const BOARD_GENERATE_NODE_BASE =
  "bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.10)] backdrop-blur-lg dark:bg-[hsl(var(--background)/0.92)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.4)]";

/** Semantic glass base — image generation (light blue tint). */
export const BOARD_GENERATE_NODE_BASE_IMAGE =
  "bg-[#f0f6ff]/95 shadow-[0_10px_24px_rgba(15,23,42,0.10)] backdrop-blur-lg dark:bg-[hsl(210_60%_8%/0.92)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.4)]";
/** Semantic glass base — image prompt (light amber tint). */
export const BOARD_GENERATE_NODE_BASE_PROMPT =
  "bg-[#fffbf0]/95 shadow-[0_10px_24px_rgba(15,23,42,0.10)] backdrop-blur-lg dark:bg-[hsl(35_50%_8%/0.92)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.4)]";
/** Semantic glass base — video generation (light purple tint). */
export const BOARD_GENERATE_NODE_BASE_VIDEO =
  "bg-[#f8f0ff]/95 shadow-[0_10px_24px_rgba(15,23,42,0.10)] backdrop-blur-lg dark:bg-[hsl(270_50%_8%/0.92)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.4)]";

/** Semantic border — image generation (blue). */
export const BOARD_GENERATE_BORDER_IMAGE = "border-[#d2e3fc] dark:border-sky-800/60";
/** Semantic border — video generation (purple). */
export const BOARD_GENERATE_BORDER_VIDEO = "border-[#e9d5fb] dark:border-violet-800/60";
/** Semantic border — image prompt (amber). */
export const BOARD_GENERATE_BORDER_PROMPT = "border-[#fcefc8] dark:border-amber-800/60";

/** Selected state — image generation. */
export const BOARD_GENERATE_SELECTED_IMAGE =
  "border-[#1a73e8] ring-1 ring-[#1a73e8]/20 dark:border-sky-400 dark:ring-sky-400/20";
/** Selected state — video generation. */
export const BOARD_GENERATE_SELECTED_VIDEO =
  "border-[#9334e6] ring-1 ring-[#9334e6]/20 dark:border-violet-400 dark:ring-violet-400/20";
/** Selected state — image prompt. */
export const BOARD_GENERATE_SELECTED_PROMPT =
  "border-[#f9ab00] ring-1 ring-[#f9ab00]/20 dark:border-amber-400 dark:ring-amber-400/20";

/** Error state for generation nodes. */
export const BOARD_GENERATE_ERROR =
  "border-[#d93025] bg-[#fce8e6]/60 dark:border-rose-400/70 dark:bg-rose-950/30";

/** Primary button — image generation (blue). */
export const BOARD_GENERATE_BTN_IMAGE =
  "bg-[#e8f0fe] text-[#1a73e8] hover:bg-[#d2e3fc] dark:bg-sky-900/50 dark:text-sky-200 dark:hover:bg-sky-900/70";
/** Primary button — video generation (purple). */
export const BOARD_GENERATE_BTN_VIDEO =
  "bg-[#f3e8fd] text-[#9334e6] hover:bg-[#e9d5fb] dark:bg-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-900/60";
/** Primary button — image prompt (amber). */
export const BOARD_GENERATE_BTN_PROMPT =
  "bg-[#fef7e0] text-[#e37400] hover:bg-[#fcefc8] dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60";

/** Status pill — image generation. */
export const BOARD_GENERATE_PILL_IMAGE =
  "bg-[#e8f0fe] text-[#1a73e8] dark:bg-sky-900/40 dark:text-sky-300";
/** Status pill — video generation. */
export const BOARD_GENERATE_PILL_VIDEO =
  "bg-[#f3e8fd] text-[#9334e6] dark:bg-violet-900/40 dark:text-violet-300";
/** Status pill — image prompt. */
export const BOARD_GENERATE_PILL_PROMPT =
  "bg-[#fef7e0] text-[#e37400] dark:bg-amber-900/40 dark:text-amber-300";

/** Semantic dot — image generation. */
export const BOARD_GENERATE_DOT_IMAGE = "bg-[#1a73e8] dark:bg-sky-400";
/** Semantic dot — video generation. */
export const BOARD_GENERATE_DOT_VIDEO = "bg-[#9334e6] dark:bg-violet-400";
/** Semantic dot — image prompt. */
export const BOARD_GENERATE_DOT_PROMPT = "bg-[#f9ab00] dark:bg-amber-400";

/** Flat input field for generation nodes. */
export const BOARD_GENERATE_INPUT =
  "border-transparent bg-[#edf2fa] text-[#202124] placeholder:text-[#5f6368] focus-visible:border-[#d2e3fc] focus-visible:ring-1 focus-visible:ring-[rgba(26,115,232,0.22)] dark:bg-[hsl(var(--muted)/0.38)] dark:text-neutral-100 dark:placeholder:text-neutral-400";

/** Node base — chat node (teal tinted). */
export const BOARD_GENERATE_NODE_BASE_CHAT =
  "bg-[#f0faf5]/95 shadow-[0_10px_24px_rgba(15,23,42,0.10)] backdrop-blur-lg dark:bg-[hsl(160_40%_8%/0.92)] dark:shadow-[0_10px_24px_rgba(0,0,0,0.4)]";

/** Semantic border — chat node (teal). */
export const BOARD_GENERATE_BORDER_CHAT = "border-[#b7e4cf] dark:border-teal-800/60";

/** Selected state — chat node. */
export const BOARD_GENERATE_SELECTED_CHAT =
  "border-[#188038] ring-1 ring-[#188038]/20 dark:border-emerald-400 dark:ring-emerald-400/20";

/** Primary button — chat node (teal). */
export const BOARD_GENERATE_BTN_CHAT =
  "bg-[#e6f4ea] text-[#188038] hover:bg-[#ceead6] dark:bg-emerald-900/50 dark:text-emerald-200 dark:hover:bg-emerald-900/70";

/** Status pill — chat node. */
export const BOARD_GENERATE_PILL_CHAT =
  "bg-[#e6f4ea] text-[#188038] dark:bg-emerald-900/40 dark:text-emerald-300";

/** Semantic dot — chat node. */
export const BOARD_GENERATE_DOT_CHAT = "bg-[#188038] dark:bg-emerald-400";

/** Inset area for results / nested content. */
export const BOARD_GENERATE_INSET =
  "bg-[#f6f8fc] dark:bg-[hsl(var(--muted)/0.26)] border border-transparent";
