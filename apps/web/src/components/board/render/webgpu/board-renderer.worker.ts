/* eslint-disable no-restricted-globals */
import type { GpuMessage, GpuPalette, GpuWorkerEvent } from "./gpu-protocol";
import type {
  CanvasAlignmentGuide,
  CanvasConnectorElement,
  CanvasNodeElement,
  CanvasPoint,
  CanvasRect,
  CanvasSnapshot,
} from "../../engine/types";
import { DEFAULT_NODE_SIZE } from "../../engine/constants";
import {
  buildConnectorPath,
  resolveConnectorEndpointsSmart,
} from "../../utils/connector-path";

const GRID_SIZE = 80;
const TEXT_ATLAS_SIZE = 1024;
const TEXT_FONT_FAMILY = "ui-sans-serif, system-ui, sans-serif";
const TEXT_MAX_LENGTH = 120;

type Vec4 = [number, number, number, number];

type LineVertex = {
  x: number;
  y: number;
  color: Vec4;
};

type RectInstance = {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  color: Vec4;
};

type TextQuad = {
  x: number;
  y: number;
  w: number;
  h: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  color: Vec4;
};

type ImageQuad = {
  x: number;
  y: number;
  w: number;
  h: number;
  texture: GPUTexture;
};

type ImageAsset = {
  texture: GPUTexture;
  width: number;
  height: number;
};

class TextAtlas {
  readonly canvas: OffscreenCanvas;
  readonly ctx: OffscreenCanvasRenderingContext2D;
  private cursorX = 0;
  private cursorY = 0;
  private rowH = 0;

  constructor(size: number) {
    this.canvas = new OffscreenCanvas(size, size);
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D context not available for text atlas.");
    this.ctx = ctx;
    this.ctx.textBaseline = "top";
    this.ctx.fillStyle = "white";
  }

