# 视频模型参数实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为视频模型引入统一的参数定义，前端按模型渲染控件与能力，后端按模型校验/补默认值并分发给 provider，同时支持 Qwen 视频模型与即梦参数映射。

**Architecture:** 在 `ModelDefinition` 中新增 `parameters` 元数据，包含 UI/校验信息与能力特性（feature）。前端 `VideoGenerateNode` 根据参数与 feature 动态渲染控件和约束，并在请求中发送规范化参数。后端统一应用默认值与必填校验，再由 provider adapter 做字段映射（如即梦 `duration -> frames`）。

**Tech Stack:** TypeScript、React、zod、tRPC、provider adapters。

### Task 1: 扩展模型类型参数定义（含 features）

**Files:**
- Modify: `packages/api/src/common/modelTypes.ts`

**Step 1: Write the failing test**
若已有类型测试，补一个断言 `ModelDefinition.parameters` 与 `features` 字段存在；否则新增最小化类型/运行时测试。

**Step 2: Run test to verify it fails**
Run: `pnpm -C packages/api test`
Expected: FAIL 因为 `parameters` 未定义。

**Step 3: Write minimal implementation**
新增参数结构与 `features` 字段：

```ts
export type ModelParameterFeature =
  | "prompt"
  | "image_url_only"
  | "audio_url_only"
  | "last_frame_support";

export type ModelParameterType = "select" | "number" | "boolean" | "text";

export type ModelParameterDefinition = {
  key: string;
  title: string;
  type: ModelParameterType;
  unit?: string;
  values?: Array<string | number | boolean>;
  min?: number;
  max?: number;
  step?: number;
  default?: string | number | boolean;
  request: boolean;
};

export type ModelDefinition = {
  // ...existing fields
  parameters?: {
    features: ModelParameterFeature[];
    fields: ModelParameterDefinition[];
  };
};
```

**Step 4: Run test to verify it passes**
Run: `pnpm -C packages/api test`
Expected: PASS。

**Step 5: Commit**
```bash
git add packages/api/src/common/modelTypes.ts
git commit -m "feat: add model parameters with features"
```

### Task 2: 模型注册表补齐参数与 features

**Files:**
- Modify: `apps/web/src/lib/model-registry/providers/qwen.json`
- Modify: `apps/web/src/lib/model-registry/providers/volcengine.json`

**Step 1: Write the failing test**
若有 registry 校验测试，补断言 `parameters.features/fields` 可解析。

**Step 2: Run test to verify it fails**
Run: `pnpm -C apps/web test`
Expected: FAIL（参数缺失）。

**Step 3: Write minimal implementation**
- Qwen 新增视频模型：`wan2.6-i2v-flash`、`wan2.6-i2v`，带 `video_generation` tag。
- Qwen `parameters`：
  - `features`: ["prompt", "image_url_only"]（默认只允许首帧图且必须公网 URL）
  - `fields`（最小集）：
    - `resolution`: select, values ["1080P","720P"], default "1080P", request false
    - `duration`: number, min 2, max 15, default 5, unit "秒", request true
- Volcengine `parameters`：
  - `features`: ["prompt", "image_url_only"]
  - `fields`：
    - `duration`: number, values [10,15], default 10, unit "秒", request true
    - `aspectRatio`: select, values ["16:9","4:3","1:1","3:4","9:16","21:9"], default "16:9", request false

**Step 4: Run test to verify it passes**
Run: `pnpm -C apps/web test`
Expected: PASS。

**Step 5: Commit**
```bash
git add apps/web/src/lib/model-registry/providers/qwen.json apps/web/src/lib/model-registry/providers/volcengine.json
git commit -m "feat: add video model parameters"
```

### Task 3: API schema 支持 parameters

**Files:**
- Modify: `packages/api/src/routers/ai.ts`
- Modify: `apps/server/src/ai/models/providerAdapters.ts`

**Step 1: Write the failing test**
补一个 schema 测试，确保 `videoGenerate` 支持 `parameters`。

**Step 2: Run test to verify it fails**
Run: `pnpm -C packages/api test`
Expected: FAIL。

