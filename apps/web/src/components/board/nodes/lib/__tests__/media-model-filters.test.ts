/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport test from "node:test";
import assert from "node:assert/strict";

import type { AiModel } from "@openloaf-saas/sdk";
import { filterImageMediaModels, filterVideoMediaModels } from "../image-generation";

test("image models allow multi-image without image_multi_input tag when capability allows", () => {
  const model: AiModel = {
    id: "img-multi",
    providerId: "qwen",
    tags: ["image_generation"],
    capabilities: {
      input: { maxImages: 4 },
      output: { supportsMulti: true },
    },
  };
  const filtered = filterImageMediaModels([model], {
    imageCount: 2,
    hasMask: false,
    outputCount: 1,
  });
  assert.equal(filtered.length, 1);
});

test("video models allow reference video without extra tag when capability allows", () => {
  const model: AiModel = {
    id: "vid-ref",
    providerId: "volcengine",
    tags: ["video_generation"],
    capabilities: {
      input: { supportsReferenceVideo: true },
      output: { supportsAudio: true },
    },
  };
  const filtered = filterVideoMediaModels([model], {
    imageCount: 1,
    hasReference: true,
    hasStartEnd: false,
    withAudio: false,
  });
  assert.equal(filtered.length, 1);
});

test("video models allow audio output without extra tag when capability allows", () => {
  const model: AiModel = {
    id: "vid-audio",
    providerId: "volcengine",
    tags: ["video_generation"],
    capabilities: {
      output: { supportsAudio: true },
    },
  };
  const filtered = filterVideoMediaModels([model], {
    imageCount: 1,
    hasReference: false,
    hasStartEnd: false,
    withAudio: true,
  });
  assert.equal(filtered.length, 1);
});
