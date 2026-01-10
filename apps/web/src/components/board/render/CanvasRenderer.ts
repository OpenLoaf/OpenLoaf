import type {
  CanvasConnectorDraft,
  CanvasConnectorElement,
  CanvasConnectorStyle,
  CanvasPoint,
  CanvasRect,
  CanvasSnapshot,
} from "../engine/types";
import type { CanvasConnectorPath } from "../utils/connector-path";
import {
  buildConnectorPath,
  resolveConnectorEndpointsSmart,
} from "../utils/connector-path";
export class CanvasRenderer {
  /** Target canvas element. */
  private readonly canvas: HTMLCanvasElement;
  /** Rendering context for the canvas. */
  private readonly ctx: CanvasRenderingContext2D;
  /** Device pixel ratio for high-DPI rendering. */
  private dpr = 1;

  /** Create a new canvas renderer. */
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context is not available.");
    }
    this.ctx = ctx;
    this.dpr = window.devicePixelRatio || 1;
  }

  /** Render the current canvas snapshot. */
  render(snapshot: CanvasSnapshot, options?: { hideGrid?: boolean }): void {
    const [width, height] = snapshot.viewport.size;
    this.resize(width, height);
    const boundsMap = this.buildBoundsMap(snapshot);

    // 先清空画布，再绘制网格与基础元素。
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!options?.hideGrid) {
      this.drawGrid(snapshot);
    }
    this.drawCanvasElements(snapshot, boundsMap);
    this.drawConnectorHandles(snapshot, boundsMap);
    this.drawConnectorDraft(snapshot, boundsMap);
    this.drawAlignmentGuides(snapshot);
    this.drawSelectionBox(snapshot);
  }

  /** Resize the canvas to match viewport size. */
  resize(width: number, height: number): void {
    const nextWidth = Math.max(1, Math.floor(width * this.dpr));
    const nextHeight = Math.max(1, Math.floor(height * this.dpr));
    if (this.canvas.width !== nextWidth || this.canvas.height !== nextHeight) {
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
  }

  /** Draw the canvas background grid. */
  private drawGrid(snapshot: CanvasSnapshot): void {
    const { zoom, offset } = snapshot.viewport;
    const gridSize = 80;
    const step = gridSize * zoom * this.dpr;
    if (step <= 0) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    const startX = ((offset[0] * this.dpr) % step + step) % step;
    const startY = ((offset[1] * this.dpr) % step + step) % step;

    this.ctx.save();
    const root = document.documentElement;
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    const isDark = root.classList.contains("dark") || (!root.classList.contains("light") && prefersDark);
    // 逻辑：浅色模式提高网格对比度，深色模式保持细腻度。
    this.ctx.strokeStyle = isDark
      ? "rgba(148, 163, 184, 0.12)"
      : "rgba(148, 163, 184, 0.2)";
    this.ctx.lineWidth = 1.2;

    // 按视口偏移绘制网格，让画布移动时有连续的参考点。
    for (let x = startX; x <= width; x += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();
    }
    for (let y = startY; y <= height; y += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(width, y);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  /** Draw canvas elements (connectors) in zIndex order. */
  private drawCanvasElements(
    snapshot: CanvasSnapshot,
    boundsMap: Record<string, CanvasRect | undefined>
  ): void {
    const canvasElements = snapshot.elements.filter(
      (element): element is CanvasConnectorElement => element.kind === "connector"
    );
    if (canvasElements.length === 0) return;

    const ordered = canvasElements.slice().sort((a, b) => {
      const az = a.zIndex ?? 0;
      const bz = b.zIndex ?? 0;
      if (az === bz) return 0;
      return az - bz;
    });

    ordered.forEach(element => {
      this.drawConnectorElement(element, snapshot, boundsMap);
    });
  }

  /** Draw a single connector element. */
  private drawConnectorElement(
    connector: CanvasConnectorElement,
    snapshot: CanvasSnapshot,
    boundsMap: Record<string, CanvasRect | undefined>
  ): void {
    const resolved = resolveConnectorEndpointsSmart(
      connector.source,
      connector.target,
      snapshot.anchors,
      boundsMap
    );
    const { source, target } = resolved;
    if (!source || !target) return;
    const style = connector.style ?? snapshot.connectorStyle;
    const path = buildConnectorPath(style, source, target, {
      sourceAnchorId: resolved.sourceAnchorId,
      targetAnchorId: resolved.targetAnchorId,
    });
    const selected = snapshot.selectedIds.includes(connector.id);
    const hovered = snapshot.connectorHoverId === connector.id;
    this.strokeConnectorPath(path, snapshot, {
      style,
      selected,
      hovered,
    });
  }

  /** Draw the connector draft while linking. */
  private drawConnectorDraft(
    snapshot: CanvasSnapshot,
    boundsMap: Record<string, CanvasRect | undefined>
  ): void {
    const draft = snapshot.connectorDraft;
    if (!draft) return;
    const resolved = resolveConnectorEndpointsSmart(
      draft.source,
      draft.target,
      snapshot.anchors,
      boundsMap
    );
    const { source, target } = resolved;
    if (!source || !target) return;
    const style = draft.style ?? snapshot.connectorStyle;
    const path = buildConnectorPath(style, source, target, {
      sourceAnchorId: resolved.sourceAnchorId,
      targetAnchorId: resolved.targetAnchorId,
    });
    this.strokeConnectorPath(path, snapshot, {
      style,
      draft: true,
    });
  }

  /** Draw connector endpoint handles for selected connectors. */
  private drawConnectorHandles(
    snapshot: CanvasSnapshot,
    boundsMap: Record<string, CanvasRect | undefined>
  ): void {
    const connectors = snapshot.elements.filter(
      element => element.kind === "connector" && snapshot.selectedIds.includes(element.id)
    ) as CanvasConnectorElement[];
    if (connectors.length === 0) return;

    const palette = this.getConnectorPalette();
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 1.5 * this.dpr;
    ctx.fillStyle = palette.handleFill;
    ctx.strokeStyle = palette.handleStroke;

    connectors.forEach(connector => {
      const { source, target } = resolveConnectorEndpointsSmart(
        connector.source,
        connector.target,
        snapshot.anchors,
        boundsMap
      );
      if (!source || !target) return;
      const radius = (snapshot.draggingId === connector.id ? 5.5 : 4.5) * this.dpr;
      const sourceScreen = this.toScreen(source, snapshot);
      const targetScreen = this.toScreen(target, snapshot);
      this.drawHandleCircle(sourceScreen, radius);
      this.drawHandleCircle(targetScreen, radius);
    });

    ctx.restore();
  }

  /** Draw alignment guides for snapping feedback. */
  private drawAlignmentGuides(snapshot: CanvasSnapshot): void {
    const guides = snapshot.alignmentGuides;
    if (!guides || guides.length === 0) return;

    this.ctx.save();
    this.ctx.strokeStyle = "rgba(37, 99, 235, 0.7)";
    this.ctx.lineWidth = 1.5 * this.dpr;
    this.ctx.setLineDash([6 * this.dpr, 4 * this.dpr]);

    guides.forEach(guide => {
      if (guide.axis === "x") {
        const x = (guide.value * snapshot.viewport.zoom + snapshot.viewport.offset[0]) * this.dpr;
        const y1 = (guide.start * snapshot.viewport.zoom + snapshot.viewport.offset[1]) * this.dpr;
        const y2 = (guide.end * snapshot.viewport.zoom + snapshot.viewport.offset[1]) * this.dpr;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y1);
        this.ctx.lineTo(x, y2);
        this.ctx.stroke();
        return;
      }
      const y = (guide.value * snapshot.viewport.zoom + snapshot.viewport.offset[1]) * this.dpr;
      const x1 = (guide.start * snapshot.viewport.zoom + snapshot.viewport.offset[0]) * this.dpr;
      const x2 = (guide.end * snapshot.viewport.zoom + snapshot.viewport.offset[0]) * this.dpr;
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y);
      this.ctx.lineTo(x2, y);
      this.ctx.stroke();
    });

    this.ctx.setLineDash([]);
    this.ctx.restore();
  }

  /** Draw selection box for rectangle selection. */
  private drawSelectionBox(snapshot: CanvasSnapshot): void {
    const box = snapshot.selectionBox;
    if (!box) return;

    const { zoom, offset } = snapshot.viewport;
    const x = (box.x * zoom + offset[0]) * this.dpr;
    const y = (box.y * zoom + offset[1]) * this.dpr;
    const w = box.w * zoom * this.dpr;
    const h = box.h * zoom * this.dpr;

    this.ctx.save();
    this.ctx.fillStyle = "rgba(37, 99, 235, 0.08)";
    this.ctx.strokeStyle = "rgba(37, 99, 235, 0.6)";
    this.ctx.lineWidth = 1.5 * this.dpr;
    this.ctx.setLineDash([6 * this.dpr, 4 * this.dpr]);
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeRect(x, y, w, h);
    this.ctx.setLineDash([]);
    this.ctx.restore();
  }

  /** Draw anchor points for connectable nodes. */
  private drawAnchors(snapshot: CanvasSnapshot): void {
    const sourceAnchor = getDraftAnchor(snapshot.connectorDraft);
    const hoverAnchor = snapshot.connectorHover;
    if (!sourceAnchor && !hoverAnchor) return;
    const ctx = this.ctx;

    const palette = this.getConnectorPalette();
    ctx.save();
    ctx.lineWidth = 1 * this.dpr;

    [sourceAnchor, hoverAnchor].forEach(anchorKey => {
      if (!anchorKey) return;
      const resolved = resolveAnchorPoint(anchorKey, snapshot);
      if (!resolved) return;
      const screen = this.toScreen(resolved.point, snapshot);
      const isSource =
        sourceAnchor?.elementId === resolved.elementId &&
        sourceAnchor.anchorId === resolved.anchorId;
      const isHover =
        hoverAnchor?.elementId === resolved.elementId &&
        hoverAnchor.anchorId === resolved.anchorId;
      if (this.isImageAnchorOverlayActive(resolved.elementId, snapshot)) {
        // 逻辑：图片节点选中或悬停时由 DOM 层绘制锚点，避免重复显示。
        return;
      }
      const radius = (isSource || isHover ? 5.5 : 3.5) * this.dpr;
      const fill = isHover ? palette.anchorHover : palette.anchor;
      const stroke = palette.handleFill;
      const offset = resolveAnchorOffset(resolved.anchorId, radius);

      ctx.beginPath();
      ctx.arc(screen[0] + offset[0], screen[1] + offset[1], radius, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.fill();
      ctx.stroke();
    });

    ctx.restore();
  }

  /** Return true when the element uses DOM overlay anchors. */
  private isImageAnchorOverlayActive(elementId: string, snapshot: CanvasSnapshot): boolean {
    const element = snapshot.elements.find(item => item.id === elementId);
    if (!element || element.kind !== "node" || element.type !== "image") return false;
    if (snapshot.selectedIds.includes(elementId)) return true;
    return snapshot.connectorHover?.elementId === elementId;
  }

  /** Stroke a connector path with optional arrowhead. */
  private strokeConnectorPath(
    path: CanvasConnectorPath,
    snapshot: CanvasSnapshot,
    options: {
      style: CanvasConnectorStyle;
      selected?: boolean;
      draft?: boolean;
      hovered?: boolean;
    }
  ): void {
    const ctx = this.ctx;
    const isDraft = options.draft ?? false;
    const selected = options.selected ?? false;
    const hovered = options.hovered ?? false;
    const palette = this.getConnectorPalette();
    const strokeColor = selected ? palette.selected : palette.stroke;
    const draftColor = palette.draft;
    const baseWidth =
      (selected ? 2.6 : options.style === "hand" ? 2.2 : 2) * this.dpr;
    const lineWidth = hovered ? baseWidth * 1.35 : baseWidth;

    ctx.save();
    ctx.strokeStyle = isDraft ? draftColor : strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (isDraft) {
      ctx.setLineDash([6 * this.dpr, 6 * this.dpr]);
    } else if (options.style === "fly") {
      ctx.setLineDash([10 * this.dpr, 7 * this.dpr]);
    } else {
      ctx.setLineDash([]);
    }

    let endPoint: CanvasPoint | null = null;
    let direction: CanvasPoint | null = null;

    if (path.kind === "polyline") {
      const points = path.points.map(point => this.toScreen(point, snapshot));
      if (points.length < 2) {
        ctx.restore();
        return;
      }
      const start = points[0];
      const end = points[points.length - 1];
      const prev = points[points.length - 2];
      if (!start || !end || !prev) {
        ctx.restore();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(start[0], start[1]);
      for (let i = 1; i < points.length; i += 1) {
        const point = points[i];
        if (!point) continue;
        ctx.lineTo(point[0], point[1]);
      }
      ctx.stroke();
      endPoint = end;
      direction = [end[0] - prev[0], end[1] - prev[1]];
    } else {
      const [p0, p1, p2, p3] = path.points.map(point =>
        this.toScreen(point, snapshot)
      ) as [CanvasPoint, CanvasPoint, CanvasPoint, CanvasPoint];
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
      ctx.stroke();
      endPoint = p3;
      direction = [p3[0] - p2[0], p3[1] - p2[1]];
    }

    ctx.setLineDash([]);
    ctx.restore();

    if (!isDraft && endPoint && direction) {
      this.drawArrowHead(endPoint, direction, strokeColor);
    }
  }

  /** Draw an arrow head at the end of a connector. */
  private drawArrowHead(
    end: CanvasPoint,
    direction: CanvasPoint,
    color: string
  ): void {
    const length = Math.hypot(direction[0], direction[1]);
    if (length <= 0.001) return;

    const ux = direction[0] / length;
    const uy = direction[1] / length;
    const size = 9 * this.dpr;
    const angle = Math.PI / 7;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const lx = ux * cos - uy * sin;
    const ly = ux * sin + uy * cos;
    const rx = ux * cos + uy * sin;
    const ry = -ux * sin + uy * cos;

    this.ctx.save();
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(end[0], end[1]);
    this.ctx.lineTo(end[0] - lx * size, end[1] - ly * size);
    this.ctx.lineTo(end[0] - rx * size, end[1] - ry * size);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  /** Convert a world point to device pixel coordinates. */
  private toScreen(point: CanvasPoint, snapshot: CanvasSnapshot): CanvasPoint {
    const { zoom, offset } = snapshot.viewport;
    return [
      (point[0] * zoom + offset[0]) * this.dpr,
      (point[1] * zoom + offset[1]) * this.dpr,
    ];
  }



  /** Resolve connector colors from CSS variables for theme awareness. */
  private getConnectorPalette(): {
    stroke: string;
    selected: string;
    draft: string;
    anchor: string;
    anchorHover: string;
    handleFill: string;
    handleStroke: string;
  } {
    if (typeof window === "undefined") {
      return {
        stroke: "#475569",
        selected: "#0f172a",
        draft: "#64748b",
        anchor: "#2563eb",
        anchorHover: "#0f172a",
        handleFill: "#ffffff",
        handleStroke: "#0f172a",
      };
    }
    const styles = window.getComputedStyle(this.canvas);
    const read = (name: string) => styles.getPropertyValue(name).trim();
    const fallbackForeground = read("--foreground") || "#0f172a";
    const fallbackMuted = read("--muted-foreground") || "#475569";
    const fallbackPrimary = read("--primary") || fallbackForeground;
    const fallbackBackground = read("--background") || "#ffffff";
    const readVar = (name: string, fallback: string) => read(name) || fallback;
    return {
      stroke: readVar("--canvas-connector", fallbackMuted),
      selected: readVar("--canvas-connector-selected", fallbackForeground),
      draft: readVar("--canvas-connector-draft", fallbackMuted),
      anchor: readVar("--canvas-connector-anchor", fallbackPrimary),
      anchorHover: readVar("--canvas-connector-anchor-hover", fallbackForeground),
      handleFill: readVar("--canvas-connector-handle-fill", fallbackBackground),
      handleStroke: readVar("--canvas-connector-handle-stroke", fallbackForeground),
    };
  }


  /** Draw a circular handle at a screen point. */
  private drawHandleCircle(point: CanvasPoint, radius: number): void {
    this.ctx.beginPath();
    this.ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
  }

  private buildBoundsMap(
    snapshot: CanvasSnapshot
  ): Record<string, CanvasRect | undefined> {
    const boundsMap: Record<string, CanvasRect | undefined> = {};
    snapshot.elements.forEach(element => {
      if (element.kind !== "node") return;
      const [x, y, w, h] = element.xywh;
      boundsMap[element.id] = { x, y, w, h };
    });
    return boundsMap;
  }
}

/** Extract anchor information from a connector draft. */
type AnchorKey = { elementId: string; anchorId: string };

function getDraftAnchor(draft: CanvasConnectorDraft | null): AnchorKey | null {
  if (!draft) return null;
  if ("elementId" in draft.source && draft.source.anchorId) {
    return {
      elementId: draft.source.elementId,
      anchorId: draft.source.anchorId,
    };
  }
  return null;
}

function resolveAnchorPoint(
  key: AnchorKey,
  snapshot: CanvasSnapshot
): { elementId: string; anchorId: string; point: CanvasPoint } | null {
  const anchors = snapshot.anchors[key.elementId];
  if (!anchors) return null;
  const anchor = anchors.find(item => item.id === key.anchorId);
  if (!anchor) return null;
  return { elementId: key.elementId, anchorId: key.anchorId, point: anchor.point };
}

function resolveAnchorOffset(anchorId: string, offset: number): CanvasPoint {
  switch (anchorId) {
    case "top":
      return [0, -offset];
    case "right":
      return [offset, 0];
    case "bottom":
      return [0, offset];
    case "left":
      return [-offset, 0];
    default:
      return [0, 0];
  }
}
