/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * Chat history branch key resolver test.
 *
 * 用法：
 *   pnpm --filter server run test:chat:branch-log
 */
import assert from "node:assert/strict"
import { resolveBranchKeyFromLeafPath } from "@/ai/services/chat/repositories/messageBranchResolver"

type MockRow = {
  id: string
  sessionId: string
  path: string
  parentMessageId: string | null
}

type FindManyArgs = {
  where?: {
    sessionId?: string
    path?: { in?: string[] }
    parentMessageId?: { in?: string[] }
  }
  orderBy?: Array<Record<string, "asc" | "desc">>
  select?: Record<string, boolean>
}

/** Build a minimal prisma reader for branch resolver tests. */
function createReader(rows: MockRow[]) {
  return {
    chatMessage: {
      async findMany(args: FindManyArgs = {}) {
        const where = args.where ?? {}
        let result = rows.slice()
        if (where.sessionId) {
          result = result.filter((row) => row.sessionId === where.sessionId)
        }
        const pathIn = where.path?.in
        if (Array.isArray(pathIn)) {
          const set = new Set(pathIn)
          result = result.filter((row) => set.has(row.path))
        }
        const parentIn = where.parentMessageId?.in
        if (Array.isArray(parentIn)) {
          const set = new Set(parentIn)
          result = result.filter((row) => row.parentMessageId && set.has(row.parentMessageId))
        }

        const orderBy = args.orderBy ?? []
        if (orderBy.length > 0) {
          for (const order of orderBy.slice().reverse()) {
            const [key, direction] = Object.entries(order)[0] ?? []
            if (!key || !direction) continue
            result.sort((left, right) => {
              const lv = String((left as any)[key] ?? "")
              const rv = String((right as any)[key] ?? "")
              const compare = lv.localeCompare(rv)
              return direction === "asc" ? compare : -compare
            })
          }
        }

        const select = args.select
        if (!select) return result
        return result.map((row) => {
          const picked: Record<string, unknown> = {}
          for (const [key, enabled] of Object.entries(select)) {
            if (!enabled) continue
            picked[key] = (row as any)[key]
          }
          return picked
        })
      },
    },
  }
}

/** Run all branch resolver tests. */
async function main() {
  const sessionId = "session_branch_test"
  const rootSplitRows: MockRow[] = [
    { id: "m01", sessionId, path: "01", parentMessageId: null },
    { id: "m0101", sessionId, path: "01/01", parentMessageId: "m01" },
    { id: "m010101", sessionId, path: "01/01/01", parentMessageId: "m0101" },
    { id: "m0102", sessionId, path: "01/02", parentMessageId: "m01" },
    { id: "m0103", sessionId, path: "01/03", parentMessageId: "m01" },
  ]
  const rootSplitReader = createReader(rootSplitRows)

  {
    const key = await resolveBranchKeyFromLeafPath(rootSplitReader as any, {
      sessionId,
      leafMessagePath: "01/01/01",
    })
    assert.equal(key, "01/01", "仅根分叉时，左支应归档到 01/01")
  }

  {
    const key = await resolveBranchKeyFromLeafPath(rootSplitReader as any, {
      sessionId,
      leafMessagePath: "01/02",
    })
    assert.equal(key, "01/02", "仅根分叉时，第二支应归档到 01/02")
  }

  const deepSplitRows: MockRow[] = [
    ...rootSplitRows,
    { id: "m01010101", sessionId, path: "01/01/01/01", parentMessageId: "m010101" },
    { id: "m01010102", sessionId, path: "01/01/01/02", parentMessageId: "m010101" },
    { id: "m0101010201", sessionId, path: "01/01/01/02/01", parentMessageId: "m01010102" },
  ]
  const deepSplitReader = createReader(deepSplitRows)

  {
    const key = await resolveBranchKeyFromLeafPath(deepSplitReader as any, {
      sessionId,
      leafMessagePath: "01/01/01/01",
    })
    assert.equal(key, "01/01/01/01", "深层分叉后应归档到最近分叉点子路径")
  }

  {
    const key = await resolveBranchKeyFromLeafPath(deepSplitReader as any, {
      sessionId,
      leafMessagePath: "01/01/01/02/01",
    })
    assert.equal(key, "01/01/01/02", "深层分叉后续节点应归档到深层分叉点")
  }

  {
    const key = await resolveBranchKeyFromLeafPath(deepSplitReader as any, {
      sessionId,
      leafMessagePath: "not_exists_path",
    })
    assert.equal(key, null, "未知路径应返回 null")
  }

  console.log("PASS chatHistoryBranchResolver")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
