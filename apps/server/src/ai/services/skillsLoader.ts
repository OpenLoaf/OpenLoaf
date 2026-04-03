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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { BUILTIN_SKILLS } from "@/ai/builtin-skills";
import {
  normalizeScalar,
  normalizeDescription,
  normalizeRootPath,
  normalizeRootPathList,
  stripFrontMatter as stripFrontMatterShared,
} from "@/ai/shared/frontMatterUtils";

type SkillScope = "builtin" | "project" | "global";

type SkillSummary = {
  /** Skill display name (may be translated via openloaf.json). */
  name: string;
  /** Original skill name from SKILL.md front-matter (used for matching/loading). */
  originalName: string;
  /** Skill description from front matter. */
  description: string;
  /** Absolute path to SKILL.md. */
  path: string;
  /** Skill folder name (parent directory of SKILL.md). */
  folderName: string;
  /** Skill scope (global/project). */
  scope: SkillScope;
  /** Color palette index (0-7), from openloaf.json. */
  colorIndex?: number | null;
  /** Whether this skill has an openloaf.json metadata file. */
  hasMeta?: boolean;
  /** Emoji icon for the skill (from openloaf.json). */
  icon?: string;
  /** Tool IDs that this skill depends on (auto-activated when skill is loaded). */
  tools?: string[];
  /** Marketplace installation metadata (only present for marketplace-installed skills). */
  marketplace?: {
    skillId: string
    repoId: string
    folderName: string
    version: string
    installedAt: string
  };
};

type SkillSource = {
  /** Skill scope (global/project). */
  scope: SkillScope;
  /** Root path for the scope. */
  rootPath: string;
};

type SkillFrontMatter = {
  /** Skill name. */
  name?: string;
  /** Skill description. */
  description?: string;
  /** Tool IDs this skill depends on (comma-separated or YAML array). */
  tools?: string[];
};

const OPENLOAF_META_DIR = ".openloaf";
const AGENTS_DIR_NAME = "agents";
const SKILLS_DIR_NAME = "skills";
const SKILL_FILE_NAME = "SKILL.md";
const FRONT_MATTER_DELIMITER = "---";

/** Load skills summary list from project roots. */
export function loadSkillSummaries(input: {
  projectRootPath?: string;
  parentProjectRootPaths?: string[];
  globalSkillsPath?: string;
}): SkillSummary[] {
  const sources = resolveSkillSources(input);
  const summaryByName = new Map<string, SkillSummary>();
  const orderedNames: string[] = [];

  // 0. 内置 skills（最低优先级）
  for (const builtin of BUILTIN_SKILLS) {
    const summary: SkillSummary = {
      name: builtin.name,
      originalName: builtin.name,
      description: builtin.description,
      path: `builtin://${builtin.name}`,
      folderName: builtin.name,
      scope: "builtin",
      colorIndex: builtin.colorIndex,
      hasMeta: true,
      icon: builtin.icon,
      ...(builtin.tools?.length ? { tools: builtin.tools } : {}),
    };
    orderedNames.push(summary.originalName);
    summaryByName.set(summary.originalName, summary);
  }

  // 1. 全局 skills → 2. 父项目 skills → 3. 项目 skills
  // 同名去重：builtin 不可被覆盖；其余后来者覆盖前者（project > parent > global）。
  for (const source of sources) {
    // 全局技能目录直接就是 skills 根目录，无需拼接 .openloaf/agents/skills。
    const skillsRootPath =
      source.scope === "global"
        ? source.rootPath
        : path.join(source.rootPath, OPENLOAF_META_DIR, AGENTS_DIR_NAME, SKILLS_DIR_NAME);
    const skillFiles = findSkillFiles(skillsRootPath);

    for (const filePath of skillFiles) {
      const summary = readSkillSummaryFromPath(filePath, source.scope);
      if (!summary) continue;
      if (!summaryByName.has(summary.originalName)) {
        orderedNames.push(summary.originalName);
      }
      const existing = summaryByName.get(summary.originalName);
      // builtin 技能不可被覆盖；其余同名技能后来者覆盖前者。
      if (!existing || existing.scope !== "builtin") {
        summaryByName.set(summary.originalName, summary);
      }
    }
  }

  return orderedNames.map((name) => summaryByName.get(name)).filter(Boolean) as SkillSummary[];
}

