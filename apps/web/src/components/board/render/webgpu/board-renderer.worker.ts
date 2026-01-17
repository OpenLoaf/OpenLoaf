/// <reference types="@webgpu/types" />
/* eslint-disable no-restricted-globals */
import type {
  GpuMessage,
  GpuPalette,
  GpuSceneSnapshot,
  GpuStateSnapshot,
  GpuWorkerEvent,
} from "./gpu-protocol";
import type {
  CanvasAlignmentGuide,
  CanvasConnectorElement,
  CanvasNodeElement,
  CanvasPoint,
  CanvasRect,
  CanvasViewportState,
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
const PALETTE_KEYS: Array<keyof GpuPalette> = [
  "grid",
  "nodeFill",
  "nodeStroke",
  "nodeSelected",
  "text",
  "textMuted",
  "connector",
  "connectorSelected",
  "connectorDraft",
  "selectionFill",
  "selectionStroke",
  "guide",
];

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
  asset: ImageAsset;
};

type ImageAsset = {
  texture: GPUTexture;
  width: number;
  height: number;
  bindGroup?: GPUBindGroup;
};

type ImageDraw = {
  buffer: GPUBuffer;
  bindGroup: GPUBindGroup;
};

type SceneBuffers = {
  rectBuffer: GPUBuffer | null;
  rectCount: number;
  lineBuffer: GPUBuffer | null;
  lineCount: number;
  textBuffer: GPUBuffer | null;
  textCount: number;
  imageDraws: ImageDraw[];
};

type SceneGeometry = {
  rects: RectInstance[];
  lines: LineVertex[];
  textQuads: TextQuad[];
  imageQuads: ImageQuad[];
};

