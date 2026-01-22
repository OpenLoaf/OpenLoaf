# Auto Summary Scheduler Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add daily auto-summary scheduling with project/workspace overrides, one-off range summaries, summary storage in `.tenas/summary`, manual single-day trigger, and status querying.

**Architecture:** Use a scheduler adapter to trigger background summary tasks. Summary tasks decide daily vs one-off based on last summary time, generate markdown with YAML frontmatter, append to `summary.jsonl`, and update `project.md`. tRPC endpoints expose manual trigger and status; a server-side summary runtime is injected into API router.

**Tech Stack:** TypeScript, Node fs/path, Hono + tRPC, AI SDK (server), workspace/project config services.

> Note: Project rules say to skip TDD and avoid worktrees when using superpowers skills; testing steps below are manual checks only.

---

### Task 1: Add summary storage + date helpers

**Files:**
- Create: `packages/api/src/services/summaryStorage.ts`
- Create: `packages/api/src/services/summaryDateUtils.ts`

**Step 1: Implement summary storage types and JSONL IO**

```ts
// packages/api/src/services/summaryStorage.ts
import { promises as fs } from "node:fs";
import path from "node:path";

export type SummaryIndexRecord = {
  projectId: string;
  filePath: string;
  dates: string[]; // YYYY-MM-DD list
  status: "queued" | "running" | "success" | "failed";
  triggeredBy: "scheduler" | "manual" | "external";
  timezone: string;
};

export type SummaryFrontmatter = {
  summaryId: string;
  projectId: string;
  dates: string[];
  createdAt: string;
  updatedAt: string;
  triggeredBy: "scheduler" | "manual" | "external";
};

const SUMMARY_DIR_NAME = ".tenas/summary";
const SUMMARY_INDEX_FILE = "summary.jsonl";

export function getSummaryDir(rootPath: string): string {
  return path.join(rootPath, SUMMARY_DIR_NAME);
}

export function getSummaryIndexPath(rootPath: string): string {
  return path.join(getSummaryDir(rootPath), SUMMARY_INDEX_FILE);
}

export async function appendSummaryIndex(
  rootPath: string,
  record: SummaryIndexRecord,
): Promise<void> {
  const dir = getSummaryDir(rootPath);
  await fs.mkdir(dir, { recursive: true });
  const line = `${JSON.stringify(record)}\n`;
  await fs.appendFile(getSummaryIndexPath(rootPath), line, "utf-8");
}

export async function readSummaryIndex(rootPath: string): Promise<SummaryIndexRecord[]> {
  try {
    const raw = await fs.readFile(getSummaryIndexPath(rootPath), "utf-8");
    return raw
      .split(/\n+/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SummaryIndexRecord);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export function buildFrontmatter(meta: SummaryFrontmatter): string {
  const lines = [
    "---",
    `summaryId: ${meta.summaryId}`,
    `projectId: ${meta.projectId}`,
    `dates: [${meta.dates.map((d) => `\"${d}\"`).join(", ")}]`,
    `createdAt: ${meta.createdAt}`,
    `updatedAt: ${meta.updatedAt}`,
    `triggeredBy: ${meta.triggeredBy}`,
    "---",
    "",
  ];
  return lines.join("\n");
}

export async function writeSummaryMarkdown(input: {
  rootPath: string;
  fileName: string;
  frontmatter: SummaryFrontmatter;
  content: string;
}): Promise<string> {
  const dir = getSummaryDir(input.rootPath);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, input.fileName);
  const body = `${buildFrontmatter(input.frontmatter)}${input.content.trim()}\n`;
  await fs.writeFile(filePath, body, "utf-8");
  return filePath;
}
```

**Step 2: Add date utilities (natural day split)**

