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

export default function TemplatePage({
  panelKey: _panelKey,
  tabId: _tabId,
}: {
  panelKey: string;
  tabId: string;
}) {
  return (
    <div className="h-full w-full p-4">
      <div className="mb-3 text-sm text-muted-foreground">模版</div>
      <div className="rounded-md border p-4 text-sm text-muted-foreground">
        模版功能开发中
      </div>
    </div>
  );
}

