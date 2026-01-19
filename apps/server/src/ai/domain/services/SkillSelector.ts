import path from "node:path";
import { existsSync, readdirSync } from "node:fs";
import {
  readSkillContentFromPath,
  readSkillSummaryFromPath,
} from "@/ai/agents/masterAgent/skillsLoader";

const TENAS_META_DIR = ".tenas";
const SKILLS_DIR_NAME = "skills";
const SKILL_FILE_NAME = "SKILL.md";

export type SkillScope = "project" | "parent" | "workspace";

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

export type SkillRoots = {
  /** Project root path. */
  projectRoot?: string;
  /** Parent project roots. */
  parentRoots?: string[];
  /** Workspace root path. */
  workspaceRoot?: string;
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

    // 逻辑：按 project -> parent -> workspace 顺序搜索技能。
    for (const searchRoot of searchRoots) {
      const skillsRootPath = path.join(searchRoot.rootPath, TENAS_META_DIR, SKILLS_DIR_NAME);
      const skillFiles = findSkillFiles(skillsRootPath);
      for (const filePath of skillFiles) {
        const summary = readSkillSummaryFromPath(
          filePath,
          searchRoot.scope === "workspace" ? "workspace" : "project",
        );
        if (!summary) continue;
        if (normalizeSkillName(summary.name) !== normalizedName) continue;
        const content = readSkillContentFromPath(filePath);
        return {
          name: summary.name,
          path: filePath,
          scope: searchRoot.scope,
          content,
        };
      }
    }

    return null;
  }

  /** Extract ordered skill names from user text. */
  static extractSkillNamesFromText(text: string): string[] {
    const matches = text.matchAll(/\/skill\/([^\s]+)/gu);
    const ordered: string[] = [];
    const seen = new Set<string>();
    for (const match of matches) {
      const rawName = match[1] ?? "";
      const name = rawName.trim();
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
  const workspaceRoot = normalizeRootPath(roots.workspaceRoot);
  const ordered: SkillSearchRoot[] = [];

  if (projectRoot) {
    ordered.push({ scope: "project", rootPath: projectRoot });
  }
  for (const parentRoot of parentRoots) {
    ordered.push({ scope: "parent", rootPath: parentRoot });
  }
  if (workspaceRoot) {
    ordered.push({ scope: "workspace", rootPath: workspaceRoot });
  }
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
