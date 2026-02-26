/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");

// Forge: playwright-core 通过 NATIVE_DEP_ROOTS 递归解析（postPackage 钩子处理）
const forgeConfigPath = path.join(repoRoot, "apps", "electron", "forge.config.ts");
const forgeConfig = fs.readFileSync(forgeConfigPath, "utf-8");
const hasForgeEntry = forgeConfig.includes("'playwright-core'");

// electron-builder: playwright-core 在 package.json build.extraResources 中显式列出
const expectedFrom = "../../node_modules/playwright-core";
const expectedTo = "node_modules/playwright-core";
const builderPkgPath = path.join(repoRoot, "apps", "electron", "package.json");
const builderPkg = JSON.parse(fs.readFileSync(builderPkgPath, "utf-8"));
const builderExtra = builderPkg?.build?.extraResources ?? [];
const hasBuilderEntry = builderExtra.some(
  (entry) => entry?.from === expectedFrom && entry?.to === expectedTo
);

if (!hasForgeEntry || !hasBuilderEntry) {
  if (!hasForgeEntry) {
    console.error(
      "[check-extra-resources] Missing 'playwright-core' in NATIVE_DEP_ROOTS (forge.config.ts)."
    );
  }
  if (!hasBuilderEntry) {
    console.error(
      `[check-extra-resources] Missing ${expectedFrom} -> ${expectedTo} in apps/desktop/package.json build.extraResources.`
    );
  }
  process.exit(1);
}

console.log("[check-extra-resources] OK: playwright-core is packaged for both Forge and Builder.");
