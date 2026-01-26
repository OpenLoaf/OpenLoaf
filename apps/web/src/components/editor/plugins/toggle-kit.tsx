'use client';

import { TogglePlugin } from '@platejs/toggle/react';

import { IndentKit } from '@/components/editor/plugins/indent-kit';
import { ToggleElement } from '@tenas-ai/ui/toggle-node';

export const ToggleKit = [
  ...IndentKit,
  TogglePlugin.withComponent(ToggleElement),
];
