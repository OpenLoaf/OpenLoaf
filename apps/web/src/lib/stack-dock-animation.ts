"use client";

import { useTabRuntime } from "@/hooks/use-tab-runtime";
import { emitSidebarOpenRequest, getLeftSidebarOpen } from "@/lib/sidebar-state";
import type { TabRuntime } from "@/hooks/tab-types";

/** Selector for the dock button anchor element. */
const STACK_DOCK_BUTTON_SELECTOR = "[data-stack-dock-button]";
/** Selector for the active stack panel element. */
const STACK_PANEL_SELECTOR = "[data-stack-panel]";
/** Default duration for the dock animation. */
const STACK_ANIMATION_DURATION_MS = 650;
/** Easing curve approximating the macOS minimize feel. */
const STACK_ANIMATION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const BOARD_VIEWER_COMPONENT = "board-viewer";

type StackAnimationDirection = "minimize" | "restore";

/** Track current animation instance for cancelation. */
let currentAnimation: Animation | null = null;
/** Cleanup callback for the active ghost layer. */
let currentCleanup: (() => void) | null = null;
let minimizeSignalSeed = 0;
const minimizeSignalByTabId = new Map<string, number>();

/** Resolve the active stack item for a tab. */
function getActiveStackItem(runtime?: TabRuntime) {
  const stack = runtime?.stack ?? [];
  const activeId = runtime?.activeStackItemId || stack.at(-1)?.id || "";
  return stack.find((item) => item.id === activeId) ?? stack.at(-1);
}

/** Return true when the board stack is in full mode. */
function isBoardStackFull(runtime?: TabRuntime) {
  const activeItem = getActiveStackItem(runtime);
  if (activeItem?.component !== BOARD_VIEWER_COMPONENT) return false;
  if (!runtime?.rightChatCollapsed) return false;
  const leftOpen = getLeftSidebarOpen();
  return leftOpen === false;
}

/** Return true when user prefers reduced motion. */
function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
}

/** Read UI animation level from document dataset. */
function getUiAnimationLevel() {
  if (typeof document === "undefined") return "high";
  const level = document.documentElement.dataset.uiAnimationLevel;
  return level === "low" || level === "medium" || level === "high" ? level : "high";
}

/** Get the dock button element used as the animation target. */
function getDockButton(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(STACK_DOCK_BUTTON_SELECTOR) as HTMLElement | null;
}

/** Find the active stack panel element for a tab. */
function getStackPanel(tabId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector(
    `${STACK_PANEL_SELECTOR}[data-stack-panel="${tabId}"]`,
  ) as HTMLElement | null;
}

/** Cancel any running animation and cleanup the ghost layer. */
function clearActiveAnimation() {
  if (currentAnimation) {
    try {
      currentAnimation.cancel();
    } catch {
      // ignore
    }
  }
  if (currentCleanup) {
    currentCleanup();
  }
  currentAnimation = null;
  currentCleanup = null;
}

/** Clone the panel into a fixed overlay so it can animate outside the dock. */
function clonePanel(panel: HTMLElement, rect: DOMRect) {
  // 克隆面板到 body，避免被左栏容器裁剪。
  const ghost = panel.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("data-stack-panel");
  ghost.setAttribute("data-stack-ghost", "true");
  ghost.style.position = "fixed";
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.margin = "0";
  ghost.style.transformOrigin = "top right";
  ghost.style.pointerEvents = "none";
  ghost.style.willChange = "transform, opacity, clip-path";
  if (typeof window !== "undefined") {
    const opacity = Number.parseFloat(window.getComputedStyle(panel).opacity);
    if (!Number.isNaN(opacity) && opacity <= 0) {
      ghost.style.opacity = "1";
    }
  }

  const layer = document.createElement("div");
  layer.style.position = "fixed";
  layer.style.left = "0";
  layer.style.top = "0";
  layer.style.width = "100%";
  layer.style.height = "100%";
  layer.style.pointerEvents = "none";
  layer.style.zIndex = "9999";
  layer.appendChild(ghost);
  document.body.appendChild(layer);

  return { ghost, layer };
}

/** Build keyframes for the dock animation. */
function buildKeyframes(
  dx: number,
  dy: number,
  scaleX: number,
  scaleY: number,
  direction: StackAnimationDirection,
) {
  const midScaleX = 1 - (1 - scaleX) * 0.6;
  const midScaleY = 1 - (1 - scaleY) * 0.6;
  const outFrames: Keyframe[] = [
    {
      transform: "translate(0px, 0px) scale(1, 1)",
      opacity: 1,
      clipPath: "inset(0% 0% 0% 0%)",
    },
    {
      transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(${midScaleX}, ${midScaleY})`,
      opacity: 0.7,
      clipPath: "inset(0% 12% 45% 35%)",
    },
    {
      transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`,
      opacity: 0,
      clipPath: "inset(0% 0% 90% 90%)",
    },
  ];

  return direction === "minimize" ? outFrames : [...outFrames].reverse();
}

