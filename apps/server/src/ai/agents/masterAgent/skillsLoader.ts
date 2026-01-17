import path from "node:path";
import { existsSync, readFileSync, readdirSync } from "node:fs";

type SkillScope = "workspace" | "project";

type SkillSummary = {
  /** Skill name from front matter or fallback. */
  name: string;
  /** Skill description from front matter. */
  description: string;
  /** Absolute path to SKILL.md. */
  path: string;
  /** Skill folder name (parent directory of SKILL.md). */
  folderName: string;
  /** Skill scope (workspace/project). */
  scope: SkillScope;
};

type SkillSource = {
  /** Skill scope (workspace/project). */
  scope: SkillScope;
  /** Root path for the scope. */
  rootPath: string;
};

type SkillFrontMatter = {
  /** Skill name. */
  name?: string;
  /** Skill description. */
  description?: string;
};

const TENAS_META_DIR = ".tenas";
const SKILLS_DIR_NAME = "skills";
const SKILL_FILE_NAME = "SKILL.md";
const FRONT_MATTER_DELIMITER = "---";

/** Load skills summary list from workspace/project roots. */
export function loadSkillSummaries(input: {
  workspaceRootPath?: string;
  projectRootPath?: string;
  parentProjectRootPaths?: string[];
}): SkillSummary[] {
  const sources = resolveSkillSources(input);
  const summaryByName = new Map<string, SkillSummary>();
  const orderedNames: string[] = [];

  for (const source of sources) {
    const skillsRootPath = path.join(source.rootPath, TENAS_META_DIR, SKILLS_DIR_NAME);
    const skillFiles = findSkillFiles(skillsRootPath);

    for (const filePath of skillFiles) {
      const summary = readSkillSummary(filePath, source.scope);
      if (!summary) continue;
      if (!summaryByName.has(summary.name)) {
        orderedNames.push(summary.name);
      }
      // 逻辑：项目级 skills 覆盖工作空间级 skills。
      if (source.scope === "project" || !summaryByName.has(summary.name)) {
        summaryByName.set(summary.name, summary);
      }
    }
  }

  return orderedNames.map((name) => summaryByName.get(name)).filter(Boolean) as SkillSummary[];
}

/** Resolve skill sources in priority order. */
function resolveSkillSources(input: {
  workspaceRootPath?: string;
  projectRootPath?: string;
  parentProjectRootPaths?: string[];
}): SkillSource[] {
  const sources: SkillSource[] = [];
  const workspaceRoot = normalizeRootPath(input.workspaceRootPath);
  const projectRoot = normalizeRootPath(input.projectRootPath);
  const parentRoots = normalizeRootPathList(input.parentProjectRootPaths);

  if (workspaceRoot) {
    sources.push({ scope: "workspace", rootPath: workspaceRoot });
  }
  for (const parentRoot of parentRoots) {
    sources.push({ scope: "project", rootPath: parentRoot });
  }
  if (projectRoot) {
    sources.push({ scope: "project", rootPath: projectRoot });
  }
  return sources;
}

/** Normalize root path input into a usable string. */
function normalizeRootPath(value?: string): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Normalize parent project root paths in priority order. */
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
  // 逻辑：父级 rootPath 需从顶层到近层排序，确保当前项目覆盖父级技能。
  return deduped.reverse();
}

/** Recursively find SKILL.md files under the skills root. */
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

/** Read a single skill summary from SKILL.md front matter. */
function readSkillSummary(filePath: string, scope: SkillScope): SkillSummary | null {
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, "utf8");
    const frontMatter = parseFrontMatter(content);
    const fallbackName = path.basename(path.dirname(filePath)) || path.basename(filePath);
    const name = (frontMatter.name || fallbackName).trim();
    if (!name) return null;
    const description = normalizeDescription(frontMatter.description);
    const folderName = path.basename(path.dirname(filePath)) || fallbackName;
    return {
      name,
      description,
      path: filePath,
      folderName,
      scope,
    };
  } catch {
    return null;
  }
}

/** Parse YAML front matter for name/description only. */
function parseFrontMatter(content: string): SkillFrontMatter {
  const lines = content.split(/\r?\n/u);
  if (lines.length === 0) return {};
  if (lines[0].trim() !== FRONT_MATTER_DELIMITER) return {};

  const result: SkillFrontMatter = {};
  let currentKey: "name" | "description" | null = null;
  let blockMode: "literal" | "folded" | null = null;
  let buffer: string[] = [];

  const flushBlock = () => {
    if (!currentKey) return;
    const rawValue = blockMode === "folded" ? buffer.join(" ") : buffer.join("\n");
    const normalized = rawValue.trim();
    if (normalized) {
      result[currentKey] = normalized;
    }
    currentKey = null;
    blockMode = null;
    buffer = [];
  };

  // 逻辑：仅解析文件起始 front matter，避免读取正文。
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === FRONT_MATTER_DELIMITER) {
      flushBlock();
      break;
    }

    if (currentKey && (line.startsWith(" ") || line.startsWith("\t") || line.trim() === "")) {
      buffer.push(line.replace(/^\s*/u, ""));
      continue;
    }

    if (currentKey) {
      flushBlock();
    }

    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2].trim();
    if (key !== "name" && key !== "description") continue;

    if (rawValue === "|" || rawValue === ">") {
      currentKey = key;
      blockMode = rawValue === ">" ? "folded" : "literal";
      buffer = [];
      continue;
    }

    const normalized = normalizeScalar(rawValue);
    if (normalized) {
      result[key] = normalized;
    }
  }

  return result;
}

/** Normalize scalar values from YAML front matter. */
function normalizeScalar(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** Normalize description into a single-line string. */
function normalizeDescription(value?: string): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return "未提供";
  return trimmed.replace(/\s+/gu, " ");
}

export type { SkillSummary, SkillScope };
