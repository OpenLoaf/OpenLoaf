/** Node type identifier for image generation. */
export const IMAGE_GENERATE_NODE_TYPE = "image_generate";
/** Gap between generated image nodes. */
export const GENERATED_IMAGE_NODE_GAP = 32;
/** Extra horizontal gap for the first generated image node. */
export const GENERATED_IMAGE_NODE_FIRST_GAP = 120;
/** Advanced panel width in pixels (w-60 + ml-4). */
export const ADVANCED_PANEL_OFFSET_PX = 240 + 16;
/** Available aspect ratio options. */
export const IMAGE_GENERATE_ASPECT_RATIO_OPTIONS = ["1:1", "16:9", "9:16", "4:3"] as const;
export const IMAGE_GENERATE_COUNT_OPTIONS = Array.from({ length: 5 }, (_, index) => index + 1);
export const IMAGE_GENERATE_STYLE_SUGGESTIONS = [
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
