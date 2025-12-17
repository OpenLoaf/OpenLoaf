'use client';

import * as React from 'react';

import remarkGfm from 'remark-gfm';
import { MarkdownPlugin, remarkMdx } from '@platejs/markdown';
import { Plate, createPlateEditor } from 'platejs/react';

import { BasicBlocksKit } from '@/components/editor/plugins/basic-blocks-kit';
import { BasicMarksKit } from '@/components/editor/plugins/basic-marks-kit';
import { Editor, EditorContainer } from '@/components/ui/editor';

interface ProjectInfoPlateProps {
  markdown: string;
  readOnly?: boolean;
}

export function ProjectInfoPlate({
  markdown,
  readOnly = true,
}: ProjectInfoPlateProps) {
  const editor = React.useMemo(
    () =>
      createPlateEditor({
        plugins: [
          ...BasicBlocksKit,
          ...BasicMarksKit,
          MarkdownPlugin.configure({
            options: { remarkPlugins: [remarkGfm, remarkMdx] },
          }),
        ],
        value: [],
      }),
    []
  );

  React.useEffect(() => {
    const nextValue = editor.api.markdown.deserialize(markdown);
    editor.tf.setValue(nextValue);
  }, [editor, markdown]);

  return (
    <Plate editor={editor}>
      <EditorContainer className="bg-background">
        <Editor
          readOnly={readOnly}
          variant="none"
          className="px-3 py-0 text-sm"
        />
      </EditorContainer>
    </Plate>
  );
}