**Step 3: Write minimal implementation**
- `aiSchemas.videoGenerate.input` 添加 `parameters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()`。
- `VideoGenerateInput` 添加 `parameters?: Record<string, string | number | boolean>`。

**Step 4: Run test to verify it passes**
Run: `pnpm -C packages/api test`
Expected: PASS。

**Step 5: Commit**
```bash
git add packages/api/src/routers/ai.ts apps/server/src/ai/models/providerAdapters.ts
git commit -m "feat: allow video parameters in api"
```

### Task 4: 后端参数默认值/必填校验

**Files:**
- Modify: `apps/server/src/ai/models/providerRequestRunner.ts`
- Modify: `apps/server/src/routers/ai.ts`

**Step 1: Write the failing test**
新增单测：缺少必填且无默认时报错；缺少但有默认值则补齐。

**Step 2: Run test to verify it fails**
Run: `pnpm -C apps/server test`
Expected: FAIL。

**Step 3: Write minimal implementation**
- 新增 helper，根据 `modelDefinition.parameters.fields`：
  - 若缺值且有 default，补 default。
  - 若 `request: true` 且最终仍无值，抛错。
- 在 `AiRouterImpl.videoGenerate` 调用该 helper 规范化 `input.parameters` 并传给 `runProviderRequest`。

**Step 4: Run test to verify it passes**
Run: `pnpm -C apps/server test`
Expected: PASS。

**Step 5: Commit**
```bash
git add apps/server/src/ai/models/providerRequestRunner.ts apps/server/src/routers/ai.ts
git commit -m "feat: validate video parameters"
```

### Task 5: Qwen 视频请求实现

**Files:**
- Modify: `apps/server/src/ai/models/qwen/qwenAdapter.ts`
- Modify: `apps/server/src/ai/models/qwen/qwenRequest.ts`

**Step 1: Write the failing test**
新增 adapter payload 测试，验证 `wan2.6-i2v(-flash)` 构造视频请求。

**Step 2: Run test to verify it fails**
Run: `pnpm -C apps/server test`
Expected: FAIL。

**Step 3: Write minimal implementation**
- `buildQwenRequestPayload` 增加视频模型分支：
  - 使用 `input.prompt`、`imageUrls` 首帧图、`parameters`（resolution/duration）。
  - 使用 DashScope video-synthesis 协议。
- `qwenAdapter.buildRequest` 为视频模型加入 `X-DashScope-Async: enable`。

**Step 4: Run test to verify it passes**
Run: `pnpm -C apps/server test`
Expected: PASS。

**Step 5: Commit**
```bash
git add apps/server/src/ai/models/qwen/qwenAdapter.ts apps/server/src/ai/models/qwen/qwenRequest.ts
git commit -m "feat: qwen video generation"
```

### Task 6: VideoGenerateNode 按模型参数渲染

**Files:**
- Modify: `apps/web/src/components/board/nodes/VideoGenerateNode.tsx`

**Step 1: Write the failing test**
新增 UI 测试，验证参数控件来自 `modelDefinition.parameters`。

**Step 2: Run test to verify it fails**
Run: `pnpm -C apps/web test`
Expected: FAIL。

**Step 3: Write minimal implementation**
- `VideoGenerateNodeProps` 增加 `parameters?: Record<string, string | number | boolean>`。
- 根据 `parameters.fields` 动态渲染控件（select/number/boolean/text）。
- 根据 `parameters.features` 控制：
  - `prompt`：允许文本输入与上游 text node。
  - `image_url_only`：仅允许图片 URL（过滤/提示），不再提交 base64。
  - `audio_url_only`：预留（当前无音频节点，但为未来扩展）。
  - `last_frame_support`：允许 2 个 image node（否则 1 个）。
- 运行时统一组装 `parameters` 并在请求中发送。
- 移除硬编码时长/比例 UI，改由参数驱动。

**Step 4: Run test to verify it passes**
Run: `pnpm -C apps/web test`
Expected: PASS。

**Step 5: Commit**
```bash
git add apps/web/src/components/board/nodes/VideoGenerateNode.tsx
git commit -m "feat: render video params by model"
```

---

Plan complete and saved to `docs/plans/2026-01-29-video-model-params.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
