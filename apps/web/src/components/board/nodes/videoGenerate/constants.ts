/** Node type identifier for video generation. */
export const VIDEO_GENERATE_NODE_TYPE = "video_generate";
/** Maximum number of input images supported by video generation by default. */
export const VIDEO_GENERATE_DEFAULT_MAX_INPUT_IMAGES = 1;
/** Gap between generated video nodes. */
export const VIDEO_GENERATE_NODE_GAP = 32;
/** Extra horizontal gap for the first generated video node. */
export const VIDEO_GENERATE_NODE_FIRST_GAP = 120;
/** Advanced panel width in pixels (w-60 + ml-4). */
export const ADVANCED_PANEL_OFFSET_PX = 240 + 16;
/** Default width for generated video placeholders. */
export const VIDEO_GENERATE_OUTPUT_WIDTH = 320;
/** Default height for generated video placeholders. */
export const VIDEO_GENERATE_OUTPUT_HEIGHT = 180;
/** Available aspect ratio options. */
export const VIDEO_GENERATE_ASPECT_RATIO_OPTIONS = ["1:1", "16:9", "9:16", "4:3"] as const;
export const VIDEO_GENERATE_STYLE_SUGGESTIONS = [
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
export const VIDEO_GENERATE_DURATION_OPTIONS = [5, 10] as const;