```ts
// packages/api/src/services/summaryDateUtils.ts
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string): Date {
  const [y, m, d] = value.split("-").map((n) => Number(n));
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function listDateKeysInRange(start: Date, end: Date): string[] {
  const keys: string[] = [];
  let cursor = startOfDay(start);
  const endDay = startOfDay(end);
  while (cursor <= endDay) {
    keys.push(formatDateKey(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return keys;
}
```

---

### Task 2: Add git commit range helper (summary data source)

**Files:**
- Modify: `packages/api/src/services/projectGitService.ts`

**Step 1: Add a date-range commit fetcher**

```ts
// packages/api/src/services/projectGitService.ts
export async function getProjectGitCommitsInRange(input: {
  projectId: string;
  from: Date;
  to: Date;
}): Promise<ProjectGitCommit[]> {
  const commits: ProjectGitCommit[] = [];
  let cursor: string | null = null;
  while (true) {
    const page = await getProjectGitCommits({
      projectId: input.projectId,
      cursor,
      pageSize: 50,
    });
    if (!page.isGitProject) return [];
    for (const item of page.items) {
      const authoredAt = new Date(item.authoredAt);
      if (authoredAt < input.from) return commits;
      if (authoredAt <= input.to) commits.push(item);
    }
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return commits;
}
```

---

### Task 3: Implement summary generator (server AI)

**Files:**
- Create: `apps/server/src/ai/application/services/summary/summaryGenerator.ts`
- Modify: `apps/server/src/ai/application/use-cases/SummaryDayUseCase.ts`
- Modify: `apps/server/src/ai/application/use-cases/SummaryProjectUseCase.ts`
- Modify: `apps/server/src/ai/application/use-cases/UpdateProjectSummaryUseCase.ts`

**Step 1: Create summary generator**

```ts
// apps/server/src/ai/application/services/summary/summaryGenerator.ts
import { generateText } from "ai";
import { resolveChatModel } from "@/ai/resolveChatModel";
import { readBasicConf } from "@/modules/settings/tenasConfStore";
import type { ProjectGitCommit } from "@tenas-ai/api/services/projectGitService";

export async function generateDailySummary(input: {
  projectName: string;
  dateKey: string;
  commits: ProjectGitCommit[];
}): Promise<string> {
  const basic = readBasicConf();
  const resolved = await resolveChatModel({
    chatModelId: basic.modelDefaultChatModelId,
  });
  const commitLines = input.commits.map(
    (commit) => `- ${commit.summary} (${commit.shortOid}, ${commit.authorName ?? ""})`,
  );
  const prompt = [
    `你是项目总结助手。请输出 ${input.dateKey} 的项目总结：`,
    `项目：${input.projectName}`,
    "变更列表：",
    commitLines.length ? commitLines.join("\n") : "- 当天无提交记录",
    "要求：简洁、条理清晰、只输出 Markdown。",
  ].join("\n");

  const result = await generateText({
    model: resolved.model,
    prompt,
  });
  return result.text ?? "";
}

export async function generateRangeSummary(input: {
  projectName: string;
  from: string;
  to: string;
  commits: ProjectGitCommit[];
}): Promise<string> {
  const basic = readBasicConf();
  const resolved = await resolveChatModel({
    chatModelId: basic.modelDefaultChatModelId,
  });
  const commitLines = input.commits.map(
    (commit) => `- ${commit.summary} (${commit.shortOid}, ${commit.authorName ?? ""})`,
  );
  const prompt = [
    `你是项目总结助手。请输出 ${input.from} 到 ${input.to} 的项目总结：`,
    `项目：${input.projectName}`,
    "变更列表：",
    commitLines.length ? commitLines.join("\n") : "- 区间内无提交记录",
    "要求：概览 + 重点变化 + 风险点（若无则省略）。",
  ].join("\n");

  const result = await generateText({
    model: resolved.model,
    prompt,
  });
  return result.text ?? "";
}
```

**Step 2: Wire SummaryDayUseCase**

