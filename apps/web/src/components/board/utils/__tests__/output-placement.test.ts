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

import { resolveRightStackPlacement } from "../output-placement";

type Rect = [number, number, number, number];

const source: Rect = [0, 0, 200, 200];

{
  const placement = resolveRightStackPlacement(source, [], {
    sideGap: 120,
    stackGap: 32,
    outputHeights: [100],
  });
  assert.ok(placement);
  assert.equal(placement?.baseX, 320);
  assert.equal(placement?.startY, 50);
}

{
  const placement = resolveRightStackPlacement(source, [], {
    sideGap: 120,
    stackGap: 32,
    outputHeights: [100, 50],
  });
  assert.ok(placement);
  assert.equal(placement?.startY, 9);
}

{
  const existing: Rect[] = [
    [320, 10, 100, 100],
    [320, 150, 100, 50],
  ];
  const placement = resolveRightStackPlacement(source, existing, {
    sideGap: 120,
    stackGap: 32,
    outputHeights: [80],
  });
  assert.ok(placement);
  assert.equal(placement?.baseX, 320);
  assert.equal(placement?.startY, 232);
}

console.log("output placement tests passed.");
