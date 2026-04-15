/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const webRoot = resolve(__dirname, "..");
const pdfjsPackagePath = require.resolve("pdfjs-dist/package.json");
const pdfjsRoot = dirname(pdfjsPackagePath);

// 扫描件/CJK PDF 依赖 cmaps 和 standard_fonts 做字体/编码回退，
// 不带这两个目录时 pdf.js 会在 Document.onLoadError 抛 UnknownErrorException。
const assets = [
  { src: resolve(pdfjsRoot, "cmaps"), dest: resolve(webRoot, "public/pdfjs/cmaps") },
  {
    src: resolve(pdfjsRoot, "standard_fonts"),
    dest: resolve(webRoot, "public/pdfjs/standard_fonts"),
  },
];

for (const { src, dest } of assets) {
  if (!existsSync(src)) {
    console.error("[pdfjs] Source assets not found:", src);
    process.exit(1);
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log("[pdfjs] Assets copied to", dest);
}
