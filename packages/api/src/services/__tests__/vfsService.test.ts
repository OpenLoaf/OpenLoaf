/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setOpenLoafRootOverride } from "@openloaf/config";

import { resolveScopedPath } from "../vfsService";
import { setResolvedTempStorageDir } from "../appConfigService";

const TEST_GLOBAL_ROOT = "/tmp/openloaf-vfs-global-root";
const TEST_TEMP_STORAGE = "/tmp/openloaf-vfs-temp-storage";

afterEach(() => {
  setOpenLoafRootOverride(null);
  setResolvedTempStorageDir(null);
});

describe("resolveScopedPath", () => {
  it("resolves global .openloaf paths under the OpenLoaf root without duplicating the prefix", () => {
    setOpenLoafRootOverride(TEST_GLOBAL_ROOT);

    expect(
      resolveScopedPath({
        target: ".openloaf/boards/board_alpha/index.tnboard",
      })
    ).toBe(path.resolve(TEST_GLOBAL_ROOT, "boards/board_alpha/index.tnboard"));
  });

  it("resolves global chat-history paths under the temp storage dir, not the config root", () => {
    setOpenLoafRootOverride(TEST_GLOBAL_ROOT);
    setResolvedTempStorageDir(TEST_TEMP_STORAGE);

    // chat-history 实际写在 temp storage dir 下（见 chatSessionPaths.ts），
    // 必须与 ~/.openloaf 配置目录分离。
    expect(
      resolveScopedPath({
        target: "chat-history/chat_alpha/messages.jsonl",
      })
    ).toBe(
      path.resolve(
        TEST_TEMP_STORAGE,
        "chat-history/chat_alpha/messages.jsonl"
      )
    );
  });
});
