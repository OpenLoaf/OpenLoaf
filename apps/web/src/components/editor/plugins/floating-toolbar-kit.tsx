'use client';

import { createPlatePlugin } from 'platejs/react';

import { FloatingToolbar } from '@tenas-ai/ui/floating-toolbar';
import { FloatingToolbarButtons } from '@tenas-ai/ui/floating-toolbar-buttons';

export const FloatingToolbarKit = [
  createPlatePlugin({
    key: 'floating-toolbar',
    render: {
      afterEditable: () => (
        <FloatingToolbar>
          <FloatingToolbarButtons />
        </FloatingToolbar>
      ),
    },
  }),
];
