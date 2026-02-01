# Server Structure Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce server-side SaaS integration sprawl by centralizing SDK usage, config, error mapping, and route wiring, while preparing clean modules for the SaaS image/video proxy described in `docs/plans/2026-01-31-saas-image-video-design.md`.

**Architecture:** Introduce a dedicated `modules/saas` integration layer (config + client + services) so routes become thin and AI modules no longer reach into auth or env directly. Add a model-list cache service and a placeholder image/video proxy service to align with the SaaS image/video plan.

**Tech Stack:** TypeScript, Hono, @tenas-saas/sdk, zod, undici/fetch.

**Constraints:** Per project rule, skip TDD tests and do not create a worktree; work on current branch.

---

### Task 1: Add a SaaS integration boundary (`modules/saas`)

**Files:**
- Create: `apps/server/src/modules/saas/saasConfig.ts`
- Create: `apps/server/src/modules/saas/saasClient.ts`
- Create: `apps/server/src/modules/saas/saasErrors.ts`
- Create: `apps/server/src/modules/saas/index.ts`

**Step 1: Create SaaS config helpers**

```ts
// apps/server/src/modules/saas/saasConfig.ts
import { getEnvString } from "@tenas-ai/config";

export function getSaasBaseUrl(): string {
  const value = getEnvString(process.env, "TENAS_SAAS_URL");
  if (!value || !value.trim()) throw new Error("saas_url_missing");
  return value.trim().replace(/\/$/, "");
}

export function getSaasAuthBaseUrl(): string {
  const value = getEnvString(process.env, "TENAS_SAAS_AUTH_URL");
  if (!value || !value.trim()) throw new Error("saas_auth_url_missing");
  return value.trim().replace(/\/$/, "");
}
```

**Step 2: Create cached SaaS client**

```ts
// apps/server/src/modules/saas/saasClient.ts
import { SaaSClient } from "@tenas-saas/sdk";
import { getSaasBaseUrl } from "./saasConfig";
import { getAccessToken } from "@/modules/auth/tokenStore";

let cached: { baseUrl: string; client: SaaSClient } | null = null;

export function getSaasClient(): SaaSClient {
  const baseUrl = getSaasBaseUrl();
  if (cached?.baseUrl === baseUrl) return cached.client;
  const client = new SaaSClient({
    baseUrl,
    getAccessToken: () => getAccessToken() ?? "",
  });
  cached = { baseUrl, client };
  return client;
}
```

**Step 3: Create SDK error mapper**

```ts
// apps/server/src/modules/saas/saasErrors.ts
import { SaaSHttpError, SaaSSchemaError, SaaSNetworkError } from "@tenas-saas/sdk";

export type SaasErrorResult = {
  status: number;
  code: "saas_request_failed" | "saas_invalid_payload" | "saas_network_failed";
  payload?: unknown;
  issues?: unknown;
  cause?: unknown;
};

export function mapSaasError(error: unknown): SaasErrorResult | null {
  if (error instanceof SaaSHttpError) {
    return { status: error.status, code: "saas_request_failed", payload: error.payload };
  }
  if (error instanceof SaaSSchemaError) {
    return { status: 502, code: "saas_invalid_payload", issues: error.issues };
  }
  if (error instanceof SaaSNetworkError) {
    return { status: 502, code: "saas_network_failed", cause: error.cause };
  }
  return null;
}
```

**Step 4: Add module exports**

```ts
// apps/server/src/modules/saas/index.ts
export { getSaasBaseUrl, getSaasAuthBaseUrl } from "./saasConfig";
export { getSaasClient } from "./saasClient";
export { mapSaasError } from "./saasErrors";
```

**Step 5: Commit**

```bash
git add apps/server/src/modules/saas/saasConfig.ts \
  apps/server/src/modules/saas/saasClient.ts \
  apps/server/src/modules/saas/saasErrors.ts \
  apps/server/src/modules/saas/index.ts
git commit -m "refactor(server): add saas integration boundary"
```

---

### Task 2: Extract SaaS auth + balance services

**Files:**
- Create: `apps/server/src/modules/saas/saasAuthService.ts`
- Create: `apps/server/src/modules/saas/saasLlmService.ts`
- Modify: `apps/server/src/modules/saas/index.ts`

**Step 1: Add auth refresh service**

```ts
// apps/server/src/modules/saas/saasAuthService.ts
import type { AuthRefreshResponse } from "@tenas-saas/sdk";
import { getSaasClient } from "./saasClient";

export async function refreshAccessToken(refreshToken: string): Promise<AuthRefreshResponse> {
  const client = getSaasClient();
  return client.auth.refresh(refreshToken);
}
```

**Step 2: Add balance service**

```ts
// apps/server/src/modules/saas/saasLlmService.ts
import { getSaasClient } from "./saasClient";

export async function fetchBalance() {
  const client = getSaasClient();
  return client.llm.balance();
}
```

**Step 3: Export services**

```ts
// apps/server/src/modules/saas/index.ts
export { refreshAccessToken } from "./saasAuthService";
export { fetchBalance } from "./saasLlmService";
```

**Step 4: Commit**

```bash
git add apps/server/src/modules/saas/saasAuthService.ts \
  apps/server/src/modules/saas/saasLlmService.ts \
  apps/server/src/modules/saas/index.ts
git commit -m "refactor(server): extract saas auth/llm services"
```

---

### Task 3: Thin out auth routes using SaaS services

**Files:**
- Modify: `apps/server/src/modules/auth/authRoutes.ts`

**Step 1: Replace inline SDK usage with services + error mapper**

```ts
import { fetchBalance, mapSaasError, refreshAccessToken } from "@/modules/saas";
```

**Step 2: Balance route**