/** Temporarily hide the real panel during the ghost animation. */
function hidePanel(panel: HTMLElement): () => void {
  const prevOpacity = panel.style.opacity;
  const prevPointerEvents = panel.style.pointerEvents;
  panel.style.opacity = "0";
  panel.style.pointerEvents = "none";
  return () => {
    panel.style.opacity = prevOpacity;
    panel.style.pointerEvents = prevPointerEvents;
  };
}

/** Animate the panel toward or away from the dock button. */
async function animateStackPanel(
  panel: HTMLElement,
  target: HTMLElement,
  direction: StackAnimationDirection,
  options?: { onClone?: () => void },
) {
  if (prefersReducedMotion()) return false;
  const panelRect = panel.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (!panelRect.width || !panelRect.height) return false;
  if (!targetRect.width || !targetRect.height) return false;

  clearActiveAnimation();

  const { ghost, layer } = clonePanel(panel, panelRect);
  options?.onClone?.();
  const originX = panelRect.right;
  const originY = panelRect.top;
  const targetX = targetRect.left + targetRect.width / 2;
  const targetY = targetRect.top + targetRect.height / 2;
  const dx = Math.round(targetX - originX);
  const dy = Math.round(targetY - originY);
  const scaleX = Math.max(targetRect.width / panelRect.width, 0.02);
  const scaleY = Math.max(targetRect.height / panelRect.height, 0.02);
  const keyframes = buildKeyframes(dx, dy, scaleX, scaleY, direction);

  let resolveDone: (() => void) | null = null;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const animation = ghost.animate(keyframes, {
    duration: STACK_ANIMATION_DURATION_MS,
    easing: STACK_ANIMATION_EASING,
    fill: "forwards",
  });

  currentAnimation = animation;
  currentCleanup = () => {
    layer.remove();
    resolveDone?.();
  };

  animation.finished
    .then(() => {
      layer.remove();
      resolveDone?.();
    })
    .catch(() => {
      layer.remove();
      resolveDone?.();
    })
    .finally(() => {
      if (currentAnimation === animation) {
        currentAnimation = null;
        currentCleanup = null;
      }
    });

  await done;
  return true;
}

/** Resolve the panel element with a short rAF retry. */
async function resolveStackPanel(tabId: string) {
  const immediate = getStackPanel(tabId);
  if (immediate) return immediate;
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  return getStackPanel(tabId);
}

/** Run the restore animation after stackHidden toggles back to false. */
export async function animateStackRestore(tabId: string) {
  if (!tabId) return;
  const panel = await resolveStackPanel(tabId);
  const target = getDockButton();
  if (!panel || !target) return;
  let restoreHidden: (() => void) | null = null;
  try {
    await animateStackPanel(panel, target, "restore", {
      onClone: () => {
        restoreHidden = hidePanel(panel);
      },
    });
  } finally {
    (restoreHidden as (() => void) | null)?.();
  }
}

/** Request a minimize animation and hide the stack afterward. */
export function requestStackMinimize(tabId: string) {
  if (!tabId) return;
  const state = useTabRuntime.getState();
  const runtime = state.runtimeByTabId[tabId];
  if (runtime?.stackHidden) return;
  // 逻辑：动画级别为低时直接隐藏，不执行最小化动画。
  if (getUiAnimationLevel() === "low") {
    state.setStackHidden(tabId, true);
    return;
  }
  const shouldRestoreFull = isBoardStackFull(runtime);
  const activeItem = getActiveStackItem(runtime);
  if (activeItem?.component === BOARD_VIEWER_COMPONENT) {
    // 逻辑：最小化前记录画布全屏状态，供恢复时读取。
    state.setStackItemParams(tabId, activeItem.id, { __boardFull: shouldRestoreFull });
  }
  if (shouldRestoreFull) {
    // 逻辑：最小化时退出全屏模式，恢复左右侧边栏。
    emitSidebarOpenRequest(true);
    state.setTabRightChatCollapsed(tabId, false);
  }
  minimizeSignalSeed += 1;
  minimizeSignalByTabId.set(tabId, minimizeSignalSeed);
  const panel = getStackPanel(tabId);
  const target = getDockButton();
  if (!panel || !target || prefersReducedMotion()) {
    state.setStackHidden(tabId, true);
    return;
  }
  let restoreHidden: (() => void) | null = null;
  let didHide = false;
  void animateStackPanel(panel, target, "minimize", {
    onClone: () => {
      restoreHidden = hidePanel(panel);
      didHide = true;
      // 触发隐藏状态，确保按钮及时出现并可提示。
      state.setStackHidden(tabId, true);
    },
  })
    .then((didRun) => {
      if (!didRun && !didHide) {
        state.setStackHidden(tabId, true);
      }
    })
    .finally(() => {
      if (restoreHidden) {
        const restore = restoreHidden as (() => void) | null;
        requestAnimationFrame(() => {
          restore?.();
        });
      }
    });
}

/** Read the latest minimize signal for a tab. */
export function getStackMinimizeSignal(tabId: string) {
  return minimizeSignalByTabId.get(tabId) ?? 0;
}
