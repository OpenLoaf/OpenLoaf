/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useEffect, useRef, useState } from "react";
import type { CanvasEngine } from "../engine/CanvasEngine";
import { resolveUpstreamData, type UpstreamData } from "../engine/upstream-data";

/** Debounce delay in milliseconds for upstream data resolution. */
const DEBOUNCE_MS = 200;

/**
 * Hook that resolves upstream data for a selected node.
 *
 * When `nodeId` is non-null, subscribes to engine changes and computes
 * the upstream text and image data by traversing incoming connectors.
 * Results are debounced by 200ms to avoid excessive recomputation
 * during rapid document changes.
 *
 * Returns `null` when `nodeId` is null (no selection or multi-select).
 */
export function useUpstreamData(
  engine: CanvasEngine,
  nodeId: string | null,
): UpstreamData | null {
  const [data, setData] = useState<UpstreamData | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // No node selected — clear result immediately.
    if (!nodeId) {
      setData(null);
      return;
    }

    // Compute upstream data for the given node, debounced.
    const compute = () => {
      const result = resolveUpstreamData(engine.doc, nodeId);
      setData(result);
    };

    // Run once immediately so the first render has data.
    compute();

    // Subscribe to engine changes and recompute with debounce.
    const unsubscribe = engine.subscribe(() => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        compute();
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [engine, nodeId]);

  return data;
}
