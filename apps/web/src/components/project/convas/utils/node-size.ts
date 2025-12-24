"use client";

import type { Node as RFNode } from "reactflow";

export type HandleIds = {
  source: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  target: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
};

/**
 * Convert a potential dimension into a usable numeric size, returning null when invalid.
 * This accepts numbers or numeric strings and rejects non-finite values.
 */
export function parseNodeSizeValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Resolve node width/height for layout and alignment calculations from any available fields.
 * Reads measured size, explicit dimensions, or style values in a single consistent pass.
 */
export function resolveNodeSize(node: RFNode): { width: number; height: number } | null {
  const measured = (node as RFNode & { measured?: { width?: number; height?: number } }).measured;
  const width = node.width ?? measured?.width ?? parseNodeSizeValue(node.style?.width);
  const height = node.height ?? measured?.height ?? parseNodeSizeValue(node.style?.height);
  if (!width || !height) return null;
  return { width, height };
}