  /** Reset atlas state for a new frame. */
  begin() {
    this.cursorX = 0;
    this.cursorY = 0;
    this.rowH = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Draw text into the atlas and return UV coordinates. */
  draw(text: string, fontSize: number) {
    const ctx = this.ctx;
    ctx.font = `${fontSize}px ${TEXT_FONT_FAMILY}`;
    const metrics = ctx.measureText(text);
    const width = Math.ceil(metrics.width);
    const height = Math.ceil(fontSize * 1.2);
    const padding = 2;
    const totalW = width + padding * 2;
    const totalH = height + padding * 2;

    if (this.cursorX + totalW > this.canvas.width) {
      this.cursorX = 0;
      this.cursorY += this.rowH;
      this.rowH = 0;
    }
    if (this.cursorY + totalH > this.canvas.height) {
      // 逻辑：图集满时重新开始绘制，保证最少内容可见。
      this.begin();
    }

    const x = this.cursorX + padding;
    const y = this.cursorY + padding;
    ctx.fillText(text, x, y);

    this.cursorX += totalW;
    this.rowH = Math.max(this.rowH, totalH);

    const u0 = x / this.canvas.width;
    const v0 = y / this.canvas.height;
    const u1 = (x + width) / this.canvas.width;
    const v1 = (y + height) / this.canvas.height;

    return { width, height, u0, v0, u1, v1 };
  }
}

let device: GPUDevice | null = null;
let context: GPUCanvasContext | null = null;
let format: GPUTextureFormat = "bgra8unorm";
let canvasSize: [number, number] = [1, 1];
let dpr = 1;
let viewUniformBuffer: GPUBuffer | null = null;
let viewBindGroup: GPUBindGroup | null = null;
let rectPipeline: GPURenderPipeline | null = null;
let linePipeline: GPURenderPipeline | null = null;
let texturePipeline: GPURenderPipeline | null = null;
let quadBuffer: GPUBuffer | null = null;
let textAtlas: TextAtlas | null = null;
let textTexture: GPUTexture | null = null;
let textSampler: GPUSampler | null = null;
let latestSnapshot: CanvasSnapshot | null = null;
let latestPalette: GpuPalette | null = null;
let latestHideGrid = false;
let latestRenderNodes = true;

const imageCache = new Map<string, ImageAsset>();
const imageLoading = new Map<string, Promise<void>>();

function toColor(color: Vec4): Vec4 {
  return [color[0] / 255, color[1] / 255, color[2] / 255, color[3]];
}

function parseHexColor(value: string | undefined, alpha: number): Vec4 {
  if (!value) return [1, 1, 1, alpha];
  const raw = value.replace("#", "").trim();
  if (raw.length === 3) {
    const r = parseInt(raw[0] + raw[0], 16) / 255;
    const g = parseInt(raw[1] + raw[1], 16) / 255;
    const b = parseInt(raw[2] + raw[2], 16) / 255;
    return [r, g, b, alpha];
  }
  if (raw.length !== 6) return [1, 1, 1, alpha];
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  return [r, g, b, alpha];
}

function initGpu(canvas: OffscreenCanvas, size: [number, number], nextDpr: number) {
  if (!navigator.gpu) {
    throw new Error("WebGPU is not available.");
  }
  dpr = nextDpr;
  canvasSize = size;
  const ctx = canvas.getContext("webgpu");
  if (!ctx) throw new Error("WebGPU context is not available.");
  context = ctx;
  format = navigator.gpu.getPreferredCanvasFormat();

  return navigator.gpu.requestAdapter().then((adapter) => {
    if (!adapter) throw new Error("Failed to acquire GPU adapter.");
    return adapter.requestDevice();
  }).then((gpuDevice) => {
    device = gpuDevice;
    configureContext();
    createResources();
    postWorkerEvent({ type: "ready" });
  });
}

function configureContext() {
  if (!context || !device) return;
  const [width, height] = canvasSize;
  context.configure({
    device,
    format,
    alphaMode: "premultiplied",
  });
  const canvas = context.canvas as OffscreenCanvas;
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
}

function createResources() {
  if (!device) return;
  const quadVertices = new Float32Array([
    0, 0,
    1, 0,
    0, 1,
    0, 1,
    1, 0,
    1, 1,
  ]);
  quadBuffer = device.createBuffer({
    size: quadVertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(quadBuffer, 0, quadVertices);

  viewUniformBuffer = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const viewBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: "uniform" },
      },
    ],
  });
  viewBindGroup = device.createBindGroup({
    layout: viewBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: viewUniformBuffer } }],
  });

  rectPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [viewBindGroupLayout] }),
    vertex: {
      module: device.createShaderModule({ code: RECT_SHADER }),
      entryPoint: "vs_main",
      buffers: [
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        },
        {
          arrayStride: 40,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 1, offset: 0, format: "float32x2" },
            { shaderLocation: 2, offset: 8, format: "float32x2" },
            { shaderLocation: 3, offset: 16, format: "float32" },
            { shaderLocation: 4, offset: 24, format: "float32x4" },
          ],
        },
      ],
    },
    fragment: {
      module: device.createShaderModule({ code: RECT_SHADER }),
      entryPoint: "fs_main",
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });

  linePipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [viewBindGroupLayout] }),
    vertex: {
      module: device.createShaderModule({ code: LINE_SHADER }),
      entryPoint: "vs_main",
      buffers: [
        {
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" },
            { shaderLocation: 1, offset: 8, format: "float32x4" },
          ],
        },
      ],
    },
    fragment: {
      module: device.createShaderModule({ code: LINE_SHADER }),
      entryPoint: "fs_main",
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "line-list" },
  });

  textAtlas = new TextAtlas(TEXT_ATLAS_SIZE);
  textTexture = device.createTexture({
    size: [TEXT_ATLAS_SIZE, TEXT_ATLAS_SIZE],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  textSampler = device.createSampler({
    magFilter: "linear",
    minFilter: "linear",
  });

  const textureBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
    ],
  });

  texturePipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [viewBindGroupLayout, textureBindGroupLayout],
    }),
    vertex: {
      module: device.createShaderModule({ code: TEXTURE_SHADER }),
      entryPoint: "vs_main",
      buffers: [
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        },
        {
          arrayStride: 48,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 1, offset: 0, format: "float32x2" },
            { shaderLocation: 2, offset: 8, format: "float32x2" },
            { shaderLocation: 3, offset: 16, format: "float32x2" },
            { shaderLocation: 4, offset: 24, format: "float32x2" },
            { shaderLocation: 5, offset: 32, format: "float32x4" },
          ],
        },
      ],
    },
    fragment: {
      module: device.createShaderModule({ code: TEXTURE_SHADER }),
      entryPoint: "fs_main",
      targets: [
        {
          format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        },
      ],
    },
    primitive: { topology: "triangle-list" },
  });
}