```ts
// apps/server/src/ai/application/use-cases/SummaryDayUseCase.ts
import { getProjectRootUri } from "@tenas-ai/api/services/vfsService";
import { resolveFilePathFromUri } from "@tenas-ai/api/services/vfsService";
import { getProjectGitCommitsInRange } from "@tenas-ai/api/services/projectGitService";
import { formatDateKey, parseDateKey, startOfDay, endOfDay } from "@tenas-ai/api/services/summaryDateUtils";
import { appendSummaryIndex, writeSummaryMarkdown } from "@tenas-ai/api/services/summaryStorage";
import { generateDailySummary } from "@/ai/application/services/summary/summaryGenerator";
import { randomUUID } from "node:crypto";

export class SummaryDayUseCase {
  /** Execute day summary. */
  async execute(input: { projectId: string; dateKey: string; triggeredBy: "scheduler" | "manual" | "external"; timezone: string; }): Promise<void> {
    const rootUri = getProjectRootUri(input.projectId);
    if (!rootUri) throw new Error("项目不存在");
    const rootPath = resolveFilePathFromUri(rootUri);
    const start = startOfDay(parseDateKey(input.dateKey));
    const end = endOfDay(parseDateKey(input.dateKey));
    const commits = await getProjectGitCommitsInRange({ projectId: input.projectId, from: start, to: end });
    const content = await generateDailySummary({ projectName: input.projectId, dateKey: input.dateKey, commits });

    const summaryId = randomUUID();
    const nowIso = new Date().toISOString();
    const fileName = `${input.dateKey}.md`;
    const filePath = await writeSummaryMarkdown({
      rootPath,
      fileName,
      frontmatter: {
        summaryId,
        projectId: input.projectId,
        dates: [input.dateKey],
        createdAt: nowIso,
        updatedAt: nowIso,
        triggeredBy: input.triggeredBy,
      },
      content,
    });

    await appendSummaryIndex(rootPath, {
      projectId: input.projectId,
      filePath,
      dates: [input.dateKey],
      status: "success",
      triggeredBy: input.triggeredBy,
      timezone: input.timezone,
    });
  }
}
```

**Step 3: Wire SummaryProjectUseCase & UpdateProjectSummaryUseCase**

```ts
// apps/server/src/ai/application/use-cases/SummaryProjectUseCase.ts
import { getProjectRootUri, resolveFilePathFromUri } from "@tenas-ai/api/services/vfsService";
import { getProjectGitCommitsInRange } from "@tenas-ai/api/services/projectGitService";
import { appendSummaryIndex, writeSummaryMarkdown } from "@tenas-ai/api/services/summaryStorage";
import { generateRangeSummary } from "@/ai/application/services/summary/summaryGenerator";
import { randomUUID } from "node:crypto";

export class SummaryProjectUseCase {
  /** Execute project summary. */
  async execute(input: { projectId: string; dates: string[]; from: Date; to: Date; triggeredBy: "scheduler" | "manual" | "external"; timezone: string; }): Promise<void> {
    const rootUri = getProjectRootUri(input.projectId);
    if (!rootUri) throw new Error("项目不存在");
    const rootPath = resolveFilePathFromUri(rootUri);
    const commits = await getProjectGitCommitsInRange({ projectId: input.projectId, from: input.from, to: input.to });
    const fromKey = input.dates[0];
    const toKey = input.dates[input.dates.length - 1];
    const content = await generateRangeSummary({ projectName: input.projectId, from: fromKey, to: toKey, commits });

    const summaryId = randomUUID();
    const nowIso = new Date().toISOString();
    const fileName = `${fromKey}_${toKey}.md`;
    const filePath = await writeSummaryMarkdown({
      rootPath,
      fileName,
      frontmatter: {
        summaryId,
        projectId: input.projectId,
        dates: input.dates,
        createdAt: nowIso,
        updatedAt: nowIso,
        triggeredBy: input.triggeredBy,
      },
      content,
    });

    await appendSummaryIndex(rootPath, {
      projectId: input.projectId,
      filePath,
      dates: input.dates,
      status: "success",
      triggeredBy: input.triggeredBy,
      timezone: input.timezone,
    });
  }
}
```

