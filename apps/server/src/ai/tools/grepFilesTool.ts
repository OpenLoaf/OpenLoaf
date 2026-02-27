/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { execFile } from "node:child_process";
import { tool, zodSchema } from "ai";
import { grepFilesToolDef } from "@openloaf/api/types/tools/runtime";
import { readBasicConf } from "@/modules/settings/openloafConfStore";
import { resolveToolPath } from "@/ai/tools/toolScope";

const DEFAULT_LIMIT = 100;
const TIMEOUT_MS = 30_000;

/** Try to find ripgrep binary path. */
function findRgBinary(): string | null {
  const candidates = ["rg", "/usr/local/bin/rg", "/opt/homebrew/bin/rg"];
  for (const bin of candidates) {
    try {
      require("node:child_process").execFileSync(bin, ["--version"], {
        timeout: 5000,
        stdio: "ignore",
      });
      return bin;
    } catch {
      // not found, try next
    }
  }
  return null;
}

let cachedRgBin: string | null | undefined;

function getRgBin(): string | null {
  if (cachedRgBin === undefined) {
    cachedRgBin = findRgBinary();
  }
  return cachedRgBin;
}

/** Execute grep-files using ripgrep or fallback to grep. */
export const grepFilesTool = tool({
  description: grepFilesToolDef.description,
  inputSchema: zodSchema(grepFilesToolDef.parameters),
  execute: async ({ pattern, include, path: searchPath, limit }): Promise<string> => {
    const allowOutside = readBasicConf().toolAllowOutsideScope;
    const resolvedPath = searchPath
      ? resolveToolPath({ target: searchPath, allowOutside }).absPath
      : resolveToolPath({ target: ".", allowOutside }).absPath;

    const resolvedLimit = typeof limit === "number" ? limit : DEFAULT_LIMIT;
    const rgBin = getRgBin();

    return new Promise<string>((resolve, reject) => {
      if (rgBin) {
        // 逻辑：优先使用 ripgrep，性能更好。
        const args = [
          "--files-with-matches",
          "--sortr=modified",
          "--regexp",
          pattern,
        ];
        if (include) {
          args.push("--glob", include);
        }
        args.push(resolvedPath);

        execFile(rgBin, args, { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
          if (err && (err as any).code === 1 && !stdout) {
            // rg exit code 1 = no matches
            resolve("No matches found.");
            return;
          }
          if (err && (err as any).code !== 1) {
            reject(new Error(`rg failed: ${err.message}`));
            return;
          }
          const lines = stdout.trim().split("\n").filter(Boolean);
          if (lines.length === 0) {
            resolve("No matches found.");
            return;
          }
          const truncated = lines.slice(0, resolvedLimit);
          const result = truncated.join("\n");
          if (lines.length > resolvedLimit) {
            resolve(`${result}\n... (${lines.length - resolvedLimit} more files)`);
          } else {
            resolve(result);
          }
        });
      } else {
        // 逻辑：fallback 到 grep -rl。
        const args = ["-rl", "--include", include || "*", pattern, resolvedPath];
        execFile("grep", args, { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
          if (err && (err as any).code === 1 && !stdout) {
            resolve("No matches found.");
            return;
          }
          if (err && (err as any).code !== 1) {
            reject(new Error(`grep failed: ${err.message}`));
            return;
          }
          const lines = stdout.trim().split("\n").filter(Boolean);
          if (lines.length === 0) {
            resolve("No matches found.");
            return;
          }
          const truncated = lines.slice(0, resolvedLimit);
          const result = truncated.join("\n");
          if (lines.length > resolvedLimit) {
            resolve(`${result}\n... (${lines.length - resolvedLimit} more files)`);
          } else {
            resolve(result);
          }
        });
      }
    });
  },
});
