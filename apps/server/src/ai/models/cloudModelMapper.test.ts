import assert from "node:assert/strict";

import { mapCloudChatModels, normalizeCloudChatModels } from "./cloudModelMapper";

const rawItems = [
  {
    id: "gpt-4o",
    provider: "openai",
    displayName: "GPT-4o",
    tags: ["chat", "invalid_tag"],
  },
];

const mapped = mapCloudChatModels(rawItems);
assert.equal(mapped.length, 1);
assert.equal(mapped[0]?.id, "gpt-4o");
assert.equal(mapped[0]?.name, "GPT-4o");
assert.equal(mapped[0]?.providerId, "openai");
assert.equal(mapped[0]?.familyId, "gpt-4o");
assert.deepEqual(mapped[0]?.tags, ["chat"]);
assert.equal(mapped[0]?.maxContextK, 0);

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
