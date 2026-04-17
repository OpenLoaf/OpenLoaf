/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import assert from "node:assert/strict";

import { mapCloudChatModels, normalizeCloudChatModels } from "./cloudModelMapper";

// 上游 llm/client.ts 把 v3 inputSlots 派生为 media tags（image_input/
// video_analysis/audio_analysis）后再交给 mapCloudChatModels；此测试验证
// 过滤逻辑在真实数据流下仍然剔除未知 tag 并保留合法 tag。
const rawItems = [
  {
    id: "OL-TX-006",
    provider: "openai",
    displayName: "GPT-4o",
    tags: ["image_input", "video_analysis", "unknown_tag"],
    capabilities: {
      common: { maxContextK: 128 },
    },
  },
];

const mapped = mapCloudChatModels(rawItems);
assert.equal(mapped.length, 1);
assert.equal(mapped[0]?.id, "OL-TX-006");
assert.equal(mapped[0]?.name, "GPT-4o");
assert.equal(mapped[0]?.providerId, "openai");
assert.equal(mapped[0]?.familyId, "OpenAI");
assert.deepEqual(mapped[0]?.tags, ["image_input", "video_analysis"]);
assert.deepEqual(mapped[0]?.capabilities, { common: { maxContextK: 128 } });

const normalized = normalizeCloudChatModels({
  success: true,
  data: {
    data: rawItems,
    updatedAt: "2024-01-01T00:00:00Z",
  },
});
assert.equal(normalized.length, 1);

const empty = normalizeCloudChatModels({
  success: false,
  message: "failed",
});
assert.deepEqual(empty, []);

console.log("cloud model mapper tests passed.");
