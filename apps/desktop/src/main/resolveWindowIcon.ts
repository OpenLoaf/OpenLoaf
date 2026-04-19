/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { app, nativeImage } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * Resolve the best icon path for BrowserWindow.
 */
export function resolveWindowIconPath(): string | undefined {
  const candidates = getCandidateIconPaths();
  // 中文注释：仅返回存在的路径，供 BrowserWindow 读取。
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * 中文注释：Linux X11 对单次请求有 ~16MB 上限，
 * 解码后超大图标（例如 3072×3072 RGBA ≈ 36MB）会让 X11 请求体越界，
 * 触发 "Cannot send request of length …" 进而拖垮 GPU 进程。
 * 在 Linux 上改为返回 resize 过的 NativeImage，避免把原图直接交给 Chromium。
 * 其他平台继续走路径，保持高 DPI icns/ico 的原生渲染质量。
 */
export function resolveWindowIconForBrowser():
  | string
  | Electron.NativeImage
  | undefined {
  if (process.platform !== 'linux') {
    return resolveWindowIconPath();
  }
  const info = resolveWindowIconInfo();
  if (!info) return undefined;
  const { width, height } = info.image.getSize();
  const max = Math.max(width, height);
  if (max <= 256) return info.image;
  return info.image.resize({ width: 256, height: 256, quality: 'best' });
}

/**
 * Resolve the best icon image for Dock / Cmd+Tab usage.
 */
export function resolveWindowIconImage(): Electron.NativeImage | undefined {
  const info = resolveWindowIconInfo();
  return info?.image;
}

export function resolveWindowIconInfo():
  | { path: string; image: Electron.NativeImage }
  | undefined {
  const candidates = getCandidateIconPaths();
  const isDebug = !app.isPackaged;
  // 中文注释：优先返回可用的非空图标，避免加载失败导致回退到默认图标。
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) {
      return { path: candidate, image };
    }
  }
  return undefined;
}

/**
 * Build icon path candidates in order of preference.
 */
function getCandidateIconPaths(): string[] {
  const preferIco = process.platform === 'win32';
  const preferIcns = process.platform === 'darwin';
  const isDev = !app.isPackaged;

  // 中文注释：开发模式优先使用 dev-icon，与生产图标区分。
  const devFilenames = preferIcns
    ? ['dev-icon.icns', 'dev-icon.png']
    : preferIco
      ? ['dev-icon.ico', 'dev-icon.png']
      : ['dev-icon.png'];

  // 中文注释：macOS 优先使用 icns，匹配正式打包的图标渲染效果。
  const prodFilenames = preferIcns
    ? ['icon.icns', 'icon.png', 'icon.ico']
    : preferIco
      ? ['icon.ico', 'icon.png']
      : ['icon.png', 'icon.ico'];

  const filenames = isDev ? [...devFilenames, ...prodFilenames] : prodFilenames;
  const roots = [
    process.resourcesPath,
    path.join(process.cwd(), 'resources'),
    path.join(process.cwd(), 'apps', 'electron', 'resources'),
    path.join(app.getAppPath(), 'resources'),
    path.join(app.getAppPath(), '..', 'resources'),
  ];

  // 中文注释：优先从打包资源目录读取，开发模式再回退到工程 resources。
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const root of roots) {
    const base = path.resolve(root);
    if (seen.has(base)) continue;
    seen.add(base);
    for (const filename of filenames) {
      candidates.push(path.join(base, filename));
    }
  }
  return candidates;
}
