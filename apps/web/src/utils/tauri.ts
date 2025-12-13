import { isTauri } from "@tauri-apps/api/core";

export const checkIsRunningInTauri = () => {
  if (typeof window === "undefined") return false;

  try {
    // 兼容两种实现：有的版本 isTauri 是 boolean，有的是函数
    return typeof isTauri === "boolean"
      ? isTauri
      : Boolean(isTauri && (isTauri as unknown as () => boolean)());
  } catch {
    // 兜底：Tauri 注入的全局
    return "__TAURI__" in window;
  }
};

