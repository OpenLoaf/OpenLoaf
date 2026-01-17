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

/** Shared slash command definitions. */
export const CHAT_COMMANDS: ChatCommand[] = [
  {
    id: "summary-history",
    command: SUMMARY_HISTORY_COMMAND,
    title: "Summary History",
    description: "Summarize the conversation for future context.",
  },
  {
    id: "summary-title",
    command: SUMMARY_TITLE_COMMAND,
    title: "Summary Title",
    description: "Generate a title for the conversation.",
  },
];
