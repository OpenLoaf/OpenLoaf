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

export function DisableRefresh() {
  useEffect(() => {
    // Allow refresh in development environment
    if (process.env.NODE_ENV === "development") {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // F5
      if (e.key === "F5") {
        e.preventDefault();
      }

      // Ctrl+R or Cmd+R
      if ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return null;
}
