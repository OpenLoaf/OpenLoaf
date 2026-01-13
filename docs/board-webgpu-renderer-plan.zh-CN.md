# 画布 WebGPU + OffscreenCanvas + Worker 渲染改造方案（全量 GPU 化）

## 目标

- 所有节点 UI 默认用 GPU 渲染（不再依赖 DOM）。
- 仅在“编辑态”使用 DOM 组件（文本输入、复杂表单等）。
- 保留现有业务逻辑（CanvasEngine、工具、选中/拖拽、连接线规则等），但渲染层完全重做。
- 采用 WebGPU + OffscreenCanvas + Worker，最大化吞吐与帧率稳定性。

## 非目标

- 不改动现有节点业务含义（类型、行为、工具触发逻辑）。
- 不改变现有文件存储格式和快照结构（CanvasSnapshot 仍为主输入）。

## 总体架构

- 主线程：保留业务逻辑与交互，负责快照整理与资源解码。
- Worker：独立 WebGPU 渲染线程，负责 GPU 初始化、资源管理与绘制。
- OffscreenCanvas：主线程创建并 transfer 到 Worker。

```
BoardCanvas
  ├─ CanvasEngine / tools / hit-testing (保留)
  ├─ WebGpuSurface (替换 CanvasSurface)
  │    ├─ WebGpuRenderer (主线程调度)
  │    └─ Worker (WebGPU 设备 + 纹理/管线)
  └─ DOM Overlay (仅编辑态)
```

## 具体改造清单（文件级别）

### 1) 替换渲染入口

- 修改 `apps/web/src/components/board/render/CanvasSurface.tsx`
  - 改为 WebGPU 版本，创建 OffscreenCanvas 并传给 Worker。
  - 负责尺寸变化与快照发送（节流/去重）。

### 2) 新增 WebGPU 渲染目录

新增目录：`apps/web/src/components/board/render/webgpu/`

- `WebGpuRenderer.ts`
  - 主线程渲染调度与 diff 处理
  - 维护资源缓存（纹理、字形图集索引、节点映射）
- `board-gpu-worker.ts`
  - Worker 入口：初始化 GPU、创建 pipeline、渲染循环
- `gpu-protocol.ts`
  - 主线程 ↔ Worker 通信协议类型
- `gpu-shaders.wgsl`
  - Grid / Node / Connector / Overlay / Text 的 shader 模板
- `gpu-atlas.ts`
  - 纹理图集与字形图集的管理策略

### 3) 扩展节点定义

修改 `apps/web/src/components/board/engine/types.ts`

- 在 `CanvasNodeDefinition` 增加 GPU 渲染描述字段，例如：
  - `gpu?: CanvasNodeGpuSpec`（节点 GPU 渲染规格）

### 4) 新增渲染适配层

新增 `apps/web/src/components/board/render/webgpu/render-adapter.ts`

- 输入：`CanvasSnapshot`
- 输出：`GpuSnapshot`
- 负责：
  - 元素排序（zIndex）
  - 连接线路径几何生成（复用 `buildConnectorPath`）
  - Node GPU 实例数据编排
  - 纹理/字形资源引用

### 5) DOM 层改为“编辑专用”

- 修改 `apps/web/src/components/board/core/CanvasDomLayer.tsx`
  - 仅在编辑态渲染对应节点 DOM
  - 非编辑态只保留交互捕获与必要 UI（如外框/控制柄仍可 GPU 化）

## 通信协议定义（主线程 ↔ Worker）

建议所有消息包含 `version` 与 `frameId`，支持 future 兼容。

```ts
export type GpuMessage =
  | {
      type: "init";
      version: 1;
      canvas: OffscreenCanvas; // transfer
      size: [number, number];
      dpr: number;
      features: {
        enableMsaa: boolean;
        enableTextAtlas: boolean;
      };
    }
  | {
      type: "resize";
      size: [number, number];
      dpr: number;
    }
  | {
      type: "snapshot";
      frameId: number;
      payload: GpuSnapshot;
    }
  | {
      type: "assets";
      images: Array<{
        id: string;
        bitmap: ImageBitmap; // transfer
      }>;
      fonts?: Array<{
        id: string;
        atlas: ImageBitmap; // transfer
        meta: FontAtlasMeta;
      }>;
    }
  | {
      type: "dispose";
      reason?: string;
    };

export type GpuWorkerEvent =
  | { type: "ready"; adapter: GPUAdapterInfo }
  | { type: "stats"; fps: number; frameTimeMs: number }
  | { type: "resource_evicted"; ids: string[] }
  | { type: "error"; message: string };
```

`GpuSnapshot` 建议结构（TypedArray 优先）：

```ts
export type GpuSnapshot = {
  viewport: {
    size: [number, number];
    zoom: number;
    offset: [number, number];
  };
  nodes: {
    instanceCount: number;
    instanceBuffer: Float32Array; // x y w h r opacity z texId ...
  };
  connectors: {
    vertexCount: number;
    vertexBuffer: Float32Array; // positions + style params
  };
  overlays: {
    guideCount: number;
    guideBuffer: Float32Array;
  };
  selection: {
    count: number;
    buffer: Float32Array;
  };
  text: {
    glyphCount: number;
    glyphBuffer: Float32Array;
  };
};
```

