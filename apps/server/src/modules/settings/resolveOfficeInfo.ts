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
import fs from "node:fs";
import { execSync } from "node:child_process";

export type OfficeInfo = {
  wps: {
    installed: boolean;
    path?: string;
    version?: string;
  };
};

// NOTE: JS string "\\" = single backslash char on disk
const WINDOWS_SYSTEM_DIRS = [
  "C:\\Program Files\\Kingsoft\\WPS Office",
  "C:\\Program Files (x86)\\Kingsoft\\WPS Office",
];

const WINDOWS_EXECUTABLES = ["wps.exe", "wpp.exe", "et.exe", "ksolaunch.exe"];

const MAC_CANDIDATES = [
  "/Applications/wpsoffice.app",
  "/Applications/WPS Office.app",
];

const LINUX_CANDIDATES = ["/usr/bin/wps", "/usr/bin/et", "/usr/bin/wpp"];

// ── Windows ──────────────────────────────────────────────

function findWindowsWps(): { path: string; version?: string } | null {
  // Build candidate list: system-level + user-level (%LOCALAPPDATA%)
  const candidates = [...WINDOWS_SYSTEM_DIRS];
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    candidates.push(path.join(localAppData, "Kingsoft", "WPS Office"));
  }

  for (const base of candidates) {
    if (!fs.existsSync(base)) continue;

    // Flat check: exe directly under base
    for (const exe of WINDOWS_EXECUTABLES) {
      if (fs.existsSync(path.join(base, exe))) {
        return { path: base };
      }
    }

    // Nested check: {version}\office6\{exe} (typical WPS layout)
    try {
      const entries = fs.readdirSync(base, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const office6 = path.join(base, entry.name, "office6");
        if (!fs.existsSync(office6)) continue;
        for (const exe of WINDOWS_EXECUTABLES) {
          if (fs.existsSync(path.join(office6, exe))) {
            return { path: base, version: entry.name };
          }
        }
      }
    } catch {
      // ignore read errors
    }

    // Base dir exists even if we didn't find a specific exe
    return { path: base };
  }

  // Fallback: Windows registry via COM ProgID → CLSID → LocalServer32
  return findWindowsWpsViaRegistry();
}

/**
 * Registry-based detection (reference: OfficeMCP Officer.py).
 *
 * 1. HKEY_CLASSES_ROOT\Kwps.Application\CLSID  → {clsid}
 * 2. HKEY_CLASSES_ROOT\CLSID\{clsid}\LocalServer32  → exe path
 */
function findWindowsWpsViaRegistry(): {
  path: string;
  version?: string;
} | null {
  const progIds = ["Kwps.Application", "Ket.Application", "Kwpp.Application"];
  for (const progId of progIds) {
    try {
      const clsidOut = execSync(
        `reg query "HKEY_CLASSES_ROOT\\${progId}\\CLSID" /ve`,
        { encoding: "utf-8", timeout: 5000, windowsHide: true },
      );
      const clsidMatch = clsidOut.match(/\{[0-9A-Fa-f-]+\}/);
      if (!clsidMatch) continue;

      const serverOut = execSync(
        `reg query "HKEY_CLASSES_ROOT\\CLSID\\${clsidMatch[0]}\\LocalServer32" /ve`,
        { encoding: "utf-8", timeout: 5000, windowsHide: true },
      );
      const rawPath = serverOut.match(/REG_SZ\s+(.+)/i)?.[1];
      if (!rawPath) continue;

      // Clean: strip quotes and trailing flags like /automation
      const exePath = rawPath
        .trim()
        .replace(/^"/, "")
        .replace(/".*/, "")
        .replace(/\s+\/.*/, "")
        .trim();

      const dir = path.dirname(exePath);
      if (dir) return { path: dir };
    } catch {
      continue;
    }
  }
  return null;
}

// ── macOS ────────────────────────────────────────────────

function findMacWps(): { path: string; version?: string } | null {
  for (const appPath of MAC_CANDIDATES) {
    if (!fs.existsSync(appPath)) continue;

    let version: string | undefined;
    try {
      version =
        execSync(
          `defaults read "${appPath}/Contents/Info.plist" CFBundleShortVersionString`,
          { encoding: "utf-8", timeout: 5000 },
        ).trim() || undefined;
    } catch {
      // version read failed, still return path
    }
    return { path: appPath, version };
  }
  return null;
}

// ── Linux ────────────────────────────────────────────────

function findLinuxWps(): { path: string; version?: string } | null {
  for (const binPath of LINUX_CANDIDATES) {
    if (!fs.existsSync(binPath)) continue;

    let version: string | undefined;
    try {
      const out = execSync(`"${binPath}" --version 2>/dev/null || true`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      const m = out.match(/[\d]+\.[\d]+\.[\d]+/);
      if (m) version = m[0];
    } catch {
      // ignore
    }
    return { path: binPath, version };
  }
  return null;
}

// ── Entry ────────────────────────────────────────────────

export function resolveOfficeInfo(): OfficeInfo {
  let result: { path: string; version?: string } | null = null;

  switch (process.platform) {
    case "win32":
      result = findWindowsWps();
      break;
    case "darwin":
      result = findMacWps();
      break;
    case "linux":
      result = findLinuxWps();
      break;
  }

  return {
    wps: {
      installed: Boolean(result),
      path: result?.path,
      version: result?.version,
    },
  };
}
