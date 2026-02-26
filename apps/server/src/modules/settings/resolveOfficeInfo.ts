/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport path from "node:path";
import fs from "node:fs";

export type OfficeInfo = {
  wps: {
    installed: boolean;
    path?: string;
    version?: string;
  };
};

const WINDOWS_CANDIDATES = [
  "C:\\\\Program Files\\\\Kingsoft\\\\WPS Office",
  "C:\\\\Program Files (x86)\\\\Kingsoft\\\\WPS Office",
];

const WINDOWS_EXECUTABLES = ["wps.exe", "wpp.exe", "et.exe", "ksolaunch.exe"];

const MAC_CANDIDATES = ["/Applications/WPS Office.app"];

const LINUX_CANDIDATES = ["/usr/bin/wps", "/usr/bin/et", "/usr/bin/wpp"];

function findWindowsWps(): string | null {
  for (const base of WINDOWS_CANDIDATES) {
    if (!fs.existsSync(base)) continue;
    for (const exe of WINDOWS_EXECUTABLES) {
      const candidate = path.join(base, exe);
      if (fs.existsSync(candidate)) return candidate;
    }
    return base;
  }
  return null;
}

function findMacWps(): string | null {
  for (const base of MAC_CANDIDATES) {
    if (fs.existsSync(base)) return base;
  }
  return null;
}

function findLinuxWps(): string | null {
  for (const base of LINUX_CANDIDATES) {
    if (fs.existsSync(base)) return base;
  }
  return null;
}

export function resolveOfficeInfo(): OfficeInfo {
  let wpsPath: string | null = null;
  switch (process.platform) {
    case "win32":
      wpsPath = findWindowsWps();
      break;
    case "darwin":
      wpsPath = findMacWps();
      break;
    case "linux":
      wpsPath = findLinuxWps();
      break;
    default:
      wpsPath = null;
      break;
  }

  return {
    wps: {
      installed: Boolean(wpsPath),
      path: wpsPath ?? undefined,
    },
  };
}
