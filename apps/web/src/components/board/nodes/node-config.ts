/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import i18next from 'i18next'

/** 集中管理主要节点配置，避免分散在各模块。 */

/** ImageNode 预览最大边长。 */
export const IMAGE_PREVIEW_MAX_DIMENSION = 1024;
/** ImageNode 预览压缩质量。 */
export const IMAGE_PREVIEW_QUALITY = 0.82;
/** ImageNode 初始尺寸最大边长。 */
export const IMAGE_NODE_DEFAULT_MAX_SIZE = 300;
/** ImageNode 最小尺寸。 */
export const IMAGE_NODE_MIN_SIZE = { w: 120, h: 90 };
/** ImageNode 最大尺寸。 */
export const IMAGE_NODE_MAX_SIZE = { w: 960, h: 720 };

/** @deprecated Node type removed in canvas redesign. Kept for reference only. */
export const IMAGE_GENERATE_NODE_TYPE = "image_generate";
/** @deprecated Node type removed in canvas redesign. Kept for reference only. */
export const VIDEO_GENERATE_NODE_TYPE = "video_generate";

/** Gap between generated image nodes. */
export const GENERATED_IMAGE_NODE_GAP = 32;
/** Extra horizontal gap for the first generated image node. */
export const GENERATED_IMAGE_NODE_FIRST_GAP = 120;
/** Default output count for image generation nodes. */
export const IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT = 1;
/** Maximum number of input images supported by image generation nodes. */
export const IMAGE_GENERATE_MAX_INPUT_IMAGES = 9;
/** Maximum number of output images supported by image generation nodes. */
export const IMAGE_GENERATE_MAX_OUTPUT_IMAGES = 9;
/** Available aspect ratio options. */
const GENERATE_ASPECT_RATIO_OPTIONS = ["auto", "1:1", "16:9", "9:16", "4:3", "3:2"] as const;
export const IMAGE_GENERATE_ASPECT_RATIO_OPTIONS = GENERATE_ASPECT_RATIO_OPTIONS;
export const VIDEO_GENERATE_ASPECT_RATIO_OPTIONS = GENERATE_ASPECT_RATIO_OPTIONS;
export const IMAGE_GENERATE_COUNT_OPTIONS = Array.from({ length: 5 }, (_, index) => index + 1);
const STYLE_SUGGESTION_KEYS = [
  'realistic',
  'anime',
  'illustration',
  '3d',
  'cyberpunk',
  'watercolor',
  'oilPainting',
  'cinematic',
  'vintage',
  'pixelArt',
  'lowPoly',
  'minimal',
  'flat',
  'chinese',
  'japanese',
  'steampunk',
  'futuristic',
  'paperCut',
  'handDrawn',
  'sketch',
  'surreal',
  'dreamy',
  'blackAndWhite',
  'highSaturation',
] as const;

/** Get localized style suggestion labels. */
export function getStyleSuggestions(): string[] {
  return STYLE_SUGGESTION_KEYS.map(key => i18next.t(`board:styleSuggestions.${key}`));
}

export const IMAGE_GENERATE_STYLE_SUGGESTIONS = STYLE_SUGGESTION_KEYS;
export const VIDEO_GENERATE_STYLE_SUGGESTIONS = STYLE_SUGGESTION_KEYS;

/** Maximum number of input images supported by video generation by default. */
export const VIDEO_GENERATE_DEFAULT_MAX_INPUT_IMAGES = 1;
/** Gap between generated video nodes. */
export const VIDEO_GENERATE_NODE_GAP = 32;
/** Extra horizontal gap for the first generated video node. */
export const VIDEO_GENERATE_NODE_FIRST_GAP = 120;
/** Default width for generated video placeholders. */
export const VIDEO_GENERATE_OUTPUT_WIDTH = 320;
/** Default height for generated video placeholders. */
export const VIDEO_GENERATE_OUTPUT_HEIGHT = 180;
export const VIDEO_GENERATE_DURATION_OPTIONS = [5, 10, 15] as const;

/** Available resolution options for AI generation. */
export const GENERATE_RESOLUTION_OPTIONS = ["1K", "2K", "4K"] as const;
