/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveScopedOpenLoafPath } from "@openloaf/config";
import { getResolvedTempStorageDir } from "./appConfigService";
import { getProjectRootPath } from "./vfsService";
import type { AutoTestVerdict } from "../types/message";

const CHAT_HISTORY_DIR = "chat-history";

export interface SessionAutoTestSummary {
  autoTest: boolean;
  autoTestScore: number | null;
  autoTestVerdict: AutoTestVerdict | null;
}

const EMPTY: SessionAutoTestSummary = {
  autoTest: false,
  autoTestScore: null,
  autoTestVerdict: null,
};

// 解析 session 目录的非画布分支：项目会话在项目根下，临时会话在全局 temp 目录。
// 与 apps/server 的 chatSessionPathResolver 保持兼容，但只覆盖列表查询需要的两种路径；
// 画布会话由 server 的 listSidebarSessions 分支负责，这里读不到就返回 EMPTY。
function resolveSessionDirCandidates(
  sessionId: string,
  projectId: string | null,
): string[] {
  const candidates: string[] = [];
  if (projectId) {
    const projectRoot = getProjectRootPath(projectId);
    if (projectRoot) {
      candidates.push(
        path.join(
          resolveScopedOpenLoafPath(projectRoot, CHAT_HISTORY_DIR),
          sessionId,
        ),
      );
    }
  }
  candidates.push(path.join(getResolvedTempStorageDir(), CHAT_HISTORY_DIR, sessionId));
  return candidates;
}

async function readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * 读取单个 session 的自动化测试摘要（autoTest 标记 + 评分 + verdict）。
 * 只读 session.json 和 EVALUATION.json，不抛错。画布会话或路径无法解析时返回 EMPTY。
 */
export async function readSessionAutoTestSummary(
  sessionId: string,
  projectId: string | null,
): Promise<SessionAutoTestSummary> {
  const candidates = resolveSessionDirCandidates(sessionId, projectId);

  for (const dir of candidates) {
    const session = await readJsonFile<{
      autoTest?: unknown;
    }>(path.join(dir, "session.json"));
    if (!session) continue;
    if (session.autoTest !== true) return EMPTY;

    const evaluation = await readJsonFile<{
      aggregate?: { score?: unknown; verdict?: unknown };
    }>(path.join(dir, "EVALUATION.json"));

    let autoTestScore: number | null = null;
    let autoTestVerdict: AutoTestVerdict | null = null;
    if (evaluation?.aggregate) {
      if (typeof evaluation.aggregate.score === "number") {
        autoTestScore = evaluation.aggregate.score;
      }
      const v = evaluation.aggregate.verdict;
      if (v === "PASS" || v === "FAIL" || v === "PARTIAL") {
        autoTestVerdict = v;
      }
    }
    return { autoTest: true, autoTestScore, autoTestVerdict };
  }
  return EMPTY;
}
