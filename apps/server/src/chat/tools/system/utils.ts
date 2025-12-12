import fs from "node:fs/promises";
import path from "node:path";

/**
 * System tools 的通用安全工具（MVP）
 * 目标：最小实现 + 明确边界，避免引入复杂策略。
 */

export const DEFAULT_TIMEOUT_MS = 12_000;
export const DEFAULT_MAX_BYTES = 512 * 1024; // 512KB

export function isProbablyPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();

  // 直观的 SSRF/本地地址拦截（MVP：不做 DNS 解析，只做字符串级判断）
  if (host === "localhost" || host === "0.0.0.0" || host === "127.0.0.1") {
    return true;
  }
  if (host === "::1" || host.startsWith("[::1]")) return true;
  if (host.endsWith(".local")) return true;

  // IPv4 私网段
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return true;

  // link-local
  if (/^169\.254\.\d+\.\d+$/.test(host)) return true;

  return false;
}

export function stripHtmlToText(html: string): string {
  // MVP：非常轻量的 HTML -> 文本，不追求完美
  return (
    html
      // 移除 script/style
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      // 保留换行语义（粗略）
      .replace(/<\/(p|div|br|li|h\d)>/gi, "\n")
      // 移除其余标签
      .replace(/<[^>]+>/g, "")
      // HTML entity（MVP：仅处理最常见的几种）
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export async function fetchTextWithLimits(opts: {
  url: string;
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
}): Promise<{ status: number; contentType?: string; text: string }> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(opts.url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: opts.userAgent ? { "user-agent": opts.userAgent } : undefined,
    });

    const contentType = res.headers.get("content-type") ?? undefined;

    // 仅做最小限制：按字节截断读取
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const sliced = bytes.length > maxBytes ? bytes.slice(0, maxBytes) : bytes;
    const text = new TextDecoder("utf-8", { fatal: false }).decode(sliced);

    return { status: res.status, contentType, text };
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveInAllowedRoots(opts: {
  baseDir: string;
  filePath: string;
  allowedRoots: string[];
}): string {
  const resolved = path.resolve(opts.baseDir, opts.filePath);

  // 仅允许访问白名单目录下的文件（MVP）
  const isAllowed = opts.allowedRoots.some((root) => {
    const rootAbs = path.resolve(opts.baseDir, root);
    return resolved === rootAbs || resolved.startsWith(rootAbs + path.sep);
  });

  if (!isAllowed) {
    throw new Error("路径不在允许范围内（MVP 白名单限制）。");
  }

  return resolved;
}

export async function readUtf8FileWithLimit(opts: {
  absolutePath: string;
  maxBytes?: number;
}): Promise<string> {
  const maxBytes = opts.maxBytes ?? 256 * 1024;
  const stat = await fs.stat(opts.absolutePath);
  if (stat.size > maxBytes) {
    throw new Error(`文件过大（>${maxBytes} bytes），已拒绝读取。`);
  }
  return await fs.readFile(opts.absolutePath, "utf8");
}

export function parseSimpleCommand(cmd: string): string[] {
  // MVP：极简解析，禁止管道/重定向/多命令
  if (/[|;&><`$()]/.test(cmd)) {
    throw new Error("命令包含危险字符（|;&><`$()），已拒绝。");
  }

  const parts = cmd.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) throw new Error("命令为空。");
  return parts;
}

export async function runCommandReadonly(opts: {
  cmd: string[];
  timeoutMs?: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const file = opts.cmd[0];
  if (!file) {
    throw new Error("命令为空。");
  }

  // MVP：优先 Bun.spawn（若运行时是 bun），否则 fallback 到 node child_process
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BunAny: any = (globalThis as any).Bun;

  if (BunAny?.spawn) {
    const proc = BunAny.spawn(opts.cmd, {
      stdout: "pipe",
      stderr: "pipe",
    });

    const timeout = setTimeout(() => {
      try {
        proc.kill();
      } catch {}
    }, timeoutMs);

    try {
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      const exitCode = await proc.exited;
      return { stdout, stderr, exitCode };
    } finally {
      clearTimeout(timeout);
    }
  }

  const { spawn } = await import("node:child_process");
  return await new Promise((resolve, reject) => {
    const child = spawn(file, opts.cmd.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunksOut: Buffer[] = [];
    const chunksErr: Buffer[] = [];

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("命令执行超时。"));
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer | string) =>
      chunksOut.push(Buffer.from(d)),
    );
    child.stderr.on("data", (d: Buffer | string) =>
      chunksErr.push(Buffer.from(d)),
    );

    child.on("error", (err: unknown) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("close", (code: number | null) => {
      clearTimeout(timeout);
      resolve({
        stdout: Buffer.concat(chunksOut).toString("utf8"),
        stderr: Buffer.concat(chunksErr).toString("utf8"),
        exitCode: code ?? 0,
      });
    });
  });
}
