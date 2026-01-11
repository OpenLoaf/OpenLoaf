import type { BoardSnapshotState } from "./boardStorage";

const BOARD_DB_NAME = "tenas-board";
const BOARD_DB_VERSION = 2;
const SNAPSHOT_STORE_NAME = "board_snapshots_v2";

type BoardSnapshotCacheRecord = BoardSnapshotState & {
  /** Workspace id used for cache scope. */
  workspaceId: string;
  /** Board id used for cache scope. */
  boardId: string;
};

let boardDbPromise: Promise<IDBDatabase> | null = null;

/** Open the IndexedDB database for board snapshots. */
const openBoardSnapshotDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BOARD_DB_NAME, BOARD_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
    if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
      // 逻辑：版本升级时重建 store，避免旧 keyPath 影响读取。
      db.createObjectStore(SNAPSHOT_STORE_NAME, {
        keyPath: ["workspaceId", "boardId"],
      });
    }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/** Get the board snapshot database instance. */
const getBoardSnapshotDb = (): Promise<IDBDatabase> | null => {
  if (typeof indexedDB === "undefined") return null;
  if (!boardDbPromise) {
    boardDbPromise = openBoardSnapshotDb();
  }
  return boardDbPromise;
};

/** Load a snapshot from local cache. */
const readBoardSnapshotCache = async (
  workspaceId: string,
  boardId: string
): Promise<BoardSnapshotCacheRecord | null> => {
  const dbPromise = getBoardSnapshotDb();
  if (!dbPromise) return null;
  try {
    const db = await dbPromise;
    return await new Promise((resolve) => {
      const tx = db.transaction(SNAPSHOT_STORE_NAME, "readonly");
      const store = tx.objectStore(SNAPSHOT_STORE_NAME);
      const request = store.get([workspaceId, boardId]);
      request.onsuccess = () => resolve((request.result as BoardSnapshotCacheRecord) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

/** Save a snapshot into local cache. */
const writeBoardSnapshotCache = async (
  snapshot: BoardSnapshotCacheRecord
): Promise<void> => {
  const dbPromise = getBoardSnapshotDb();
  if (!dbPromise) return;
  try {
    const db = await dbPromise;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(SNAPSHOT_STORE_NAME, "readwrite");
      const store = tx.objectStore(SNAPSHOT_STORE_NAME);
      store.put(snapshot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // 逻辑：本地缓存失败时静默处理，避免影响主流程。
  }
};

export type { BoardSnapshotCacheRecord };
export { readBoardSnapshotCache, writeBoardSnapshotCache };
