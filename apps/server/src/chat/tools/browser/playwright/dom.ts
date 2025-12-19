/**
 * 将 take-snapshot 返回的 uid（backendDOMNodeId）解析成数字。
 */
export function parseBackendNodeId(uid: string): number {
  const raw = String(uid ?? "").trim();
  if (!raw) throw new Error("Missing uid");
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid uid: ${raw}`);
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) throw new Error(`Invalid uid: ${raw}`);
  return num;
}

/**
 * 计算元素的中心点坐标（用于鼠标点击/hover/拖拽）。
 */
export async function getNodeCenterPoint(cdp: any, backendNodeId: number) {
  await cdp.send("DOM.enable").catch(() => {});
  await cdp.send("DOM.scrollIntoViewIfNeeded", { backendNodeId }).catch(() => {});

  try {
    const res = await cdp.send("DOM.getContentQuads", { backendNodeId });
    const quad = (res as any)?.quads?.[0];
    if (Array.isArray(quad) && quad.length === 8) {
      const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
      const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
      return { x, y };
    }
  } catch {
    // fall through
  }

  const res = await cdp.send("DOM.getBoxModel", { backendNodeId });
  const quad = (res as any)?.model?.content;
  if (!Array.isArray(quad) || quad.length !== 8) {
    throw new Error("Cannot compute element center point.");
  }
  const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
  const y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
  return { x, y };
}

/**
 * 用 CDP Input.dispatchMouseEvent 在坐标点执行一次点击。
 */
export async function dispatchClickAtPoint(
  cdp: any,
  point: { x: number; y: number },
  clickCount: number,
) {
  const x = Math.max(0, point.x);
  const y = Math.max(0, point.y);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount,
  });
}

/**
 * 用 CDP Input.dispatchMouseEvent 将鼠标移动到坐标点（用于 hover/拖拽）。
 */
export async function dispatchMouseMoveAtPoint(cdp: any, point: { x: number; y: number }) {
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: Math.max(0, point.x),
    y: Math.max(0, point.y),
  });
}