```ts
// apps/server/src/ai/application/use-cases/UpdateProjectSummaryUseCase.ts
import { getProjectRootUri, resolveFilePathFromUri } from "@tenas-ai/api/services/vfsService";
import { writeSummaryMarkdown } from "@tenas-ai/api/services/summaryStorage";
import { randomUUID } from "node:crypto";

export class UpdateProjectSummaryUseCase {
  /** Execute project summary update. */
  async execute(input: { projectId: string; content: string; triggeredBy: "scheduler" | "manual" | "external"; timezone: string; }): Promise<void> {
    const rootUri = getProjectRootUri(input.projectId);
    if (!rootUri) throw new Error("项目不存在");
    const rootPath = resolveFilePathFromUri(rootUri);
    const summaryId = randomUUID();
    const nowIso = new Date().toISOString();
    await writeSummaryMarkdown({
      rootPath,
      fileName: "project.md",
      frontmatter: {
        summaryId,
        projectId: input.projectId,
        dates: [],
        createdAt: nowIso,
        updatedAt: nowIso,
        triggeredBy: input.triggeredBy,
      },
      content: input.content,
    });
  }
}
```

---

### Task 4: Implement background tasks + scheduler + status store

**Files:**
- Modify: `apps/server/src/ai/application/ports/TaskStatusRepository.ts`
- Create: `apps/server/src/ai/infrastructure/repositories/InMemoryTaskStatusRepository.ts`
- Modify: `apps/server/src/ai/application/services/BackgroundTaskService.ts`
- Modify: `apps/server/src/ai/infrastructure/adapters/SchedulerAdapters.ts`
- Create: `apps/server/src/ai/application/services/summary/summaryScheduler.ts`
- Modify: `apps/server/src/index.ts`

**Step 1: Extend task status repository for listing**

```ts
// apps/server/src/ai/application/ports/TaskStatusRepository.ts
export interface TaskStatusRepository {
  upsertStatus(record: TaskStatusRecord): Promise<void>;
  getStatus(taskId: string): Promise<TaskStatusRecord | null>;
  listStatuses?(filter?: { projectId?: string; workspaceId?: string; status?: TaskStatusValue[] }): Promise<TaskStatusRecord[]>;
}
```

**Step 2: Add in-memory status repository**

```ts
// apps/server/src/ai/infrastructure/repositories/InMemoryTaskStatusRepository.ts
import type { TaskStatusRecord, TaskStatusRepository, TaskStatusValue } from "@/ai/application/ports/TaskStatusRepository";

export class InMemoryTaskStatusRepository implements TaskStatusRepository {
  private readonly store = new Map<string, TaskStatusRecord>();

  async upsertStatus(record: TaskStatusRecord): Promise<void> {
    this.store.set(record.taskId, record);
  }

  async getStatus(taskId: string): Promise<TaskStatusRecord | null> {
    return this.store.get(taskId) ?? null;
  }

  async listStatuses(filter?: { projectId?: string; workspaceId?: string; status?: TaskStatusValue[] }): Promise<TaskStatusRecord[]> {
    const statuses = Array.from(this.store.values());
    if (!filter) return statuses;
    return statuses.filter((record) => {
      if (filter.projectId && record.metadata?.projectId !== filter.projectId) return false;
      if (filter.workspaceId && record.metadata?.workspaceId !== filter.workspaceId) return false;
      if (filter.status && !filter.status.includes(record.status)) return false;
      return true;
    });
  }
}
```

**Step 3: Implement BackgroundTaskService orchestration**

