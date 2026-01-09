"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Value } from "platejs";
import { setValue } from "platejs";
import { ParagraphPlugin, Plate, usePlateEditor } from "platejs/react";
import { Editor as SlateEditor, type BaseEditor } from "slate";
import { ChevronUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTabs } from "@/hooks/use-tabs";
import { trpc } from "@/utils/trpc";
import { cn } from "@/lib/utils";
import { handleChatMentionPointerDown } from "@/lib/chat/mention-pointer";
import {
  buildMentionNode,
  getPlainTextValue,
  parseChatValue,
  serializeChatValue,
} from "@/components/chat/chat-input-utils";
import { MentionKit } from "@/components/editor/plugins/mention-kit";
import { ClipboardKit } from "@/components/editor/plugins/clipboard-kit";
import { ParagraphElement } from "@/components/ui/paragraph-node";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { Button } from "@/components/ui/button";
import SelectMode from "@/components/chat/input/SelectMode";

export type ImageNodeInputProps = {
  /** Optional wrapper class name. */
  className?: string;
  /** Placeholder text for the input. */
  placeholder?: string;
  /** Submit handler for input content. */
  onSubmit?: (value: string) => void;
};

/** Render a chat-style input for image nodes. */
export function ImageNodeInput({
  className,
  placeholder = "Type a note...",
  onSubmit,
}: ImageNodeInputProps) {
  const editorId = useId();
  /** Current input value. */
  const [inputValue, setInputValue] = useState("");
  /** Plain text value used for button state. */
  const [plainTextValue, setPlainTextValue] = useState(() =>
    getPlainTextValue(parseChatValue(""))
  );
  /** Track the last serialized value to avoid redundant editor updates. */
  const lastSerializedRef = useRef(inputValue);
  const { data: projects = [] } = useQuery(trpc.project.list.queryOptions());
  const activeTabId = useTabs((state) => state.activeTabId);
  const pushStackItem = useTabs((state) => state.pushStackItem);
  const plugins = useMemo(
    () => [ParagraphPlugin.withComponent(ParagraphElement), ...MentionKit, ...ClipboardKit],
    []
  );
  const initialValue = useMemo(() => parseChatValue(inputValue), []);
  const editor = usePlateEditor({
    id: `image-node-input-${editorId}`,
    plugins,
    value: initialValue,
  });
  const canSubmit = plainTextValue.trim().length > 0;

  /** Handle pointer events on mention chips. */
  const handleMentionPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      handleChatMentionPointerDown(event, {
        activeTabId,
        projects,
        pushStackItem,
      });
    },
    [activeTabId, projects, pushStackItem]
  );

  /** Insert a file reference as a mention node. */
  const insertFileMention = useCallback(
    (fileRef: string) => {
      if (!editor) return;
      if (!editor.selection) {
        const endPoint = SlateEditor.end(editor as unknown as BaseEditor, []);
        editor.tf.select(endPoint);
      }
      editor.tf.focus();
      editor.tf.insertNodes(buildMentionNode(fileRef), { select: true });
      editor.tf.insertText(" ");
    },
    [editor]
  );

  /** Sync editor value into serialized string state. */
  const handleValueChange = useCallback(
    (nextValue: Value) => {
      const serialized = serializeChatValue(nextValue);
      lastSerializedRef.current = serialized;
      setInputValue(serialized);
      setPlainTextValue(getPlainTextValue(nextValue));
    },
    []
  );

  /** Submit the current input value. */
  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = inputValue.trim();
      if (!trimmed) return;
      onSubmit?.(trimmed);
      setInputValue("");
      setPlainTextValue("");
    },
    [inputValue, onSubmit]
  );

  /** Submit when pressing Enter without Shift. */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit(event as unknown as React.FormEvent);
      }
    },
    [handleSubmit]
  );

  useEffect(() => {
    if (!editor) return;
    if (inputValue === lastSerializedRef.current) return;
    const nextValue = parseChatValue(inputValue);
    setValue(editor, nextValue);
    setPlainTextValue(getPlainTextValue(nextValue));
    lastSerializedRef.current = inputValue;
  }, [editor, inputValue]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        "relative h-[94px] w-[360px] rounded-xl border border-border bg-card shadow-lg transition-colors",
        "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20",
        className
      )}
      onPointerDownCapture={handleMentionPointerDown}
    >
      <form
        className="flex h-full flex-col overflow-hidden"
        onSubmit={handleSubmit}
      >
        <div className="flex-1 px-2 pt-1.5 pb-2">
          <Plate
            editor={editor}
            onValueChange={({ value: nextValue }) => handleValueChange(nextValue)}
          >
            <EditorContainer className="h-full bg-transparent">
              <Editor
                variant="none"
                className="h-full min-h-0 text-[13px] leading-5"
                placeholder={placeholder}
                onKeyDown={handleKeyDown}
                data-teatime-chat-input="true"
              />
            </EditorContainer>
          </Plate>
        </div>

        <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5">
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
            <SelectMode className="max-w-[10rem]" />
            <Button
              type={canSubmit ? "submit" : "button"}
              size="icon"
              disabled={!canSubmit}
              className={cn(
                "h-8 w-8 rounded-full shrink-0 shadow-none transition-colors",
                canSubmit
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground opacity-50"
              )}
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
