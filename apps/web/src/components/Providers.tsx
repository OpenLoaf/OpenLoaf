"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { queryClient } from "@/utils/trpc";
import { useDisableContextMenu } from "@/lib/useDisableContextMenu";
import "@/lib/monaco/monaco-loader";
import { ThemeProvider } from "./ThemeProvider";
import { handleUiEvent } from "@/lib/chat/uiEvent";
import type { UiEvent } from "@tenas-ai/api";
import { usePrewarmPlate } from "@/hooks/use-prewarm-plate";
import { useBasicConfig } from "@/hooks/use-basic-config";
import AutoUpdateGate from "@/components/layout/AutoUpdateGate";
import { clearThemeOverride, readThemeOverride } from "@/lib/theme-override";
import FilePreviewDialog from "@/components/file/FilePreviewDialog";
import LocalAuthGate from "@/components/local-auth/LocalAuthGate";
import { isElectronEnv } from "@/utils/is-electron-env";

type ThemeSelection = "light" | "dark" | "system";
type FontSizeSelection = "small" | "medium" | "large" | "xlarge";

const WINDOWS_TITLEBAR_SYMBOL_LIGHT = "#1c1c1c";
const WINDOWS_TITLEBAR_SYMBOL_DARK = "#f2f2f0";

/** Normalize theme selection from unknown input. */
function normalizeThemeSelection(value: unknown): ThemeSelection | null {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return null;
}

/** Normalize font size selection from unknown input. */
function normalizeFontSizeSelection(value: unknown): FontSizeSelection {
  if (value === "small" || value === "medium" || value === "large" || value === "xlarge") {
    return value;
  }
  return "medium";
}

/** Convert font size selection to root font size. */
function toRootFontSize(value: FontSizeSelection): string {
  return value === "small"
    ? "14px"
    : value === "medium"
      ? "16px"
      : value === "large"
        ? "18px"
        : "20px";
}

/** Apply theme from settings once when the app boots. */
function ThemeSettingsBootstrap() {
  const { theme, setTheme } = useTheme();
  const { basic, isLoading } = useBasicConfig();
  // 仅首次应用数据库配置，避免与用户切换造成相互覆盖。
  const appliedThemeRef = useRef(false);

  useEffect(() => {
    if (isLoading || appliedThemeRef.current) return;
    const nextTheme = normalizeThemeSelection(basic.uiTheme);
    if (!nextTheme) return;
    if (nextTheme === "system") {
      // 逻辑：系统模式优先读取当日覆盖，跨日自动失效。
      const override = readThemeOverride();
      const target = override?.theme ?? "system";
      if (theme === target) {
        appliedThemeRef.current = true;
        return;
      }
      appliedThemeRef.current = true;
      setTheme(target);
      return;
    }
    // 逻辑：手动模式清理覆盖，避免影响下次系统切换。
    clearThemeOverride();
    if (theme === nextTheme) {
      appliedThemeRef.current = true;
      return;
    }
    appliedThemeRef.current = true;
    setTheme(nextTheme);
  }, [isLoading, basic.uiTheme, theme, setTheme]);

  return null;
}

/** Apply font size from settings to the document root. */
function FontSizeSettingsBootstrap() {
  const { basic, isLoading } = useBasicConfig();

  useEffect(() => {
    if (isLoading) return;
    const nextFontSize = toRootFontSize(normalizeFontSizeSelection(basic.uiFontSize));
    // 逻辑：启动时把字号写入根节点，避免未打开设置页时字号不生效。
    document.documentElement.style.fontSize = nextFontSize;
  }, [basic.uiFontSize, isLoading]);

  return null;
}

/** Apply animation level to the document root. */
function AnimationSettingsBootstrap() {
  const { basic, isLoading } = useBasicConfig();

  useEffect(() => {
    if (isLoading) return;
    const level = basic.uiAnimationLevel;
    const next =
      level === "low" || level === "medium" || level === "high" ? level : "high";
    // 逻辑：统一写入到根节点，供非 React 模块读取。
    document.documentElement.dataset.uiAnimationLevel = next;
  }, [basic.uiAnimationLevel, isLoading]);

  return null;
}

function WindowsTitlebarSymbolColorBootstrap() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const api = window.tenasElectron;
    if (!api?.setTitleBarSymbolColor) return;
    const isElectron = isElectronEnv();
    if (!isElectron) return;
    const isWindows =
      typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("win");
    if (!isWindows) return;

    const themeValue = typeof resolvedTheme === "string" ? resolvedTheme.toLowerCase() : "";
    const isDark =
      themeValue === "dark" ||
      (themeValue !== "light" && document.documentElement.classList.contains("dark"));
    const symbolColor = isDark
      ? WINDOWS_TITLEBAR_SYMBOL_DARK
      : WINDOWS_TITLEBAR_SYMBOL_LIGHT;
    api.setTitleBarSymbolColor({ symbolColor }).catch(() => {});
  }, [resolvedTheme]);

  return null;
}

