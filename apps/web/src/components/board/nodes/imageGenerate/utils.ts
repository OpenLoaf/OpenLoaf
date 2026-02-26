/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport {
  IMAGE_GENERATE_COUNT_OPTIONS,
} from "./constants";
import {
  IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT,
  IMAGE_GENERATE_MAX_OUTPUT_IMAGES,
} from "../lib/image-generation";

/** Normalize the stored value to a plain text string. */
export function normalizeTextValue(value?: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Normalize the output count within supported bounds. */
export function normalizeOutputCount(value: number | undefined) {
  if (!Number.isFinite(value)) return IMAGE_GENERATE_DEFAULT_OUTPUT_COUNT;
  const rounded = Math.round(value as number);
  // 逻辑：限制在允许范围内，避免无效请求数量。
  const maxCount = Math.min(IMAGE_GENERATE_MAX_OUTPUT_IMAGES, IMAGE_GENERATE_COUNT_OPTIONS.length);
  return Math.min(Math.max(rounded, 1), maxCount);
}
