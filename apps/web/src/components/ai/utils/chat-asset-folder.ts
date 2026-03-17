"use client";

export type ChatAssetFolderDescriptor = {
  /** Relative folder path under the current project/global storage root. */
  relativePath: string;
  /** Translation key for the folder label. */
  labelKey: "tool.videoDownload.chatAsset" | "tool.videoDownload.boardAsset";
};

/** Join relative path segments with stable POSIX separators. */
function joinRelativeSegments(segments: string[]) {
  return segments
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

/** Resolve the asset folder for the current chat scope. */
export function buildChatAssetFolderDescriptor(input: {
  /** Current chat session id. */
  sessionId?: string | null;
  /** Current project id. */
  projectId?: string | null;
  /** Current board id. */
  boardId?: string | null;
}): ChatAssetFolderDescriptor | null {
  const sessionId = input.sessionId?.trim() ?? "";
  const projectId = input.projectId?.trim() ?? "";
  const boardId = input.boardId?.trim() ?? "";

  // 逻辑：header file 按钮始终对应“当前会话”的 asset 目录。
  // 画布聊天的会话文件存储在 boards/<boardId>/chat-history/<sessionId>/asset 下，
  // 不应跳到画布级 boards/<boardId>/asset。
  if (boardId && sessionId) {
    return {
      relativePath: joinRelativeSegments([
        projectId ? ".openloaf" : "",
        "boards",
        boardId,
        "chat-history",
        sessionId,
        "asset",
      ]),
      labelKey: "tool.videoDownload.chatAsset",
    };
  }

  if (!sessionId) return null;

  return {
    relativePath: joinRelativeSegments([
      projectId ? ".openloaf" : "",
      "chat-history",
      sessionId,
      "asset",
    ]),
    labelKey: "tool.videoDownload.chatAsset",
  };
}
