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
import type { Components } from "streamdown";
import MarkdownCodeInline from "./MarkdownCodeInline";
import MarkdownTable from "./MarkdownTable";

const CODE: Components["code"] = React.memo(function CODE(props: any) {
  return <MarkdownCodeInline {...props} />;
});

const TABLE: Components["table"] = React.memo(function TABLE(props: any) {
  return <MarkdownTable {...(props as React.ComponentProps<"table">)} />;
});

// Override list elements — streamdown generates dynamic classes (e.g. `list-inside`, `[li_&]:pl-6`)
// that Tailwind cannot scan at build time. We replace them with static classes known to Tailwind.
const UL: Components["ul"] = React.memo(function UL({
  children,
  className: _originalClass,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      className="list-disc whitespace-normal pl-4 marker:text-muted-foreground"
      {...props}
    >
      {children}
    </ul>
  );
});

const OL: Components["ol"] = React.memo(function OL({
  children,
  className: _originalClass,
  ...props
}: React.ComponentProps<"ol">) {
  return (
    <ol
      className="list-decimal whitespace-normal pl-4 marker:text-muted-foreground"
      {...props}
    >
      {children}
    </ol>
  );
});

const LI: Components["li"] = React.memo(function LI({
  children,
  className: _originalClass,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li {...props}>
      {children}
    </li>
  );
});

export const markdownComponents: Components = {
  code: CODE,
  table: TABLE,
  ul: UL,
  ol: OL,
  li: LI,
};
