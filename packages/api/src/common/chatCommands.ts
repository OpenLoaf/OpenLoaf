/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
export type ChatCommandId = "summary-history" | "summary-title";

export type ChatCommand = {
  /** Stable command identifier. */
  id: ChatCommandId;
  /** Slash command token. */
  command: string;
  /** Display title for UI menus. */
  title: string;
  /** Optional helper text for UI menus. */
  description?: string;
};

export const SUMMARY_HISTORY_COMMAND = "/summary-history";
export const SUMMARY_TITLE_COMMAND = "/summary-title";
export const SKILL_COMMAND_PREFIX = "/skill/";

/** Shared slash command definitions (descriptions should be translated by frontend). */
export const CHAT_COMMANDS: ChatCommand[] = [
  {
    id: "summary-history",
    command: SUMMARY_HISTORY_COMMAND,
    title: "Summary History",
    description: "Summarize current conversation for better continuation.",
  },
  {
    id: "summary-title",
    command: SUMMARY_TITLE_COMMAND,
    title: "Summary Title",
    description: "Generate a title for current conversation.",
  },
];
