"use client";

import * as React from "react";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "@/components/ai-elements/code-block";
import { cn } from "@/lib/utils";

/**
 * Render markdown fenced code block with ai-elements code-block primitives.
 */
export default function MarkdownCodeBlock({
  code,
  language,
  className,
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  const normalizedLanguage = (language || "text").toLowerCase();

  return (
    <CodeBlock
      code={code}
      language={normalizedLanguage as any}
      showLineNumbers
      className={cn("my-3 w-full min-w-0 max-w-full", className)}
    >
      <CodeBlockHeader>
        <CodeBlockTitle>{normalizedLanguage}</CodeBlockTitle>
        <CodeBlockActions>
          <CodeBlockCopyButton />
        </CodeBlockActions>
      </CodeBlockHeader>
    </CodeBlock>
  );
}
