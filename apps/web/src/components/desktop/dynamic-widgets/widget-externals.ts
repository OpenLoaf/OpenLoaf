'use client'

import * as React from 'react'
import * as ReactJSXRuntime from 'react/jsx-runtime'

/**
 * 逻辑：esbuild 编译 widget 时将 react/react-dom/react-jsx-runtime 标记为 external，
 * 产物中保留 `from 'react'` 等裸模块标识符。浏览器 Blob URL import 无法解析裸标识符，
 * 需要将它们替换为可 import 的 Blob URL shim。
 */

const EXTERNALS_KEY = '__TENAS_WIDGET_EXTERNALS__'

/** 注册外部依赖到全局，供 Blob URL shim 模块访问 */
export function ensureExternalsRegistered() {
  if (typeof window === 'undefined') return
  if ((window as any)[EXTERNALS_KEY]) return
  ;(window as any)[EXTERNALS_KEY] = {
    'react': React,
    'react/jsx-runtime': ReactJSXRuntime,
    'react-dom': React,
  }
}

/** 为外部依赖创建 Blob URL shim，浏览器可以 import 这些 URL */
const shimUrlCache = new Map<string, string>()

function getShimUrl(moduleName: string): string {
  const cached = shimUrlCache.get(moduleName)
  if (cached) return cached

  const shimCode = moduleName === 'react/jsx-runtime'
    ? `const m = window['${EXTERNALS_KEY}']['${moduleName}'];
export const jsx = m.jsx;
export const jsxs = m.jsxs;
export const jsxDEV = m.jsxDEV || m.jsx;
export const Fragment = m.Fragment;
export default m;`
    : moduleName === 'react'
      ? `const m = window['${EXTERNALS_KEY}']['${moduleName}'];
export default m;
export const useState = m.useState;
export const useEffect = m.useEffect;
export const useCallback = m.useCallback;
export const useMemo = m.useMemo;
export const useRef = m.useRef;
export const useContext = m.useContext;
export const useReducer = m.useReducer;
export const useId = m.useId;
export const createContext = m.createContext;
export const createElement = m.createElement;
export const Fragment = m.Fragment;
export const forwardRef = m.forwardRef;
export const memo = m.memo;
export const lazy = m.lazy;
export const Suspense = m.Suspense;
export const Children = m.Children;
export const cloneElement = m.cloneElement;
export const isValidElement = m.isValidElement;
export const startTransition = m.startTransition;
export const useTransition = m.useTransition;
export const useDeferredValue = m.useDeferredValue;
export const useSyncExternalStore = m.useSyncExternalStore;
export const useInsertionEffect = m.useInsertionEffect;
export const useLayoutEffect = m.useLayoutEffect;
export const useImperativeHandle = m.useImperativeHandle;
export const useDebugValue = m.useDebugValue;`
      : `const m = window['${EXTERNALS_KEY}']['${moduleName}'];
export default m;`

  const url = URL.createObjectURL(
    new Blob([shimCode], { type: 'text/javascript' }),
  )
  shimUrlCache.set(moduleName, url)
  return url
}

/** 替换编译产物中的裸模块标识符为 Blob URL */
export function patchBareImports(code: string): string {
  const externals = [
    'react/jsx-runtime',
    'react-dom',
    'react',
    '@tenas-ai/widget-sdk',
  ]
  let patched = code
  for (const ext of externals) {
    const shimUrl = getShimUrl(ext)
    const escaped = ext.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    patched = patched.replace(
      new RegExp(`from\\s+['"]${escaped}['"]`, 'g'),
      `from '${shimUrl}'`,
    )
  }
  return patched
}
