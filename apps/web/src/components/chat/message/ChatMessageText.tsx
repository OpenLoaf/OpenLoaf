"use client";

import * as React from "react";
import { type Value } from "platejs";
import { ParagraphPlugin, Plate, usePlateEditor } from "platejs/react";
import { Text } from "slate";
import type { RenderLeafProps } from "platejs";

import { cn } from "@/lib/utils";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { ParagraphElement } from "@/components/ui/paragraph-node";
import { MentionKit } from "@/components/editor/plugins/mention-kit";
import { ClipboardKit } from "@/components/editor/plugins/clipboard-kit";
import { parseChatValue } from "../chat-input-utils";

const COMMAND_REGEX = /(^|\s)(\/[\w-]+)/g;

interface ChatMessageTextProps {
  value: string;
  className?: string;
}

export default function ChatMessageText({ value, className }: ChatMessageTextProps) {
  const editorId = React.useId();
  const plugins = React.useMemo(
    () => [ParagraphPlugin.withComponent(ParagraphElement), ...MentionKit, ...ClipboardKit],
    [],
  );
  const initialValue = React.useMemo<Value>(() => parseChatValue(value), [value]);
  const editor = usePlateEditor(
    {
      id: `chat-message-${editorId}`,
      enabled: true,
      plugins,
      value: initialValue,
    },
    [editorId, initialValue],
  );

  const decorate = React.useCallback((entry: any) => {
    if (!Array.isArray(entry)) return [];
    const [node, path] = entry;
    const ranges: Array<{ command?: boolean; anchor: any; focus: any }> = [];
    if (!Text.isText(node)) return ranges;
    COMMAND_REGEX.lastIndex = 0;
    let match = COMMAND_REGEX.exec(node.text);
    while (match) {
      const lead = match[1] ?? "";
      const command = match[2] ?? "";
      const start = match.index + lead.length;
      const end = start + command.length;
      ranges.push({
        command: true,
        anchor: { path, offset: start },
        focus: { path, offset: end },
      });
      match = COMMAND_REGEX.exec(node.text);
    }
    return ranges;
  }, []);

  const renderLeaf = React.useCallback((props: RenderLeafProps) => {
    const { attributes, children, leaf } = props;
    if ((leaf as any).command) {
      return (
        <span
          {...attributes}
          className="inline-flex items-center rounded-md bg-muted px-1.5 text-[11px] font-semibold text-foreground"
        >
          {children}
        </span>
      );
    }
    return <span {...attributes}>{children}</span>;
  }, []);

  if (!editor) return null;

  return (
    <Plate editor={editor} decorate={decorate} renderLeaf={renderLeaf} readOnly>
      <EditorContainer className="bg-transparent">
        <Editor
          variant="none"
          className={cn("text-[13px] leading-5", className)}
          readOnly
          data-teatime-chat-message="true"
        />
      </EditorContainer>
    </Plate>
  );
}
