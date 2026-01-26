'use client';

import { createPlatePlugin } from 'platejs/react';

import { FixedToolbar } from '@tenas-ai/ui/fixed-toolbar';
import { FixedToolbarButtons } from '@tenas-ai/ui/fixed-toolbar-buttons';

export const FixedToolbarKit = [
  createPlatePlugin({
    key: 'fixed-toolbar',
    render: {
      beforeEditable: () => (
        <FixedToolbar>
          <FixedToolbarButtons />
        </FixedToolbar>
      ),
    },
  }),
];
