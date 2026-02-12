"use client";

import * as React from "react";
import type { Components } from "react-markdown";
import { cn } from "@/lib/utils";
import MarkdownCodeInline from "./MarkdownCodeInline";
import MarkdownPre from "./MarkdownPre";
import MarkdownTable from "./MarkdownTable";

const H1: Components["h1"] = React.memo(function H1({ className, ...props }) {
  return (
    <h1
      className={cn(
        "scroll-m-20 !text-base !font-semibold tracking-tight !mt-4 !mb-2 first:!mt-0",
        className
      )}
      {...props}
    />
  );
});

const H2: Components["h2"] = React.memo(function H2({ className, ...props }) {
  return (
    <h2
      className={cn(
        "scroll-m-20 !text-[15px] !font-semibold tracking-tight !mt-4 !mb-2 first:!mt-0",
        className
      )}
      {...props}
    />
  );
});

const H3: Components["h3"] = React.memo(function H3({ className, ...props }) {
  return (
    <h3
      className={cn(
        "scroll-m-20 !text-sm !font-semibold tracking-tight !mt-4 !mb-2 first:!mt-0",
        className
      )}
      {...props}
    />
  );
});

const H4: Components["h4"] = React.memo(function H4({ className, ...props }) {
  return (
    <h4
      className={cn(
        "scroll-m-20 !text-sm !font-semibold tracking-tight !mt-4 !mb-2 first:!mt-0",
        className
      )}
      {...props}
    />
  );
});

const H5: Components["h5"] = React.memo(function H5({ className, ...props }) {
  return (
    <h5
      className={cn(
        "scroll-m-20 !text-sm !font-semibold tracking-tight !mt-4 !mb-2 first:!mt-0",
        className
      )}
      {...props}
    />
  );
});

const H6: Components["h6"] = React.memo(function H6({ className, ...props }) {
  return (
    <h6
      className={cn(
        "scroll-m-20 !text-sm !font-semibold tracking-tight !mt-4 !mb-2 first:!mt-0",
        className
      )}
      {...props}
    />
  );
});

const P: Components["p"] = React.memo(function P({ className, ...props }) {
  return (
    <p
      className={cn("!my-2 leading-relaxed first:!mt-0 last:!mb-0", className)}
      {...props}
    />
  );
});

const UL: Components["ul"] = React.memo(function UL({ className, ...props }) {
  return <ul className={cn("!my-2 !pl-5", className)} {...props} />;
});

const OL: Components["ol"] = React.memo(function OL({ className, ...props }) {
  return <ol className={cn("!my-2 !pl-5", className)} {...props} />;
});

const LI: Components["li"] = React.memo(function LI({ className, ...props }) {
  return <li className={cn("!my-0.5 marker:text-muted-foreground", className)} {...props} />;
});

const STRONG: Components["strong"] = React.memo(function STRONG({ className, ...props }) {
  return <strong className={cn("font-semibold text-foreground", className)} {...props} />;
});

const BLOCKQUOTE: Components["blockquote"] = React.memo(function BLOCKQUOTE({ className, ...props }) {
  return (
    <blockquote
      className={cn(
        "not-italic !my-2 border-l-2 border-l-primary/50 pl-4 text-muted-foreground",
        className
      )}
      {...props}
    />
  );
});

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
