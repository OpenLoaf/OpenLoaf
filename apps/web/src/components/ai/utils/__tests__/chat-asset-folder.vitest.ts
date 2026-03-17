import { describe, expect, it } from "vitest";
import { buildChatAssetFolderDescriptor } from "../chat-asset-folder";

describe("buildChatAssetFolderDescriptor", () => {
  it("returns project chat asset path for normal project chats", () => {
    expect(
      buildChatAssetFolderDescriptor({
        sessionId: "session_alpha",
        projectId: "project_alpha",
      }),
    ).toEqual({
      relativePath: ".openloaf/chat-history/session_alpha/asset",
      labelKey: "tool.videoDownload.chatAsset",
    });
  });

  it("returns global chat asset path for normal global chats", () => {
    expect(
      buildChatAssetFolderDescriptor({
        sessionId: "session_alpha",
      }),
    ).toEqual({
      relativePath: "chat-history/session_alpha/asset",
      labelKey: "tool.videoDownload.chatAsset",
    });
  });

  it("returns board asset path for project board chats", () => {
    expect(
      buildChatAssetFolderDescriptor({
        sessionId: "session_alpha",
        projectId: "project_alpha",
        boardId: "board_alpha",
      }),
    ).toEqual({
      relativePath: ".openloaf/boards/board_alpha/asset",
      labelKey: "tool.videoDownload.boardAsset",
    });
  });

  it("returns board asset path for global board chats", () => {
    expect(
      buildChatAssetFolderDescriptor({
        sessionId: "session_alpha",
        boardId: "board_alpha",
      }),
    ).toEqual({
      relativePath: "boards/board_alpha/asset",
      labelKey: "tool.videoDownload.boardAsset",
    });
  });

  it("returns board asset path even without sessionId", () => {
    expect(
      buildChatAssetFolderDescriptor({
        projectId: "project_alpha",
        boardId: "board_alpha",
      }),
    ).toEqual({
      relativePath: ".openloaf/boards/board_alpha/asset",
      labelKey: "tool.videoDownload.boardAsset",
    });
  });

  it("returns null when chat scope has neither board nor session", () => {
    expect(buildChatAssetFolderDescriptor({})).toBeNull();
  });
});
