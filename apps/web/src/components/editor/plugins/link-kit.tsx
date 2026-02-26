'use client';

import { LinkPlugin } from '@platejs/link/react';

import { LinkElement } from '@openloaf/ui/link-node';
import { LinkFloatingToolbar } from '@openloaf/ui/link-toolbar';

export const LinkKit = [
  LinkPlugin.configure({
    render: {
      node: LinkElement,
      afterEditable: () => <LinkFloatingToolbar />,
    },
  }),
];