```ts
const payload = await fetchBalance();
// ... existing response shaping ...
```

**Step 3: Refresh function**

```ts
const payload = await refreshAccessToken(input.refreshToken);
// ... normalize payload / errors ...
```

**Step 4: Replace SDK error handling with mapSaasError**

```ts
const mapped = mapSaasError(error);
if (mapped) {
  // log and return mapped.status
}
```

**Step 5: Commit**

```bash
git add apps/server/src/modules/auth/authRoutes.ts
git commit -m "refactor(server): use saas services in auth routes"
```

---

### Task 4: Centralize SaaS model list + cache (preparing for image/video plan)

**Files:**
- Create: `apps/server/src/modules/saas/saasModelService.ts`
- Modify: `apps/server/src/ai/models/cloudModelRoutes.ts`
- Modify: `apps/server/src/ai/models/resolveChatModel.ts`
- Modify: `apps/server/src/modules/saas/index.ts`

**Step 1: Add cached model list service**

```ts
// apps/server/src/modules/saas/saasModelService.ts
import { getSaasBaseUrl } from "./saasConfig";
import { getAccessToken } from "@/modules/auth/tokenStore";

type ModelListPayload = { success: boolean; data: unknown[] };

let cached: { updatedAt: number; payload: ModelListPayload | null } = {
  updatedAt: 0,
  payload: null,
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchModelList(): Promise<ModelListPayload> {
  const now = Date.now();
  if (cached.payload && now - cached.updatedAt < CACHE_TTL_MS) {
    return cached.payload;
  }
  const baseUrl = getSaasBaseUrl();
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}/api/llm/models`, { headers });
  const payload = (await response.json().catch(() => null)) as ModelListPayload | null;
  if (!response.ok || !payload) {
    return cached.payload ?? { success: false, data: [] };
  }
  cached = { updatedAt: now, payload };
  return payload;
}
```

**Step 2: Use service in cloudModelRoutes**

```ts
import { fetchModelList } from "@/modules/saas";
// ...
const payload = await fetchModelList();
return c.json(payload ?? { success: false, data: [] });
```

**Step 3: Use service in resolveChatModel**

```ts
import { fetchModelList } from "@/modules/saas";
// ...
const payload = await fetchModelList();
// validate payload, then build providers
```

**Step 4: Export service**

```ts
export { fetchModelList } from "./saasModelService";
```

**Step 5: Commit**

```bash
git add apps/server/src/modules/saas/saasModelService.ts \
  apps/server/src/ai/models/cloudModelRoutes.ts \
  apps/server/src/ai/models/resolveChatModel.ts \
  apps/server/src/modules/saas/index.ts
git commit -m "refactor(server): centralize saas model list cache"
```

---

### Task 5: Add image/video SaaS proxy skeleton (align with 2026-01-31 plan)

**Files:**
- Create: `apps/server/src/modules/saas/saasMediaService.ts`
- Create: `apps/server/src/ai/interface/routes/saasMediaRoutes.ts`
- Modify: `apps/server/src/bootstrap/createApp.ts`

**Step 1: Create media service skeleton (no business logic yet)**

```ts
// apps/server/src/modules/saas/saasMediaService.ts
export type SaasMediaSubmitArgs = {
  modelId: string;
  input: Record<string, unknown>;
};

export type SaasMediaTaskResult = {
  taskId: string;
  status: "queued" | "running" | "succeeded" | "failed";
  resultUrls?: string[];
};

export async function submitMediaTask(_input: SaasMediaSubmitArgs): Promise<SaasMediaTaskResult> {
  throw new Error("not_implemented");
}

export async function pollMediaTask(_taskId: string): Promise<SaasMediaTaskResult> {
  throw new Error("not_implemented");
}
```

**Step 2: Add route skeleton**

```ts
// apps/server/src/ai/interface/routes/saasMediaRoutes.ts
import type { Hono } from "hono";

export function registerSaasMediaRoutes(app: Hono): void {
  app.post("/ai/image", (c) => c.json({ error: "not_implemented" }, 501));
  app.post("/ai/vedio", (c) => c.json({ error: "not_implemented" }, 501));
}
```

**Step 3: Wire routes**

```ts
// apps/server/src/bootstrap/createApp.ts
import { registerSaasMediaRoutes } from "@/ai/interface/routes/saasMediaRoutes";
// ...
registerSaasMediaRoutes(app);
```

**Step 4: Commit**

```bash
git add apps/server/src/modules/saas/saasMediaService.ts \
  apps/server/src/ai/interface/routes/saasMediaRoutes.ts \
  apps/server/src/bootstrap/createApp.ts
git commit -m "refactor(server): scaffold saas media proxy routes"
```

---

### Task 6: Consolidate SaaS login URL building

**Files:**
- Modify: `apps/server/src/modules/auth/authRoutes.ts`
- Modify: `apps/server/src/modules/saas/saasConfig.ts`

**Step 1: Move login URL construction to saasConfig**

```ts
// apps/server/src/modules/saas/saasConfig.ts
export function buildSaasLoginUrl(port: number): string {
  const base = getSaasAuthBaseUrl();
  const url = new URL(`${base}/login`);
  url.searchParams.set("from", "electron");
  url.searchParams.set("port", String(port));
  return url.toString();
}
```

**Step 2: Use buildSaasLoginUrl in authRoutes**

```ts
import { buildSaasLoginUrl } from "@/modules/saas";
// ...
const authorizeUrl = buildSaasLoginUrl(getServerPort());
```

**Step 3: Commit**

```bash
git add apps/server/src/modules/saas/saasConfig.ts \
  apps/server/src/modules/auth/authRoutes.ts
git commit -m "refactor(server): centralize saas login url builder"
```

