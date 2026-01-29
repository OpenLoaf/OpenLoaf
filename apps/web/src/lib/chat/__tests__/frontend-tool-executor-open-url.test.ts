import assert from "node:assert/strict";

import { waitForWebContentsViewReady } from "../open-url-ack";

const viewKey = "view-1";

const eventTarget = new EventTarget();
(Object.assign(globalThis, { window: eventTarget }) as unknown);

async function run() {
  let resolved = false;
  const readyPromise = waitForWebContentsViewReady(viewKey).then((result) => {
    resolved = true;
    return result;
  });

  assert.equal(resolved, false);

  eventTarget.dispatchEvent(
    new CustomEvent("tenas:webcontents-view:status", {
      detail: { key: viewKey, webContentsId: 1, loading: true, ready: false, ts: Date.now() },
    }),
  );

  assert.equal(resolved, false);

  eventTarget.dispatchEvent(
    new CustomEvent("tenas:webcontents-view:status", {
      detail: { key: viewKey, webContentsId: 1, loading: false, ready: true, ts: Date.now() },
    }),
  );

  const result = await readyPromise;

  assert.equal(resolved, true);
  assert.ok(result);
  assert.equal(result?.status, "ready");
  assert.equal(result?.detail.key, viewKey);

  console.log("frontend-tool-executor open-url ready wait tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
