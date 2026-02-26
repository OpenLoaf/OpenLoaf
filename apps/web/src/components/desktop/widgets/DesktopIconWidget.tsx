/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { FileText, ListTodo, Search, Settings } from "lucide-react";
import type { DesktopIconKey } from "../types";

interface DesktopIconWidgetProps {
  /** Icon key to render. */
  iconKey: DesktopIconKey;
}

/** Render a desktop icon glyph by key. */
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

/** Render a desktop icon widget. */
export default function DesktopIconWidget({ iconKey }: DesktopIconWidgetProps) {
  return getDesktopIconByKey(iconKey);
}
