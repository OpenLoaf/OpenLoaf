/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@openloaf/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@openloaf/ui/dialog";
import { isElectronEnv } from "@/utils/is-electron-env";

type UpdateSource = "incremental" | "desktop";

type AutoUpdateGateState = {
  status: OpenLoafIncrementalUpdateStatus | null;
  autoUpdateStatus: OpenLoafAutoUpdateStatus | null;
  open: boolean;
  source: UpdateSource | null;
  changelog: string | null;
  changelogLoading: boolean;
};

/**
 * Strip YAML frontmatter (--- ... ---) from a markdown string.
 */
function stripFrontmatter(raw: string): string {
  const match = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (match) return raw.slice(match[0].length).trim();
  return raw.trim();
}

/**
 * Detect user language code (e.g. 'zh', 'en').
 */
function detectLang(): string {
  const raw = typeof navigator !== "undefined" ? navigator.language : "zh-CN";
  const primary = raw.split("-")[0].toLowerCase();
  return primary || "zh";
}

/**
 * Fetch a single changelog with language fallback.
 * changelogUrl is a base URL without extension (e.g. https://r2.../changelogs/server/0.1.0).
 * Tries {base}.{lang}.md first, falls back to {base}.zh.md.
 */
async function fetchChangelogWithLang(baseUrl: string, lang: string): Promise<string | null> {
  const candidates = lang === "zh" ? [`${baseUrl}/zh.md`] : [`${baseUrl}/${lang}.md`, `${baseUrl}/zh.md`];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const raw = await res.text();
      const body = stripFrontmatter(raw);
      if (body) return body;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Fetch and merge changelogs from multiple base URLs.
 */
async function fetchChangelogs(baseUrls: string[]): Promise<string | null> {
  const lang = detectLang();
  const parts: string[] = [];
  for (const url of baseUrls) {
    const body = await fetchChangelogWithLang(url, lang);
    if (body) parts.push(body);
  }
  return parts.length > 0 ? parts.join("\n\n---\n\n") : null;
}

/**
 * Shows a global update prompt when incremental updates are ready.
 */
export default function AutoUpdateGate() {
  const { t } = useTranslation("common");
  const [state, setState] = React.useState<AutoUpdateGateState>({
    status: null,
    autoUpdateStatus: null,
    open: false,
    source: null,
    changelog: null,
    changelogLoading: false,
  });
  const lastReadyTsRef = React.useRef<number | null>(null);
  const lastAutoTsRef = React.useRef<number | null>(null);
  const isElectron = React.useMemo(() => isElectronEnv(), []);

  /** Fetch initial status from main process. */
  React.useEffect(() => {
    if (!isElectron) return;
    const api = window.openloafElectron;
    void api?.getIncrementalUpdateStatus?.().then((s) => {
      if (s) setState((prev) => ({ ...prev, status: s }));
    }).catch(() => {});
    void api?.getAutoUpdateStatus?.().then((s) => {
      if (s) setState((prev) => ({ ...prev, autoUpdateStatus: s }));
    }).catch(() => {});
  }, [isElectron]);

  /** Listen for status events. */
  React.useEffect(() => {
    if (!isElectron) return;
    const onIncremental = (e: Event) => {
      const detail = (e as CustomEvent<OpenLoafIncrementalUpdateStatus>).detail;
      if (detail) setState((prev) => ({ ...prev, status: detail }));
    };
    const onAuto = (e: Event) => {
      const detail = (e as CustomEvent<OpenLoafAutoUpdateStatus>).detail;
      if (detail) setState((prev) => ({ ...prev, autoUpdateStatus: detail }));
    };
    window.addEventListener("openloaf:incremental-update:status", onIncremental);
    window.addEventListener("openloaf:auto-update:status", onAuto);
    return () => {
      window.removeEventListener("openloaf:incremental-update:status", onIncremental);
      window.removeEventListener("openloaf:auto-update:status", onAuto);
    };
  }, [isElectron]);

  // Desktop 整包更新下载完成 → 立即弹出提示
  React.useEffect(() => {
    if (!state.autoUpdateStatus || state.autoUpdateStatus.state !== "downloaded") return;
    if (state.autoUpdateStatus.ts === lastAutoTsRef.current) return;
    lastAutoTsRef.current = state.autoUpdateStatus.ts;
    setState((prev) => ({
      ...prev,
      open: true,
      source: "desktop",
      changelog: null,
      changelogLoading: false,
    }));
  }, [state.autoUpdateStatus]);

  // 增量更新就绪 → 弹出提示（desktop 更新优先）
  React.useEffect(() => {
    if (!state.status || state.status.state !== "ready") return;
    if (state.status.ts === lastReadyTsRef.current) return;
    // Desktop 更新下载完成时不弹增量更新提示
    if (state.autoUpdateStatus?.state === "downloaded") return;
    lastReadyTsRef.current = state.status.ts;

    const urls: string[] = [];
    if (state.status.server?.changelogUrl) urls.push(state.status.server.changelogUrl);
    if (state.status.web?.changelogUrl) urls.push(state.status.web.changelogUrl);

    if (urls.length > 0) {
      setState((prev) => ({ ...prev, open: true, source: "incremental", changelog: null, changelogLoading: true }));
      void fetchChangelogs(urls).then((changelog) => {
        setState((prev) => ({ ...prev, changelog, changelogLoading: false }));
      });
    } else {
      setState((prev) => ({ ...prev, open: true, source: "incremental", changelog: null, changelogLoading: false }));
    }
  }, [state.status, state.autoUpdateStatus]);

  /** Restart the app to apply updates (skips quit confirmation). */
  const handleRelaunch = React.useCallback(async () => {
    const api = window.openloafElectron;
    if (!isElectron || !api?.relaunchApp) return;
    await api.relaunchApp();
  }, [isElectron]);
  const isDesktopUpdate = state.source === "desktop";
  const nextVersionLabel = React.useMemo(() => {
    if (isDesktopUpdate) {
      const v = state.autoUpdateStatus?.nextVersion;
      return v ? t("updateGate.desktopVersion", { version: v }) : t("updateGate.newVersion");
    }
    if (!state.status) return t("updateGate.newVersion");
    const parts: string[] = [];
    if (state.status.server?.newVersion) parts.push(t("updateGate.serverVersion", { version: state.status.server.newVersion }));
    if (state.status.web?.newVersion) parts.push(t("updateGate.webVersion", { version: state.status.web.newVersion }));
    return parts.length > 0 ? parts.join(" / ") : t("updateGate.newVersion");
  }, [isDesktopUpdate, state.status, state.autoUpdateStatus, t]);

  if (!isElectron) return null;

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => setState((prev) => ({ ...prev, open }))}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("updateGate.title")}</DialogTitle>
          <DialogDescription>
            {isDesktopUpdate
              ? t("updateGate.descDesktop", { version: nextVersionLabel })
              : t("updateGate.descIncremental", { version: nextVersionLabel })}
          </DialogDescription>
        </DialogHeader>
        {!isDesktopUpdate && state.changelogLoading ? (
          <div className="py-2 text-xs text-muted-foreground">{t("updateGate.loadingChangelog")}</div>
        ) : !isDesktopUpdate && state.changelog ? (
          <div className="max-h-48 overflow-y-auto rounded-3xl border p-3">
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-xs">
              {state.changelog}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setState((prev) => ({ ...prev, open: false }))}
          >
            {t("updateGate.later")}
          </Button>
          <Button onClick={() => void handleRelaunch()}>{t("updateGate.restartNow")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