```ts
// apps/server/src/ai/application/services/BackgroundTaskService.ts
import { readSummaryIndex } from "@tenas-ai/api/services/summaryStorage";
import { listDateKeysInRange, parseDateKey, startOfDay } from "@tenas-ai/api/services/summaryDateUtils";
import { SummaryDayUseCase } from "@/ai/application/use-cases/SummaryDayUseCase";
import { SummaryProjectUseCase } from "@/ai/application/use-cases/SummaryProjectUseCase";
import type { TaskStatusRepository } from "@/ai/application/ports/TaskStatusRepository";

export class BackgroundTaskService {
  constructor(
    private readonly taskStatusRepo: TaskStatusRepository,
    private readonly summaryDayUseCase: SummaryDayUseCase,
    private readonly summaryProjectUseCase: SummaryProjectUseCase,
  ) {}

  /** Execute background summary task. */
  async run(input: {
    taskId: string;
    projectId: string;
    rootPath: string;
    now: Date;
    triggeredBy: "scheduler" | "manual" | "external";
    forceDateKey?: string;
    timezone: string;
  }): Promise<void> {
    await this.taskStatusRepo.upsertStatus({
      taskId: input.taskId,
      status: "running",
      metadata: { projectId: input.projectId },
    });

    const summaries = await readSummaryIndex(input.rootPath);
    const lastSummary = summaries.at(-1);
    const lastAt = lastSummary ? new Date(lastSummary as any).toISOString() : null;
    const now = input.now;

    if (input.forceDateKey) {
      await this.summaryDayUseCase.execute({
        projectId: input.projectId,
        dateKey: input.forceDateKey,
        triggeredBy: input.triggeredBy,
        timezone: input.timezone,
      });
    } else {
      const lastTime = lastSummary ? new Date(lastSummary as any) : null;
      if (lastTime && now.getTime() - lastTime.getTime() > 5 * 24 * 60 * 60 * 1000) {
        const dates = listDateKeysInRange(lastTime, now);
        const from = startOfDay(parseDateKey(dates[0]));
        const to = now;
        await this.summaryProjectUseCase.execute({
          projectId: input.projectId,
          dates,
          from,
          to,
          triggeredBy: input.triggeredBy,
          timezone: input.timezone,
        });
      } else {
        const start = lastTime ?? now;
        const dates = listDateKeysInRange(start, now);
        for (const dateKey of dates) {
          await this.summaryDayUseCase.execute({
            projectId: input.projectId,
            dateKey,
            triggeredBy: input.triggeredBy,
            timezone: input.timezone,
          });
        }
      }
    }

    await this.taskStatusRepo.upsertStatus({
      taskId: input.taskId,
      status: "completed",
      metadata: { projectId: input.projectId },
    });
  }
}
```

**Step 4: Implement scheduler adapters and init**

```ts
// apps/server/src/ai/infrastructure/adapters/SchedulerAdapters.ts
import type { ScheduleJobInput, SchedulerPort } from "@/ai/application/ports/SchedulerPort";

export class InProcessSchedulerAdapter implements SchedulerPort {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  async schedule(input: ScheduleJobInput): Promise<void> {
    await this.cancel(input.jobId);
    const delay = Math.max(0, input.runAt.getTime() - Date.now());
    const timer = setTimeout(() => {
      (input.payload as (() => void) | undefined)?.();
      this.timers.delete(input.jobId);
    }, delay);
    this.timers.set(input.jobId, timer);
  }

  async cancel(jobId: string): Promise<void> {
    const timer = this.timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobId);
    }
  }
}
```