function updateViewUniform(viewport: CanvasSnapshot["viewport"]) {
  if (!device || !viewUniformBuffer) return;
  const data = new Float32Array([
    canvasSize[0] * dpr,
    canvasSize[1] * dpr,
    viewport.zoom,
    dpr,
    viewport.offset[0],
    viewport.offset[1],
    0,
    0,
  ]);
  device.queue.writeBuffer(viewUniformBuffer, 0, data);
}

function postWorkerEvent(event: GpuWorkerEvent) {
  (self as DedicatedWorkerGlobalScope).postMessage(event);
}

function ensureImageTexture(src: string) {
  if (!device) return;
  if (imageCache.has(src) || imageLoading.has(src)) return;
  const promise = fetch(src)
    .then((res) => res.blob())
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => {
      if (!device) return;
      const texture = device.createTexture({
        size: [bitmap.width, bitmap.height],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture },
        { width: bitmap.width, height: bitmap.height }
      );
      imageCache.set(src, { texture, width: bitmap.width, height: bitmap.height });
    })
    .catch(() => {})
    .finally(() => {
      imageLoading.delete(src);
      if (latestSnapshot) {
        // 逻辑：图片加载完成后补一帧刷新。
        render(latestSnapshot, latestPalette, latestHideGrid, latestRenderNodes);
      }
    });
  imageLoading.set(src, promise);
}

function getNodeBoundsMap(elements: CanvasSnapshot["elements"]) {
  const bounds: Record<string, CanvasRect | undefined> = {};
  elements.forEach((element) => {
    if (element.kind !== "node") return;
    const [x, y, w, h] = element.xywh;
    bounds[element.id] = { x, y, w, h };
  });
  return bounds;
}

function appendLine(lines: LineVertex[], a: CanvasPoint, b: CanvasPoint, color: Vec4) {
  lines.push({ x: a[0], y: a[1], color });
  lines.push({ x: b[0], y: b[1], color });
}

function buildGridLines(viewport: CanvasSnapshot["viewport"], color: Vec4) {
  const lines: LineVertex[] = [];
  const zoom = viewport.zoom;
  const [width, height] = viewport.size;
  const left = -viewport.offset[0] / zoom;
  const top = -viewport.offset[1] / zoom;
  const right = (width - viewport.offset[0]) / zoom;
  const bottom = (height - viewport.offset[1]) / zoom;
  const startX = Math.floor(left / GRID_SIZE) * GRID_SIZE;
  const startY = Math.floor(top / GRID_SIZE) * GRID_SIZE;

  for (let x = startX; x <= right; x += GRID_SIZE) {
    appendLine(lines, [x, top], [x, bottom], color);
  }
  for (let y = startY; y <= bottom; y += GRID_SIZE) {
    appendLine(lines, [left, y], [right, y], color);
  }
  return lines;
}

function sampleBezier(points: CanvasPoint[], segments = 24) {
  if (points.length !== 4) return points;
  const [p0, p1, p2, p3] = points as [CanvasPoint, CanvasPoint, CanvasPoint, CanvasPoint];
  const out: CanvasPoint[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const t2 = t * t;
    const x =
      p0[0] * mt2 * mt +
      3 * p1[0] * mt2 * t +
      3 * p2[0] * mt * t2 +
      p3[0] * t2 * t;
    const y =
      p0[1] * mt2 * mt +
      3 * p1[1] * mt2 * t +
      3 * p2[1] * mt * t2 +
      p3[1] * t2 * t;
    out.push([x, y]);
  }
  return out;
}

