/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryClient, trpc, trpcClient } from '@/utils/trpc'
import {
  listMarketSkills,
  getMarketSkillDetail,
  downloadMarketSkill,
  checkSkillUpdates,
  rateMarketSkill,
} from '@/lib/saas-skill-market'
import type {
  MarketSkillEntry,
  SkillMarketListRequest,
  SkillMarketListResponse,
  SkillMarketDetailResponse,
  SkillMarketCheckUpdatesResponse,
  SkillMarketRateResponse,
} from '@/lib/saas-skill-market'

// Re-export types for consumer convenience.
export type {
  MarketSkillEntry,
  SkillMarketListResponse,
  SkillMarketDetailResponse,
  SkillMarketCheckUpdatesResponse,
  SkillMarketRateResponse,
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const MARKET_KEYS = {
  all: ['skill-market'] as const,
  list: (params?: MarketSkillListParams) =>
    [...MARKET_KEYS.all, 'list', params ?? {}] as const,
  detail: (skillId: string | null) =>
    [...MARKET_KEYS.all, 'detail', skillId] as const,
  updates: ['skill-market', 'updates'] as const,
}

// ---------------------------------------------------------------------------
// useMarketSkills — paginated list with search / category / sort
// ---------------------------------------------------------------------------

export type MarketSkillListParams = {
  search?: string
  category?: string
  sort?: SkillMarketListRequest['sort']
  repoId?: string
  page?: number
  pageSize?: number
}

/** Fetch marketplace skill list with optional search, category, sort, and pagination. */
export function useMarketSkills(params?: MarketSkillListParams) {
  return useQuery({
    queryKey: MARKET_KEYS.list(params),
    queryFn: () =>
      listMarketSkills({
        search: params?.search || undefined,
        category: params?.category || undefined,
        sort: params?.sort || undefined,
        repoId: params?.repoId || undefined,
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 20,
      }),
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// useMarketSkillDetail — single skill detail
// ---------------------------------------------------------------------------

/** Fetch a single marketplace skill detail. Disabled when skillId is null. */
export function useMarketSkillDetail(skillId: string | null) {
  return useQuery({
    queryKey: MARKET_KEYS.detail(skillId),
    queryFn: () => getMarketSkillDetail(skillId!),
    enabled: Boolean(skillId),
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// useInstallMarketSkill — download ZIP → import via trpc
// ---------------------------------------------------------------------------

type InstallMarketSkillInput = {
  skillId: string
  scope: 'global' | 'project'
  projectId?: string
}

/**
 * Mutation: download a marketplace skill ZIP and import it via the
 * backend `settings.importSkillFromArchive` tRPC endpoint.
 */
export function useInstallMarketSkill() {
  return useMutation({
    mutationFn: async (input: InstallMarketSkillInput) => {
      // 1. Download ZIP from SaaS
      const { data, fileName } = await downloadMarketSkill(input.skillId)

      // 2. Convert ArrayBuffer → base64 in chunks to avoid OOM
      const bytes = new Uint8Array(data)
      const chunks: string[] = []
      const chunkSize = 8192
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize)
        chunks.push(String.fromCharCode(...chunk))
      }
      const contentBase64 = btoa(chunks.join(''))

      // 3. Import via backend tRPC mutation
      const result = await trpcClient.settings.importSkillFromArchive.mutate({
        contentBase64,
        fileName: fileName || `${input.skillId}.zip`,
        scope: input.scope,
        projectId: input.projectId,
      })

      return result
    },
    onSuccess: (_data, input) => {
      // Invalidate local skill lists so UI reflects the new install.
      invalidateSkillQueries(input.projectId)
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to install skill',
      )
    },
  })
}

// ---------------------------------------------------------------------------
// useRateMarketSkill — rate a marketplace skill
// ---------------------------------------------------------------------------

type RateMarketSkillInput = {
  skillId: string
  rating: number
  comment?: string
}

/** Mutation: rate a marketplace skill (1-5). */
export function useRateMarketSkill() {
  return useMutation({
    mutationFn: (input: RateMarketSkillInput) =>
      rateMarketSkill(input.skillId, input.rating, input.comment),
    onSuccess: (_data, input) => {
      // Refresh the detail cache for the rated skill.
      queryClient.invalidateQueries({
        queryKey: MARKET_KEYS.detail(input.skillId),
      })
      // Also refresh the list so updated ratings are visible.
      queryClient.invalidateQueries({ queryKey: MARKET_KEYS.all })
    },
  })
}

// ---------------------------------------------------------------------------
// useSkillUpdateCheck — batch check installed skills for updates
// ---------------------------------------------------------------------------

type InstalledSkillInfo = {
  name: string
  originalName: string
  path: string
  folderName: string
  scope: string
  version?: string
  marketplace?: {
    skillId: string
    repoId: string
    folderName: string
    version: string
    installedAt: string
  }
}

/**
 * Check for marketplace updates against locally installed skills.
 * Disabled when no installed skills are available.
 */
export function useSkillUpdateCheck(projectId?: string) {
  const queryOptions = projectId
    ? trpc.settings.getSkills.queryOptions({ projectId })
    : trpc.settings.getSkills.queryOptions()

  const skillsQuery = useQuery(queryOptions)
  const installed = (skillsQuery.data ?? []) as InstalledSkillInfo[]

  // Build the installed list payload for the SaaS API.
  // Only include skills that were installed from the marketplace.
  const installedPayload = installed
    .filter((s) => s.marketplace?.skillId)
    .map((s) => ({
      skillId: s.marketplace!.skillId,
      version: s.marketplace!.version,
    }))

  return useQuery({
    queryKey: MARKET_KEYS.updates,
    queryFn: () => checkSkillUpdates({ installed: installedPayload }),
    enabled: installedPayload.length > 0,
    staleTime: 5 * 60_000,
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Invalidate local skill list queries (both global and project-scoped). */
function invalidateSkillQueries(projectId?: string) {
  queryClient.invalidateQueries({
    queryKey: trpc.settings.getSkills.queryOptions().queryKey,
  })
  if (projectId) {
    queryClient.invalidateQueries({
      queryKey: trpc.settings.getSkills.queryOptions({ projectId }).queryKey,
    })
  }
}
