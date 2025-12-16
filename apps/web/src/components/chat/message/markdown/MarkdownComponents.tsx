"use client";

import * as React from "react";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import MarkdownCodeInline from "./MarkdownCodeInline";
import MarkdownPre from "./MarkdownPre";
import MarkdownTable from "./MarkdownTable";

const H1: Components["h1"] = ({ className, ...props }) => (
  <h1
    className={cn(
      "scroll-m-20 !text-base !font-semibold tracking-tight !mt-4 !mb-2 first:!mt-0",
      className
    )}
    {...props}
  />
);

const H2: Components["h2"] = ({ className, ...props }) => (
  <h2
    className={cn(
      "scroll-m-20 !text-[15px] !font-semibold tracking-tight !mt-4 !mb-2 first:!mt-0",
      className
    )}
    {...props}
  />
);

const H3: Components["h3"] = ({ className, ...props }) => (
  <h3
    className={cn(
      "scroll-m-20 !text-sm !font-semibold tracking-tight !mt-4 !mb-2 first:!mt-0",
      className
    )}
    {...props}
  />
);

const H4: Components["h4"] = ({ className, ...props }) => (
  <h4
    className={cn(
      "scroll-m-20 !text-sm !font-semibold tracking-tight !mt-4 !mb-2 first:!mt-0",
      className
    )}
    {...props}
  />
);

const H5: Components["h5"] = ({ className, ...props }) => (
  <h5
    className={cn(
      "scroll-m-20 !text-sm !font-semibold tracking-tight !mt-4 !mb-2 first:!mt-0",
      className
    )}
    {...props}
  />
);

const H6: Components["h6"] = ({ className, ...props }) => (
  <h6
    className={cn(
      "scroll-m-20 !text-sm !font-semibold tracking-tight !mt-4 !mb-2 first:!mt-0",
      className
    )}
    {...props}
  />
);

const P: Components["p"] = ({ className, ...props }) => (
  <p
    className={cn("!my-2 leading-relaxed first:!mt-0 last:!mb-0", className)}
    {...props}
  />
);

const UL: Components["ul"] = ({ className, ...props }) => (
  <ul className={cn("!my-2 !pl-5", className)} {...props} />
);

const OL: Components["ol"] = ({ className, ...props }) => (
  <ol className={cn("!my-2 !pl-5", className)} {...props} />
);

const LI: Components["li"] = ({ className, ...props }) => (
  <li className={cn("!my-0.5 marker:text-muted-foreground", className)} {...props} />
);

const STRONG: Components["strong"] = ({ className, ...props }) => (
  <strong className={cn("font-semibold text-foreground", className)} {...props} />
);

const BLOCKQUOTE: Components["blockquote"] = ({ className, ...props }) => (
  <blockquote
    className={cn(
      "not-italic !my-2 border-l-2 border-l-primary/50 pl-4 text-muted-foreground",
      className
    )}
    {...props}
  />
);

const PRE: Components["pre"] = ({ node: _node, ...props }) => (
  <MarkdownPre {...(props as React.ComponentProps<"pre">)} />
);

const CODE: Components["code"] = ({ node: _node, ...props }) => (
  <MarkdownCodeInline {...(props as any)} />
);

const TABLE: Components["table"] = ({ node: _node, ...props }) => (
  <MarkdownTable {...(props as React.ComponentProps<"table">)} />
);

export const markdownComponents: Components = {
  h1: H1,
  h2: H2,
  h3: H3,
  h4: H4,
  h5: H5,
  h6: H6,
  p: P,
  ul: UL,
  ol: OL,
  li: LI,
  strong: STRONG,
  blockquote: BLOCKQUOTE,
  pre: PRE,
  code: CODE,
  table: TABLE,
};

