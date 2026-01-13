import os from "node:os";
import { promises as fs } from "node:fs";
import { tool, zodSchema } from "ai";
import {
  shellDestructiveToolDef,
  shellReadonlyToolDef,
  shellWriteToolDef,
} from "@tenas-ai/api/types/tools/system";
import { resolveProjectPath, resolveProjectRootPath } from "@/ai/tools/system/projectPath";
import { ensureFile, listDirectory } from "@/ai/tools/system/fileTools";

/** Shell readonly tool output. */
type ShellReadonlyToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Original command string. */
    cmd: string;
    /** Command output. */
    output: string;
  };
};

/** Shell write tool output. */
type ShellWriteToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Original command string. */
    cmd: string;
    /** Project-relative path. */
    path: string;
  };
};

/** Shell destructive tool output. */
type ShellDestructiveToolOutput = {
  /** Success flag. */
  ok: true;
  /** Payload data. */
  data: {
    /** Original command string. */
    cmd: string;
    /** Project-relative path. */
    path: string;
  };
};

/** Split a command string into tokens. */
function splitCommand(raw: string): { command: string; args: string[] } {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("cmd is required.");
  // 逻辑：禁止管道与重定向等复杂语法，避免绕过白名单。
  if (/[|;&><]/.test(trimmed)) {
    throw new Error("Unsupported shell syntax.");
  }
  const parts = trimmed.split(/\s+/);
  return { command: parts[0] ?? "", args: parts.slice(1) };
}

/** Execute readonly shell command. */
export const shellReadonlyTool = tool({
  description: shellReadonlyToolDef.description,
  inputSchema: zodSchema(shellReadonlyToolDef.parameters),
  execute: async ({ cmd }): Promise<ShellReadonlyToolOutput> => {
    const { command, args } = splitCommand(cmd);
    if (!command) throw new Error("cmd is required.");

    if (command === "date") {
      return { ok: true, data: { cmd, output: new Date().toString() } };
    }
    if (command === "uname") {
      return { ok: true, data: { cmd, output: `${os.type()} ${os.release()}` } };
    }
    if (command === "whoami") {
      return { ok: true, data: { cmd, output: os.userInfo().username } };
    }
    if (command === "pwd") {
      const { rootPath } = resolveProjectRootPath();
      return { ok: true, data: { cmd, output: rootPath } };
    }
    if (command === "ls") {
      const flags = args.filter((arg) => arg.startsWith("-"));
      if (flags.length > 0) {
        throw new Error("ls flags are not supported.");
      }
      const positionals = args.filter((arg) => !arg.startsWith("-"));
      if (positionals.length > 1) {
        throw new Error("ls supports a single path.");
      }
      const targetArg = positionals[0] ?? ".";
      const resolved = resolveProjectPath(targetArg);
      const entries = await listDirectory(resolved.absPath);
      const output = entries
        .map((entry) => (entry.type === "dir" ? `${entry.name}/` : entry.name))
        .join("\n");
      return { ok: true, data: { cmd, output } };
    }

    throw new Error("Unsupported readonly command.");
  },
});

/** Execute write shell command. */
export const shellWriteTool = tool({
  description: shellWriteToolDef.description,
  inputSchema: zodSchema(shellWriteToolDef.parameters),
  needsApproval: true,
  execute: async ({ cmd }): Promise<ShellWriteToolOutput> => {
    const { command, args } = splitCommand(cmd);
    if (command !== "mkdir") {
      throw new Error("Only mkdir is supported.");
    }
    if (args.length !== 1 || args[0].startsWith("-")) {
      throw new Error("mkdir requires a single path.");
    }
    const targetPath = args[0];
    if (!targetPath) {
      throw new Error("mkdir requires a path.");
    }
    const resolved = resolveProjectPath(targetPath);
    await fs.mkdir(resolved.absPath, { recursive: true });
    return { ok: true, data: { cmd, path: resolved.relativePath } };
  },
});

/** Execute destructive shell command. */
export const shellDestructiveTool = tool({
  description: shellDestructiveToolDef.description,
  inputSchema: zodSchema(shellDestructiveToolDef.parameters),
  needsApproval: true,
  execute: async ({ cmd }): Promise<ShellDestructiveToolOutput> => {
    const { command, args } = splitCommand(cmd);
    if (command !== "rm") {
      throw new Error("Only rm is supported.");
    }
    if (args.length !== 1 || args[0].startsWith("-")) {
      throw new Error("rm requires a single file path.");
    }
    const targetPath = args[0];
    if (!targetPath) {
      throw new Error("rm requires a path.");
    }
    const resolved = resolveProjectPath(targetPath);
    await ensureFile(resolved.absPath);
    await fs.unlink(resolved.absPath);
    return { ok: true, data: { cmd, path: resolved.relativePath } };
  },
});
