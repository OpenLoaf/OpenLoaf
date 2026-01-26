import { BaseCalloutPlugin } from '@platejs/callout';

import { CalloutElementStatic } from '@tenas-ai/ui/callout-node-static';

export const BaseCalloutKit = [
  BaseCalloutPlugin.withComponent(CalloutElementStatic),
];
