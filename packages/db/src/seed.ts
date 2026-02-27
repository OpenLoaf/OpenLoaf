/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import "dotenv/config";

import path from "node:path";
import { pathToFileURL } from "node:url";

import { prisma } from "./index";

/** Run database seed operations. */
async function seed() {
  // MVP：不再写入任何默认数据，保持空库即可。
}

// 入口执行时直接运行 seed。
const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  seed()
    .then(() => {
      console.log("Seed complete.");
    })
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

export { seed };
