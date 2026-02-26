import { createDragDropManager, type DragDropManager } from 'dnd-core';
import { HTML5Backend } from 'react-dnd-html5-backend';

const DND_MANAGER_KEY = Symbol.for('openloaf:dnd-manager');

/**
 * Returns a global singleton DragDropManager for all editors.
 */
function getGlobalDndManager(): DragDropManager {
  const globalAny = globalThis as typeof globalThis & { [key: symbol]: DragDropManager | undefined };

  // 使用全局 Symbol 缓存，确保跨多个 Tab/React root 只创建一个 HTML5 backend。
  if (!globalAny[DND_MANAGER_KEY]) {
    globalAny[DND_MANAGER_KEY] = createDragDropManager(HTML5Backend);
  }

  return globalAny[DND_MANAGER_KEY]!;
}

export const dndManager = getGlobalDndManager();