/** Resolve skill sources in priority order. */
function resolveSkillSources(input: {
  projectRootPath?: string;
  parentProjectRootPaths?: string[];
  globalSkillsPath?: string;
}): SkillSource[] {
  const sources: SkillSource[] = [];
  const globalSkillsPath = normalizeRootPath(input.globalSkillsPath);
  const projectRoot = normalizeRootPath(input.projectRootPath);
  const parentRoots = normalizeRootPathList(input.parentProjectRootPaths);

  // 优先级从低到高：global → parent → project。
  if (globalSkillsPath) {
    sources.push({ scope: "global", rootPath: globalSkillsPath });
  }
  for (const parentRoot of parentRoots) {
    sources.push({ scope: "project", rootPath: parentRoot });
  }
  if (projectRoot) {
    sources.push({ scope: "project", rootPath: projectRoot });
  }
  return sources;
}


/** Recursively find SKILL.md files under the skills root, sorted by folder mtime (oldest first). */
function findSkillFiles(rootPath: string): string[] {
  if (!existsSync(rootPath)) return [];
  const entries = readdirSync(rootPath, { withFileTypes: true });
  const results: Array<{ filePath: string; mtime: number }> = [];

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      // Check if this directory directly contains SKILL.md
      const skillMdPath = path.join(entryPath, SKILL_FILE_NAME);
      if (existsSync(skillMdPath)) {
        let mtime = 0;
        try {
          mtime = statSync(entryPath).mtimeMs;
        } catch {
          // fallback to 0
        }
        results.push({ filePath: skillMdPath, mtime });
      } else {
        // Recurse into subdirectories
        const nested = findSkillFiles(entryPath);
        for (const nestedPath of nested) {
          let mtime = 0;
          try {
            mtime = statSync(path.dirname(nestedPath)).mtimeMs;
          } catch {
            // fallback
          }
          results.push({ filePath: nestedPath, mtime });
        }
      }
      continue;
    }
    if (entry.isFile() && entry.name === SKILL_FILE_NAME) {
      let mtime = 0;
      try {
        mtime = statSync(rootPath).mtimeMs;
      } catch {
        // fallback
      }
      results.push({ filePath: entryPath, mtime });
    }
  }

  // Sort by mtime ascending (oldest first, newest last)
  results.sort((a, b) => a.mtime - b.mtime);
  return results.map((r) => r.filePath);
}

/** Read a single skill summary from SKILL.md front matter. */
export function readSkillSummaryFromPath(filePath: string, scope: SkillScope): SkillSummary | null {
  // 内置 skill 的虚拟路径不需要文件系统读取
  if (filePath.startsWith("builtin://")) {
    const name = filePath.replace("builtin://", "");
    const builtin = BUILTIN_SKILLS.find((s) => s.name === name);
    if (!builtin) return null;
    return {
      name: builtin.name,
      originalName: builtin.name,
      description: builtin.description,
      path: filePath,
      folderName: builtin.name,
      scope: "builtin",
      colorIndex: builtin.colorIndex,
      hasMeta: true,
      icon: builtin.icon,
    };
  }
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, "utf8");
    const frontMatter = parseFrontMatter(content);
    const fallbackName = path.basename(path.dirname(filePath)) || path.basename(filePath);
    const originalName = (frontMatter.name || fallbackName).trim();
    if (!originalName) return null;
    let name = originalName;
    let description = normalizeDescription(frontMatter.description);
    const folderName = path.basename(path.dirname(filePath)) || fallbackName;

    // Override name/description/colorIndex/icon from openloaf.json if present
    const meta = readOpenLoafMeta(path.dirname(filePath));
    let colorIndex: number | null | undefined;
    let icon: string | undefined;
    let marketplace: SkillSummary['marketplace'];
    const hasMeta = meta !== null;
    if (meta) {
      if (meta.name) name = meta.name;
      if (meta.description) description = meta.description;
      colorIndex = meta.colorIndex;
      icon = meta.icon;
      marketplace = meta.marketplace;
    }

    return {
      name,
      originalName,
      description,
      path: filePath,
      folderName,
      scope,
      colorIndex,
      hasMeta,
      icon,
      ...(frontMatter.tools?.length ? { tools: frontMatter.tools } : {}),
      ...(marketplace ? { marketplace } : {}),
    };
  } catch {
    return null;
  }
}

