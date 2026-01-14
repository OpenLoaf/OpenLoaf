import * as React from 'react';

import type { TMentionElement } from 'platejs';
import type { SlateElementProps } from 'platejs/static';

import { KEYS } from 'platejs';
import { SlateElement } from 'platejs/static';

import { cn } from '@/lib/utils';
import { parseTenasFileUrl } from '@/components/project/filesystem/utils/file-system-utils';

export function MentionElementStatic(
  props: SlateElementProps<TMentionElement> & {
    prefix?: string;
  }
) {
  const { prefix } = props;
  const element = props.element;
  const rawValue = element.value ?? '';
  const normalizedValue = rawValue.startsWith('@') ? rawValue.slice(1) : rawValue;
  const match = normalizedValue.match(/^(.*?)(?::(\d+)-(\d+))?$/);
  const baseValue = match?.[1] ?? normalizedValue;
  const lineStart = match?.[2];
  const lineEnd = match?.[3];
  const parsed = baseValue.startsWith('tenas-file://') ? parseTenasFileUrl(baseValue) : null;
  const labelBase = parsed?.relativePath ?? baseValue;
  const label = labelBase.split('/')?.pop() || labelBase;
  const labelWithLines =
    lineStart && lineEnd ? `${label} ${lineStart}:${lineEnd}` : label;

  return (
    <SlateElement
      {...props}
      className={cn(
        'inline-block rounded-md bg-muted px-1.5 py-0.5 align-baseline font-medium text-sm',
        element.children[0][KEYS.bold] === true && 'font-bold',
        element.children[0][KEYS.italic] === true && 'italic',
        element.children[0][KEYS.underline] === true && 'underline'
      )}
      attributes={{
        ...props.attributes,
        'data-slate-value': element.value,
      }}
    >
      {props.children}
      {prefix}
      {labelWithLines}
    </SlateElement>
  );
}
