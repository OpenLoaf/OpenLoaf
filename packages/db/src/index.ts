/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
// packages/db/src/index.ts

import { Prisma, PrismaClient } from "../prisma/generated/client";
export { Prisma };
export type { PrismaClient };
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { resolveOpenLoafDatabaseUrl } from "@openloaf/config";

const adapter = new PrismaLibSql({
  url: resolveOpenLoafDatabaseUrl(),
});

export const prisma = new PrismaClient({ adapter });

// 你要保留 default export 也可以
export default prisma;
