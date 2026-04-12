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
  /** Resolve a skill by name from ordered roots. */
  static async resolveSkillByName(
    name: string,
    roots: SkillRoots,
  ): Promise<SkillMatch | null> {
    const normalizedName = normalizeSkillName(name);
    if (!normalizedName) return null;
    const searchRoots = buildSearchRoots(roots);

    // 逻辑：按 project -> parent -> global 顺序搜索技能。
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
          searchRoot.scope === "global"
            ? searchRoot.scope
            : "project",
        );
        if (!summary) continue;
        if (
          normalizeSkillName(summary.originalName) !== normalizedName &&
          normalizeSkillName(summary.name) !== normalizedName
        ) continue;
        const content = readSkillContentFromPath(filePath);
        return {
          name: summary.name,
          path: filePath,
          scope: searchRoot.scope,
          content,
        };
      }
    }

    // 回退到内置 skills
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
