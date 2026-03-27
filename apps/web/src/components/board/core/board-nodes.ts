/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { AudioNodeDefinition } from "../nodes/AudioNode";
import { CalendarNodeDefinition } from "../nodes/CalendarNode";
import { FileAttachmentNodeDefinition } from "../nodes/FileAttachmentNode";
import { createFallbackNodeDefinition, DEPRECATED_NODE_TYPES } from "../nodes/FallbackNode";
import { GroupNodeDefinition, ImageGroupNodeDefinition } from "../nodes/GroupNode";
import { ImageNodeDefinition } from "../nodes/ImageNode";
import { VideoNodeDefinition } from "../nodes/VideoNode";
import { LinkNodeDefinition } from "../nodes/LinkNode";
import { StrokeNodeDefinition } from "../nodes/StrokeNode";
import { TextNodeDefinition } from "../nodes/TextNode";
import { TableNodeDefinition } from "../nodes/TableNode";

/** Default node definitions registered for board canvases. */
export const BOARD_NODE_DEFINITIONS = [
  ImageNodeDefinition,
  VideoNodeDefinition,
  AudioNodeDefinition,
  FileAttachmentNodeDefinition,
  CalendarNodeDefinition,
  LinkNodeDefinition,
  StrokeNodeDefinition,
  TextNodeDefinition,
  TableNodeDefinition,
  GroupNodeDefinition,
  ImageGroupNodeDefinition,
  ...DEPRECATED_NODE_TYPES.map(createFallbackNodeDefinition),
];
