# Python CLI Installer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Python as a third-party tool with install/status/update support, using official installers on macOS/Windows and package manager commands on Linux, caching downloads under `.teanas-cache`.

**Architecture:** Extend CLI tool config/types to include `python`, add a Python-specific installer/status module in the server, and render a new first-row Python entry in settings. Downloads go to the active workspace root under `.teanas-cache/python/<version>/`.

**Tech Stack:** TypeScript, Node.js (`fetch`, `crypto`, `fs`), Hono/tRPC, React.

> Note: Per project rule, skip TDD test execution and do not create a worktree.

### Task 1: Extend CLI tool types and settings schemas

**Files:**
- Modify: `packages/api/src/types/basic.ts`
- Modify: `packages/api/src/routers/absSetting.ts`

**Step 1: Write the failing test**
Skip (project rule: no TDD in superpowers skills).

**Step 2: Run test to verify it fails**
Skip.

**Step 3: Write minimal implementation**
Update CLI tool config and status schemas:

```ts
// packages/api/src/types/basic.ts
export const cliToolsConfigSchema = z.object({
  codex: cliToolConfigSchema,
  claudeCode: cliToolConfigSchema,
  python: cliToolConfigSchema,
});

export type CliToolsConfig = {
  /** Codex CLI config. */
  codex: CliToolConfig;
  /** Claude Code CLI config. */
  claudeCode: CliToolConfig;
  /** Python CLI config. */
  python: CliToolConfig;
};
```

```ts
// packages/api/src/routers/absSetting.ts
const cliToolIdSchema = z.enum(["codex", "claudeCode", "python"]);

const cliToolStatusSchema = z.object({
  id: cliToolIdSchema,
  installed: z.boolean(),
  version: z.string().optional(),
  latestVersion: z.string().optional(),
  hasUpdate: z.boolean().optional(),
  path: z.string().optional(),
});
```

**Step 4: Run test to verify it passes**
Skip.

**Step 5: Commit**
Optional (ask user).

---

### Task 2: Update defaults and normalization for CLI tools

**Files:**
- Modify: `apps/server/src/modules/settings/tenasConfStore.ts`
- Modify: `apps/server/src/modules/settings/settingsService.ts`

**Step 1: Write the failing test**
Skip.

**Step 2: Run test to verify it fails**
Skip.

**Step 3: Write minimal implementation**
Add `python` default config and normalize it alongside existing tools.

```ts
// apps/server/src/modules/settings/tenasConfStore.ts
cliTools: {
  codex: { apiUrl: "", apiKey: "", forceCustomApiKey: false },
  claudeCode: { apiUrl: "", apiKey: "", forceCustomApiKey: false },
  python: { apiUrl: "", apiKey: "", forceCustomApiKey: false },
},

function normalizeCliToolsConfig(raw: unknown, fallback: CliToolsConfig): CliToolsConfig {
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const codex = normalizeCliToolConfig(source.codex, fallback.codex);
  const claudeCode = normalizeCliToolConfig(source.claudeCode, fallback.claudeCode);
  const python = normalizeCliToolConfig(source.python, fallback.python);
  return { codex, claudeCode, python };
}
```

```ts
// apps/server/src/modules/settings/settingsService.ts
function normalizeCliToolsConfig(raw: unknown, fallback: CliToolsConfig): CliToolsConfig {
  const source = isRecord(raw) ? raw : {};
  const codex = normalizeCliToolConfig(source.codex, fallback.codex);
  const claudeCode = normalizeCliToolConfig(source.claudeCode, fallback.claudeCode);
  const python = normalizeCliToolConfig(source.python, fallback.python);
  return { codex, claudeCode, python };
}
```

**Step 4: Run test to verify it passes**
Skip.

**Step 5: Commit**
Optional (ask user).

---

### Task 3: Add Python tool status/update/install logic

**Files:**
- Create: `apps/server/src/ai/models/cli/pythonTool.ts`
- Modify: `apps/server/src/ai/models/cli/cliToolService.ts`

**Step 1: Write the failing test**
Skip.

**Step 2: Run test to verify it fails**
Skip.

**Step 3: Write minimal implementation**
Create a Python tool module with installer logic, download cache, and status detection.

