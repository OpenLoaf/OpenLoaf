import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { buildModelRegistryPayload } from "../sync-model-registry.mjs";

test("builds model registry payload from provider directory", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "model-registry-"));
  const providerA = {
    id: "alpha",
    label: "Alpha",
    adapterId: "alpha",
    apiUrl: "https://alpha.example.com",
    models: [],
  };
  const providerB = {
    id: "beta",
    label: "Beta",
    adapterId: "beta",
    apiUrl: "https://beta.example.com",
    models: [],
  };
  await fs.writeFile(
    path.join(tempDir, "a.json"),
    `${JSON.stringify(providerA)}\n`,
  );
  await fs.writeFile(
    path.join(tempDir, "b.json"),
    `${JSON.stringify(providerB)}\n`,
  );

  const payload = await buildModelRegistryPayload(tempDir);
  assert.equal(payload.providers.length, 2);
  assert.deepEqual(
    payload.providers.map((provider) => provider.id).sort(),
    ["alpha", "beta"],
  );
  assert.equal(typeof payload.updatedAt, "string");
});

test("builds model registry payload from array json file", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "model-registry-"));
  const payloadPath = path.join(tempDir, "providers.json");
  const providers = [
    {
      id: "gamma",
      label: "Gamma",
      adapterId: "gamma",
      apiUrl: "https://gamma.example.com",
      models: [],
    },
  ];
  await fs.writeFile(payloadPath, `${JSON.stringify(providers)}\n`);

  const payload = await buildModelRegistryPayload(payloadPath);
  assert.equal(payload.providers.length, 1);
  assert.equal(payload.providers[0]?.id, "gamma");
});
