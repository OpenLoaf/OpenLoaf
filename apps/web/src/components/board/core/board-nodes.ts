import { CalendarNodeDefinition } from "../nodes/CalendarNode";
import { GroupNodeDefinition, ImageGroupNodeDefinition } from "../nodes/GroupNode";
import { ImageGenerateNodeDefinition } from "../nodes/ImageGenerateNode";
import { VideoGenerateNodeDefinition } from "../nodes/VideoGenerateNode";
import { ImageNodeDefinition } from "../nodes/ImageNode";
import { ImagePromptGenerateNodeDefinition } from "../nodes/ImagePromptGenerateNode";
import { LinkNodeDefinition } from "../nodes/LinkNode";
import { StrokeNodeDefinition } from "../nodes/StrokeNode";
import { TextNodeDefinition } from "../nodes/TextNode";

/** Default node definitions registered for board canvases. */
export const BOARD_NODE_DEFINITIONS = [
  ImageNodeDefinition,
  CalendarNodeDefinition,
  LinkNodeDefinition,
  StrokeNodeDefinition,
  TextNodeDefinition,
  ImagePromptGenerateNodeDefinition,
  ImageGenerateNodeDefinition,
  VideoGenerateNodeDefinition,
  GroupNodeDefinition,
  ImageGroupNodeDefinition,
];
