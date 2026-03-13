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
 * Design token constants — pre-composed Tailwind class strings for the
 * OpenLoaf semantic color system.  All colors are backed by CSS custom
 * properties defined in `index.css` (`:root` / `.dark`), so changing
 * `:root { --ol-blue: ... }` will propagate everywhere these tokens are used.
 */

/* ── Semantic Color Tokens ── */

export const OL_BLUE = {
  text: 'text-ol-blue',
  bg: 'bg-ol-blue-bg',
  bgHover: 'hover:bg-ol-blue-bg-hover',
  badge: 'bg-ol-blue-bg text-ol-blue',
  button: 'bg-ol-blue-bg text-ol-blue hover:bg-ol-blue-bg-hover',
  dot: 'bg-ol-blue',
  cssVar: 'var(--ol-blue)',
} as const

export const OL_GREEN = {
  text: 'text-ol-green',
  bg: 'bg-ol-green-bg',
  bgHover: 'hover:bg-ol-green-bg-hover',
  badge: 'bg-ol-green-bg text-ol-green',
  button: 'bg-ol-green-bg text-ol-green hover:bg-ol-green-bg-hover',
  dot: 'bg-ol-green',
  cssVar: 'var(--ol-green)',
} as const

export const OL_AMBER = {
  text: 'text-ol-amber',
  bg: 'bg-ol-amber-bg',
  bgHover: 'hover:bg-ol-amber-bg-hover',
  badge: 'bg-ol-amber-bg text-ol-amber',
  button: 'bg-ol-amber-bg text-ol-amber hover:bg-ol-amber-bg-hover',
  dot: 'bg-ol-amber',
  cssVar: 'var(--ol-amber)',
} as const

export const OL_RED = {
  text: 'text-ol-red',
  bg: 'bg-ol-red-bg',
  bgHover: 'hover:bg-ol-red-bg-hover',
  badge: 'bg-ol-red-bg text-ol-red',
  button: 'bg-ol-red-bg text-ol-red hover:bg-ol-red-bg-hover',
  dot: 'bg-ol-red',
  cssVar: 'var(--ol-red)',
} as const

export const OL_PURPLE = {
  text: 'text-ol-purple',
  bg: 'bg-ol-purple-bg',
  bgHover: 'hover:bg-ol-purple-bg-hover',
  badge: 'bg-ol-purple-bg text-ol-purple',
  button: 'bg-ol-purple-bg text-ol-purple hover:bg-ol-purple-bg-hover',
  dot: 'bg-ol-purple',
  cssVar: 'var(--ol-purple)',
} as const

export const OL_NEUTRAL = {
  textPrimary: 'text-ol-text-primary',
  textSecondary: 'text-ol-text-secondary',
  textAuxiliary: 'text-ol-text-auxiliary',
  surfaceMuted: 'bg-ol-surface-muted',
  surfaceInset: 'bg-ol-surface-inset',
  surfaceInput: 'bg-ol-surface-input',
  divider: 'border-ol-divider',
  dividerBg: 'bg-ol-divider',
} as const

export const OL_COLORS = {
  blue: OL_BLUE,
  green: OL_GREEN,
  amber: OL_AMBER,
  red: OL_RED,
  purple: OL_PURPLE,
  neutral: OL_NEUTRAL,
} as const

/* ── Focus Ring ── */

export const OL_FOCUS = {
  ring: 'focus-visible:ring-ol-focus-ring',
  border: 'focus-visible:border-ol-focus-border',
  input: 'focus-visible:border-ol-focus-border focus-visible:ring-1 focus-visible:ring-ol-focus-ring',
} as const

/* ── Radius Standards ── */

/** Radius standard — choose by component type */
export const OL_RADIUS = {
  /** Buttons, Badge, Tag, Chip */
  pill: 'rounded-full',
  /** Small controls: inputs, small cards, dropdown items */
  control: 'rounded-lg',
  /** Medium containers: cards, panels, dialog content */
  card: 'rounded-xl',
  /** Large containers: main panels, dialog shells, overlays */
  panel: 'rounded-2xl',
  /** No rounding */
  none: 'rounded-none',
} as const

/* ── Shadow Tokens ── */

export const OL_SHADOW = {
  glass: 'shadow-ol-glass',
  toolbar: 'shadow-ol-toolbar',
  float: 'shadow-ol-float',
} as const

/* ── Glass Effect Presets ── */

/** Glass effect presets — background + blur + shadow */
export const OL_GLASS = {
  /** Toolbar overlays (strong blur + medium shadow) */
  toolbar: 'bg-card/90 dark:bg-sidebar backdrop-blur-md shadow-ol-toolbar',
  /** Generation node containers (strong blur + light shadow) */
  node: 'bg-background/95 dark:bg-background/92 backdrop-blur-lg shadow-ol-glass',
  /** Floating panels (light blur + medium shadow) */
  float: 'bg-background/90 dark:bg-background/88 backdrop-blur-sm shadow-ol-float',
  /** Inset areas (no shadow, no blur) */
  inset: 'bg-ol-surface-inset border border-transparent',
} as const

/* ── Transition Standards ── */

/** Standard transitions */
export const OL_TRANSITION = {
  /** Color changes (button hover, state toggle) */
  colors: 'transition-colors duration-150',
  /** All properties (expand/collapse, scale) */
  all: 'transition-all duration-150',
  /** Opacity (fade in/out) */
  opacity: 'transition-opacity duration-150',
} as const
