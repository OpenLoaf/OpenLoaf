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

  // Board asset is stored at boards/<boardId>/asset,
  // aligned with the backend – no chat-history/<sessionId> nesting.
  if (boardId) {
    return {
      relativePath: joinRelativeSegments([
        projectId ? ".openloaf" : "",
        "boards",
        boardId,
        "asset",
      ]),
      labelKey: "tool.videoDownload.boardAsset",
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
