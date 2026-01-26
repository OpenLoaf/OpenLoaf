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

type AutoUpdateGateState = {
  status: TenasAutoUpdateStatus | null;
  open: boolean;
};

/**
 * Shows a global update prompt when a new version is downloaded.
 */
export default function AutoUpdateGate() {
  const [state, setState] = React.useState<AutoUpdateGateState>({
    status: null,
    open: false,
  });
  const lastDownloadedTsRef = React.useRef<number | null>(null);
  const isElectron = React.useMemo(
    () =>
      process.env.NEXT_PUBLIC_ELECTRON === "1" ||
      (typeof navigator !== "undefined" && navigator.userAgent.includes("Electron")),
    [],
  );

  /** Fetch initial update status from the main process. */
  const fetchInitialStatus = React.useCallback(async () => {
    const api = window.tenasElectron;
    if (!isElectron || !api?.getAutoUpdateStatus) return;
    try {
      const status = await api.getAutoUpdateStatus();
      if (status) setState((prev) => ({ ...prev, status }));
    } catch {
      // ignore
    }
  }, [isElectron]);

  /** Handle update status events from Electron main process. */
  const handleStatusEvent = React.useCallback((event: Event) => {
    const detail = (event as CustomEvent<TenasAutoUpdateStatus>).detail;
    if (!detail) return;
    setState((prev) => ({ ...prev, status: detail }));
  }, []);

  /** Install the downloaded update and restart the app. */
  const installDownloadedUpdate = React.useCallback(async () => {
    const api = window.tenasElectron;
    if (!isElectron || !api?.installUpdate) return;
    await api.installUpdate();
  }, [isElectron]);

  React.useEffect(() => {
    if (!isElectron) return;
    void fetchInitialStatus();
  }, [isElectron, fetchInitialStatus]);

  React.useEffect(() => {
    if (!isElectron) return;
    window.addEventListener("tenas:auto-update:status", handleStatusEvent);
    return () =>
      window.removeEventListener("tenas:auto-update:status", handleStatusEvent);
  }, [isElectron, handleStatusEvent]);

  React.useEffect(() => {
    if (!state.status || state.status.state !== "downloaded") return;
    // 防止重复弹窗；同一条下载事件只提示一次。
    if (state.status.ts === lastDownloadedTsRef.current) return;
    lastDownloadedTsRef.current = state.status.ts;
    setState((prev) => ({ ...prev, open: true }));
  }, [state.status]);

  if (!isElectron) return null;

  const nextVersionLabel = state.status?.nextVersion
    ? `v${state.status.nextVersion}`
    : "新版本";

  return (
    <Dialog
      open={state.open}
      onOpenChange={(open) => setState((prev) => ({ ...prev, open }))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>更新已准备好</DialogTitle>
          <DialogDescription>
            {nextVersionLabel} 已下载完成，重启后即可完成更新。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setState((prev) => ({ ...prev, open: false }))}>
            稍后
          </Button>
          <Button onClick={() => void installDownloadedUpdate()}>立即重启</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
