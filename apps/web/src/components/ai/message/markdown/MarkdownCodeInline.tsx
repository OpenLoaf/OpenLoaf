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
import { cn } from "@/lib/utils";
import { useOptionalChatSession } from "@/components/ai/context";
import { createFileEntryFromUri, openFile } from "@/components/file/lib/open-file";
import { useProject } from "@/hooks/use-project";

/** Match absolute paths like /Users/..., /tmp/..., /home/... with at least 2 segments. */
const ABSOLUTE_PATH_RE = /^\/(?:[a-zA-Z0-9._~-]+\/)+[a-zA-Z0-9._~-]+(?:\.[a-zA-Z0-9]+)?$/;
/** Match session-scoped template paths like ${CURRENT_CHAT_DIR}/xxx. */
const CHAT_DIR_TEMPLATE_RE = /^\$\{CURRENT_CHAT_DIR\}\/\S+$/;

/** Check if text looks like a clickable file path. */
function isFilePath(text: string): boolean {
  if (!text || text.length < 3) return false;
  return ABSOLUTE_PATH_RE.test(text) || CHAT_DIR_TEMPLATE_RE.test(text);
}

function ClickableFilePath({
  text,
  className,
  codeProps,
}: {
  text: string;
  className?: string;
  codeProps: Record<string, unknown>;
}) {
  const session = useOptionalChatSession();
  const projectQuery = useProject(session?.projectId ?? undefined);
  const projectRootUri = projectQuery.data?.project?.rootUri ?? undefined;

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const name = text.split("/").filter(Boolean).pop() ?? text;
      const entry = createFileEntryFromUri({ uri: text, name });
      if (!entry) return;
      openFile({
        entry,
        tabId: session?.tabId,
        projectId: session?.projectId ?? undefined,
        sessionId: session?.sessionId ?? undefined,
        rootUri: projectRootUri,
      });
    },
    [text, session?.tabId, session?.projectId, session?.sessionId, projectRootUri],
  );

  return (
    <code
      className={cn(
        "rounded-3xl bg-muted px-2 py-1 font-mono text-[0.9em] font-normal text-foreground wrap-break-word",
        "cursor-pointer text-primary hover:underline",
        className,
      )}
      onClick={handleClick}
      title="点击打开文件"
      {...(codeProps as any)}
    >
      {text}
    </code>
  );
}

export default React.memo(function MarkdownCodeInline({
  className,
  children,
  ...props
}: {
  className?: string;
  children?: unknown;
  'data-block'?: boolean | string;
} & Record<string, unknown>) {
  const isBlock = props['data-block'] === true || props['data-block'] === 'true';

  if (isBlock) {
    return (
      <pre
        className={cn(
          "overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[0.9em] text-foreground",
          className,
        )}
      >
        <code {...(props as any)}>{children as any}</code>
      </pre>
    );
  }

  const text = typeof children === "string" ? children : "";
  if (text && isFilePath(text)) {
    return <ClickableFilePath text={text} className={className} codeProps={props} />;
  }

  return (
    <code
      className={cn(
        "rounded-3xl bg-muted px-2 py-1 font-mono text-[0.9em] font-normal text-foreground wrap-break-word",
        className
      )}
      {...(props as any)}
    >
      {children as any}
    </code>
  );
});
