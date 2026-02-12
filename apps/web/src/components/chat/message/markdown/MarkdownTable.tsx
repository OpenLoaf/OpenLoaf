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
