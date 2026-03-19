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

/* eslint-disable @typescript-eslint/no-require-imports */

let patched = false

export function patchPixiBindGroupCascade(): void {
  if (patched) return
  patched = true

  try {
    // Access PixiJS internal BindGroup class.
    // The require path is stable across pixi.js v8.x.
    const mod = require('pixi.js/lib/rendering/renderers/gpu/shader/BindGroup') as {
      BindGroup: { prototype: PixiBindGroup }
    }

    const proto = mod.BindGroup.prototype
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
