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

type AutoUpdateGateState = {
  status: OpenLoafIncrementalUpdateStatus | null;
  open: boolean;
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
  const [state, setState] = React.useState<AutoUpdateGateState>({
    status: null,
    open: false,
    changelog: null,
    changelogLoading: false,
  });
  /** Last ready timestamp to avoid duplicate prompts. */
  const lastReadyTsRef = React.useRef<number | null>(null);
  const isElectron = React.useMemo(() => isElectronEnv(), []);

  /** Fetch initial incremental update status from the main process. */
  const fetchInitialStatus = React.useCallback(async () => {
    const api = window.openloafElectron;
    if (!isElectron || !api?.getIncrementalUpdateStatus) return;
    try {
      const status = await api.getIncrementalUpdateStatus();
      if (status) setState((prev) => ({ ...prev, status }));
    } catch {
      // ignore
    }
  }, [isElectron]);

  /** Handle incremental update status events from Electron main process. */
  const handleStatusEvent = React.useCallback((event: Event) => {
    const detail = (event as CustomEvent<OpenLoafIncrementalUpdateStatus>).detail;
    if (!detail) return;
    setState((prev) => ({ ...prev, status: detail }));
  }, []);

  /** Restart the app to apply updates. */
  const handleRelaunch = React.useCallback(async () => {
    const api = window.openloafElectron;
    if (!isElectron || !api?.relaunchApp) return;
    await api.relaunchApp();
  }, [isElectron]);

  React.useEffect(() => {
    if (!isElectron) return;
    void fetchInitialStatus();
  }, [isElectron, fetchInitialStatus]);

  React.useEffect(() => {
    if (!isElectron) return;
    window.addEventListener("openloaf:incremental-update:status", handleStatusEvent);
    return () =>
      window.removeEventListener("openloaf:incremental-update:status", handleStatusEvent);
  }, [isElectron, handleStatusEvent]);

  React.useEffect(() => {
    if (!state.status || state.status.state !== "ready") return;
    // 防止重复弹窗；同一条下载事件只提示一次。
    if (state.status.ts === lastReadyTsRef.current) return;
    lastReadyTsRef.current = state.status.ts;

    // 收集 changelog URLs
    const urls: string[] = [];
    if (state.status.server?.changelogUrl) urls.push(state.status.server.changelogUrl);
    if (state.status.web?.changelogUrl) urls.push(state.status.web.changelogUrl);

    if (urls.length > 0) {
      setState((prev) => ({ ...prev, open: true, changelog: null, changelogLoading: true }));
      void fetchChangelogs(urls).then((changelog) => {
        setState((prev) => ({ ...prev, changelog, changelogLoading: false }));
      });
    } else {
      setState((prev) => ({ ...prev, open: true, changelog: null, changelogLoading: false }));
    }
  }, [state.status]);

  if (!isElectron) return null;

  const nextVersionLabel = React.useMemo(() => {
    if (!state.status) return "新版本";
    const parts: string[] = [];
    if (state.status.server?.newVersion) {
      parts.push(`服务端 v${state.status.server.newVersion}`);
    }
    if (state.status.web?.newVersion) {
      parts.push(`Web v${state.status.web.newVersion}`);
    }
    return parts.length > 0 ? parts.join(" / ") : "新版本";
  }, [state.status]);

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => setState((prev) => ({ ...prev, open }))}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>更新已准备好</DialogTitle>
          <DialogDescription>
            {nextVersionLabel} 已准备好，重启后即可完成更新。
          </DialogDescription>
        </DialogHeader>
        {state.changelogLoading ? (
          <div className="py-2 text-xs text-muted-foreground">加载更新日志...</div>
        ) : state.changelog ? (
          <div className="max-h-48 overflow-y-auto rounded-md border p-3">
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
            稍后
          </Button>
          <Button onClick={() => void handleRelaunch()}>立即重启</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
