/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useQuery } from '@tanstack/react-query'
import { fetchCatalog, type CatalogItem } from '@/lib/saas-media'

/**
 * Fetch and cache remote catalog options for a SelectField.
 *
 * @param catalogId - The catalog identifier (e.g. "styles", "voices").
 *                    Pass `undefined` to skip fetching.
 * @returns items and loading state.
 */
export function useCatalog(catalogId: string | undefined) {
  const { data, isLoading } = useQuery<CatalogItem[]>({
    queryKey: ['catalog', catalogId],
    queryFn: () => fetchCatalog(catalogId!),
    enabled: !!catalogId,
    staleTime: 5 * 60 * 1000,
  })

  return {
    items: data ?? [],
    isLoading,
  }
}
