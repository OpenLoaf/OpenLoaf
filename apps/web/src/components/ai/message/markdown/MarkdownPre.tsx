"use client";

import * as React from "react";
import MarkdownCodeBlock from "./MarkdownCodeBlock";

function toText(children: React.ReactNode): string {
  if (children == null) return "";
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(toText).join("");
  return "";
}

export default React.memo(function MarkdownPre({
  children,
}: React.ComponentProps<"pre">) {
  const child = React.Children.toArray(children)[0];

  if (React.isValidElement(child)) {
    const anyChild: any = child;
    const childClassName: string | undefined = anyChild.props?.className;
    const match = /language-(\w+)/.exec(childClassName || "");
    const code = toText(anyChild.props?.children).replace(/\n$/, "");
    return <MarkdownCodeBlock code={code} language={match?.[1]} />;
  }

  const fallbackCode = toText(children).replace(/\n$/, "");
  return <MarkdownCodeBlock code={fallbackCode} language="text" />;
});
