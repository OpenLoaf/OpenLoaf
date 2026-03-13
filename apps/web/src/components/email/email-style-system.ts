/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/** Main Gmail-like panel surface; outer border is provided by LeftDock frame. */
export const EMAIL_GLASS_PANEL_CLASS =
  "rounded-2xl bg-background shadow-none dark:bg-background/90";

/** Split layout panel surface aligned with calendar left/right module layering. */
export const EMAIL_SPLIT_PANEL_CLASS =
  "rounded-lg border border-border/55 bg-background/95 shadow-none dark:bg-background/88";

/** Secondary inset used for metadata blocks and grouped actions. */
export const EMAIL_GLASS_INSET_CLASS =
  "rounded-xl bg-ol-surface-inset border border-transparent";

/** Compact metadata chip style for counts and tags. */
export const EMAIL_META_CHIP_CLASS =
  "rounded-full bg-ol-surface-muted px-2 py-0.5 text-[11px] text-ol-text-auxiliary";

/** Flat input surface matching Gmail search and compose controls. */
export const EMAIL_FLAT_INPUT_CLASS =
  "border border-transparent bg-ol-surface-input text-ol-text-primary placeholder:text-ol-text-auxiliary focus-visible:border-ol-focus-border focus-visible:ring-ol-focus-ring";

/** Navigation block tint. */
export const EMAIL_TINT_NAV_CLASS =
  "!bg-muted/42 dark:!bg-muted/28";

/** List/detail neutral tint. */
export const EMAIL_TINT_LIST_CLASS = "bg-ol-surface-inset";

/** Detail header tint. */
export const EMAIL_TINT_DETAIL_CLASS = "bg-ol-surface-muted";

/** Common row tones. */
export const EMAIL_TONE_HOVER_CLASS =
  "hover:bg-ol-surface-muted";
export const EMAIL_TONE_ACTIVE_CLASS =
  "bg-ol-blue-bg-hover text-ol-text-primary font-semibold";

/** Scroll surface for message list area. */
export const EMAIL_LIST_SURFACE_CLASS =
  "bg-background/92 dark:bg-background/90";

/** Message row read/unread states for clear contrast. */
export const EMAIL_LIST_UNREAD_ROW_CLASS =
  "bg-background/98 text-ol-text-primary dark:bg-background/96";
export const EMAIL_LIST_READ_ROW_CLASS =
  "bg-background/88 text-ol-text-auxiliary dark:bg-background/86";

/** Divider tone used across list and sidebar separators. */
export const EMAIL_DIVIDER_CLASS = "border-ol-divider";

// ── 视图密度 ──

export type EmailDensity = 'compact' | 'default' | 'comfortable';

const DENSITY_STORAGE_KEY = 'openloaf-email-density';

export function getStoredDensity(): EmailDensity {
  if (typeof window === 'undefined') return 'default';
  const stored = localStorage.getItem(DENSITY_STORAGE_KEY);
  if (stored === 'compact' || stored === 'default' || stored === 'comfortable') return stored;
  return 'default';
}

export function setStoredDensity(density: EmailDensity): void {
  localStorage.setItem(DENSITY_STORAGE_KEY, density);
}

export const EMAIL_DENSITY_ROW_HEIGHT: Record<EmailDensity, string> = {
  compact: '!h-[38px] !min-h-[38px]',
  default: '!h-[50px] !min-h-[50px]',
  comfortable: '!h-[64px] !min-h-[64px]',
};

export const EMAIL_DENSITY_TEXT_SIZE: Record<EmailDensity, string> = {
  compact: 'text-[12px]',
  default: 'text-[13px]',
  comfortable: 'text-[14px]',
};
