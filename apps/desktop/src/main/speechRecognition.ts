import { app } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { Logger } from "./logging/startupLogger";

type SpeechStartArgs = {
  language?: string;
  webContents: Electron.WebContents;
};

type SpeechStartResult = { ok: true } | { ok: false; reason: string };

type SpeechStopResult = { ok: true } | { ok: false; reason: string };

type SpeechResultPayload = {
  type: "partial" | "final";
  text: string;
  lang?: string;
};

type SpeechStatePayload = {
  state: "listening" | "stopped" | "idle" | "error";
  reason?: string;
  lang?: string;
};

type SpeechErrorPayload = {
  message: string;
  detail?: string;
};

type SpeechSession = {
  process: ChildProcessWithoutNullStreams;
  webContents: Electron.WebContents;
  buffer: string;
  language?: string;
};

/** Active speech recognition session. */
let activeSession: SpeechSession | null = null;

/** Resolve the speech helper path for the current environment. */
function resolveSpeechHelperPath(): string | null {
  const platform = process.platform;
  let relativeDir: string;
  let binaryName: string;

  if (platform === "darwin") {
    relativeDir = "macos";
    binaryName = "tenas-speech";
  } else if (platform === "win32") {
    relativeDir = "windows";
    binaryName = "tenas-speech.exe";
  } else {
    return null;
  }
  // 中文注释：生产环境从 resources 读取，开发环境从 apps/desktop/resources 读取。
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "speech", relativeDir, binaryName);
  }
  const devRoot = path.resolve(__dirname, "../..");
  return path.join(devRoot, "resources", "speech", relativeDir, binaryName);
}

/** Send an IPC event to a renderer. */
function emitToRenderer(
  channel: string,
  payload: unknown,
  target?: Electron.WebContents
) {
  const webContents = target ?? activeSession?.webContents;
  if (!webContents) return;
  if (webContents.isDestroyed()) return;
  webContents.send(channel, payload);
}

/** Emit speech result to renderer. */
function emitSpeechResult(payload: SpeechResultPayload) {
  emitToRenderer("tenas:speech:result", payload);
}

/** Emit speech state to renderer. */
function emitSpeechState(payload: SpeechStatePayload, target?: Electron.WebContents) {
  emitToRenderer("tenas:speech:state", payload, target);
}

/** Emit speech error to renderer. */
function emitSpeechError(payload: SpeechErrorPayload, target?: Electron.WebContents) {
  emitToRenderer("tenas:speech:error", payload, target);
}

/** Handle stdout data from speech helper. */
function handleSpeechStdout(data: Buffer, log: Logger) {
  if (!activeSession) return;
  activeSession.buffer += data.toString();
  const parts = activeSession.buffer.split("\n");
  activeSession.buffer = parts.pop() ?? "";
  for (const line of parts) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as
        | SpeechResultPayload
        | (SpeechErrorPayload & { type?: "error" });
      if (parsed.type === "partial" || parsed.type === "final") {
        emitSpeechResult(parsed);
      } else if ((parsed as { type?: string }).type === "error") {
        emitSpeechError({
          message: (parsed as SpeechErrorPayload).message ?? "Speech helper error",
          detail: (parsed as SpeechErrorPayload).detail,
        });
      }
    } catch (error) {
      log(`[speech] Failed to parse helper output: ${String(error)}`);
    }
  }
}

/** Handle stderr data from speech helper. */
function handleSpeechStderr(data: Buffer, log: Logger) {
  const message = data.toString().trim();
  if (!message) return;
  log(`[speech] stderr: ${message}`);
  emitSpeechError({ message: "Speech helper error", detail: message });
}

/** Create a speech recognition manager bound to Electron main process. */
export function createSpeechRecognitionManager(args: { log: Logger }) {
  /** Start a new speech recognition session. */
  const start = async ({ language, webContents }: SpeechStartArgs): Promise<SpeechStartResult> => {
    if (process.platform !== "darwin" && process.platform !== "win32") {
      return { ok: false, reason: "当前仅支持 macOS/Windows 语音识别。" };
    }
    if (webContents.isDestroyed()) {
      return { ok: false, reason: "目标窗口已关闭。" };
    }

    const helperPath = resolveSpeechHelperPath();
    if (!helperPath || !fs.existsSync(helperPath)) {
      return { ok: false, reason: "语音识别组件未构建，请先运行 pnpm --filter desktop run build:speech-helper。" };
    }

    // 中文注释：每次启动只保留一个会话，避免多进程抢占麦克风。
    if (activeSession) {
      await stop("restart");
    }

    const spawnArgs = [] as string[];
    if (language) {
      spawnArgs.push("--lang", language);
    }

    const child = spawn(helperPath, spawnArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    activeSession = {
      process: child,
      webContents,
      buffer: "",
      language,
    };

    child.stdout.on("data", (chunk) => handleSpeechStdout(chunk, args.log));
    child.stderr.on("data", (chunk) => handleSpeechStderr(chunk, args.log));

    child.on("exit", (code, signal) => {
      if (!activeSession || activeSession.process !== child) return;
      const target = activeSession.webContents;
      activeSession = null;
      const reason = signal ? `signal:${signal}` : `exit:${code ?? 0}`;
      emitSpeechState({ state: "stopped", reason, lang: language }, target);
    });

    child.on("error", (error) => {
      emitSpeechError({ message: "语音识别启动失败", detail: String(error) }, webContents);
      emitSpeechState({ state: "error", reason: String(error), lang: language }, webContents);
      activeSession = null;
    });

    emitSpeechState({ state: "listening", lang: language });
    return { ok: true };
  };

  /** Stop the current speech recognition session. */
  const stop = async (reason = "user"): Promise<SpeechStopResult> => {
    if (!activeSession) return { ok: true };
    const session = activeSession;
    activeSession = null;
    emitSpeechState({ state: "stopped", reason, lang: session.language }, session.webContents);
    try {
      session.process.kill("SIGTERM");
    } catch (error) {
      return { ok: false, reason: String(error) };
    }
    return { ok: true };
  };

  return { start, stop };
}
