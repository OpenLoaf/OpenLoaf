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

import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { ComponentProps, ReactNode } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@openloaf/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  CheckCircleIcon,
  LoaderCircleIcon,
  WrenchIcon,
  XCircleIcon,
} from "lucide-react";
import { isValidElement } from "react";

import { CodeBlock } from "./code-block";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn("group not-prose min-w-0 text-xs", className)}
    {...props}
  />
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
  title?: string;
  className?: string;
  icon?: ReactNode;
  /** Whether to show the status badge. */
  showStatus?: boolean;
} & (
  | { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
  | {
      type: DynamicToolUIPart["type"];
      state: DynamicToolUIPart["state"];
      toolName: string;
    }
);

const statusIcons: Record<ToolPart["state"] | "output-streaming", ReactNode> = {
  "approval-requested": <LoaderCircleIcon className="size-3 animate-spin text-yellow-600" />,
  "approval-responded": <CheckCircleIcon className="size-3 text-foreground" />,
  "input-available": <LoaderCircleIcon className="size-3 animate-spin text-muted-foreground" />,
  "input-streaming": <LoaderCircleIcon className="size-3 animate-spin text-muted-foreground" />,
  "output-available": <CheckCircleIcon className="size-3 text-foreground" />,
  "output-denied": <XCircleIcon className="size-3 text-muted-foreground" />,
  "output-error": <XCircleIcon className="size-3 text-destructive" />,
  "output-streaming": <LoaderCircleIcon className="size-3 animate-spin text-muted-foreground" />,
};

export const getStatusBadge = (status: string) => statusIcons[status as keyof typeof statusIcons];

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  toolName,
  icon,
  showStatus = true,
  ...props
}: ToolHeaderProps) => {
  const derivedName =
    type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-1.5 rounded-full px-2.5 py-1",
        "transition-colors duration-150 hover:bg-muted/60",
        className
      )}
      {...props}
    >
      {icon ?? <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />}
      <span className="shrink-0 text-xs font-medium text-muted-foreground">
        {title ?? derivedName}
      </span>
      {showStatus ? <span className="shrink-0">{getStatusBadge(state)}</span> : null}
    </CollapsibleTrigger>
  );
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 space-y-2 px-2.5 py-2 text-xs text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
  /** Tool ID displayed after the "参数" heading */
  toolId?: string;
};

export const ToolInput = ({ className, input, toolId, ...props }: ToolInputProps) => {
  if (input == null) return null;
  const code = typeof input === "string" ? input : JSON.stringify(input, null, 2) ?? "";
  return (
    <div className={cn("space-y-2 overflow-hidden", className)} {...props}>
      <h4 className="flex items-center gap-2 font-medium text-muted-foreground text-xs tracking-wide">
        <span>参数</span>
        {toolId ? (
          <span className="text-[10px] font-normal text-muted-foreground/50">{toolId}</span>
        ) : null}
      </h4>
      <div className="rounded-2xl bg-muted/50">
        <CodeBlock code={code} language="json" />
      </div>
    </div>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = (
      <CodeBlock code={JSON.stringify(output, null, 2) ?? ""} language="json" />
    );
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-2", className)} {...props}>
      <h4 className="font-medium text-muted-foreground text-xs tracking-wide">
        {errorText ? "错误" : "结果"}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-2xl text-xs [&_table]:w-full",
          errorText
            ? "bg-destructive/10 text-destructive"
            : "bg-muted/50 text-foreground"
        )}
      >
        {errorText && (
          <div className="whitespace-pre-wrap break-all px-3 py-2">{errorText}</div>
        )}
        {Output}
      </div>
    </div>
  );
};