/** Read openloaf.json metadata from a skill folder. */
function readOpenLoafMeta(folderPath: string): {
  name?: string
  description?: string
  targetLanguage?: string
  sourceLanguage?: string
  colorIndex?: number | null
  icon?: string
  marketplace?: {
    skillId: string
    repoId: string
    folderName: string
    version: string
    installedAt: string
  }
} | null {
  const metaPath = path.join(folderPath, "openloaf.json");
  if (!existsSync(metaPath)) return null;
  try {
    const raw = readFileSync(metaPath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      name: typeof parsed.name === "string" ? parsed.name.trim() || undefined : undefined,
      description: typeof parsed.description === "string" ? parsed.description.trim() || undefined : undefined,
      targetLanguage: typeof parsed.targetLanguage === "string" ? parsed.targetLanguage : undefined,
      sourceLanguage: typeof parsed.sourceLanguage === "string" ? parsed.sourceLanguage : undefined,
      colorIndex: typeof parsed.colorIndex === "number" ? parsed.colorIndex : null,
      icon: typeof parsed.icon === "string" ? parsed.icon.trim() || undefined : undefined,
      marketplace: parseMarketplaceMeta(parsed.marketplace),
    };
  } catch {
    return null;
  }
}

/**
 * Read skill content, optionally preferring a translated version.
 * If `preferredLanguage` is provided, checks `{skillFolder}/{lang}/SKILL.md` first.
 */
export function readSkillContentFromPath(filePath: string, preferredLanguage?: string): string {
  // 处理内置 skill 的虚拟路径
  if (filePath.startsWith("builtin://")) {
    const name = filePath.replace("builtin://", "");
    const builtin = BUILTIN_SKILLS.find((s) => s.name === name);
    return builtin?.content ?? "";
  }

  if (preferredLanguage) {
    const skillFolder = path.dirname(filePath)
    const fileName = path.basename(filePath)
    const translatedPath = path.join(skillFolder, preferredLanguage, fileName)
    if (existsSync(translatedPath)) {
      try {
        const content = readFileSync(translatedPath, "utf8")
        return stripSkillFrontMatter(content)
      } catch {
        // fall through to original
      }
    }
  }
  if (!existsSync(filePath)) return "";
  try {
    const content = readFileSync(filePath, "utf8");
    return stripSkillFrontMatter(content);
  } catch {
    return "";
  }
}

/** Alias for shared stripFrontMatter. */
const stripSkillFrontMatter = stripFrontMatterShared;

/** Parse YAML front matter for name/description/tools. */
function parseFrontMatter(content: string): SkillFrontMatter {
  const lines = content.split(/\r?\n/u);
  if (lines.length === 0) return {};
  const firstLine = lines[0] ?? "";
  if (firstLine.trim() !== FRONT_MATTER_DELIMITER) return {};

  const result: SkillFrontMatter = {};
  let currentKey: "name" | "description" | null = null;
  let blockMode: "literal" | "folded" | null = null;
  let buffer: string[] = [];
  let toolsBuffer: string[] = [];
  let inToolsList = false;

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

  const flushTools = () => {
    if (toolsBuffer.length > 0) {
      result.tools = toolsBuffer;
      toolsBuffer = [];
    }
    inToolsList = false;
  };

  // 逻辑：仅解析文件起始 front matter，避免读取正文。
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === FRONT_MATTER_DELIMITER) {
      flushBlock();
      flushTools();
      break;
    }

    // Handle YAML list items for tools (e.g. "  - CalendarQuery")
    if (inToolsList) {
      const listItem = /^\s+-\s+(.+)$/u.exec(line);
      if (listItem) {
        const id = (listItem[1] ?? '').trim();
        if (id) toolsBuffer.push(id);
        continue;
      }
      // Not a list item → end of tools list
      flushTools();
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
    const rawValue = (match[2] ?? "").trim();

    // Handle tools field: inline array or YAML list
    if (key === "tools") {
      if (rawValue) {
        // Inline format: tools: CalendarQuery, CalendarMutate, time-now
        // or bracket format: tools: [CalendarQuery, CalendarMutate]
        const cleaned = rawValue.replace(/^\[|\]$/g, "");
        result.tools = cleaned.split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        // YAML list format (items on following lines)
        inToolsList = true;
      }
      continue;
    }

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

/** Parse marketplace metadata from openloaf.json. */
function parseMarketplaceMeta(
  value: unknown,
): { skillId: string; repoId: string; folderName: string; version: string; installedAt: string } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const v = value as Record<string, unknown>
  if (
    typeof v.skillId !== 'string' || !v.skillId ||
    typeof v.repoId !== 'string' || !v.repoId ||
    typeof v.folderName !== 'string' || !v.folderName ||
    typeof v.version !== 'string' || !v.version ||
    typeof v.installedAt !== 'string' || !v.installedAt
  ) {
    return undefined
  }
  return {
    skillId: v.skillId,
    repoId: v.repoId,
    folderName: v.folderName,
    version: v.version,
    installedAt: v.installedAt,
  }
}

export type { SkillSummary, SkillScope };
