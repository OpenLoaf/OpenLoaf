/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { WidgetSDK } from '@openloaf/widget-sdk'

/** Metadata for a dynamic widget from the server. */
export interface DynamicWidgetMeta {
  id: string
  name: string
  description?: string
  main: string
  scripts?: Record<string, string>
  openloaf?: {
    type: 'widget'
    defaultSize?: string
    constraints?: {
      defaultW: number
      defaultH: number
      minW: number
      minH: number
      maxW: number
      maxH: number
    }
    support?: { workspace: boolean; project: boolean }
  }
}

/** Props interface for dynamically loaded widget components. */
export interface DynamicWidgetComponentProps {
  sdk: WidgetSDK
}

/** A dynamically loaded widget React component. */
export type DynamicWidgetComponent = React.ComponentType<DynamicWidgetComponentProps>
