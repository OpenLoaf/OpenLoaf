'use client';

import * as React from 'react';

import remarkGfm from 'remark-gfm';
import { MarkdownPlugin, remarkMdx } from '@platejs/markdown';
import { Plate, usePlateEditor } from 'platejs/react';

import { BasicNodesKit } from '@/components/editor/plugins/basic-nodes-kit';
import { Editor, EditorContainer } from '@/components/ui/editor';

interface ProjectIntroPlateProps {
  markdown: string;
  readOnly?: boolean;
}

export function ProjectIntroPlate({
  markdown,
  readOnly = true,
}: ProjectIntroPlateProps) {
  const editor = usePlateEditor(
    {
      plugins: [
        ...BasicNodesKit,
        MarkdownPlugin.configure({
          options: { remarkPlugins: [remarkGfm, remarkMdx] },
        }),
      ],
      value: [],
    },
    []
  );

  React.useEffect(() => {
    const nextValue = editor.api.markdown.deserialize(markdown);
    editor.tf.setValue(nextValue);
  }, [editor, markdown]);

  return (
    <Plate editor={editor}>
      <EditorContainer className="rounded-md border bg-background">
        <Editor
          readOnly={readOnly}
          variant="none"
          className="px-3 py-2 text-sm"
        />
      </EditorContainer>
    </Plate>
  );
}