```ts
// apps/server/src/ai/models/cli/pythonTool.ts
import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { execa } from "execa";
import { getWorkspaceRootPath } from "@tenas-ai/api/services/vfsService";
import { logger } from "@/common/logger";

const PYTHON_RELEASES_URL =
  "https://www.python.org/api/v2/downloads/release/?is_published=1&release_type=full";

/** Python release summary. */
type PythonRelease = {
  name: string;
  release_date: string;
  pre_release: boolean;
  resource_uri: string;
};

/** Python release file entry. */
type PythonReleaseFile = {
  name: string;
  url: string;
  sha256_sum: string;
};

/** Build cache directory for Python installers. */
function resolvePythonCacheRoot(): string {
  const workspaceRoot = getWorkspaceRootPath();
  return path.join(workspaceRoot, ".teanas-cache", "python");
}

/** Parse release id from resource uri. */
function resolveReleaseId(uri: string): string {
  return uri.split("/").filter(Boolean).pop() ?? "";
}

/** Parse version number from release name. */
function parsePythonVersion(name: string): string | null {
  const match = name.match(/(\d+\.\d+\.\d+)/);
  return match?.[1] ?? null;
}

/** Fetch JSON payload from python.org API. */
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Python API request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Resolve latest stable Python release. */
export async function resolveLatestPythonRelease(): Promise<{ version: string; id: string }> {
  const releases = await fetchJson<PythonRelease[]>(PYTHON_RELEASES_URL);
  // 逻辑：过滤预发布版本，取最高的 3.x 版本。
  const stable = releases.filter((item) => !item.pre_release);
  const withVersion = stable
    .map((item) => ({
      version: parsePythonVersion(item.name),
      id: resolveReleaseId(item.resource_uri),
    }))
    .filter((item): item is { version: string; id: string } => Boolean(item.version));
  withVersion.sort((a, b) => {
    const left = a.version.split(".").map(Number);
    const right = b.version.split(".").map(Number);
    for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
      const diff = (left[i] ?? 0) - (right[i] ?? 0);
      if (diff !== 0) return diff > 0 ? -1 : 1;
    }
    return 0;
  });
  const latest = withVersion[0];
  if (!latest) throw new Error("Python release not found");
  return latest;
}

/** Resolve release files for a Python release id. */
async function resolveReleaseFiles(releaseId: string): Promise<PythonReleaseFile[]> {
  return await fetchJson<PythonReleaseFile[]>(
    `https://www.python.org/api/v2/downloads/release_file/?release=${releaseId}`,
  );
}

/** Resolve installer file for current platform. */
export async function resolvePythonInstallerFile(): Promise<{
  version: string;
  url: string;
  sha256: string;
}> {
  const latest = await resolveLatestPythonRelease();
  const files = await resolveReleaseFiles(latest.id);
  // 逻辑：按平台/架构匹配官方安装包。
  if (process.platform === "darwin") {
    const match = files.find((file) => file.name.includes("macOS installer"));
    if (!match) throw new Error("macOS installer not found");
    return { version: latest.version, url: match.url, sha256: match.sha256_sum };
  }
  if (process.platform === "win32") {
    const arch = process.arch;
    const match = files.find((file) => {
      if (!file.name.includes("Windows installer")) return false;
      if (arch === "arm64") return file.name.includes("ARM64");
      if (arch === "ia32") return file.name.includes("32-bit");
      return file.name.includes("64-bit");
    });
    if (!match) throw new Error("Windows installer not found");
    return { version: latest.version, url: match.url, sha256: match.sha256_sum };
  }
  throw new Error("Installer download only supported on macOS/Windows");
}

