'use client';

import * as React from 'react';

import { Plate, usePlateEditor } from 'platejs/react';
import { BlockSelectionPlugin } from '@platejs/selection/react';

import { BasicBlocksKit } from '@/components/editor/plugins/basic-blocks-kit';
import { BasicMarksKit } from '@/components/editor/plugins/basic-marks-kit';
import { Editor, EditorContainer } from '@/components/ui/editor';
import { MarkdownKit } from '@/components/editor/plugins/markdown-kit';
import { DndKit } from '@/components/editor/plugins/dnd-kit';
import { EditorKit } from '@/components/editor/editor-kit';

interface ProjectInfoPlateProps {
  markdown: string;
  readOnly?: boolean;
}

export function ProjectInfoPlate({
  markdown,
  readOnly = true,
}: ProjectInfoPlateProps) {
  const editor = usePlateEditor({
    plugins: [
      // BlockSelectionPlugin 提供 blockSelection API，BlockDraggable 会用到（如 getNodes/focus/add）。
      // BlockSelectionPlugin,
      // ...BasicBlocksKit,
      // ...BasicMarksKit,
      // ...MarkdownKit,
      // ...DndKit,
      ...EditorKit
    ],
    value: [],
  });

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
