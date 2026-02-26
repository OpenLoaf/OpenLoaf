/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { memo } from "react";

/** Project stats settings placeholder. */
const ProjectStatsSettings = memo(function ProjectStatsSettings() {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 p-6 text-sm text-muted-foreground">
      统计设置占位
    </div>
  );
});

export { ProjectStatsSettings };
