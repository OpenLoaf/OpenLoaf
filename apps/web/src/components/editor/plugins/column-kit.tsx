'use client';

import { ColumnItemPlugin, ColumnPlugin } from '@platejs/layout/react';

import { ColumnElement, ColumnGroupElement } from '@tenas-ai/ui/column-node';

export const ColumnKit = [
  ColumnPlugin.withComponent(ColumnGroupElement),
  ColumnItemPlugin.withComponent(ColumnElement),
];