function appendConnectorLines(
  connector: CanvasConnectorElement,
  snapshot: CanvasSnapshot,
  boundsMap: Record<string, CanvasRect | undefined>,
  lines: LineVertex[],
  palette: GpuPalette
) {
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
  const isSelected = snapshot.selectedIds.includes(connector.id);
  const color = toColor(isSelected ? palette.connectorSelected : palette.connector);
  const points = path.kind === "bezier" ? sampleBezier(path.points as CanvasPoint[]) : path.points;
  for (let i = 0; i < points.length - 1; i += 1) {
    appendLine(lines, points[i]!, points[i + 1]!, color);
  }

  if (points.length >= 2) {
    const end = points[points.length - 1]!;
    const prev = points[points.length - 2]!;
    const dx = end[0] - prev[0];
    const dy = end[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const size = 10;
    const angle = Math.PI / 7;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const lx = ux * cos - uy * sin;
    const ly = ux * sin + uy * cos;
    const rx = ux * cos + uy * sin;
    const ry = -ux * sin + uy * cos;
    appendLine(lines, end, [end[0] - lx * size, end[1] - ly * size], color);
    appendLine(lines, end, [end[0] - rx * size, end[1] - ry * size], color);
  }
}

function wrapText(text: string, maxWidth: number, ctx: OffscreenCanvasRenderingContext2D, maxLines: number) {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  const pushLine = (line: string) => {
    if (line.trim().length === 0) return;
    lines.push(line);
  };

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      pushLine("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth) {
        current = next;
        continue;
      }
      if (!current) {
        // 逻辑：超长单词按字符拆分，保证可见。
        let chunk = "";
        for (const ch of word) {
          const test = chunk + ch;
          if (ctx.measureText(test).width > maxWidth && chunk) {
            pushLine(chunk);
            chunk = ch;
            if (lines.length >= maxLines) return lines;
          } else {
            chunk = test;
          }
        }
        current = chunk;
      } else {
        pushLine(current);
        if (lines.length >= maxLines) return lines;
        current = word;
      }
      if (lines.length >= maxLines) return lines;
    }
    if (current) {
      pushLine(current);
      if (lines.length >= maxLines) return lines;
    }
  }
  return lines;
}

function normalizeTextValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  const extractLegacyText = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    if ("text" in node && typeof (node as any).text === "string") {
      return String((node as any).text);
    }
    if ("children" in node && Array.isArray((node as any).children)) {
      return (node as any).children.map(extractLegacyText).join("");
    }
    return "";
  };
  return (value as unknown[]).map(extractLegacyText).join("\n");
}

function resolveNodeTitle(element: CanvasNodeElement) {
  switch (element.type) {
    case "text":
      return "";
    case "image":
      return (element.props as any).fileName || "Image";
    case "link":
      {
        const title = (element.props as any).title as string | undefined;
        if (title) return title;
        const url = (element.props as any).url as string | undefined;
        if (!url) return "Link";
        try {
          return new URL(url).hostname.replace(/^www\./, "");
        } catch {
          return url;
        }
      }
    case "image_generate":
      return "生成图片";
    case "image_prompt_generate":
      return "图片提示";
    case "calendar":
      return "日历";
    case "group":
    case "image-group":
      return "分组";
    default:
      return element.type;
  }
}

function resolveNodeSubtitle(element: CanvasNodeElement) {
  if (element.type === "link") {
    return (element.props as any).url || "";
  }
  if (element.type === "image_generate") {
    const errorText = (element.props as any).errorText;
    if (errorText) return `错误: ${errorText}`;
    const results = (element.props as any).resultImages as string[] | undefined;
    if (results && results.length > 0) return `已生成 ${results.length} 张`;
    const prompt = (element.props as any).promptText as string | undefined;
    return prompt || "";
  }
  if (element.type === "image_prompt_generate") {
    const errorText = (element.props as any).errorText;
    if (errorText) return `错误: ${errorText}`;
    const resultText = (element.props as any).resultText as string | undefined;
    if (resultText) return resultText;
    const prompt = (element.props as any).promptText as string | undefined;
    return prompt || "";
  }
  return "";
}

function trimText(value: string) {
  if (value.length <= TEXT_MAX_LENGTH) return value;
  return `${value.slice(0, TEXT_MAX_LENGTH - 3)}...`;
}

