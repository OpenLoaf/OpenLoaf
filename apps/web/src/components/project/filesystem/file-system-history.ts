import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type HistoryAction =
  | { kind: "rename"; from: string; to: string }
  | { kind: "copy"; from: string; to: string }
  | { kind: "mkdir"; uri: string }
  /** Create a new file with payload. */
  | { kind: "create"; uri: string; content: string }
  | { kind: "delete"; uri: string; trashUri: string }
  | { kind: "trash"; uri: string }
  | { kind: "batch"; actions: HistoryAction[] };

type HistoryExecutor = {
  rename: (from: string, to: string) => Promise<void>;
  copy: (from: string, to: string) => Promise<void>;
  mkdir: (uri: string) => Promise<void>;
  delete: (uri: string) => Promise<void>;
  /** Write a text file for create/redo flows. */
  writeFile: (uri: string, content: string) => Promise<void>;
  trash: (uri: string) => Promise<void>;
  refresh: () => void;
};

type HistorySnapshot = {
  undoStack: HistoryAction[];
  redoStack: HistoryAction[];
};

const historyStore = new Map<string, HistorySnapshot>();

/** Apply a history action in reverse order. */
async function applyUndo(action: HistoryAction, executor: HistoryExecutor) {
  if (action.kind === "batch") {
    for (let i = action.actions.length - 1; i >= 0; i -= 1) {
      await applyUndo(action.actions[i], executor);
    }
    return;
  }
  if (action.kind === "rename") {
    await executor.rename(action.to, action.from);
    return;
  }
  if (action.kind === "copy") {
    await executor.delete(action.to);
    return;
  }
  if (action.kind === "mkdir") {
    await executor.delete(action.uri);
    return;
  }
  if (action.kind === "create") {
    await executor.delete(action.uri);
    return;
  }
  if (action.kind === "delete") {
    await executor.rename(action.trashUri, action.uri);
    return;
  }
  if (action.kind === "trash") {
    toast.message("该项已进入系统回收站，无法撤回");
  }
}

/** Apply a history action forward. */
async function applyRedo(action: HistoryAction, executor: HistoryExecutor) {
  if (action.kind === "batch") {
    for (const item of action.actions) {
      await applyRedo(item, executor);
    }
    return;
  }
  if (action.kind === "rename") {
    await executor.rename(action.from, action.to);
    return;
  }
  if (action.kind === "copy") {
    await executor.copy(action.from, action.to);
    return;
  }
  if (action.kind === "mkdir") {
    await executor.mkdir(action.uri);
    return;
  }
  if (action.kind === "create") {
    await executor.writeFile(action.uri, action.content);
    return;
  }
  if (action.kind === "delete") {
    await executor.rename(action.uri, action.trashUri);
    return;
  }
  if (action.kind === "trash") {
    await executor.trash(action.uri);
  }
}

/** Manage undo/redo stack for file system operations. */
export function useFileSystemHistory(executor: HistoryExecutor, historyKey = "default") {
  const initialSnapshot = useMemo(
    () => historyStore.get(historyKey) ?? { undoStack: [], redoStack: [] },
    [historyKey]
  );
  const [undoStack, setUndoStack] = useState<HistoryAction[]>(
    initialSnapshot.undoStack
  );
  const [redoStack, setRedoStack] = useState<HistoryAction[]>(
    initialSnapshot.redoStack
  );
  const isPerformingRef = useRef(false);
  const snapshotRef = useRef<HistorySnapshot>({
    undoStack: initialSnapshot.undoStack,
    redoStack: initialSnapshot.redoStack,
  });

  const updateSnapshot = useCallback((next: HistorySnapshot) => {
    snapshotRef.current = next;
    historyStore.set(historyKey, next);
  }, [historyKey]);

  const push = useCallback((action: HistoryAction) => {
    if (isPerformingRef.current) return;
    setUndoStack((prev) => {
      const next = [...prev, action];
      updateSnapshot({ undoStack: next, redoStack: [] });
      return next;
    });
    setRedoStack([]);
  }, [updateSnapshot]);

  const undo = useCallback(async () => {
    const current = snapshotRef.current;
    if (current.undoStack.length === 0) return;
    const action = current.undoStack[current.undoStack.length - 1];
    isPerformingRef.current = true;
    try {
      await applyUndo(action, executor);
      executor.refresh();
      const nextUndo = current.undoStack.slice(0, -1);
      const nextRedo =
        action.kind === "trash" ? current.redoStack : [...current.redoStack, action];
      updateSnapshot({ undoStack: nextUndo, redoStack: nextRedo });
      setUndoStack(nextUndo);
      setRedoStack(nextRedo);
    } catch (error) {
      toast.error("撤回失败，请检查文件状态");
      console.error(error);
    } finally {
      isPerformingRef.current = false;
    }
  }, [executor, updateSnapshot]);

  const redo = useCallback(async () => {
    const current = snapshotRef.current;
    if (current.redoStack.length === 0) return;
    const action = current.redoStack[current.redoStack.length - 1];
    isPerformingRef.current = true;
    try {
      await applyRedo(action, executor);
      executor.refresh();
      const nextRedo = current.redoStack.slice(0, -1);
      const nextUndo = [...current.undoStack, action];
      updateSnapshot({ undoStack: nextUndo, redoStack: nextRedo });
      setRedoStack(nextRedo);
      setUndoStack(nextUndo);
    } catch (error) {
      toast.error("前进失败，请检查文件状态");
      console.error(error);
    } finally {
      isPerformingRef.current = false;
    }
  }, [executor, updateSnapshot]);

  const clear = useCallback(() => {
    const next = { undoStack: [], redoStack: [] };
    updateSnapshot(next);
    setUndoStack([]);
    setRedoStack([]);
  }, [updateSnapshot]);

  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    push,
    undo,
    redo,
    clear,
  };
}

export type { HistoryAction };
