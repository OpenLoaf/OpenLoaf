import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");

const expectedFrom = "../../node_modules/playwright-core";
const expectedTo = "node_modules/playwright-core";

const forgeConfigPath = path.join(repoRoot, "apps", "electron", "forge.config.ts");
const forgeConfig = fs.readFileSync(forgeConfigPath, "utf-8");
const hasForgeEntry = forgeConfig.includes(expectedFrom);

const builderPkgPath = path.join(repoRoot, "apps", "electron", "package.json");
const builderPkg = JSON.parse(fs.readFileSync(builderPkgPath, "utf-8"));
const builderExtra = builderPkg?.build?.extraResources ?? [];
const hasBuilderEntry = builderExtra.some(
  (entry) => entry?.from === expectedFrom && entry?.to === expectedTo
);

if (!hasForgeEntry || !hasBuilderEntry) {
  if (!hasForgeEntry) {
    console.error(
      `[check-extra-resources] Missing ${expectedFrom} in apps/electron/forge.config.ts extraResource.`
    );
  }
  if (!hasBuilderEntry) {
    console.error(
      `[check-extra-resources] Missing ${expectedFrom} -> ${expectedTo} in apps/electron/package.json build.extraResources.`
    );
  }
  process.exit(1);
}

console.log("[check-extra-resources] OK: playwright-core is packaged for both Forge and Builder.");
