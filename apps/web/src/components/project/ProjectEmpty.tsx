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

import { useTranslation } from "react-i18next";

interface ProjectEmptyProps {
  title?: string;
  hint?: string;
}

/** Project empty state. */
export default function ProjectEmpty({ title, hint }: ProjectEmptyProps) {
  const { t } = useTranslation("workspace");
  return (
    <div className="h-full w-full flex items-center justify-center">
      <div className="max-w-md rounded-2xl border border-dashed border-border/70 bg-card/60 px-6 py-8 text-center">
        <div className="text-base font-semibold text-foreground">
          {title ? `${title} ${t("project.emptyHomeSuffix")}` : t("project.emptyHome")}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {hint ?? t("project.emptyHint")}
        </div>
      </div>
    </div>
  );
}