```ts
// apps/server/src/ai/application/services/summary/summaryScheduler.ts
import { readWorkspaceProjectTrees } from "@tenas-ai/api/services/projectTreeService";
import { getProjectRootPath, getWorkspaceRootPathById } from "@tenas-ai/api/services/vfsService";
import { readBasicConf } from "@/modules/settings/tenasConfStore";
import { SummaryDayUseCase } from "@/ai/application/use-cases/SummaryDayUseCase";
import { SummaryProjectUseCase } from "@/ai/application/use-cases/SummaryProjectUseCase";
import { BackgroundTaskService } from "@/ai/application/services/BackgroundTaskService";
import { InMemoryTaskStatusRepository } from "@/ai/infrastructure/repositories/InMemoryTaskStatusRepository";
import { InProcessSchedulerAdapter } from "@/ai/infrastructure/adapters/SchedulerAdapters";
import { randomUUID } from "node:crypto";

export class SummaryScheduler {
  private readonly scheduler = new InProcessSchedulerAdapter();
  private readonly taskStatus = new InMemoryTaskStatusRepository();
  private readonly runner = new BackgroundTaskService(
    this.taskStatus,
    new SummaryDayUseCase(),
    new SummaryProjectUseCase(),
  );

  async scheduleAll(): Promise<void> {
    const workspaceTrees = await readWorkspaceProjectTrees();
    const basic = readBasicConf();
    const hourList = basic.autoSummaryHours;
    if (!basic.autoSummaryEnabled || hourList.length === 0) return;

    for (const tree of workspaceTrees) {
      for (const node of tree.projects) {
        const rootPath = getProjectRootPath(node.id, tree.workspaceId);
        if (!rootPath) continue;
        for (const hour of hourList) {
          const runAt = nextRunAt(hour);
          const jobId = `summary:${node.id}:${hour}`;
          await this.scheduler.schedule({
            jobId,
            runAt,
            payload: () => void this.runner.run({
              taskId: randomUUID(),
              projectId: node.id,
              rootPath,
              now: new Date(),
              triggeredBy: "scheduler",
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
          });
        }
      }
    }
  }

  getStatusRepo() {
    return this.taskStatus;
  }

  getRunner() {
    return this.runner;
  }
}

function nextRunAt(hour: number): Date {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
  if (next <= now) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, 0, 0, 0);
  }
  return next;
}
```

```ts
// apps/server/src/index.ts
import { initSummaryScheduler } from "@/modules/summary/summaryBootstrap";
// after startServer()
void initSummaryScheduler();
```

---

### Task 5: Add summary runtime injection + tRPC endpoints

**Files:**
- Create: `packages/api/src/services/summaryRuntime.ts`
- Modify: `packages/api/src/routers/project.ts`
- Create: `apps/server/src/modules/summary/summaryBootstrap.ts`

**Step 1: Create runtime injection helpers**

```ts
// packages/api/src/services/summaryRuntime.ts
export type SummaryRuntime = {
  runDailySummary: (input: { projectId: string; dateKey: string; triggeredBy: "manual" | "external" }) => Promise<{ taskId: string }>;
  getTaskStatus: (input: { taskId: string }) => Promise<{ taskId: string; status: string; metadata?: Record<string, unknown> } | null>;
  listTaskStatus: (input: { projectId?: string; workspaceId?: string }) => Promise<Array<{ taskId: string; status: string; metadata?: Record<string, unknown> }>>;
};

let runtime: SummaryRuntime | null = null;

export function setSummaryRuntime(next: SummaryRuntime): void {
  runtime = next;
}

export function requireSummaryRuntime(): SummaryRuntime {
  if (!runtime) throw new Error("Summary runtime not registered");
  return runtime;
}
```

**Step 2: Add tRPC endpoints**

```ts
// packages/api/src/routers/project.ts
import { requireSummaryRuntime } from "../services/summaryRuntime";

// ... inside projectRouter
runSummaryForDay: shieldedProcedure
  .input(z.object({ projectId: z.string(), dateKey: z.string() }))
  .mutation(async ({ input }) => {
    const runtime = requireSummaryRuntime();
    return runtime.runDailySummary({ projectId: input.projectId, dateKey: input.dateKey, triggeredBy: "manual" });
  }),
getSummaryTaskStatus: shieldedProcedure
  .input(z.object({ taskId: z.string() }))
  .query(async ({ input }) => {
    const runtime = requireSummaryRuntime();
    return runtime.getTaskStatus({ taskId: input.taskId });
  }),
listSummaryTaskStatus: shieldedProcedure
  .input(z.object({ projectId: z.string().optional(), workspaceId: z.string().optional() }))
  .query(async ({ input }) => {
    const runtime = requireSummaryRuntime();
    return runtime.listTaskStatus(input);
  }),
```

