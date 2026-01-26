'use client';

import { LinkPlugin } from '@platejs/link/react';

import { LinkElement } from '@tenas-ai/ui/link-node';
import { LinkFloatingToolbar } from '@tenas-ai/ui/link-toolbar';

export const LinkKit = [
  LinkPlugin.configure({
    render: {
      node: LinkElement,
      afterEditable: () => <LinkFloatingToolbar />,
    },
  }),
];
