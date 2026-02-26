/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nexport type ImageMeta = {
  /** Natural width of the image. */
  width: number;
  /** Natural height of the image. */
  height: number;
};

/** Calculate preview dialog size based on image metadata and viewport. */
export function getImageDialogSize(meta: ImageMeta) {
  const padding = 16;
  const headerHeight = 48;
  const maxWidth = Math.floor(window.innerWidth * 0.9);
  const maxHeight = Math.floor(window.innerHeight * 0.8);
  const maxContentWidth = Math.max(maxWidth - padding * 2, 1);
  const maxContentHeight = Math.max(maxHeight - padding * 2 - headerHeight, 1);
  const clampedWidth = Math.min(meta.width, maxContentWidth);
  let contentHeight = Math.round((meta.height * clampedWidth) / meta.width);
  let contentWidth = clampedWidth;
  if (contentHeight > maxContentHeight) {
    contentHeight = maxContentHeight;
    contentWidth = Math.round((meta.width * contentHeight) / meta.height);
  }
  return {
    width: contentWidth + padding * 2,
    height: contentHeight + padding * 2 + headerHeight,
  };
}
