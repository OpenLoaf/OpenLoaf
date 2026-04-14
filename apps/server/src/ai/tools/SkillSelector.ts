/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import {
  readSkillContentFromPath,
  readSkillSummaryFromPath,
} from "@/ai/services/skillsLoader";
import { BUILTIN_SKILLS } from "@/ai/builtin-skills";

const OPENLOAF_META_DIR = ".openloaf";
const SKILLS_DIR_NAME = "skills";
const SKILL_FILE_NAME = "SKILL.md";

export type SkillScope = "builtin" | "project" | "parent" | "global";

export type SkillMatch = {
  /** Skill name. */
  name: string;
  /** Skill file path. */
  path: string;
  /** Skill scope. */
  scope: SkillScope;
  /** Skill content. */
  content: string;
};

type SkillRoots = {
  /** Project root path. */
  projectRoot?: string;
  /** Parent project roots. */
  parentRoots?: string[];
  /** Global root path. */
  globalRoot?: string;
};

type SkillSearchRoot = {
  /** Skill scope. */
  scope: SkillScope;
  /** Root directory. */
  rootPath: string;
};

export class SkillSelector {
  /** Resolve a skill by name from ordered roots.
   *
   * 匹配规则（按顺序尝试，首个命中即返回）：
   *   1. 原样（小写）精确匹配；
   *   2. 若输入以 `-skill` 结尾 → 去掉后缀再匹配（兼容「只写后缀版」找旧命名）；
   *   3. 若输入不以 `-skill` 结尾 → 补上后缀再匹配（兼容「写旧名」找新命名）。
   *
   * 每个候选名都会完整走一遍 project → parent → global → builtin 的搜索链，
   * 确保项目自定义 skill 永远优先于内置同名 skill。
   */
  static async resolveSkillByName(
    name: string,
    roots: SkillRoots,
  ): Promise<SkillMatch | null> {
    const normalizedName = normalizeSkillName(name);
    if (!normalizedName) return null;

    const candidates = buildNameCandidates(normalizedName);
    const searchRoots = buildSearchRoots(roots);

    for (const candidate of candidates) {
      const match = resolveExactSkillName(candidate, searchRoots);
      if (match) return match;
    }

    return null;
  }

  /** Extract ordered skill names from user text.
   *  Supports both new format `/skill/[originalName|displayName]` and legacy `/skill/name`.
   */
  static extractSkillNamesFromText(text: string): string[] {
    // New format: /skill/[originalName|displayName] or /skill/[originalName]
    const bracketMatches = text.matchAll(/\/skill\/\[([^\]|]+)(?:\|[^\]]*)?\]/gu);
    // Legacy format: /skill/name (ASCII word chars and hyphens only)
    const legacyMatches = text.matchAll(/\/skill\/([\w-]+)/gu);

    const ordered: string[] = [];
    const seen = new Set<string>();

    // Process bracket format first (higher priority)
    for (const match of bracketMatches) {
      const name = (match[1] ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(name);
    }

    // Process legacy format for backward compatibility
    for (const match of legacyMatches) {
      const name = (match[1] ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(name);
    }

    return ordered;
  }
}

function buildSearchRoots(roots: SkillRoots): SkillSearchRoot[] {
  const projectRoot = normalizeRootPath(roots.projectRoot);
  const parentRoots = normalizeRootPathList(roots.parentRoots);
  const globalSkillsPath = path.join(homedir(), ".openloaf", "skills");
  const ordered: SkillSearchRoot[] = [];

  if (projectRoot) {
    ordered.push({ scope: "project", rootPath: projectRoot });
  }
  for (const parentRoot of parentRoots) {
    ordered.push({ scope: "parent", rootPath: parentRoot });
  }
  // 全局技能优先级最低，放在最后搜索。
  ordered.push({ scope: "global", rootPath: globalSkillsPath });
  return ordered;
}

function normalizeRootPath(value?: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeRootPathList(values?: string[]): string[] {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map((value) => normalizeRootPath(value))
    .filter((value): value is string => Boolean(value));
  const unique = new Set<string>();
  const deduped = normalized.filter((value) => {
    if (unique.has(value)) return false;
    unique.add(value);
    return true;
  });
  return deduped;
}

function normalizeSkillName(name: string): string {
  return name.trim().toLowerCase();
}

const SKILL_SUFFIX = "-skill";

/** Build ordered candidate names for fallback matching. Input must already be normalized. */
function buildNameCandidates(normalizedName: string): string[] {
  const candidates = [normalizedName];
  if (normalizedName.endsWith(SKILL_SUFFIX)) {
    const stripped = normalizedName.slice(0, -SKILL_SUFFIX.length);
    if (stripped) candidates.push(stripped);
  } else {
    candidates.push(`${normalizedName}${SKILL_SUFFIX}`);
  }
  return candidates;
}

/** Exact-match lookup: project → parent → global → builtin. */
function resolveExactSkillName(
  normalizedName: string,
  searchRoots: readonly SkillSearchRoot[],
): SkillMatch | null {
  for (const searchRoot of searchRoots) {
    // 全局技能目录直接就是 skills 根目录，项目级拼接 .openloaf/skills。
    const skillsRootPath =
      searchRoot.scope === "global"
        ? searchRoot.rootPath
        : path.join(searchRoot.rootPath, OPENLOAF_META_DIR, SKILLS_DIR_NAME);
    const skillFiles = findSkillFiles(skillsRootPath);
    for (const filePath of skillFiles) {
      const summary = readSkillSummaryFromPath(
        filePath,
        searchRoot.scope === "global" ? searchRoot.scope : "project",
      );
      if (!summary) continue;
      if (
        normalizeSkillName(summary.originalName) !== normalizedName &&
        normalizeSkillName(summary.name) !== normalizedName
      )
        continue;
      const content = readSkillContentFromPath(filePath);
      return {
        name: summary.name,
        path: filePath,
        scope: searchRoot.scope,
        content,
      };
    }
  }

  const builtin = BUILTIN_SKILLS.find(
    (s) => normalizeSkillName(s.name) === normalizedName,
  );
  if (builtin) {
    return {
      name: builtin.name,
      path: `builtin://${builtin.name}`,
      scope: "builtin",
      content: builtin.content,
    };
  }

  return null;
}

function findSkillFiles(rootPath: string): string[] {
  if (!existsSync(rootPath)) return [];
  const entries = readdirSync(rootPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...findSkillFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name === SKILL_FILE_NAME) {
      files.push(entryPath);
    }
  }

  return files;
}
