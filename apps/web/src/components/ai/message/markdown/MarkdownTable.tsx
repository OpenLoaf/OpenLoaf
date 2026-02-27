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

import * as React from "react";

export default React.memo(function MarkdownTable({
  className,
  children,
  ...props
}: React.ComponentProps<"table">) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table className={className} {...props}>
        {children}
      </table>
    </div>
  );
});
