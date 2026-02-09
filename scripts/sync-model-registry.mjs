#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_OUTPUT = "apps/web/src/lib/model-registry/providers.generated.json";

function isHttpSource(value) {
  return value.startsWith("http://") || value.startsWith("https://");
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function normalizePayload(payload) {
  if (Array.isArray(payload)) {
    return { providers: payload };
  }
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.providers)) {
      return {
        providers: payload.providers,
        updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : undefined,
      };
    }
    if (typeof payload.id === "string") {
      return { providers: [payload] };
    }
  }
  throw new Error("Invalid model registry payload");
}

function validateProviders(providers) {
  for (const provider of providers) {
    if (!provider || typeof provider.id !== "string") {
      throw new Error("Provider id is required");
    }
  }
}

async function loadFromDirectory(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  const providers = [];
  for (const file of files) {
    const payload = await readJsonFile(path.join(dirPath, file));
    const normalized = normalizePayload(payload);
    providers.push(...normalized.providers);
  }
  return { providers };
}

export async function buildModelRegistryPayload(source, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  let payload;
  if (isHttpSource(source)) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Failed to fetch model registry: ${response.status}`);
    }
    payload = await response.json();
  } else {
    const resolved = path.isAbsolute(source) ? source : path.resolve(cwd, source);
    const stat = await fs.stat(resolved);
    payload = stat.isDirectory()
      ? await loadFromDirectory(resolved)
      : await readJsonFile(resolved);
  }

  const normalized = normalizePayload(payload);
  validateProviders(normalized.providers);
  return {
    updatedAt: normalized.updatedAt ?? new Date().toISOString(),
    providers: normalized.providers,
  };
}

export async function writeModelRegistryPayload(payload, outputPath, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const resolved = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(cwd, outputPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(payload, null, 2)}\n`);
  return resolved;
}

export async function syncModelRegistry(options = {}) {
  const source = options.source;
  const output = options.output ?? DEFAULT_OUTPUT;
  if (!source) {
    throw new Error("Missing model registry source");
  }
  const payload = await buildModelRegistryPayload(source, options);
  const resolved = await writeModelRegistryPayload(payload, output, options);
  return { path: resolved, count: payload.providers.length };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const source =
    args[0] ?? process.env.MODEL_REGISTRY_URL ?? process.env.MODEL_REGISTRY_PATH;
  const output = args[1] ?? process.env.MODEL_REGISTRY_OUTPUT ?? DEFAULT_OUTPUT;
  if (!source) {
    console.error(
      "Usage: sync-model-registry <source> [output]\\n" +
        "Source can be a URL, file path, or directory of provider JSON files.",
    );
    process.exit(1);
  }
  syncModelRegistry({ source, output }).then(
    ({ path: resolvedPath, count }) => {
      console.log(`Saved ${count} providers to ${resolvedPath}`);
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
