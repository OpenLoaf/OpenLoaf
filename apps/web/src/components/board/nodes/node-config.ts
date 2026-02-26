/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n/** 集中管理主要节点配置，避免分散在各模块。 */

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

/** Node type identifier for image generation. */
export const IMAGE_GENERATE_NODE_TYPE = "image_generate";
/** Node type identifier for video generation. */
export const VIDEO_GENERATE_NODE_TYPE = "video_generate";

/** Gap between generated image nodes. */
export const GENERATED_IMAGE_NODE_GAP = 32;
/** Extra horizontal gap for the first generated image node. */
export const GENERATED_IMAGE_NODE_FIRST_GAP = 120;
/** Advanced panel width in pixels (w-60 + ml-4). */
export const ADVANCED_PANEL_OFFSET_PX = 240 + 16;

/** Default output count for image generation nodes. */
export const IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT = 1;
/** Maximum number of input images supported by image generation nodes. */
export const IMAGE_GENERATE_MAX_INPUT_IMAGES = 9;
/** Maximum number of output images supported by image generation nodes. */
export const IMAGE_GENERATE_MAX_OUTPUT_IMAGES = 9;
/** Available aspect ratio options. */
const GENERATE_ASPECT_RATIO_OPTIONS = ["1:1", "16:9", "9:16", "4:3"] as const;
export const IMAGE_GENERATE_ASPECT_RATIO_OPTIONS = GENERATE_ASPECT_RATIO_OPTIONS;
export const VIDEO_GENERATE_ASPECT_RATIO_OPTIONS = GENERATE_ASPECT_RATIO_OPTIONS;
export const IMAGE_GENERATE_COUNT_OPTIONS = Array.from({ length: 5 }, (_, index) => index + 1);
const GENERATE_STYLE_SUGGESTIONS = [
  "写实",
  "动漫",
  "插画",
  "3D",
  "赛博朋克",
  "水彩",
  "油画",
  "电影感",
  "复古",
  "像素风",
  "低多边形",
  "极简",
  "扁平",
  "国风",
  "日系",
  "蒸汽朋克",
  "未来科技",
  "剪纸",
  "手绘",
  "素描",
  "超现实",
  "梦幻",
  "黑白",
  "高饱和",
] as const;
export const IMAGE_GENERATE_STYLE_SUGGESTIONS = GENERATE_STYLE_SUGGESTIONS;
export const VIDEO_GENERATE_STYLE_SUGGESTIONS = GENERATE_STYLE_SUGGESTIONS;

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
export const VIDEO_GENERATE_DURATION_OPTIONS = [5, 10] as const;
