"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlateEditor } from "platejs/react";
import { Editor as SlateEditor, type BaseEditor } from "slate";
import { playNotificationSound } from "@/lib/notification-sound";
import { isElectronEnv } from "@/utils/is-electron-env";

/** Default error message for dictation failures. */
const DEFAULT_ERROR_MESSAGE = "语音识别不可用";

type SpeechResultDetail = TenasSpeechResult;

type SpeechStateDetail = TenasSpeechState;

type SpeechErrorDetail = TenasSpeechError;

type SpeechDictationOptions = {
  /** Plate editor instance to write dictation text into. */
  editor: PlateEditor;
  /** Locale for speech recognition (e.g. zh-CN). */
  language?: string;
  /** Whether to play a start tone when dictation begins. */
  enableStartTone?: boolean;
  /** Error callback for dictation failures. */
  onError?: (message: string) => void;
};

type SpeechDictationState = {
  /** Whether dictation is currently listening. */
  isListening: boolean;
  /** Whether OS dictation is supported in this environment. */
  isSupported: boolean;
  /** Start dictation. */
  start: () => Promise<void>;
  /** Stop dictation. */
  stop: () => Promise<void>;
  /** Toggle dictation. */
  toggle: () => Promise<void>;
};

/** Provide OS speech dictation controls for the Plate editor. */
export function useSpeechDictation({
  editor,
  language,
  enableStartTone = true,
  onError,
}: SpeechDictationOptions): SpeechDictationState {
  const [isListening, setIsListening] = useState(false);
  /** Track the current listening state without re-subscribing event handlers. */
  const isListeningRef = useRef(false);
  /** Track the last interim text to replace it on updates. */
  const lastInterimRef = useRef("");
  const isElectron = useMemo(() => isElectronEnv(), []);
  const isSupported = Boolean(
    isElectron &&
      typeof window !== "undefined" &&
      window.tenasElectron?.startSpeechRecognition,
  );

  /** Update listener refs when listening state changes. */
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  /** Ensure the editor has a valid selection before inserting dictation text. */
  const ensureSelection = useCallback(() => {
    if (editor.selection) return;
    const endPoint = SlateEditor.end(editor as unknown as BaseEditor, []);
    editor.tf.select(endPoint);
  }, [editor]);

  /** Insert partial/final speech text into the editor. */
  const applySpeechText = useCallback(
    (text: string, isFinal: boolean) => {
      if (!text) return;
      // 中文注释：只在语音监听状态下写入，避免旧事件污染输入框。
      if (!isListeningRef.current) return;
      ensureSelection();
      editor.tf.focus();
      if (lastInterimRef.current) {
        // 中文注释：先移除旧的临时文本，再写入新结果。
        editor.tf.delete({
          distance: lastInterimRef.current.length,
          reverse: true,
        });
        lastInterimRef.current = "";
      }
      editor.tf.insertText(text);
      if (isFinal) {
        editor.tf.insertText(" ");
      } else {
        lastInterimRef.current = text;
      }
    },
    [editor, ensureSelection],
  );

  /** Handle speech result events from Electron. */
  const handleSpeechResult = useCallback(
    (event: Event) => {
      const detail = (event as CustomEvent<SpeechResultDetail>).detail;
      if (!detail?.text) return;
      applySpeechText(detail.text, detail.type === "final");
    },
    [applySpeechText],
  );

  /** Handle speech state events from Electron. */
  const handleSpeechState = useCallback(
    (event: Event) => {
      const detail = (event as CustomEvent<SpeechStateDetail>).detail;
      if (!detail) return;
      if (detail.state === "stopped" || detail.state === "error") {
        lastInterimRef.current = "";
        setIsListening(false);
      }
    },
    [],
  );

  /** Handle speech error events from Electron. */
  const handleSpeechError = useCallback(
    (event: Event) => {
      const detail = (event as CustomEvent<SpeechErrorDetail>).detail;
      const message = detail?.message ?? DEFAULT_ERROR_MESSAGE;
      if (onError) onError(message);
      lastInterimRef.current = "";
      setIsListening(false);
    },
    [onError],
  );

  /** Start speech dictation in Electron main process. */
  const start = useCallback(async () => {
    if (!isSupported || !window.tenasElectron?.startSpeechRecognition) {
      if (onError) onError(DEFAULT_ERROR_MESSAGE);
      return;
    }
    const result = await window.tenasElectron.startSpeechRecognition({
      language: language?.trim() || undefined,
    });
    if (result?.ok) {
      lastInterimRef.current = "";
      setIsListening(true);
      return;
    }
    const reason = result && "reason" in result ? result.reason : undefined;
    if (onError) onError(reason ?? DEFAULT_ERROR_MESSAGE);
  }, [isSupported, language, onError]);

  /** Stop speech dictation in Electron main process. */
  const stop = useCallback(async () => {
    if (!window.tenasElectron?.stopSpeechRecognition) return;
    await window.tenasElectron.stopSpeechRecognition();
    lastInterimRef.current = "";
    setIsListening(false);
  }, []);

  /** Toggle speech dictation based on current state. */
  const toggle = useCallback(async () => {
    if (isListeningRef.current) {
      await stop();
    } else {
      if (enableStartTone) {
        playNotificationSound("dictation-start");
      }
      await start();
    }
  }, [enableStartTone, start, stop]);

  useEffect(() => {
    if (!isSupported) return;
    window.addEventListener("tenas:speech:result", handleSpeechResult);
    window.addEventListener("tenas:speech:state", handleSpeechState);
    window.addEventListener("tenas:speech:error", handleSpeechError);
    return () => {
      window.removeEventListener("tenas:speech:result", handleSpeechResult);
      window.removeEventListener("tenas:speech:state", handleSpeechState);
      window.removeEventListener("tenas:speech:error", handleSpeechError);
    };
  }, [handleSpeechResult, handleSpeechState, handleSpeechError, isSupported]);

  useEffect(() => {
    return () => {
      if (!isListeningRef.current) return;
      void stop();
    };
  }, [stop]);

  return {
    isListening,
    isSupported,
    start,
    stop,
    toggle,
  };
}
