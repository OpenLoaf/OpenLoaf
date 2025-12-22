'use client';

import { DndProvider } from 'react-dnd';

import { DndPlugin } from '@platejs/dnd';
import { PlaceholderPlugin } from '@platejs/media/react';

import { BlockDraggable } from '@/components/ui/block-draggable';
import { dndManager } from '@/lib/dnd-manager';

export const DndKit = [
  DndPlugin.configure({
    options: {
      enableScroller: true,
      onDropFiles: ({ dragItem, editor, target }) => {
        editor
          .getTransforms(PlaceholderPlugin)
          .insert.media(dragItem.files, { at: target, nextBlock: false });
      },
    },
    render: {
      aboveNodes: BlockDraggable,
      aboveSlate: ({ children }) => (
        // 复用全局 DnD manager，避免多编辑器并存时创建多个 HTML5 backend。
        <DndProvider manager={dndManager}>{children}</DndProvider>
      ),
    },
  }),
];
