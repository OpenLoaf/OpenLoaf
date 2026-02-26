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

import * as React from "react";
import type { Components } from "react-markdown";
import MarkdownCodeInline from "./MarkdownCodeInline";
import MarkdownPre from "./MarkdownPre";
import MarkdownTable from "./MarkdownTable";

const PRE: Components["pre"] = React.memo(function PRE({ node: _node, ...props }) {
  return <MarkdownPre {...(props as React.ComponentProps<"pre">)} />;
});

const CODE: Components["code"] = React.memo(function CODE({ node: _node, ...props }) {
  return <MarkdownCodeInline {...(props as any)} />;
});

const TABLE: Components["table"] = React.memo(function TABLE({ node: _node, ...props }) {
  return <MarkdownTable {...(props as React.ComponentProps<"table">)} />;
});

export const markdownComponents: Components = {
  pre: PRE,
  code: CODE,
  table: TABLE,
};

