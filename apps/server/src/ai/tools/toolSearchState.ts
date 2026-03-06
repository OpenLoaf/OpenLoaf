/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * Per-session state tracking which tools have been activated via tool-search.
 */
export class ActivatedToolSet {
  /** Core tools that are always available (e.g. tool-search). */
  private readonly coreToolIds: ReadonlySet<string>
  /** Tools dynamically activated via tool-search. */
  private readonly activatedIds = new Set<string>()

  constructor(coreToolIds: readonly string[]) {
    this.coreToolIds = new Set(coreToolIds)
  }

  activate(toolIds: string[]): void {
    for (const id of toolIds) this.activatedIds.add(id)
  }

  getActiveToolIds(): string[] {
    return [...this.coreToolIds, ...this.activatedIds]
  }

  isActive(toolId: string): boolean {
    return this.coreToolIds.has(toolId) || this.activatedIds.has(toolId)
  }
}
