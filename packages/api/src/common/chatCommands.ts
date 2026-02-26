/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nexport type ChatCommandId = "summary-history" | "summary-title";

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

/** Shared slash command definitions. */
export const CHAT_COMMANDS: ChatCommand[] = [
  {
    id: "summary-history",
    command: SUMMARY_HISTORY_COMMAND,
    title: "Summary History",
    description: "总结当前对话内容，便于后续继续对话。",
  },
  {
    id: "summary-title",
    command: SUMMARY_TITLE_COMMAND,
    title: "Summary Title",
    description: "生成当前对话的标题。",
  },
];
