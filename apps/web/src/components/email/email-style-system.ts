/** Main Gmail-like panel surface; outer border is provided by LeftDock frame. */
export const EMAIL_GLASS_PANEL_CLASS =
  "rounded-2xl bg-[#ffffff] shadow-none dark:bg-slate-900/78";

/** Secondary inset used for metadata blocks and grouped actions. */
export const EMAIL_GLASS_INSET_CLASS =
  "rounded-xl bg-[#f6f8fc] border border-transparent dark:bg-slate-800/72";

/** Compact metadata chip style for counts and tags. */
export const EMAIL_META_CHIP_CLASS =
  "rounded-full bg-[#e8eaed] px-2 py-0.5 text-[11px] text-[#5f6368] dark:bg-slate-700 dark:text-slate-200";

/** Flat input surface matching Gmail search and compose controls. */
export const EMAIL_FLAT_INPUT_CLASS =
  "border border-transparent bg-[#edf2fa] text-[#1f1f1f] placeholder:text-[#5f6368] focus-visible:border-[#d2e3fc] focus-visible:ring-[rgba(26,115,232,0.22)] dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus-visible:border-slate-600";

/** Navigation block tint. */
export const EMAIL_TINT_NAV_CLASS = "!bg-[#f8fafd] dark:!bg-slate-900/72";

/** List/detail neutral tint. */
export const EMAIL_TINT_LIST_CLASS = "bg-[#f6f8fc] dark:bg-slate-900/62";

/** Detail header tint. */
export const EMAIL_TINT_DETAIL_CLASS = "bg-[#f1f3f4] dark:bg-slate-800/82";

/** Common row tones. */
export const EMAIL_TONE_HOVER_CLASS = "hover:bg-[#f1f3f4] dark:hover:bg-slate-800/72";
export const EMAIL_TONE_ACTIVE_CLASS =
  "bg-[#d3e3fd] text-[#001d35] font-semibold dark:bg-sky-900/46 dark:text-sky-100";

/** Message row read/unread states for clear contrast. */
export const EMAIL_LIST_UNREAD_ROW_CLASS =
  "bg-[#ffffff] text-[#202124] dark:bg-slate-900/84 dark:text-slate-50";
export const EMAIL_LIST_READ_ROW_CLASS =
  "bg-[#f8fafd] text-[#5f6368] dark:bg-slate-900/56 dark:text-slate-300";

/** Divider tone used across list and sidebar separators. */
export const EMAIL_DIVIDER_CLASS = "border-[#e3e8ef] dark:border-slate-700";
