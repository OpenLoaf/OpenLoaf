/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { trpc } from "@/utils/trpc"

/** CLI 工具 ID → 模型注册表 provider ID 映射。 */
const CLI_TOOL_PROVIDER_MAP: Record<string, string> = {
  codex: "codex-cli",
  claudeCode: "claude-code-cli",
}

/**
 * 返回已安装的 CLI 工具对应的 provider ID 集合。
 * 未加载完成时返回空 Set（保守过滤，避免闪烁）。
 */
export function useInstalledCliProviderIds(): Set<string> {
  const { data } = useQuery({
    ...trpc.settings.getCliToolsStatus.queryOptions(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })

  return useMemo(() => {
    const ids = new Set<string>()
    if (!data) return ids
    for (const status of data) {
      if (!status.installed) continue
      const providerId = CLI_TOOL_PROVIDER_MAP[status.id]
      if (providerId) ids.add(providerId)
    }
    return ids
  }, [data])
}
