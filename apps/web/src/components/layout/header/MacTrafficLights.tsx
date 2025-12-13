"use client";

import { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { checkIsRunningInTauri } from "@/utils/tauri";

const isMacOS = () => {
  if (typeof navigator === "undefined") return false;
  return navigator.platform.toLowerCase().includes("mac");
};

export function MacTrafficLights() {
  const shouldRender = checkIsRunningInTauri() && isMacOS();
  const appWindow = shouldRender ? getCurrentWindow() : null;

  const close = useCallback(async () => {
    if (!appWindow) return;
    await appWindow.close();
  }, [appWindow]);

  const minimize = useCallback(async () => {
    if (!appWindow) return;
    await appWindow.minimize();
  }, [appWindow]);

  const toggleMaximize = useCallback(async () => {
    if (!appWindow) return;
    const maximized = await appWindow.isMaximized();
    if (maximized) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  }, [appWindow]);

  if (!shouldRender) return null;

  const base =
    "h-3 w-3 rounded-full border border-black/20 hover:brightness-110 active:brightness-95";

  return (
    <div className="flex items-center gap-2 pl-3 pr-2" aria-label="Window controls">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className={`${base} bg-[#ff5f57]`}
      />
      <button
        type="button"
        aria-label="Minimize"
        onClick={minimize}
        className={`${base} bg-[#febc2e]`}
      />
      <button
        type="button"
        aria-label="Maximize"
        onClick={toggleMaximize}
        className={`${base} bg-[#28c840]`}
      />
    </div>
  );
}

