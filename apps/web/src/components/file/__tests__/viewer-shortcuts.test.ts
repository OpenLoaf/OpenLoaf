import assert from "node:assert/strict";

import { isFindShortcutEvent, stopFindShortcutPropagation } from "../lib/viewer-shortcuts.ts";

type PartialKeyEvent = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  stopPropagation?: () => void;
};

const baseEvent: PartialKeyEvent = {
  key: "f",
  metaKey: true,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};

assert.equal(isFindShortcutEvent(baseEvent), true);
assert.equal(isFindShortcutEvent({ ...baseEvent, key: "F" }), true);
assert.equal(isFindShortcutEvent({ ...baseEvent, metaKey: false, ctrlKey: true }), true);
assert.equal(isFindShortcutEvent({ ...baseEvent, shiftKey: true }), false);
assert.equal(isFindShortcutEvent({ ...baseEvent, altKey: true }), false);
assert.equal(isFindShortcutEvent({ ...baseEvent, key: "g" }), false);

let stopped = false;
stopFindShortcutPropagation({
  ...baseEvent,
  stopPropagation: () => {
    stopped = true;
  },
});
assert.equal(stopped, true);

stopped = false;
stopFindShortcutPropagation({
  ...baseEvent,
  key: "g",
  stopPropagation: () => {
    stopped = true;
  },
});
assert.equal(stopped, false);

console.log("Viewer shortcut tests passed.");
