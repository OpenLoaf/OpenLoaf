import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(__dirname, "..");
const sourceDir = resolve(webRoot, "node_modules/monaco-editor/min/vs");
const destDir = resolve(webRoot, "public/monaco/vs");

/** Copy Monaco editor assets into the web public folder. */
function copyMonacoAssets() {
  // 逻辑：避免引用不存在的依赖，先校验源目录。
  if (!existsSync(sourceDir)) {
    console.error("[monaco] Source assets not found:", sourceDir);
    process.exit(1);
  }

  // 逻辑：确保目标目录干净，避免残留旧版本文件。
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  cpSync(sourceDir, destDir, { recursive: true });
  console.log("[monaco] Assets copied to", destDir);
}

copyMonacoAssets();
