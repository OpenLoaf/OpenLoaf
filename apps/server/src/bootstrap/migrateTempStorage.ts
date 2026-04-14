/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, rmdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { getDefaultTempStoragePath } from "@openloaf/api/services/appConfigService";
import { readBasicConf, writeBasicConf } from "@/modules/settings/openloafConfStore";

/** Historical default temp paths that predate the ~/OpenLoafData migration. */
function legacyTempCandidates(): string[] {
  const home = homedir();
  if (process.platform === "win32") {
    const list: string[] = [path.join(home, "OpenLoaf", "Temp")];
    if (existsSync("D:\\")) list.unshift("D:\\OpenLoaf\\Temp");
    return list;
  }
  if (process.platform === "darwin") {
    return [path.join(home, "Documents", "OpenLoaf", "Temp")];
  }
  return [path.join(home, "OpenLoaf", "Temp")];
}

/**
 * Probe a legacy directory.
 *
 * Returns:
 *   - { kind: "absent" }   directory does not exist (stat ENOENT)
 *   - { kind: "empty" }    directory exists but readdir returned 0 entries
 *   - { kind: "data", count }  directory has children
 *   - { kind: "blocked" }  directory exists (stat OK) but readdir threw EPERM/EACCES
 *                          — typical macOS App Management / TCC scenario where the
 *                          server process can stat ~/Documents but cannot enumerate it.
 *
 * Critical: do NOT collapse "blocked" into "absent" — that's exactly the silent
 * failure mode that hid the issue last time.
 */
type LegacyProbe =
  | { kind: "absent" }
  | { kind: "empty" }
  | { kind: "data"; count: number }
  | { kind: "blocked"; reason: string };

function probeLegacyDir(dir: string): LegacyProbe {
  if (!existsSync(dir)) return { kind: "absent" };
  try {
    const count = readdirSync(dir).length;
    return count > 0 ? { kind: "data", count } : { kind: "empty" };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "";
    if (code === "EPERM" || code === "EACCES") {
      return { kind: "blocked", reason: code };
    }
    return { kind: "blocked", reason: (err as Error).message };
  }
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

/**
 * One-shot migration from legacy temp paths to ~/OpenLoafData.
 *
 * Runs on every server boot but is idempotent: once the legacy path is
 * emptied, subsequent runs are no-ops.
 *
 * Policy:
 *   - Only users on the *default* path (empty setting or setting equal to a
 *     legacy default) are migrated. Users who customized appTempStorageDir
 *     to a non-legacy location are left untouched.
 *   - Each top-level child under the legacy dir is moved into the new root;
 *     collisions are skipped (no clobber).
 *   - After a successful move the setting is cleared so it falls back to the
 *     new default on next read.
 */
export function migrateLegacyTempStorage(): void {
  const newDefault = getDefaultTempStoragePath();
  const legacyPaths = legacyTempCandidates();

  const conf = readBasicConf();
  const saved = (conf.appTempStorageDir ?? "").trim();

  // Bail out if the user has customized the path to something that isn't a
  // historical default — they decided, we don't touch.
  const settingIsLegacyOrEmpty =
    saved === "" ||
    samePath(saved, newDefault) ||
    legacyPaths.some((p) => samePath(saved, p));
  if (!settingIsLegacyOrEmpty) return;

  // Probe each candidate; act on the first one that has data or is blocked.
  let legacyWithData: string | null = null;
  for (const p of legacyPaths) {
    if (samePath(p, newDefault)) continue;
    const probe = probeLegacyDir(p);
    if (probe.kind === "absent" || probe.kind === "empty") continue;
    if (probe.kind === "blocked") {
      // Server process can stat the dir but cannot enumerate it (macOS App
      // Management / TCC). We cannot migrate from inside the server — log a
      // clear, actionable message and move on. Do NOT silently swallow this.
      console.warn(
        `[migrate-temp] legacy data directory exists at ${p} but the server ` +
          `process cannot read it (${probe.reason}). This is the macOS App ` +
          `Management / TCC restriction on ~/Documents. Migrate manually with:\n` +
          `  mv "${p}"/* "${p}"/.* "${newDefault}"/ 2>/dev/null; rmdir "${p}"\n` +
          `or grant the desktop app "Files and Folders → Documents" access in ` +
          `System Settings → Privacy & Security and restart.`,
      );
      return;
    }
    legacyWithData = p;
    break;
  }
  if (!legacyWithData) return;

  mkdirSync(newDefault, { recursive: true });

  let moved = 0;
  let skipped = 0;
  for (const name of readdirSync(legacyWithData)) {
    const src = path.join(legacyWithData, name);
    const dst = path.join(newDefault, name);
    if (existsSync(dst)) {
      skipped++;
      continue;
    }
    try {
      renameSync(src, dst);
      moved++;
    } catch {
      try {
        cpSync(src, dst, { recursive: true, errorOnExist: true });
        rmSync(src, { recursive: true, force: true });
        moved++;
      } catch (err) {
        console.warn(
          `[migrate-temp] skip ${src}: ${(err as Error).message}`,
        );
        skipped++;
      }
    }
  }

  try {
    if (readdirSync(legacyWithData).length === 0) rmdirSync(legacyWithData);
  } catch {
    // Leave the dir in place if cleanup fails; not critical.
  }

  if (saved && !samePath(saved, newDefault)) {
    writeBasicConf({ ...conf, appTempStorageDir: "" });
  }

  console.log(
    `[migrate-temp] ${legacyWithData} -> ${newDefault} (moved=${moved}, skipped=${skipped})`,
  );
}
