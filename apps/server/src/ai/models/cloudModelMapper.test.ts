/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport assert from "node:assert/strict";

import { mapCloudChatModels, normalizeCloudChatModels } from "./cloudModelMapper";

const rawItems = [
  {
    id: "gpt-4o",
    provider: "openai",
    displayName: "GPT-4o",
    tags: ["chat", "invalid_tag"],
    capabilities: {
      common: { maxContextK: 128 },
    },
  },
];

const mapped = mapCloudChatModels(rawItems);
assert.equal(mapped.length, 1);
assert.equal(mapped[0]?.id, "gpt-4o");
assert.equal(mapped[0]?.name, "GPT-4o");
assert.equal(mapped[0]?.providerId, "openai");
assert.equal(mapped[0]?.familyId, "OpenAI");
assert.deepEqual(mapped[0]?.tags, ["chat"]);
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
