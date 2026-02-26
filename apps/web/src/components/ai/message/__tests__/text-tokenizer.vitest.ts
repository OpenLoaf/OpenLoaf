import { describe, expect, it } from "vitest";
import { parseChatTextTokens, preprocessChatText } from "../text-tokenizer";

describe("text-tokenizer", () => {
  it("normalizes url boundary in CJK text", () => {
    const text = "查看https://example.com测试";
    expect(preprocessChatText(text)).toBe("查看https://example.com 测试");
  });

  it("parses mention and command tokens", () => {
    const tokens = parseChatTextTokens("/help 查看 @project/file.ts:1-2");
    expect(tokens).toEqual([
      { type: "command", value: "/help" },
      { type: "text", value: " 查看 " },
      { type: "mention", value: "project/file.ts:1-2" },
    ]);
  });

  it("does not treat file paths as commands", () => {
    const tokens = parseChatTextTokens("创建 /tmp/openloaf-tool-test.txt 文件");
    expect(tokens.every((t) => t.type === "text")).toBe(true);
  });

  it("keeps plain text when no special token", () => {
    const tokens = parseChatTextTokens("普通文本");
    expect(tokens).toEqual([{ type: "text", value: "普通文本" }]);
  });
});