type ViewState = {
  viewport: CanvasViewportState;
  palette: GpuPalette;
  hideGrid: boolean;
  renderNodes: boolean;
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
/** Cached bind group layout for texture sampling. */
let textureBindGroupLayout: GPUBindGroupLayout | null = null;
let quadBuffer: GPUBuffer | null = null;
let textAtlas: TextAtlas | null = null;
let textTexture: GPUTexture | null = null;
let textSampler: GPUSampler | null = null;
/** Bind group for the text atlas texture. */
let textBindGroup: GPUBindGroup | null = null;
/** Latest scene data for GPU rendering. */
let latestScene: GpuSceneSnapshot | null = null;
/** Latest state data for GPU rendering. */
let latestState: GpuStateSnapshot | null = null;
/** Latest view data for GPU rendering. */
let latestView: ViewState | null = null;
/** Cached GPU buffers for the current scene. */
let sceneBuffers: SceneBuffers | null = null;
/** Cached GPU buffer for grid lines. */
let gridLineBuffer: GPUBuffer | null = null;
/** Cached grid line vertex count. */
let gridLineCount = 0;
/** Dirty flag for scene geometry rebuild. */
let sceneDirty = false;
/** Dirty flag for grid geometry rebuild. */
let gridDirty = false;
/** Render scheduling guard. */
let renderScheduled = false;
let lastImageTextureCount = -1;

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

  return navigator.gpu.requestAdapter().then((adapter: GPUAdapter | null) => {
    if (!adapter) throw new Error("Failed to acquire GPU adapter.");
    return adapter.requestDevice();
  }).then((gpuDevice: GPUDevice) => {
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

  textureBindGroupLayout = device.createBindGroupLayout({
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

  if (textTexture && textSampler && textureBindGroupLayout) {
    textBindGroup = device.createBindGroup({
      layout: textureBindGroupLayout,
      entries: [
        { binding: 0, resource: textSampler },
        { binding: 1, resource: textTexture.createView() },
      ],
    });
  }
}

function updateViewUniform(viewport: CanvasViewportState) {
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
  self.postMessage(event);
}

/** Return true when two viewport states share the same values. */
function isViewportEqual(a: CanvasViewportState | null, b: CanvasViewportState): boolean {
  if (!a) return false;
  return (
    a.zoom === b.zoom &&
    a.offset[0] === b.offset[0] &&
    a.offset[1] === b.offset[1] &&
    a.size[0] === b.size[0] &&
    a.size[1] === b.size[1]
  );
}

/** Return true when two palettes share the same values. */
function isPaletteEqual(a: GpuPalette | null, b: GpuPalette): boolean {
  if (!a) return false;
  return PALETTE_KEYS.every((key) => {
    const left = a[key];
    const right = b[key];
    return (
      left[0] === right[0] &&
      left[1] === right[1] &&
      left[2] === right[2] &&
      left[3] === right[3]
    );
  });
}

/** Schedule a coalesced render in the worker. */
function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  queueMicrotask(() => {
    renderScheduled = false;
    renderFrame();
  });
}

function emitStats() {
  const imageTextures = imageCache.size;
  if (imageTextures === lastImageTextureCount) return;
  lastImageTextureCount = imageTextures;
  // 逻辑：仅在纹理数量变化时上报，减少主线程通信。
  postWorkerEvent({ type: "stats", imageTextures });
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
      const asset: ImageAsset = { texture, width: bitmap.width, height: bitmap.height };
      if (textureBindGroupLayout && textSampler) {
        asset.bindGroup = device.createBindGroup({
          layout: textureBindGroupLayout,
          entries: [
            { binding: 0, resource: textSampler },
            { binding: 1, resource: texture.createView() },
          ],
        });
      }
      imageCache.set(src, asset);
    })
    .catch(() => {})
    .finally(() => {
      imageLoading.delete(src);
      // 逻辑：图片纹理就绪后触发一次场景重建。
      sceneDirty = true;
      scheduleRender();
    });
  imageLoading.set(src, promise);
}

function getNodeBoundsMap(elements: GpuSceneSnapshot["elements"]) {
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

function buildGridLines(viewport: CanvasViewportState, color: Vec4) {
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
  state: GpuStateSnapshot,
  anchors: GpuSceneSnapshot["anchors"],
  boundsMap: Record<string, CanvasRect | undefined>,
  lines: LineVertex[],
  palette: GpuPalette
) {
  const resolved = resolveConnectorEndpointsSmart(
    connector.source,
    connector.target,
    anchors,
    boundsMap
  );
  const { source, target } = resolved;
  if (!source || !target) return;
  const style = connector.style ?? state.connectorStyle;
  const path = buildConnectorPath(style, source, target, {
    sourceAnchorId: resolved.sourceAnchorId,
    targetAnchorId: resolved.targetAnchorId,
  });
  const isSelected = state.selectedIds.includes(connector.id);
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

/** Build geometry for the current scene and state. */
function buildSceneGeometry(
  scene: GpuSceneSnapshot,
  state: GpuStateSnapshot,
  palette: GpuPalette,
  renderNodes: boolean
): SceneGeometry {
  const rects: RectInstance[] = [];
  const lines: LineVertex[] = [];
  const textQuads: TextQuad[] = [];
  const imageQuads: ImageQuad[] = [];
  const atlas = textAtlas;
  const boundsMap = getNodeBoundsMap(scene.elements);

  const connectorElements = scene.elements.filter(
    (element): element is CanvasConnectorElement => element.kind === "connector"
  );
  connectorElements.forEach((connector) => {
    appendConnectorLines(connector, state, scene.anchors, boundsMap, lines, palette);
  });
  if (state.connectorDraft) {
    const draft = state.connectorDraft;
    const resolved = resolveConnectorEndpointsSmart(
      draft.source,
      draft.target,
      scene.anchors,
      boundsMap
    );
    const { source, target } = resolved;
    if (source && target) {
      const style = draft.style ?? state.connectorStyle;
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
    const selectedIds = new Set(state.selectedIds);
    scene.elements.forEach((element) => {
      if (element.kind !== "node") return;
      if (element.id === state.editingNodeId) return;
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
            imageQuads.push({ x: dx, y: dy, w: drawW, h: drawH, asset });
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
        const ctx = atlas?.ctx;
        if (ctx) {
          ctx.font = `${fontSize}px ${TEXT_FONT_FAMILY}`;
        }
        const maxLines = Math.max(1, Math.floor((h - padding * 2) / lineHeight));
        const linesValue = ctx ? wrapText(textValue, maxWidth, ctx, maxLines) : [];
        linesValue.forEach((line, index) => {
          if (!line || !atlas) return;
          const entry = atlas.draw(line, fontSize);
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
        if (title && atlas) {
          const fontSize = 12;
          const entry = atlas.draw(title, fontSize);
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
        if (subtitle && atlas) {
          const fontSize = 11;
          const entry = atlas.draw(subtitle, fontSize);
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

  if (state.pendingInsert && state.pendingInsertPoint) {
    const [w, h] = state.pendingInsert.size ?? DEFAULT_NODE_SIZE;
    const x = state.pendingInsertPoint[0] - w / 2;
    const y = state.pendingInsertPoint[1] - h / 2;
    const base = toColor(palette.nodeFill);
    rects.push({ x, y, w, h, rotation: 0, color: [base[0], base[1], base[2], base[3] * 0.5] });
    const label = trimText(state.pendingInsert.type);
    if (label && atlas) {
      const fontSize = 12;
      const entry = atlas.draw(label, fontSize);
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

  if (state.selectionBox) {
    const { x, y, w, h } = state.selectionBox;
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

  state.alignmentGuides.forEach((guide: CanvasAlignmentGuide) => {
    const color = toColor(palette.guide);
    if (guide.axis === "x") {
      appendLine(lines, [guide.value, guide.start], [guide.value, guide.end], color);
    } else {
      appendLine(lines, [guide.start, guide.value], [guide.end, guide.value], color);
    }
  });

  return { rects, lines, textQuads, imageQuads };
}

/** Ensure a bind group exists for the image asset. */
function ensureImageBindGroup(asset: ImageAsset): GPUBindGroup | null {
  if (asset.bindGroup) return asset.bindGroup;
  if (!device || !textureBindGroupLayout || !textSampler) return null;
  const bindGroup = device.createBindGroup({
    layout: textureBindGroupLayout,
    entries: [
      { binding: 0, resource: textSampler },
      { binding: 1, resource: asset.texture.createView() },
    ],
  });
  asset.bindGroup = bindGroup;
  return bindGroup;
}

/** Build GPU draw data for image quads. */
function buildImageDraws(imageQuads: ImageQuad[]): ImageDraw[] {
  const draws: ImageDraw[] = [];
  imageQuads.forEach((quad) => {
    const buffer = buildImageBuffer([quad]);
    if (!buffer) return;
    const bindGroup = ensureImageBindGroup(quad.asset);
    if (!bindGroup) {
      buffer.destroy();
      return;
    }
    draws.push({ buffer, bindGroup });
  });
  return draws;
}

/** Destroy cached scene buffers. */
function destroySceneBuffers(buffers: SceneBuffers | null) {
  if (!buffers) return;
  buffers.rectBuffer?.destroy();
  buffers.lineBuffer?.destroy();
  buffers.textBuffer?.destroy();
  buffers.imageDraws.forEach(draw => draw.buffer.destroy());
}

/** Destroy cached grid buffer. */
function destroyGridBuffer() {
  if (gridLineBuffer) {
    gridLineBuffer.destroy();
    gridLineBuffer = null;
  }
  gridLineCount = 0;
}

/** Rebuild scene buffers from latest data. */
function rebuildSceneBuffers(scene: GpuSceneSnapshot, state: GpuStateSnapshot, view: ViewState) {
  destroySceneBuffers(sceneBuffers);
  sceneBuffers = buildSceneBuffers(scene, state, view);
}

/** Rebuild grid buffers for the current view. */
function rebuildGridBuffer(view: ViewState) {
  destroyGridBuffer();
  if (view.hideGrid) return;
  const gridLines = buildGridLines(view.viewport, toColor(view.palette.grid));
  gridLineBuffer = buildLineBuffer(gridLines);
  gridLineCount = gridLines.length;
}

/** Build GPU buffers for the current scene. */
function buildSceneBuffers(
  scene: GpuSceneSnapshot,
  state: GpuStateSnapshot,
  view: ViewState
): SceneBuffers | null {
  if (!device || !textAtlas || !textTexture || !textSampler) return null;
  textAtlas.begin();
  const geometry = buildSceneGeometry(scene, state, view.palette, view.renderNodes);
  if (geometry.textQuads.length > 0) {
    device.queue.copyExternalImageToTexture(
      { source: textAtlas.canvas },
      { texture: textTexture },
      { width: textAtlas.canvas.width, height: textAtlas.canvas.height }
    );
  }
  const rectBuffer = buildRectBuffer(geometry.rects);
  const lineBuffer = buildLineBuffer(geometry.lines);
  const textBuffer = buildTextBuffer(geometry.textQuads);
  const imageDraws = buildImageDraws(geometry.imageQuads);
  return {
    rectBuffer,
    rectCount: geometry.rects.length,
    lineBuffer,
    lineCount: geometry.lines.length,
    textBuffer,
    textCount: geometry.textQuads.length,
    imageDraws,
  };
}

/** Render a frame using cached buffers. */
function renderFrame() {
  if (!device || !context || !rectPipeline || !linePipeline || !texturePipeline || !viewBindGroup || !quadBuffer) {
    return;
  }
  if (!latestScene || !latestState || !latestView) return;

  if (sceneDirty) {
    // 逻辑：场景或状态变化时重建缓存几何。
    rebuildSceneBuffers(latestScene, latestState, latestView);
    sceneDirty = false;
  }
  if (gridDirty) {
    // 逻辑：视图或配色变化时重建网格线。
    rebuildGridBuffer(latestView);
    gridDirty = false;
  }

  updateViewUniform(latestView.viewport);

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

  if (linePipeline) {
    renderPass.setPipeline(linePipeline);
    renderPass.setBindGroup(0, viewBindGroup);
    if (gridLineBuffer) {
      renderPass.setVertexBuffer(0, gridLineBuffer);
      renderPass.draw(gridLineCount, 1, 0, 0);
    }
    if (sceneBuffers?.lineBuffer) {
      renderPass.setVertexBuffer(0, sceneBuffers.lineBuffer);
      renderPass.draw(sceneBuffers.lineCount, 1, 0, 0);
    }
  }

  if (sceneBuffers?.rectBuffer && rectPipeline) {
    renderPass.setPipeline(rectPipeline);
    renderPass.setBindGroup(0, viewBindGroup);
    renderPass.setVertexBuffer(0, quadBuffer);
    renderPass.setVertexBuffer(1, sceneBuffers.rectBuffer);
    renderPass.draw(6, sceneBuffers.rectCount, 0, 0);
  }

  if (sceneBuffers?.textBuffer && textBindGroup) {
    renderPass.setPipeline(texturePipeline);
    renderPass.setBindGroup(0, viewBindGroup);
    renderPass.setBindGroup(1, textBindGroup);
    renderPass.setVertexBuffer(0, quadBuffer);
    renderPass.setVertexBuffer(1, sceneBuffers.textBuffer);
    renderPass.draw(6, sceneBuffers.textCount, 0, 0);
  }

  if (sceneBuffers?.imageDraws.length) {
    renderPass.setPipeline(texturePipeline);
    renderPass.setBindGroup(0, viewBindGroup);
    sceneBuffers.imageDraws.forEach((draw) => {
      renderPass.setBindGroup(1, draw.bindGroup);
      renderPass.setVertexBuffer(0, quadBuffer);
      renderPass.setVertexBuffer(1, draw.buffer);
      renderPass.draw(6, 1, 0, 0);
    });
  }

  renderPass.end();
  device.queue.submit([encoder.finish()]);
  emitStats();
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
      .catch((error: unknown) => {
        postWorkerEvent({ type: "error", message: error instanceof Error ? error.message : String(error) });
      });
    return;
  }
  if (message.type === "resize") {
    canvasSize = message.size;
    dpr = message.dpr;
    configureContext();
    gridDirty = true;
    scheduleRender();
    return;
  }
  if (message.type === "scene") {
    latestScene = message.scene;
    sceneDirty = true;
    scheduleRender();
    return;
  }
  if (message.type === "state") {
    latestState = message.state;
    sceneDirty = true;
    scheduleRender();
    return;
  }
  if (message.type === "view") {
    const nextView: ViewState = {
      viewport: message.viewport,
      palette: message.palette,
      hideGrid: Boolean(message.hideGrid),
      renderNodes: message.renderNodes !== false,
    };
    const prevView = latestView;
    const viewportChanged = !prevView || !isViewportEqual(prevView.viewport, nextView.viewport);
    const paletteChanged = !prevView || !isPaletteEqual(prevView.palette, nextView.palette);
    const hideGridChanged = !prevView || prevView.hideGrid !== nextView.hideGrid;
    const renderNodesChanged = !prevView || prevView.renderNodes !== nextView.renderNodes;
    latestView = nextView;
    if (paletteChanged || renderNodesChanged) {
      sceneDirty = true;
    }
    if (paletteChanged || viewportChanged || hideGridChanged) {
      gridDirty = true;
    }
    scheduleRender();
    return;
  }
  if (message.type === "dispose") {
    latestScene = null;
    latestState = null;
    latestView = null;
    destroySceneBuffers(sceneBuffers);
    sceneBuffers = null;
    destroyGridBuffer();
    sceneDirty = false;
    gridDirty = false;
    return;
  }
};
