"use client";

import * as React from "react";
import { Button } from "@tenas-ai/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tenas-ai/ui/dialog";
import { isElectronEnv } from "@/utils/is-electron-env";

type AutoUpdateGateState = {
  status: TenasIncrementalUpdateStatus | null;
  open: boolean;
};

/**
 * Shows a global update prompt when incremental updates are ready.
 */
export default function AutoUpdateGate() {
  const [state, setState] = React.useState<AutoUpdateGateState>({
    status: null,
    open: false,
  });
  /** Last ready timestamp to avoid duplicate prompts. */
  const lastReadyTsRef = React.useRef<number | null>(null);
  const isElectron = React.useMemo(() => isElectronEnv(), []);

  /** Fetch initial incremental update status from the main process. */
  const fetchInitialStatus = React.useCallback(async () => {
    const api = window.tenasElectron;
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
    const detail = (event as CustomEvent<TenasIncrementalUpdateStatus>).detail;
    if (!detail) return;
    setState((prev) => ({ ...prev, status: detail }));
  }, []);

  /** Restart the app to apply updates. */
  const handleRelaunch = React.useCallback(async () => {
    const api = window.tenasElectron;
    if (!isElectron || !api?.relaunchApp) return;
    await api.relaunchApp();
  }, [isElectron]);

  React.useEffect(() => {
    if (!isElectron) return;
    void fetchInitialStatus();
  }, [isElectron, fetchInitialStatus]);

  React.useEffect(() => {
    if (!isElectron) return;
    window.addEventListener("tenas:incremental-update:status", handleStatusEvent);
    return () =>
      window.removeEventListener("tenas:incremental-update:status", handleStatusEvent);
  }, [isElectron, handleStatusEvent]);

  React.useEffect(() => {
    if (!state.status || state.status.state !== "ready") return;
    // 防止重复弹窗；同一条下载事件只提示一次。
    if (state.status.ts === lastReadyTsRef.current) return;
    lastReadyTsRef.current = state.status.ts;
    setState((prev) => ({ ...prev, open: true }));
  }, [state.status]);

  if (!isElectron) return null;

  // 中文注释：从已更新的组件版本拼接展示文案。
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>更新已准备好</DialogTitle>
          <DialogDescription>
            {nextVersionLabel} 已准备好，重启后即可完成更新。
          </DialogDescription>
        </DialogHeader>
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