/** Download installer to cache and verify sha256. */
export async function downloadPythonInstaller(): Promise<string> {
  const { version, url, sha256 } = await resolvePythonInstallerFile();
  const cacheRoot = resolvePythonCacheRoot();
  const filename = path.basename(new URL(url).pathname);
  const targetDir = path.join(cacheRoot, version);
  const targetPath = path.join(targetDir, filename);
  await mkdir(targetDir, { recursive: true });
  if (!existsSync(targetPath)) {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Download failed: ${response.status}`);
    }
    await pipeline(response.body, createWriteStream(targetPath));
  }
  const buffer = await readFile(targetPath);
  const digest = createHash("sha256").update(buffer).digest("hex");
  if (sha256 && digest !== sha256) {
    throw new Error("Installer checksum mismatch");
  }
  return targetPath;
}

/** Open the installer file on the current OS. */
export async function openPythonInstaller(filePath: string): Promise<void> {
  // 逻辑：macOS/Windows 使用系统安装器打开。
  if (process.platform === "darwin") {
    await execa("open", [filePath]);
    return;
  }
  if (process.platform === "win32") {
    await execa("cmd", ["/c", "start", "", filePath], { windowsHide: true });
    return;
  }
  throw new Error("Installer open only supported on macOS/Windows");
}

/** Resolve python binary info. */
export async function resolvePythonInstallInfo(): Promise<{
  installed: boolean;
  version?: string;
  path?: string;
}> {
  const candidates = ["python3", "python"];
  for (const command of candidates) {
    try {
      const result = await execa(command, ["--version"], { all: true });
      const output = (result.stdout || result.stderr || result.all || "").trim();
      const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
      const version = versionMatch?.[1];
      const pathResult = process.platform === "win32"
        ? await execa("where", [command], { all: true })
        : await execa("which", [command], { all: true });
      const pathLine = (pathResult.stdout || pathResult.stderr || "")
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean);
      return {
        installed: true,
        version: version ?? undefined,
        path: pathLine ?? undefined,
      };
    } catch (error) {
      logger.debug({ err: error, command }, "[cli] python command not found");
    }
  }
  return { installed: false };
}

/** Install Python on Linux via package manager. */
export async function installPythonOnLinux(): Promise<void> {
  if (process.platform !== "linux") return;
  // 逻辑：按顺序尝试 apt/dnf/yum/pacman/zypper。
  const candidates = [
    { tool: "apt-get", args: ["install", "-y", "python3"] },
    { tool: "dnf", args: ["install", "-y", "python3"] },
    { tool: "yum", args: ["install", "-y", "python3"] },
    { tool: "pacman", args: ["-Sy", "--noconfirm", "python"] },
    { tool: "zypper", args: ["--non-interactive", "install", "python3"] },
  ];
  for (const candidate of candidates) {
    try {
      const hasSudo = await execa("which", ["sudo"], { reject: false });
      const useSudo = hasSudo.exitCode === 0;
      const cmd = useSudo ? "sudo" : candidate.tool;
      const args = useSudo
        ? ["-n", candidate.tool, ...candidate.args]
        : candidate.args;
      await execa(cmd, args, { stdio: "inherit" });
      return;
    } catch (error) {
      logger.warn({ err: error, tool: candidate.tool }, "[cli] linux install failed");
    }
  }
  throw new Error("未找到可用的 Linux 包管理器或安装失败");
}
```

Wire it into CLI tool service:

```ts
// apps/server/src/ai/models/cli/cliToolService.ts
import {
  downloadPythonInstaller,
  installPythonOnLinux,
  openPythonInstaller,
  resolveLatestPythonRelease,
  resolvePythonInstallInfo,
} from "@/ai/models/cli/pythonTool";

export type CliToolId = "codex" | "claudeCode" | "python";

export type CliToolStatus = {
  id: CliToolId;
  installed: boolean;
  version?: string;
  latestVersion?: string;
  hasUpdate?: boolean;
  path?: string;
};

const CLI_TOOL_DEFINITIONS: Record<Exclude<CliToolId, "python">, CliToolDefinition> = {
  // existing codex/claude
};

async function getPythonToolStatus(): Promise<CliToolStatus> {
  const info = await resolvePythonInstallInfo();
  return { id: "python", ...info };
}

export async function getCliToolStatus(id: CliToolId): Promise<CliToolStatus> {
  if (id === "python") return await getPythonToolStatus();
  // existing logic
}

export async function getCliToolsStatus(): Promise<CliToolStatus[]> {
  const ids: CliToolId[] = ["python", "codex", "claudeCode"];
  return await Promise.all(ids.map((id) => getCliToolStatus(id)));
}

export async function checkCliToolUpdate(id: CliToolId): Promise<CliToolStatus> {
  if (id === "python") {
    const status = await getPythonToolStatus();
    if (!status.installed || !status.version) return status;
    const latest = await resolveLatestPythonRelease();
    return {
      ...status,
      latestVersion: latest.version,
      hasUpdate: status.version !== latest.version,
    };
  }
  // existing logic
}

export async function installCliTool(id: CliToolId): Promise<CliToolStatus> {
  if (id === "python") {
    if (process.platform === "linux") {
      await installPythonOnLinux();
    } else {
      const installerPath = await downloadPythonInstaller();
      await openPythonInstaller(installerPath);
    }
    return await getPythonToolStatus();
  }
  // existing logic
}
```

**Step 4: Run test to verify it passes**
Skip.

**Step 5: Commit**
Optional (ask user).

---

### Task 4: Add Python defaults in web config

**Files:**
- Modify: `apps/web/src/hooks/use-basic-config.ts`

**Step 1: Write the failing test**
Skip.

**Step 2: Run test to verify it fails**
Skip.

**Step 3: Write minimal implementation**

```ts
// apps/web/src/hooks/use-basic-config.ts
cliTools: {
  codex: { apiUrl: "", apiKey: "", forceCustomApiKey: false },
  claudeCode: { apiUrl: "", apiKey: "", forceCustomApiKey: false },
  python: { apiUrl: "", apiKey: "", forceCustomApiKey: false },
},
```

**Step 4: Run test to verify it passes**
Skip.

**Step 5: Commit**
Optional (ask user).

---

### Task 5: Update settings UI for third-party tools

**Files:**
- Modify: `apps/web/src/components/setting/menus/provider/ProviderManagement.tsx`

**Step 1: Write the failing test**
Skip.

**Step 2: Run test to verify it fails**
Skip.

**Step 3: Write minimal implementation**
Add Python into CLI maps, show it as the first row, rename section title.

```tsx
// apps/web/src/components/setting/menus/provider/ProviderManagement.tsx
const cliToolLabels: Record<CliToolKind, string> = {
  python: "Python",
  codex: "Codex CLI",
  claudeCode: "Claude Code",
};

const cliToolDescriptions: Record<CliToolKind, string> = {
  python: "Python 运行时环境",
  codex: "OpenAI Codex CLI 编程助手",
  claudeCode: "Anthropic Claude Code CLI 编程助手",
};
```

```tsx
<TenasSettingsGroup title="第三方工具">
  <div className="divide-y divide-border">
    {/* Python row goes first */}
    <div className="flex flex-wrap items-start gap-2 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Terminal size={16} aria-hidden="true" />
          <span>{cliToolLabels.python}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {cliToolDescriptions.python} · 版本：{resolveCliVersionLabel(cliStatuses.python)}
          {cliStatuses.python.path ? ` · 路径：${cliStatuses.python.path}` : ""}
        </div>
      </div>
      <TenasSettingsField className="w-full sm:w-52 shrink-0 justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={
            (installCliMutation.isPending &&
              installCliMutation.variables?.id === "python") ||
            (checkUpdateMutation.isPending &&
              checkUpdateMutation.variables?.id === "python")
          }
          onClick={() => void handleCliPrimaryAction("python")}
        >
          {cliStatuses.python.installed
            ? installCliMutation.isPending &&
              installCliMutation.variables?.id === "python"
              ? "升级中..."
              : cliStatuses.python.hasUpdate && cliStatuses.python.latestVersion
                ? `升级到v${cliStatuses.python.latestVersion}`
                : checkUpdateMutation.isPending &&
                    checkUpdateMutation.variables?.id === "python"
                  ? "检测中..."
                  : "检测更新"
            : installCliMutation.isPending &&
                installCliMutation.variables?.id === "python"
              ? "安装中..."
              : "安装"}
        </Button>
      </TenasSettingsField>
    </div>

    {/* existing codex/claude rows */}
  </div>
</TenasSettingsGroup>
```

Also update `CliToolStatus` type to include `path?: string`, and add python to `buildCliSettingsFromBasic` and `buildCliStatusMap` fallback.

**Step 4: Run test to verify it passes**
Skip.

**Step 5: Commit**
Optional (ask user).

---

### Task 6: Manual verification checklist (no automated tests)

**Files:**
- N/A

**Step 1: macOS/Windows install flow**
- Click Python → Install → ensure installer opens.
- Verify `.teanas-cache/python/<version>/` contains the installer.

**Step 2: Linux install flow**
- Click Python → Install → verify package manager command attempts.

**Step 3: Status display**
- Ensure version and path show after install.

**Step 4: Typecheck**
Optional: `pnpm check-types` (skip if not desired).