function render(
  snapshot: CanvasSnapshot,
  palette: GpuPalette | null,
  hideGrid: boolean,
  renderNodes: boolean
) {
  if (!device || !context || !rectPipeline || !linePipeline || !texturePipeline || !viewBindGroup || !quadBuffer) {
    return;
  }
  if (!palette || !textAtlas || !textTexture || !textSampler) return;

  updateViewUniform(snapshot.viewport);

  const rects: RectInstance[] = [];
  const lines: LineVertex[] = [];
  const textQuads: TextQuad[] = [];
  const imageQuads: ImageQuad[] = [];
  const boundsMap = getNodeBoundsMap(snapshot.elements);

  textAtlas.begin();

  if (!hideGrid) {
    const gridLines = buildGridLines(snapshot.viewport, toColor(palette.grid));
    lines.push(...gridLines);
  }

  const connectorElements = snapshot.elements.filter(
    (element): element is CanvasConnectorElement => element.kind === "connector"
  );
  connectorElements.forEach((connector) => {
    appendConnectorLines(connector, snapshot, boundsMap, lines, palette);
  });
  if (snapshot.connectorDraft) {
    const draft = snapshot.connectorDraft;
    const resolved = resolveConnectorEndpointsSmart(
      draft.source,
      draft.target,
      snapshot.anchors,
      boundsMap
    );
    const { source, target } = resolved;
    if (source && target) {
      const style = draft.style ?? snapshot.connectorStyle;
      const path = buildConnectorPath(style, source, target, {
        sourceAnchorId: resolved.sourceAnchorId,
        targetAnchorId: resolved.targetAnchorId,
      });
      const color = toColor(palette.connectorDraft);
      const points = path.kind === "bezier" ? sampleBezier(path.points as CanvasPoint[]) : path.points;
      for (let i = 0; i < points.length - 1; i += 1) {
        appendLine(lines, points[i]!, points[i + 1]!, color);
      }
    }
  }

  if (renderNodes) {
    const selectedIds = new Set(snapshot.selectedIds);
    snapshot.elements.forEach((element) => {
      if (element.kind !== "node") return;
      if (element.id === snapshot.editingNodeId) return;
      const [x, y, w, h] = element.xywh;
      const isSelected = selectedIds.has(element.id);
      const opacity = element.opacity ?? 1;
      if (element.type === "stroke") {
        const points = (element.props as any).points as Array<[number, number]> | undefined;
        const colorHex = (element.props as any).color as string | undefined;
        const alpha = (element.props as any).opacity ?? 1;
        if (points && points.length > 1) {
          const color = parseHexColor(colorHex, alpha);
          for (let i = 0; i < points.length - 1; i += 1) {
            const a = points[i]!;
            const b = points[i + 1]!;
            appendLine(lines, [x + a[0], y + a[1]], [x + b[0], y + b[1]], color);
          }
        }
        return;
      }
      const baseColor = toColor(palette.nodeFill);
      const isGroup = element.type === "group" || element.type === "image-group";
      const fillAlpha = isGroup ? baseColor[3] * 0.08 : baseColor[3] * opacity;
      const fillColor: Vec4 = [baseColor[0], baseColor[1], baseColor[2], fillAlpha];
      rects.push({ x, y, w, h, rotation: (element.rotate ?? 0) * (Math.PI / 180), color: fillColor });

      if (isSelected || isGroup) {
        const stroke = toColor(isSelected ? palette.nodeSelected : palette.nodeStroke);
        appendLine(lines, [x, y], [x + w, y], stroke);
        appendLine(lines, [x + w, y], [x + w, y + h], stroke);
        appendLine(lines, [x + w, y + h], [x, y + h], stroke);
        appendLine(lines, [x, y + h], [x, y], stroke);
      }

      if (element.type === "image") {
        const imageSrc = (element.props as any).previewSrc || (element.props as any).originalSrc || "";
        if (imageSrc) {
          ensureImageTexture(imageSrc);
          const asset = imageCache.get(imageSrc);
          if (asset) {
            const padding = 8;
            const availableW = Math.max(1, w - padding * 2);
            const availableH = Math.max(1, h - padding * 2);
            const aspect = asset.width / Math.max(asset.height, 1);
            let drawW = availableW;
            let drawH = availableW / aspect;
            if (drawH > availableH) {
              drawH = availableH;
              drawW = drawH * aspect;
            }
            const dx = x + (w - drawW) / 2;
            const dy = y + (h - drawH) / 2;
            imageQuads.push({ x: dx, y: dy, w: drawW, h: drawH, texture: asset.texture });
          }
        }
      }

      const title = trimText(resolveNodeTitle(element));
      const subtitle = trimText(resolveNodeSubtitle(element));
      const padding = 10;
      const maxWidth = Math.max(1, w - padding * 2);
      if (element.type === "text") {
        const rawText = normalizeTextValue((element.props as any).value);
        const isPlaceholder = rawText.trim().length === 0;
        const textValue = isPlaceholder ? "输入文字内容" : rawText;
        const fontSize = 13;
        const lineHeight = fontSize + 4;
        textAtlas.ctx.font = `${fontSize}px ${TEXT_FONT_FAMILY}`;
        const maxLines = Math.max(1, Math.floor((h - padding * 2) / lineHeight));
        const linesValue = wrapText(textValue, maxWidth, textAtlas.ctx, maxLines);
        linesValue.forEach((line, index) => {
          if (!line) return;
          const entry = textAtlas.draw(line, fontSize);
          textQuads.push({
            x: x + padding,
            y: y + padding + index * lineHeight,
            w: entry.width,
            h: entry.height,
            u0: entry.u0,
            v0: entry.v0,
            u1: entry.u1,
            v1: entry.v1,
            color: toColor(isPlaceholder ? palette.textMuted : palette.text),
          });
        });
      } else {
        if (title) {
          const fontSize = 12;
          const entry = textAtlas.draw(title, fontSize);
          textQuads.push({
            x: x + padding,
            y: y + padding,
            w: entry.width,
            h: entry.height,
            u0: entry.u0,
            v0: entry.v0,
            u1: entry.u1,
            v1: entry.v1,
            color: toColor(palette.text),
          });
        }
        if (subtitle) {
          const fontSize = 11;
          const entry = textAtlas.draw(subtitle, fontSize);
          textQuads.push({
            x: x + padding,
            y: y + padding + 16,
            w: entry.width,
            h: entry.height,
            u0: entry.u0,
            v0: entry.v0,
            u1: entry.u1,
            v1: entry.v1,
            color: toColor(palette.textMuted),
          });
        }
      }
    });
  }

  if (snapshot.pendingInsert && snapshot.pendingInsertPoint) {
    const [w, h] = snapshot.pendingInsert.size ?? DEFAULT_NODE_SIZE;
    const x = snapshot.pendingInsertPoint[0] - w / 2;
    const y = snapshot.pendingInsertPoint[1] - h / 2;
    const base = toColor(palette.nodeFill);
    rects.push({ x, y, w, h, rotation: 0, color: [base[0], base[1], base[2], base[3] * 0.5] });
    const label = trimText(snapshot.pendingInsert.type);
    if (label) {
      const fontSize = 12;
      const entry = textAtlas.draw(label, fontSize);
      textQuads.push({
        x: x + 10,
        y: y + 10,
        w: entry.width,
        h: entry.height,
        u0: entry.u0,
        v0: entry.v0,
        u1: entry.u1,
        v1: entry.v1,
        color: toColor(palette.textMuted),
      });
    }
  }

  // selection box
  if (snapshot.selectionBox) {
    const { x, y, w, h } = snapshot.selectionBox;
    rects.push({
      x,
      y,
      w,
      h,
      rotation: 0,
      color: toColor(palette.selectionFill),
    });
    const stroke = toColor(palette.selectionStroke);
    appendLine(lines, [x, y], [x + w, y], stroke);
    appendLine(lines, [x + w, y], [x + w, y + h], stroke);
    appendLine(lines, [x + w, y + h], [x, y + h], stroke);
    appendLine(lines, [x, y + h], [x, y], stroke);
  }

  // alignment guides
  snapshot.alignmentGuides.forEach((guide: CanvasAlignmentGuide) => {
    const color = toColor(palette.guide);
    if (guide.axis === "x") {
      appendLine(lines, [guide.value, guide.start], [guide.value, guide.end], color);
    } else {
      appendLine(lines, [guide.start, guide.value], [guide.end, guide.value], color);
    }
  });

  if (textQuads.length > 0) {
    device.queue.copyExternalImageToTexture(
      { source: textAtlas.canvas },
      { texture: textTexture },
      { width: textAtlas.canvas.width, height: textAtlas.canvas.height }
    );
  }

  const rectBuffer = buildRectBuffer(rects);
  const lineBuffer = buildLineBuffer(lines);
  const textBuffer = buildTextBuffer(textQuads);
  const imageBuffers: GPUBuffer[] = [];

  const encoder = device.createCommandEncoder();
  const view = context.getCurrentTexture().createView();
  const renderPass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });

  if (lineBuffer && linePipeline) {
    renderPass.setPipeline(linePipeline);
    renderPass.setBindGroup(0, viewBindGroup);
    renderPass.setVertexBuffer(0, lineBuffer);
    renderPass.draw(lines.length, 1, 0, 0);
  }

  if (rectBuffer && rectPipeline) {
    renderPass.setPipeline(rectPipeline);
    renderPass.setBindGroup(0, viewBindGroup);
    renderPass.setVertexBuffer(0, quadBuffer);
    renderPass.setVertexBuffer(1, rectBuffer);
    renderPass.draw(6, rects.length, 0, 0);
  }

  if (textBuffer && texturePipeline && textTexture && textSampler) {
    const textBindGroup = device.createBindGroup({
      layout: texturePipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: textSampler },
        { binding: 1, resource: textTexture.createView() },
      ],
    });
    renderPass.setPipeline(texturePipeline);
    renderPass.setBindGroup(0, viewBindGroup);
    renderPass.setBindGroup(1, textBindGroup);
    renderPass.setVertexBuffer(0, quadBuffer);
    renderPass.setVertexBuffer(1, textBuffer);
    renderPass.draw(6, textQuads.length, 0, 0);
  }

  if (imageQuads.length > 0 && texturePipeline) {
    for (const quad of imageQuads) {
      const imageBuffer = buildImageBuffer([quad]);
      if (!imageBuffer) continue;
      imageBuffers.push(imageBuffer);
      const imageBindGroup = device.createBindGroup({
        layout: texturePipeline.getBindGroupLayout(1),
        entries: [
          { binding: 0, resource: textSampler as GPUSampler },
          { binding: 1, resource: quad.texture.createView() },
        ],
      });
      renderPass.setPipeline(texturePipeline);
      renderPass.setBindGroup(0, viewBindGroup);
      renderPass.setBindGroup(1, imageBindGroup);
      renderPass.setVertexBuffer(0, quadBuffer);
      renderPass.setVertexBuffer(1, imageBuffer);
      renderPass.draw(6, 1, 0, 0);
    }
  }

  renderPass.end();
  device.queue.submit([encoder.finish()]);
  rectBuffer?.destroy();
  lineBuffer?.destroy();
  textBuffer?.destroy();
  imageBuffers.forEach(buffer => buffer.destroy());
}

