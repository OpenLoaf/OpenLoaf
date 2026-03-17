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

import { useEffect } from "react";
import {
  appendChatInputText,
  buildSkillCommandText,
} from "./chat-input-utils";

/**
 * Centralized window event listeners for ChatInput.
 * Extracts skill insertion, text prefill, and AI request forwarding.
 */
export function useChatInputEvents({
  setInput,
  handleSubmit,
}: {
  setInput: (updater: string | ((prev: string) => string)) => void;
  handleSubmit: (value: string) => void;
}) {
  // Handle skill insert events (from stack panel skill clicks)
  useEffect(() => {
    const handleInsertSkill = (event: Event) => {
      const detail = (event as CustomEvent<{ skillName?: string; displayName?: string }>).detail;
      const skillName = detail?.skillName?.trim() ?? "";
      if (!skillName) return;
      const nextToken = buildSkillCommandText(skillName, detail?.displayName);
      if (!nextToken) return;
      setInput((prev) => appendChatInputText(prev as string, nextToken));
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("openloaf:chat-focus-input-end"));
      });
    };
    window.addEventListener("openloaf:chat-insert-skill", handleInsertSkill);
    return () => {
      window.removeEventListener("openloaf:chat-insert-skill", handleInsertSkill);
    };
  }, [setInput]);

  // Handle prefill text events (e.g. from task board)
  useEffect(() => {
    const handlePrefill = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      const text = detail?.text ?? "";
      if (!text) return;
      setInput(text);
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent("openloaf:chat-focus-input-end"));
      });
    };
    window.addEventListener("openloaf:chat-prefill-input", handlePrefill);
    return () => {
      window.removeEventListener("openloaf:chat-prefill-input", handlePrefill);
    };
  }, [setInput]);

  // Handle AI request forwarded from Search dialog
  useEffect(() => {
    const handleSearchAiRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string }>).detail;
      const nextValue = detail?.text?.trim();
      if (!nextValue) return;
      void handleSubmit(nextValue);
    };
    window.addEventListener("openloaf:chat-send-message", handleSearchAiRequest);
    return () => {
      window.removeEventListener("openloaf:chat-send-message", handleSearchAiRequest);
    };
  }, [handleSubmit]);
}
