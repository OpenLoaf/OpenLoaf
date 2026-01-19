# CLI Environment Info Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a settings view that shows supported command-line environment (bash or PowerShell) with path and version.

**Architecture:** Add a server-side settings query that resolves shell info per host OS, then render it in the Third-Party Tools settings panel. The UI reads the data via existing tRPC settings client and shows platform-specific labels with graceful fallbacks.

**Tech Stack:** Next.js (app), tRPC, TanStack Query, Node.js child_process.

### Task 1: Add server-side shell info resolver

**Files:**
- Create: `apps/server/src/modules/settings/resolveSystemCliInfo.ts`

**Step 1: Implement resolver**

```ts
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 2000;

export type SystemCliInfo = {
  platform: "darwin" | "linux" | "win32" | "unknown";
  shell: {
    name: "bash" | "powershell" | "unknown";
    available: boolean;
    path?: string;
    version?: string;
  };
};

function normalizePlatform(): SystemCliInfo["platform"] {
  const platform = os.platform();
  if (platform === "darwin" || platform === "linux" || platform === "win32") return platform;
  return "unknown";
}

async function runCommand(command: string, args: string[]) {
  const result = await execFileAsync(command, args, {
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: 1024 * 256,
  });
  return result.stdout.trim();
}

export async function resolveSystemCliInfo(): Promise<SystemCliInfo> {
  const platform = normalizePlatform();

  if (platform === "win32") {
    try {
      const path = await runCommand("where", ["powershell"]);
      const version = await runCommand("powershell", ["-Command", "$PSVersionTable.PSVersion.ToString()"]);
      return {
        platform,
        shell: {
          name: "powershell",
          available: Boolean(path),
          path: path ? path.split(/\r?\n/)[0] : undefined,
          version: version || undefined,
        },
      };
    } catch {
      return { platform, shell: { name: "powershell", available: false } };
    }
  }

  if (platform === "darwin" || platform === "linux") {
    try {
      const path = await runCommand("command", ["-v", "bash"]);
      const versionLine = await runCommand("bash", ["--version"]);
      const version = versionLine.split(/\r?\n/)[0];
      return {
        platform,
        shell: {
          name: "bash",
          available: Boolean(path),
          path: path || undefined,
          version: version || undefined,
        },
      };
    } catch {
      return { platform, shell: { name: "bash", available: false } };
    }
  }

  return { platform: "unknown", shell: { name: "unknown", available: false } };
}
```

### Task 2: Expose settings query

**Files:**
- Modify: `apps/server/src/routers/settings.ts`
- Modify: `packages/api/src/routers/absSetting.ts`

**Step 1: Add API schema**

```ts
const systemCliInfoSchema = z.object({
  platform: z.enum(["darwin", "linux", "win32", "unknown"]),
  shell: z.object({
    name: z.enum(["bash", "powershell", "unknown"]),
    available: z.boolean(),
    path: z.string().optional(),
    version: z.string().optional(),
  }),
});
```

**Step 2: Add route to settings router**

```ts
import { resolveSystemCliInfo } from "@/modules/settings/resolveSystemCliInfo";

systemCliInfo: shieldedProcedure.query(async () => {
  return await resolveSystemCliInfo();
}),
```

### Task 3: Render in settings UI

**Files:**
- Modify: `apps/web/src/components/setting/menus/ThirdPartyTools.tsx`

**Step 1: Add query and render**

```tsx
const systemCliInfoQuery = useQuery({
  ...trpc.settings.systemCliInfo.queryOptions(),
  staleTime: 30_000,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
});

const systemCliInfo = systemCliInfoQuery.data;
const isSystemCliLoading = systemCliInfoQuery.isLoading && !systemCliInfo;

const platformLabel = useMemo(() => {
  if (!systemCliInfo) return "未知系统";
  if (systemCliInfo.platform === "darwin") return "macOS";
  if (systemCliInfo.platform === "linux") return "Linux";
  if (systemCliInfo.platform === "win32") return "Windows";
  return "未知系统";
}, [systemCliInfo]);

const shellLabel = useMemo(() => {
  if (isSystemCliLoading) return "检测中";
  if (!systemCliInfo?.shell.available) return "未检测到命令行支持";
  const name = systemCliInfo.shell.name === "powershell" ? "PowerShell" : "bash";
  const version = systemCliInfo.shell.version ? ` v${systemCliInfo.shell.version}` : "";
  const path = systemCliInfo.shell.path ? ` · 路径：${systemCliInfo.shell.path}` : "";
  return `${name}${version}${path}`;
}, [isSystemCliLoading, systemCliInfo]);
```

### Task 4: Optional verification

**Step 1: Manual check**
- Open settings page in web app and confirm the “命令行环境” line displays OS + shell details.

