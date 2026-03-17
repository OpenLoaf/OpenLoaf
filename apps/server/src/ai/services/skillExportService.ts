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
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import JSZip from "jszip";

/** Export a skill folder as a base64-encoded zip archive. */
export async function exportSkill(skillFolderPath: string): Promise<{
  ok: boolean;
  contentBase64?: string;
  fileName?: string;
  error?: string;
}> {
  const normalizedPath = skillFolderPath.replace(/[/\\]SKILL\.md$/i, "");
  if (!existsSync(normalizedPath)) {
    return { ok: false, error: "技能文件夹不存在" };
  }
  const stat = statSync(normalizedPath);
  if (!stat.isDirectory()) {
    return { ok: false, error: "路径不是文件夹" };
  }

  const folderName = path.basename(normalizedPath);
  const zip = new JSZip();
  addFolderToZip(zip, normalizedPath, folderName);

  const content = await zip.generateAsync({ type: "base64", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return {
    ok: true,
    contentBase64: content,
    fileName: `${folderName}.zip`,
  };
}

/** Recursively add a folder's contents to a JSZip instance. */
function addFolderToZip(zip: JSZip, folderPath: string, zipPrefix: string): void {
  const entries = readdirSync(folderPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);
    const zipPath = `${zipPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      addFolderToZip(zip, fullPath, zipPath);
    } else if (entry.isFile()) {
      const content = readFileSync(fullPath);
      zip.file(zipPath, content);
    }
  }
}
