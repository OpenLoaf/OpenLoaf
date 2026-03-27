/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { EntityVisitTrigger, EntityVisitType } from "@openloaf/api";
import { trpc } from "@/utils/trpc";

type RecordEntityVisitPayload = {
  /** Entity type. */
  entityType: EntityVisitType;
  /** Entity id. */
  entityId?: string | null;
  /** Owning project id when available. */
  projectId?: string | null;
  /** Visit trigger. */
  trigger: EntityVisitTrigger;
};

/** Record a unified entity visit without interrupting the current UI action. */
export function useRecordEntityVisit() {
  const queryClient = useQueryClient();
  const { mutate } = useMutation(
    trpc.visit.record.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.visit.listSidebarHistory.pathKey() });
      },
    }),
  );

  const recordEntityVisit = useCallback(
    (input: RecordEntityVisitPayload) => {
      const entityId = input.entityId?.trim();
      if (!entityId) return;
      const projectId = input.projectId?.trim();
      mutate({
        entityType: input.entityType,
        entityId,
        ...(projectId ? { projectId } : {}),
        trigger: input.trigger,
      });
    },
    [mutate],
  );

  return { recordEntityVisit };
}
