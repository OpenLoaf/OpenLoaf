/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */
import type { Container } from "pixi.js"
import type { CanvasEngine } from "../../engine/CanvasEngine"

/**
 * Synchronizes the CanvasEngine viewport state to a PixiJS world container.
 * On every view change, applies zoom + offset as a PixiJS transform.
 * This is the core of "zero-cost pan/zoom" — just changing container transform.
 */
export class PixiViewportSync {
  private engine: CanvasEngine
  private worldContainer: Container

  constructor(engine: CanvasEngine, worldContainer: Container) {
    this.engine = engine
    this.worldContainer = worldContainer
  }

  /** Apply current viewport state to the world container transform. */
  sync(): void {
    const { zoom, offset } = this.engine.viewport.getState()
    this.worldContainer.position.set(offset[0], offset[1])
    this.worldContainer.scale.set(zoom, zoom)
  }

  destroy(): void {
    // No subscriptions to clean up — sync is called externally.
  }
}