function WindowsTitlebarHeightBootstrap() {
  useEffect(() => {
    const api = window.tenasElectron;
    const setTitleBarOverlayHeight = api?.setTitleBarOverlayHeight;
    if (!setTitleBarOverlayHeight) return;
    const isElectron = isElectronEnv();
    if (!isElectron) return;
    const isWindows =
      typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("win");
    if (!isWindows) return;

    let headerEl: HTMLElement | null = null;
    let rafId = 0;
    let retryId: number | null = null;
    let lastHeight = 0;
    let observed = false;

    const schedule = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        sync();
      });
    };

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    const mutationObserver = new MutationObserver(schedule);

    const sync = () => {
      if (!headerEl || !document.contains(headerEl)) {
        headerEl = document.querySelector<HTMLElement>('[data-slot="app-header"]');
        if (!headerEl && retryId == null) {
          retryId = window.setTimeout(() => {
            retryId = null;
            schedule();
          }, 120);
          return;
        }
      }
      if (headerEl && resizeObserver && !observed) {
        resizeObserver.observe(headerEl);
        observed = true;
      }
      if (!headerEl) return;
      const height = Math.max(0, Math.round(headerEl.getBoundingClientRect().height));
      if (!height || height === lastHeight) return;
      lastHeight = height;
      setTitleBarOverlayHeight({ height }).catch(() => {});
    };

    mutationObserver.observe(document.body ?? document.documentElement, {
      childList: true,
      subtree: true,
    });
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      window.removeEventListener("resize", schedule);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
      if (rafId) window.cancelAnimationFrame(rafId);
      if (retryId != null) window.clearTimeout(retryId);
    };
  }, []);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  useDisableContextMenu();
  // 中文注释：应用空闲时预热编辑器相关模块，降低首次打开时的卡顿峰值。
  usePrewarmPlate();

  useEffect(() => {
    const isElectron = isElectronEnv();
    const isMac =
      typeof navigator !== "undefined" &&
      navigator.platform.toLowerCase().includes("mac");
    const isWindows =
      typeof navigator !== "undefined" &&
      navigator.platform.toLowerCase().includes("win");
    const hasTitlebarOverlay =
      isElectron && isWindows && "windowControlsOverlay" in navigator;

    document.documentElement.classList.toggle(
      "macos",
      isMac
    );

    document.documentElement.classList.toggle("electron", isElectron);
    document.documentElement.classList.toggle("titlebar-overlay", hasTitlebarOverlay);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    /** Determine whether the message is ResizeObserver loop noise. */
    const isResizeObserverNoise = (message: string) => {
      return message.includes("ResizeObserver loop");
    };
    /** Extract the most relevant message from a runtime error event. */
    const getResizeObserverMessage = (event: ErrorEvent) => {
      if (typeof event.message === "string" && event.message.length > 0) {
        return event.message;
      }
      if (event.error instanceof Error && typeof event.error.message === "string") {
        return event.error.message;
      }
      return "";
    };
    /** Suppress ResizeObserver loop errors from dev overlay noise. */
    const handleResizeObserverError = (event: ErrorEvent) => {
      const message = getResizeObserverMessage(event);
      if (!isResizeObserverNoise(message)) return;
      // 过滤 ResizeObserver 循环错误，避免开发环境叠加报错。
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    /** Suppress ResizeObserver loop console noise from dev overlay. */
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      const message = args
        .map((arg) => {
          if (arg instanceof Error) return arg.message;
          if (typeof arg === "string") return arg;
          if (arg && typeof (arg as { message?: string }).message === "string") {
            return (arg as { message?: string }).message ?? "";
          }
          return "";
        })
        .find((text) => Boolean(text)) ?? "";
      // 过滤 ResizeObserver 的 console 噪音，避免开发时遮挡真实错误。
      if (isResizeObserverNoise(message)) {
        return;
      }
      originalConsoleError(...args);
    };
    const overlayElementId = "webpack-dev-server-client-overlay";
    /** Remove the webpack dev server overlay iframe if present. */
    const removeWebpackDevOverlay = () => {
      const overlayElement = document.getElementById(overlayElementId);
      if (!overlayElement?.parentNode) return;
      // 开发环境下直接移除 webpack overlay，避免遮挡真实调试内容。
      overlayElement.parentNode.removeChild(overlayElement);
    };
    /** Observe DOM changes to keep the overlay removed. */
    const observeWebpackDevOverlay = () => {
      const observer = new MutationObserver(() => {
        removeWebpackDevOverlay();
      });
      if (document.body) {
        observer.observe(document.body, { childList: true });
      }
      return observer;
    };
    // 流程：先清理一次 overlay，再监听 body 变化，若被重新插入则立即移除。
    removeWebpackDevOverlay();
    const overlayObserver = observeWebpackDevOverlay();
    window.addEventListener("error", handleResizeObserverError, true);
    return () => {
      window.removeEventListener("error", handleResizeObserverError, true);
      console.error = originalConsoleError;
      overlayObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    // Electron 主进程会通过 preload 桥接 `tenas:ui-event`，这里统一交给 handleUiEvent 分发。
    const onUiEvent = (event: Event) => {
      const detail = (event as CustomEvent<UiEvent>).detail;
      handleUiEvent(detail);
    };
    window.addEventListener("tenas:ui-event", onUiEvent);
    return () => window.removeEventListener("tenas:ui-event", onUiEvent);
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <ThemeSettingsBootstrap />
        <FontSizeSettingsBootstrap />
        <AnimationSettingsBootstrap />
        <WindowsTitlebarSymbolColorBootstrap />
        <WindowsTitlebarHeightBootstrap />
        <MotionSettingsBootstrap>
          <LocalAuthGate>
            {children}
            <FilePreviewDialog />
            <AutoUpdateGate />
          </LocalAuthGate>
          {/* <ReactQueryDevtools initialIsOpen={false} /> */}
        </MotionSettingsBootstrap>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function MotionSettingsBootstrap({ children }: { children: React.ReactNode }) {
  const { basic } = useBasicConfig();
  // 逻辑：动画级别为低时全局禁用 motion 动画。
  const reduceMotion = basic.uiAnimationLevel === "low";

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "never"}>
      {children}
    </MotionConfig>
  );
}
