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

import { mergeSnapshotData } from "./browserAutomationTools";

const baseSnapshot = {
  url: "https://root.local",
  title: "root",
  readyState: "complete",
  text: "root-text",
  elements: [{ selector: "#root", text: "Root", tag: "button" }],
  frames: [
    {
      src: "https://same.local/frame",
      name: "frame-1",
      title: "same-origin",
      width: 320,
      height: 240,
      status: "same-origin" as const,
      text: "frame-text",
      elements: [{ selector: "a", text: "Link", tag: "a" }],
    },
    {
      src: "https://cross.local/frame",
      name: "frame-2",
      title: "cross-origin",
      width: 320,
      height: 240,
      status: "cross-origin" as const,
    },
  ],
};

const merged = mergeSnapshotData(baseSnapshot, { maxTextLength: 80, maxElements: 10 });

assert.ok(merged.text.includes("root-text"));
assert.ok(merged.text.includes("frame-text"));
assert.ok(merged.text.indexOf("root-text") < merged.text.indexOf("frame-text"));
assert.equal(merged.elements.length, 2);
assert.equal(merged.frames?.length, 2);
assert.equal(merged.frames?.[1]?.status, "cross-origin");
assert.equal(merged.frames?.[1]?.text, undefined);

const limitedText = mergeSnapshotData(baseSnapshot, { maxTextLength: 9, maxElements: 10 });
assert.equal(limitedText.text, "root-text");

const limitedElements = mergeSnapshotData(baseSnapshot, { maxTextLength: 80, maxElements: 1 });
assert.equal(limitedElements.elements.length, 1);
assert.equal(limitedElements.elements[0]?.selector, "#root");

console.log("browser snapshot iframe merge tests passed.");
