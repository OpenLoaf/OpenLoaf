import { promises as fs } from "node:fs";
import path from "node:path";

export type SummaryIndexRecord = {
  /** Project id for summary lookup. */
  projectId: string;
  /** Absolute summary file path. */
  filePath: string;
  /** Covered date keys (YYYY-MM-DD). */
  dates: string[];
  /** Summary processing status. */
  status: "queued" | "running" | "success" | "failed";
  /** Trigger source. */
  triggeredBy: "scheduler" | "manual" | "external";
  /** IANA timezone id. */
  timezone: string;
};

export type SummaryFrontmatter = {
  /** Summary id. */
  summaryId: string;
  /** Project id. */
  projectId: string;
  /** Covered date keys (YYYY-MM-DD). */
  dates: string[];
  /** Created timestamp ISO string. */
  createdAt: string;
  /** Updated timestamp ISO string. */
  updatedAt: string;
  /** Trigger source. */
  triggeredBy: "scheduler" | "manual" | "external";
};

export type SummaryMarkdown = {
  /** Parsed frontmatter. */
  frontmatter: SummaryFrontmatter | null;
  /** Markdown content without frontmatter. */
  content: string;
};

const SUMMARY_DIR_NAME = ".openloaf/summary";
const SUMMARY_INDEX_FILE = "summary.jsonl";
const FRONTMATTER_BOUNDARY = "---";

/** Resolve summary directory from root path. */
export function getSummaryDir(rootPath: string): string {
  return path.join(rootPath, SUMMARY_DIR_NAME);
}

/** Resolve summary index path from root path. */
export function getSummaryIndexPath(rootPath: string): string {
  return path.join(getSummaryDir(rootPath), SUMMARY_INDEX_FILE);
}

/** Append a summary record into JSONL index. */
export async function appendSummaryIndex(
  rootPath: string,
  record: SummaryIndexRecord,
): Promise<void> {
  const dir = getSummaryDir(rootPath);
  await fs.mkdir(dir, { recursive: true });
  const line = `${JSON.stringify(record)}\n`;
  await fs.appendFile(getSummaryIndexPath(rootPath), line, "utf-8");
}

/** Read summary index records from JSONL. */
export async function readSummaryIndex(rootPath: string): Promise<SummaryIndexRecord[]> {
  try {
    const raw = await fs.readFile(getSummaryIndexPath(rootPath), "utf-8");
    return raw
      .split(/\n+/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SummaryIndexRecord);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Build YAML frontmatter block for summary markdown. */
export function buildFrontmatter(meta: SummaryFrontmatter): string {
  const lines = [
    FRONTMATTER_BOUNDARY,
    `summaryId: ${meta.summaryId}`,
    `projectId: ${meta.projectId}`,
    `dates: ${JSON.stringify(meta.dates)}`,
    `createdAt: ${meta.createdAt}`,
    `updatedAt: ${meta.updatedAt}`,
    `triggeredBy: ${meta.triggeredBy}`,
    FRONTMATTER_BOUNDARY,
    "",
  ];
  return lines.join("\n");
}

/** Write summary markdown file with frontmatter. */
export async function writeSummaryMarkdown(input: {
  rootPath: string;
  fileName: string;
  frontmatter: SummaryFrontmatter;
  content: string;
}): Promise<string> {
  const dir = getSummaryDir(input.rootPath);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, input.fileName);
  const body = `${buildFrontmatter(input.frontmatter)}${input.content.trim()}\n`;
  await fs.writeFile(filePath, body, "utf-8");
  return filePath;
}

/** Read summary markdown file and parse frontmatter. */
export async function readSummaryMarkdown(filePath: string): Promise<SummaryMarkdown> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return parseSummaryMarkdown(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { frontmatter: null, content: "" };
    }
    throw err;
  }
}

/** Parse summary markdown content into frontmatter + body. */
export function parseSummaryMarkdown(raw: string): SummaryMarkdown {
  const normalized = raw ?? "";
  if (!normalized.startsWith(`${FRONTMATTER_BOUNDARY}\n`)) {
    return { frontmatter: null, content: normalized };
  }
  const endIndex = normalized.indexOf(`\n${FRONTMATTER_BOUNDARY}`, FRONTMATTER_BOUNDARY.length + 1);
  if (endIndex === -1) {
    return { frontmatter: null, content: normalized };
  }
  const block = normalized.slice(FRONTMATTER_BOUNDARY.length + 1, endIndex);
  const content = normalized.slice(endIndex + FRONTMATTER_BOUNDARY.length + 1).replace(/^\n/, "");
  return {
    frontmatter: parseFrontmatterBlock(block),
    content,
  };
}

/** Parse YAML frontmatter block into summary metadata. */
export function parseFrontmatterBlock(block: string): SummaryFrontmatter | null {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const map = new Map<string, string>();
  for (const line of lines) {
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    if (!key) continue;
    map.set(key.trim(), value);
  }

  const summaryId = map.get("summaryId") ?? "";
  const projectId = map.get("projectId") ?? "";
  const datesRaw = map.get("dates") ?? "[]";
  const createdAt = map.get("createdAt") ?? "";
  const updatedAt = map.get("updatedAt") ?? "";
  const triggeredBy = (map.get("triggeredBy") ?? "scheduler") as SummaryFrontmatter["triggeredBy"];

  if (!summaryId || !projectId) return null;
  let dates: string[] = [];
  try {
    const parsed = JSON.parse(datesRaw);
    if (Array.isArray(parsed)) {
      dates = parsed.filter((value) => typeof value === "string");
    }
  } catch {
    // 逻辑：日期解析失败时回退为空数组。
    dates = [];
  }

  return {
    summaryId,
    projectId,
    dates,
    createdAt,
    updatedAt,
    triggeredBy,
  };
}
