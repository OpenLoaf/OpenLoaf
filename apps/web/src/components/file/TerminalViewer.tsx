"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { trpc } from "@/utils/trpc";
import { resolveServerUrl } from "@/utils/server-url";
import { getDisplayPathFromUri } from "@/components/project/filesystem/utils/file-system-utils";
import { useTerminalStatus } from "@/hooks/use-terminal-status";

import "xterm/css/xterm.css";
import "./terminal-viewer.css";

interface TerminalViewerProps {
  pwdUri?: string;
  panelKey?: string;
  tabId?: string;
}

type TerminalSession = {
  sessionId: string;
  token: string;
};

type TerminalServerMessage =
  | { type: "output"; data: string }
  | { type: "exit"; code?: number; signal?: number };

/** Build a websocket URL for terminal sessions. */
function resolveTerminalWsUrl(sessionId: string, token: string): string {
  const baseUrl = resolveServerUrl();
  const origin =
    baseUrl ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost");
  const wsBase = origin.replace(/^http/, "ws");
  const params = new URLSearchParams({ sessionId, token });
  return `${wsBase}/terminal/ws?${params.toString()}`;
}

/** Parse terminal server message payload. */
function parseTerminalMessage(raw: string): TerminalServerMessage | null {
  try {
    return JSON.parse(raw) as TerminalServerMessage;
  } catch {
    return null;
  }
}

/** Render a terminal viewer powered by xterm.js. */
export default function TerminalViewer({ pwdUri }: TerminalViewerProps) {
  const terminalStatus = useTerminalStatus();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<TerminalSession | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "ready" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createSessionMutation = useMutation(
    trpc.terminal.createSession.mutationOptions()
  );
  const closeSessionMutation = useMutation(
    trpc.terminal.closeSession.mutationOptions()
  );

  const displayPath = useMemo(() => {
    if (!pwdUri) return "";
    return pwdUri.startsWith("file://") ? getDisplayPathFromUri(pwdUri) : pwdUri;
  }, [pwdUri]);

  useEffect(() => {
    if (!terminalStatus.enabled || terminalStatus.isLoading) return;
    if (!pwdUri || !containerRef.current) {
      setStatus("idle");
      return;
    }
    let disposed = false;
    setStatus("connecting");
    setErrorMessage(null);

    const terminal = new Terminal({
      convertEol: true,
      fontFamily:
        "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace)",
      fontSize: 12,
      theme: {
        background: "transparent",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const sendMessage = (payload: object) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify(payload));
    };

    const handleResize = () => {
      if (!fitAddonRef.current || !terminalRef.current) return;
      fitAddonRef.current.fit();
      // 中文注释：尺寸变化后同步 cols/rows，保证 PTY 行列匹配。
      sendMessage({
        type: "resize",
        cols: terminalRef.current.cols,
        rows: terminalRef.current.rows,
      });
    };

    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(containerRef.current);

    const inputDisposable = terminal.onData((data) => {
      // 中文注释：用户输入透传给服务端 PTY。
      sendMessage({ type: "input", data });
    });

    const connect = async () => {
      try {
        const session = await createSessionMutation.mutateAsync({
          pwd: pwdUri,
          cols: terminal.cols || 80,
          rows: terminal.rows || 24,
        });
        if (disposed) return;
        sessionRef.current = session;
        const socket = new WebSocket(
          resolveTerminalWsUrl(session.sessionId, session.token)
        );
        socketRef.current = socket;

        socket.onopen = () => {
          setStatus("ready");
          handleResize();
        };

        socket.onmessage = (event) => {
          const payload = parseTerminalMessage(String(event.data));
          if (!payload) return;
          if (payload.type === "output" && typeof payload.data === "string") {
            terminal.write(payload.data);
          } else if (payload.type === "exit") {
            setStatus("error");
            setErrorMessage("终端已退出");
          }
        };

        socket.onerror = () => {
          setStatus("error");
          setErrorMessage("终端连接失败");
        };
        socket.onclose = () => {
          if (disposed) return;
          setStatus((prev) => (prev === "ready" ? "error" : prev));
        };
      } catch (error) {
        if (disposed) return;
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "终端连接失败"
        );
      }
    };

    void connect();

    return () => {
      disposed = true;
      inputDisposable.dispose();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      socketRef.current?.close();
      socketRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      if (sessionRef.current) {
        void closeSessionMutation.mutateAsync({
          sessionId: sessionRef.current.sessionId,
          token: sessionRef.current.token,
        });
        sessionRef.current = null;
      }
    };
  }, [pwdUri, terminalStatus.enabled, terminalStatus.isLoading]);

  if (terminalStatus.isLoading) {
    return (
      <div className="h-full w-full p-4 text-muted-foreground">
        正在检查终端状态…
      </div>
    );
  }

  if (!terminalStatus.enabled) {
    return (
      <div className="h-full w-full p-4 text-muted-foreground">
        终端功能未开启
      </div>
    );
  }

  if (!pwdUri) {
    return (
      <div className="h-full w-full p-4 text-muted-foreground">未选择目录</div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <div className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
        <div className="truncate">{displayPath}</div>
      </div>
      <div className="terminal-viewer flex-1" ref={containerRef} />
      {status === "connecting" ? (
        <div className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          正在连接终端…
        </div>
      ) : status === "error" ? (
        <div className="border-t border-border/60 px-3 py-2 text-xs text-destructive">
          {errorMessage ?? "终端连接失败"}
        </div>
      ) : null}
    </div>
  );
}
