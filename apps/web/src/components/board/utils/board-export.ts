/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { toBlob } from "html-to-image";

/** Selector list for elements excluded from board exports. */
export const BOARD_EXPORT_IGNORE_SELECTOR = [
  "[data-canvas-toolbar]",
  "[data-board-controls]",
  "[data-node-toolbar]",
  "[data-node-inspector]",
  "[data-connector-drop-panel]",
  "[data-connector-action]",
  "[data-multi-resize-handle]",
  "[data-board-minimap]",
  "[data-board-anchor-overlay]",
  "[data-board-selection-outline]",
].join(",");

/** Return true when the media element is cross-origin and may taint canvas. */
export function isCrossOriginMediaElement(element: Element): boolean {
  if (typeof window === "undefined") return false;
  if (!(element instanceof HTMLImageElement || element instanceof HTMLVideoElement)) {
    return false;
  }
  const rawSrc = element.currentSrc || element.src;
  if (!rawSrc) return false;
  if (rawSrc.startsWith("data:") || rawSrc.startsWith("blob:")) return false;
  try {
    const url = new URL(rawSrc, window.location.href);
    return url.origin !== window.location.origin;
  } catch {
    return true;
  }
}

/** Notify a board canvas to toggle export mode. */
export function setBoardExporting(target: HTMLElement, exporting: boolean) {
  const event = new CustomEvent("openloaf:board-export", { detail: { exporting } });
  target.dispatchEvent(event);
}

/** Wait for a number of animation frames. */
export function waitForAnimationFrames(count: number): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    let remaining = count;
    const step = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  });
}

/** Capture a board canvas as a PNG blob. */
export async function captureBoardImageBlob(target: HTMLElement): Promise<Blob | null> {
  return toBlob(target, {
    cacheBust: true,
    backgroundColor: undefined,
    // 逻辑：跳过远程字体注入，避免跨域样式导致导出报错。
    skipFonts: true,
    filter: (node) => {
      if (!(node instanceof Element)) return true;
      if (isCrossOriginMediaElement(node)) return false;
      return !node.closest(BOARD_EXPORT_IGNORE_SELECTOR);
    },
  });
}
