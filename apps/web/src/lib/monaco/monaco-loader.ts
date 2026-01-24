"use client";

import { loader } from "@monaco-editor/react";
import type { Environment } from "monaco-editor";

/** 本地 Monaco 静态资源路径。 */
export const MONACO_ASSETS_PATH = "/monaco/vs";
/** Monaco 通用 worker 脚本路径。 */
export const MONACO_WORKER_MAIN_PATH = `${MONACO_ASSETS_PATH}/base/worker/workerMain.js`;

declare global {
  interface Window {
    MonacoEnvironment?: Environment;
  }
}

/** Configure Monaco to load assets and workers from local static files. */
function configureMonacoLoader() {
  loader.config({ paths: { vs: MONACO_ASSETS_PATH } });

  if (typeof window === "undefined") return;

  // 逻辑：保留已有环境配置，仅补齐 worker 地址。
  const existing = window.MonacoEnvironment ?? {};
  window.MonacoEnvironment = {
    ...existing,
    getWorkerUrl: () => MONACO_WORKER_MAIN_PATH,
  };
}

configureMonacoLoader();
