/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * Patch PixiJS v8 BindGroup.prototype.onResourceChange to prevent
 * cascading destruction of shared BindGroups (e.g. FilterSystem._globalFilterBindGroup).
 *
 * Root cause: PixiJS v8's TextureGC may destroy a texture that was previously
 * bound to the _globalFilterBindGroup via FilterSystem._setupBindGroupsAndRender().
 * The destroyed texture emits a "change" event, and the original onResourceChange
 * calls this.destroy() when resource.destroyed is true — setting this.resources = null.
 * All subsequent filter renders then crash at BindGroup.setResource() because
 * this.resources is null.
 *
 * Fix: Instead of destroying the entire BindGroup when a single resource dies,
 * just unsubscribe from the dead resource and remove it from the map.
 * This is safe because _setupBindGroupsAndRender() always sets fresh resources
 * before each filter render pass.
 */

let patched = false

export function patchPixiBindGroupCascade(): void {
  if (patched) return
  patched = true

  try {
    // Access PixiJS BindGroup class from the public entry point.
    // Previously used a deep subpath import that isn't in the exports map.
    const { BindGroup } = require('pixi.js') as {
      BindGroup: { prototype: PixiBindGroup }
    }

    const proto = BindGroup.prototype
    if (!proto || typeof proto.onResourceChange !== 'function') return

    proto.onResourceChange = function patchedOnResourceChange(
      this: PixiBindGroup,
      resource: PixiResource,
    ) {
      this._dirty = true

      if (resource.destroyed) {
        // Original code calls this.destroy() here, which sets this.resources = null
        // and kills the shared _globalFilterBindGroup for all future filter renders.
        // Instead, just detach the dead resource gracefully.
        resource.off?.('change', this.onResourceChange, this)
        if (this.resources) {
          for (const i in this.resources) {
            if (this.resources[i] === resource) {
              delete this.resources[i]
              break
            }
          }
        }
      } else {
        this._updateKey?.()
      }
    }
  } catch {
    // BindGroup module not available (SSR or non-WebGL build) — skip.
  }

  patchBatcherBreak()
}

/**
 * Patch PixiJS v8 DefaultBatcher.prototype.break to guard against null _activeBatch.
 *
 * Root cause: Batcher.begin() resets _activeBatch to null. It's only assigned when
 * actual geometry instructions call ensureBatch(). If a Graphics object was .clear()-ed
 * and its context is rebuilt with zero renderable geometry, _activeBatch stays null.
 * When finish() → break() runs, it crashes: "Cannot read properties of null (reading 'clear')".
 *
 * This typically happens when a Graphics.clear() call marks the context dirty, but the
 * PixiJS render loop rebuilds the context before new draw commands are issued.
 */
function patchBatcherBreak(): void {
  try {
    const pixi = require('pixi.js') as Record<string, unknown>
    // DefaultBatcher is the concrete class used by the WebGL/WebGPU renderer.
    const Batcher = pixi.DefaultBatcher as { prototype: PixiBatcher } | undefined
    if (!Batcher?.prototype || typeof Batcher.prototype.break !== 'function') return

    const origBreak = Batcher.prototype.break
    Batcher.prototype.break = function patchedBreak(
      this: PixiBatcher,
      instructionPipe: unknown,
    ) {
      if (!this._activeBatch) return
      origBreak.call(this, instructionPipe)
    }
  } catch {
    // DefaultBatcher not available — skip.
  }
}

/** Minimal type stubs for PixiJS internals (Batcher). */
interface PixiBatcher {
  _activeBatch: unknown | null
  break(instructionPipe: unknown): void
}

/** Minimal type stubs for PixiJS internals. */
interface PixiResource {
  destroyed?: boolean
  off?(event: string, fn: Function, ctx: unknown): void
  on?(event: string, fn: Function, ctx: unknown): void
}

interface PixiBindGroup {
  resources: Record<string, PixiResource> | null
  _dirty: boolean
  onResourceChange(resource: PixiResource): void
  _updateKey?(): void
  destroy(): void
}
