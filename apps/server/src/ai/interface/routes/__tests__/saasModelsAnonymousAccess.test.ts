import assert from "node:assert/strict";

import { Hono } from "hono";

import { registerSaasMediaRoutes } from "../saasMediaRoutes";
import { registerCloudModelRoutes } from "../../../models/cloudModelRoutes";

const app = new Hono();

registerSaasMediaRoutes(app, {
  fetchImageModelsProxy: async () => ({
    success: true,
    data: { data: [] },
  }),
  fetchVideoModelsProxy: async () => ({
    success: true,
    data: { data: [] },
  }),
});

registerCloudModelRoutes(app, {
  fetchModelList: async () => ({
    success: true,
    data: {
      data: [],
      updatedAt: "2026-02-05T00:00:00Z",
    },
  }),
});

const imageResponse = await app.request("/ai/image/models");
assert.equal(imageResponse.status, 200);
const imagePayload = await imageResponse.json();
assert.equal(imagePayload.success, true);

const videoResponse = await app.request("/ai/vedio/models");
assert.equal(videoResponse.status, 200);
const videoPayload = await videoResponse.json();
assert.equal(videoPayload.success, true);

const chatResponse = await app.request("/llm/models");
assert.equal(chatResponse.status, 200);
const chatPayload = await chatResponse.json();
assert.equal(chatPayload.success, true);
assert.deepEqual(chatPayload.data, []);

console.log("saas models anonymous access tests passed.");