function buildRectBuffer(rects: RectInstance[]) {
  if (!device || rects.length === 0) return null;
  const data = new Float32Array(rects.length * 10);
  rects.forEach((rect, i) => {
    const offset = i * 10;
    data[offset] = rect.x;
    data[offset + 1] = rect.y;
    data[offset + 2] = rect.w;
    data[offset + 3] = rect.h;
    data[offset + 4] = rect.rotation;
    data[offset + 5] = 0;
    data[offset + 6] = rect.color[0];
    data[offset + 7] = rect.color[1];
    data[offset + 8] = rect.color[2];
    data[offset + 9] = rect.color[3];
  });
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function buildLineBuffer(lines: LineVertex[]) {
  if (!device || lines.length === 0) return null;
  const data = new Float32Array(lines.length * 6);
  lines.forEach((line, i) => {
    const offset = i * 6;
    data[offset] = line.x;
    data[offset + 1] = line.y;
    data[offset + 2] = line.color[0];
    data[offset + 3] = line.color[1];
    data[offset + 4] = line.color[2];
    data[offset + 5] = line.color[3];
  });
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function buildTextBuffer(texts: TextQuad[]) {
  if (!device || texts.length === 0) return null;
  const data = new Float32Array(texts.length * 12);
  texts.forEach((text, i) => {
    const offset = i * 12;
    data[offset] = text.x;
    data[offset + 1] = text.y;
    data[offset + 2] = text.w;
    data[offset + 3] = text.h;
    data[offset + 4] = text.u0;
    data[offset + 5] = text.v0;
    data[offset + 6] = text.u1;
    data[offset + 7] = text.v1;
    data[offset + 8] = text.color[0];
    data[offset + 9] = text.color[1];
    data[offset + 10] = text.color[2];
    data[offset + 11] = text.color[3];
  });
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

function buildImageBuffer(images: ImageQuad[]) {
  if (!device || images.length === 0) return null;
  const data = new Float32Array(images.length * 12);
  images.forEach((image, i) => {
    const offset = i * 12;
    data[offset] = image.x;
    data[offset + 1] = image.y;
    data[offset + 2] = image.w;
    data[offset + 3] = image.h;
    data[offset + 4] = 0;
    data[offset + 5] = 0;
    data[offset + 6] = 1;
    data[offset + 7] = 1;
    data[offset + 8] = 1;
    data[offset + 9] = 1;
    data[offset + 10] = 1;
    data[offset + 11] = 1;
  });
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(buffer, 0, data);
  return buffer;
}

const RECT_SHADER = `
struct ViewUniforms {
  size: vec2<f32>,
  zoom: f32,
  dpr: f32,
  offset: vec2<f32>,
  padding: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uView: ViewUniforms;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(
  @location(0) inPos: vec2<f32>,
  @location(1) instPos: vec2<f32>,
  @location(2) instSize: vec2<f32>,
  @location(3) instRotation: f32,
  @location(4) instColor: vec4<f32>,
) -> VSOut {
  let center = instPos + instSize * 0.5;
  let local = (inPos * instSize) - (instSize * 0.5);
  let c = cos(instRotation);
  let s = sin(instRotation);
  let rotated = vec2<f32>(local.x * c - local.y * s, local.x * s + local.y * c);
  let world = center + rotated;
  let screen = (world * uView.zoom + uView.offset) * uView.dpr;
  let clip = vec2<f32>(
    (screen.x / uView.size.x) * 2.0 - 1.0,
    1.0 - (screen.y / uView.size.y) * 2.0
  );
  var out: VSOut;
  out.position = vec4<f32>(clip, 0.0, 1.0);
  out.color = instColor;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  return in.color;
}
`;

const LINE_SHADER = `
struct ViewUniforms {
  size: vec2<f32>,
  zoom: f32,
  dpr: f32,
  offset: vec2<f32>,
  padding: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uView: ViewUniforms;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vs_main(
  @location(0) inPos: vec2<f32>,
  @location(1) inColor: vec4<f32>,
) -> VSOut {
  let screen = (inPos * uView.zoom + uView.offset) * uView.dpr;
  let clip = vec2<f32>(
    (screen.x / uView.size.x) * 2.0 - 1.0,
    1.0 - (screen.y / uView.size.y) * 2.0
  );
  var out: VSOut;
  out.position = vec4<f32>(clip, 0.0, 1.0);
  out.color = inColor;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  return in.color;
}
`;

const TEXTURE_SHADER = `
struct ViewUniforms {
  size: vec2<f32>,
  zoom: f32,
  dpr: f32,
  offset: vec2<f32>,
  padding: vec2<f32>,
};

@group(0) @binding(0) var<uniform> uView: ViewUniforms;
@group(1) @binding(0) var uSampler: sampler;
@group(1) @binding(1) var uTexture: texture_2d<f32>;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
};

@vertex
fn vs_main(
  @location(0) inPos: vec2<f32>,
  @location(1) instPos: vec2<f32>,
  @location(2) instSize: vec2<f32>,
  @location(3) uv0: vec2<f32>,
  @location(4) uv1: vec2<f32>,
  @location(5) instColor: vec4<f32>,
) -> VSOut {
  let world = instPos + inPos * instSize;
  let screen = (world * uView.zoom + uView.offset) * uView.dpr;
  let clip = vec2<f32>(
    (screen.x / uView.size.x) * 2.0 - 1.0,
    1.0 - (screen.y / uView.size.y) * 2.0
  );
  var out: VSOut;
  out.position = vec4<f32>(clip, 0.0, 1.0);
  out.uv = uv0 + (uv1 - uv0) * inPos;
  out.color = instColor;
  return out;
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let sampled = textureSample(uTexture, uSampler, in.uv);
  return sampled * in.color;
}
`;

self.onmessage = (event: MessageEvent<GpuMessage>) => {
  const message = event.data;
  if (message.type === "init") {
    initGpu(message.canvas, message.size, message.dpr)
      .catch((error) => {
        postWorkerEvent({ type: "error", message: error instanceof Error ? error.message : String(error) });
      });
    return;
  }
  if (message.type === "resize") {
    canvasSize = message.size;
    dpr = message.dpr;
    configureContext();
    return;
  }
  if (message.type === "snapshot") {
    latestSnapshot = message.snapshot;
    latestPalette = message.palette;
    latestHideGrid = Boolean(message.hideGrid);
    latestRenderNodes = message.renderNodes !== false;
    render(message.snapshot, message.palette, latestHideGrid, latestRenderNodes);
    return;
  }
  if (message.type === "dispose") {
    latestSnapshot = null;
    latestPalette = null;
    return;
  }
};
