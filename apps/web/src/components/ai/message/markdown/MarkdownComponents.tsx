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

export const markdownComponents: Components = {
  code: CODE,
  table: TABLE,
};