## GPU Pipeline 模板（WGSL + 管线结构）

### 统一 Uniform

```wgsl
struct ViewUniforms {
  viewProj : mat4x4<f32>;
  dpr : f32;
  padding0 : vec3<f32>;
};

@group(0) @binding(0) var<uniform> uView : ViewUniforms;
```

### Node Pipeline（实例化矩形）

```wgsl
struct NodeInstance {
  pos : vec2<f32>;
  size : vec2<f32>;
  rotation : f32;
  opacity : f32;
  texId : f32;
  z : f32;
  padding : vec2<f32>;
};

@group(1) @binding(0) var uSampler : sampler;
@group(1) @binding(1) var uAtlas : texture_2d<f32>;

@vertex
fn vs_main(@location(0) inPos: vec2<f32>,
           @location(1) inst: NodeInstance) -> VSOut {
  // 计算 world -> clip
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  // 采样纹理或纯色
}
```

### Connector Pipeline（线条挤出）

- 由 CPU 生成折线点，GPU 侧挤出为 quad strip。
- 支持 stroke width、虚线、选中态颜色。

### Overlay Pipeline

- 绘制选中框、对齐线、锚点。
- 颜色直接由 instance buffer 控制。

### Grid Pipeline

- 使用 fragment shader 计算网格，避免 CPU 绘制。

## 资源管理策略

- **纹理图集**：统一管理图片节点与图标纹理，支持 LRU 淘汰。
- **字形图集**：MSDF 字体图集，按字体/字号缓存。
- **上传路径**：主线程 decode → ImageBitmap → transfer → GPU 纹理。
- **带宽控制**：
  - 小幅变动只更新 instance buffer
  - 大规模变动增量发送（diff）

## 业务逻辑保留策略

- `CanvasEngine`、工具行为、snapshots 结构保持不变。
- `hit-testing` 继续在 CPU 侧进行（复用几何逻辑），只替换绘制层。
- DOM 层仅用于编辑态输入，不参与常态渲染。

## 每个节点的迁移方案

> 原则：默认 GPU 显示，编辑态才启用 DOM 组件。

### TextNode

- GPU 渲染：
  - 文字内容 → glyph 布局 → glyph quad buffer
  - 使用 MSDF 字体图集绘制
- 编辑态 DOM：
  - 继续使用现有 textarea/Slate 编辑逻辑
  - 编辑结束后刷新 GPU glyph buffer

### ImageNode

- GPU 渲染：
  - 图片转成纹理图集，渲染为纹理矩形
- 编辑态 DOM：
  - 仅在需要编辑元数据（如 alt 或扩展操作）时显示

### ImageGenerateNode / ImagePromptGenerateNode

- GPU 渲染：
  - 展示 prompt 摘要、运行状态、进度条、缩略图
  - 控件（按钮/下拉）以 GPU icon + 状态文本呈现
- 编辑态 DOM：
  - 展示完整表单与交互按钮

### LinkNode

- GPU 渲染：
  - 链接标题 + icon
- 编辑态 DOM：
  - 展示输入框/设置链接

### CalendarNode

- GPU 渲染：
  - 生成日历布局为 instance buffer
- 编辑态 DOM：
  - 设置项/弹窗表单

### GroupNode

- GPU 渲染：
  - 渲染为容器边框或背景块
- 编辑态 DOM：
  - 只有在重命名/编辑说明时启用

### StrokeNode

- GPU 渲染：
  - stroke 点序列 → polyline buffer → quad strip
- 编辑态 DOM：
  - 无需 DOM

## 关键改动点总结

- `CanvasSurface` → WebGPU 版本（OffscreenCanvas + Worker）。
- `CanvasRenderer` 替换为 `WebGpuRenderer`（主线程调度）。
- 每个节点增加 GPU 规格（GPU spec）用于渲染适配层。
- DOM 渲染收敛到“编辑态”，常态全 GPU。

## 阶段性的任务执行列表

### 阶段 0：准备与验证
- 定义 `GpuSnapshot` 数据结构与协议类型
- 增加 WebGPU feature detection 与 fallback 策略
- 验证 OffscreenCanvas + Worker 在目标浏览器可用

### 阶段 1：基础渲染管线
- 新建 WebGPU Worker 与基础 pipeline
- 实现 Grid + 纯色节点矩形渲染
- 完成 viewport transform（缩放/平移）

### 阶段 2：节点 GPU 化
- ImageNode → 纹理图集
- TextNode → MSDF 字体图集
- GroupNode / LinkNode / CalendarNode 的布局渲染

### 阶段 3：连接线与交互渲染
- Connector path → quad strip
- 选中框、对齐线、锚点与 hover 状态

### 阶段 4：编辑态 DOM 叠加
- 接入 DOM 编辑态切换
- 编辑态结束后同步 GPU 资源

### 阶段 5：优化与回归
- 实现 diff 更新与 buffer pooling
- LRU 纹理淘汰 + 资源统计
- 性能监控（fps/frametime）
- 全功能回归验证
