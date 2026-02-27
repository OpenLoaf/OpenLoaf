/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client';

import { useEffect, useRef } from 'react';

let prewarmStarted = false;
let prewarmDone = false;
let prewarmPromise: Promise<void> | null = null;

// 通过 idle/timeout 预热编辑器相关的大模块，尽量把同步初始化成本挪到空闲时间执行
function scheduleIdle(fn: () => void, timeout = 800): () => void {
  // SSR 环境直接返回空回调
  if (typeof window === 'undefined') return () => {};
  // 浏览器空闲回调，存在则优先使用
  if ('requestIdleCallback' in window) {
    const handle = (window as any).requestIdleCallback(fn, { timeout });
    return () => {
      (window as any).cancelIdleCallback(handle);
    };
  }
  // 兜底：使用 setTimeout 模拟
  const h = setTimeout(fn, timeout);
  return () => clearTimeout(h);
}

async function doPrewarm() {
  if (prewarmDone) return;
  // 中文注释：动态引入编辑器插件与静态渲染模块，拆到独立 chunk，空闲时加载。
  const t0 = performance.now();
  await Promise.allSettled([
    import('@/components/editor/editor-kit'),
    import('@/components/editor/editor-base-kit'),
    import('platejs/react'),
    import('platejs/static'),
  ]);
  prewarmDone = true;
  const dt = Math.round(performance.now() - t0);
  // eslint-disable-next-line no-console
  console.log(`[Plate][prewarm] modules loaded: ${dt}ms`);
}

/** Preload heavy editor modules during browser idle time to reduce jank on first open. */
export function usePrewarmPlate() {
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (prewarmStarted || prewarmDone) return;
    prewarmStarted = true;
    cancelRef.current = scheduleIdle(() => {
      prewarmPromise = doPrewarm();
    }, 600);
    return () => {
      cancelRef.current?.();
      cancelRef.current = null;
    };
  }, []);
}
