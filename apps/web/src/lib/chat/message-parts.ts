"use client";

type AnyPart = {
  type?: unknown;
  toolName?: unknown;
};

/** 判断一个 part 是否是 tool part（用于 UI 渲染工具卡片）。 */
export function isToolPart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const p = part as AnyPart;
  if (typeof p.toolName === "string" && p.toolName.trim()) return true;
  if (typeof p.type !== "string") return false;
  const type = p.type.trim();
  return type === "dynamic-tool" || type.startsWith("tool-");
}
