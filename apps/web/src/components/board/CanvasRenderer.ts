import type {
  CanvasConnectorDraft,
  CanvasConnectorElement,
  CanvasConnectorStyle,
  CanvasPoint,
  CanvasSnapshot,
} from "./CanvasTypes";
import type { CanvasConnectorPath } from "./utils/connector-path";
import { buildConnectorPath, resolveConnectorEndpoint } from "./utils/connector-path";
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
  render(snapshot: CanvasSnapshot): void {
    const [width, height] = snapshot.viewport.size;
    this.resize(width, height);

    // 先清空画布，再绘制网格与基础元素。
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawGrid(snapshot);
    this.drawConnectors(snapshot);
    this.drawConnectorHandles(snapshot);
    this.drawConnectorDraft(snapshot);
    this.drawAlignmentGuides(snapshot);
    this.drawSelectionBox(snapshot);
    this.drawAnchors(snapshot);
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
    this.ctx.strokeStyle = "rgba(148, 163, 184, 0.2)";
    this.ctx.lineWidth = 1;

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

  /** Draw all connector elements. */
  private drawConnectors(snapshot: CanvasSnapshot): void {
    const connectors = snapshot.elements.filter(
      (element): element is CanvasConnectorElement => element.kind === "connector"
    );
    if (connectors.length === 0) return;

    connectors.forEach(connector => {
      const source = resolveConnectorEndpoint(connector.source, snapshot.anchors);
      const target = resolveConnectorEndpoint(connector.target, snapshot.anchors);
      if (!source || !target) return;
      const style = connector.style ?? snapshot.connectorStyle;
      const path = buildConnectorPath(style, source, target);
      const selected = snapshot.selectedIds.includes(connector.id);
      this.strokeConnectorPath(path, snapshot, {
        style,
        selected,
      });
    });
  }

  /** Draw the connector draft while linking. */
  private drawConnectorDraft(snapshot: CanvasSnapshot): void {
    const draft = snapshot.connectorDraft;
    if (!draft) return;
    const source = resolveConnectorEndpoint(draft.source, snapshot.anchors);
    const target = resolveConnectorEndpoint(draft.target, snapshot.anchors);
    if (!source || !target) return;
    const style = draft.style ?? snapshot.connectorStyle;
    const path = buildConnectorPath(style, source, target);
    this.strokeConnectorPath(path, snapshot, {
      style,
      draft: true,
    });
  }

  /** Draw connector endpoint handles for selected connectors. */
  private drawConnectorHandles(snapshot: CanvasSnapshot): void {
    const connectors = snapshot.elements.filter(
      element => element.kind === "connector" && snapshot.selectedIds.includes(element.id)
    ) as CanvasConnectorElement[];
    if (connectors.length === 0) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 1.5 * this.dpr;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#0f172a";

    connectors.forEach(connector => {
      const source = resolveConnectorEndpoint(connector.source, snapshot.anchors);
      const target = resolveConnectorEndpoint(connector.target, snapshot.anchors);
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
    const shouldShow =
      snapshot.activeToolId === "connector" ||
      snapshot.connectorDraft ||
      snapshot.connectorHover;
    if (!shouldShow) return;

    const sourceAnchor = getDraftAnchor(snapshot.connectorDraft);
    const hoverAnchor = snapshot.connectorHover;
    const ctx = this.ctx;

    ctx.save();
    ctx.lineWidth = 1 * this.dpr;

    Object.entries(snapshot.anchors).forEach(([elementId, anchors]) => {
      anchors.forEach(anchor => {
        const screen = this.toScreen(anchor.point, snapshot);
        const isSource =
          sourceAnchor?.elementId === elementId &&
          sourceAnchor.anchorId === anchor.id;
        const isHover =
          hoverAnchor?.elementId === elementId &&
          hoverAnchor.anchorId === anchor.id;
        const radius = (isSource || isHover ? 5.5 : 3.5) * this.dpr;
        const fill = isHover
          ? "#0f172a"
          : isSource
            ? "#1d4ed8"
            : "rgba(148, 163, 184, 0.75)";
        const stroke = isHover || isSource ? "#ffffff" : "rgba(15, 23, 42, 0.2)";

        ctx.beginPath();
        ctx.arc(screen[0], screen[1], radius, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.fill();
        ctx.stroke();
      });
    });

    ctx.restore();
  }

  /** Stroke a connector path with optional arrowhead. */
  private strokeConnectorPath(
    path: CanvasConnectorPath,
    snapshot: CanvasSnapshot,
    options: {
      style: CanvasConnectorStyle;
      selected?: boolean;
      draft?: boolean;
    }
  ): void {
    const ctx = this.ctx;
    const isDraft = options.draft ?? false;
    const selected = options.selected ?? false;
    const strokeColor = selected ? "#0f172a" : "rgba(30, 41, 59, 0.7)";
    const draftColor = "rgba(100, 116, 139, 0.8)";
    const lineWidth = (selected ? 2.6 : options.style === "hand" ? 2.2 : 2) * this.dpr;

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
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i][0], points[i][1]);
      }
      ctx.stroke();
      endPoint = points[points.length - 1];
      const prev = points[points.length - 2];
      direction = [endPoint[0] - prev[0], endPoint[1] - prev[1]];
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

  /** Draw a circular handle at a screen point. */
  private drawHandleCircle(point: CanvasPoint, radius: number): void {
    this.ctx.beginPath();
    this.ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
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
