/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Get CDP targetId for a given webContents using Electron's debugger API.
 */
export async function getCdpTargetId(webContents: Electron.WebContents): Promise<string | undefined> {
  const dbg = webContents.debugger;
  let attachedHere = false;
  try {
    if (!dbg.isAttached()) {
      dbg.attach('1.3');
      attachedHere = true;
    }
    // 通过 Target.getTargetInfo 获取当前 webContents 对应的 CDP targetId。
    const info = (await dbg.sendCommand('Target.getTargetInfo')) as {
      targetInfo?: { targetId?: string };
    };
    const id = String(info?.targetInfo?.targetId ?? '');
    return id || undefined;
  } catch {
    return undefined;
  } finally {
    if (attachedHere) {
      try {
        dbg.detach();
      } catch {
        // ignore
      }
    }
  }
}
