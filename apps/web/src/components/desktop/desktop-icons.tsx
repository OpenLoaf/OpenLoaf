"use client";

import { FileText, ListTodo, Search, Settings } from "lucide-react";
import type { DesktopIconKey } from "./types";

/** Resolve a desktop icon element by its key. */
export function getDesktopIconByKey(key: DesktopIconKey) {
  switch (key) {
    case "files":
      return <FileText className="size-5" />;
    case "tasks":
      return <ListTodo className="size-5" />;
    case "search":
      return <Search className="size-5" />;
    case "settings":
      return <Settings className="size-5" />;
    default:
      return <FileText className="size-5" />;
  }
}