**Step 3: Implement server runtime and bootstrap**

```ts
// apps/server/src/modules/summary/summaryBootstrap.ts
import { setSummaryRuntime } from "@tenas-ai/api/services/summaryRuntime";
import { SummaryScheduler } from "@/ai/application/services/summary/summaryScheduler";
import { getProjectRootPath } from "@tenas-ai/api/services/vfsService";
import { randomUUID } from "node:crypto";

export async function initSummaryScheduler(): Promise<void> {
  const scheduler = new SummaryScheduler();
  await scheduler.scheduleAll();
  const runner = scheduler.getRunner();
  const statusRepo = scheduler.getStatusRepo();

  setSummaryRuntime({
    runDailySummary: async ({ projectId, dateKey, triggeredBy }) => {
      const rootPath = getProjectRootPath(projectId);
      if (!rootPath) throw new Error("Project not found");
      const taskId = randomUUID();
      await runner.run({
        taskId,
        projectId,
        rootPath,
        now: new Date(),
        triggeredBy,
        forceDateKey: dateKey,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      return { taskId };
    },
    getTaskStatus: async ({ taskId }) => statusRepo.getStatus(taskId),
    listTaskStatus: async (filter) => statusRepo.listStatuses?.({
      projectId: filter.projectId,
      workspaceId: filter.workspaceId,
    }) ?? [],
  });
}
```

---

### Task 6: Update Project AI settings UI with manual trigger

**Files:**
- Modify: `apps/web/src/components/project/settings/menus/ProjectAiSettings.tsx`

**Step 1: Add manual trigger popover**

```tsx
// apps/web/src/components/project/settings/menus/ProjectAiSettings.tsx
const runSummary = useMutation(
  trpc.project.runSummaryForDay.mutationOptions(),
);

const [manualDate, setManualDate] = useState<string>(""");

function handleRunSummary() {
  if (!projectId || !manualDate) return;
  runSummary.mutate({ projectId, dateKey: manualDate });
}
```

```tsx
// inside render block
<div className="flex flex-wrap items-start gap-2 py-3">
  <div className="min-w-0 flex-1">
    <div className="text-sm font-medium">立即触发</div>
    <div className="text-xs text-muted-foreground">选择任意日期进行日汇总（覆盖同日记录）</div>
  </div>
  <TenasSettingsField className="w-full sm:w-[360px] shrink-0">
    <div className="flex items-center justify-end gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline">执行</Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[240px]">
          <div className="space-y-3">
            <input
              type="date"
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
              value={manualDate}
              onChange={(event) => setManualDate(event.target.value)}
            />
            <Button type="button" onClick={handleRunSummary} disabled={!manualDate || runSummary.isPending}>
              立即触发
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  </TenasSettingsField>
</div>
```

---

### Manual checks (no automated tests per project rule)

- Trigger `runSummaryForDay` from UI; verify `.tenas/summary/YYYY-MM-DD.md` exists and has YAML frontmatter.
- Trigger auto scheduler by adjusting system clock/hour list; verify `summary.jsonl` appended.
- Verify one-off summary file `YYYY-MM-DD_YYYY-MM-DD.md` when `lastSummaryTime > 5 days`.
- Check `listSummaryTaskStatus` returns running task during execution.

---

Plan complete and saved to `docs/plans/2026-01-20-auto-summary-scheduler.md`.

Two execution options:
1. Subagent-Driven (this session)
2. Parallel Session (separate)

Which approach?
