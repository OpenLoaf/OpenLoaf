import { BaseTogglePlugin } from '@platejs/toggle';

import { ToggleElementStatic } from '@tenas-ai/ui/toggle-node-static';

export const BaseToggleKit = [
  BaseTogglePlugin.withComponent(ToggleElementStatic),
];
