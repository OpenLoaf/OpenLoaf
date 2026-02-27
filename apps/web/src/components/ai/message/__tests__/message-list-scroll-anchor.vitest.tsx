/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import * as React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

type MockMessage = {
  id: string;
  role: "user" | "assistant";
  parts?: Array<{ type: "text"; text: string }>;
};

type MockChatState = {
  messages: MockMessage[];
  status: "ready" | "submitted" | "streaming" | "error";
  error: Error | undefined;
  isHistoryLoading: boolean;
  stepThinking: boolean;
  pendingCloudMessage: unknown;
};

let mockChatState: MockChatState = {
  messages: [],
  status: "ready",
  error: undefined,
  isHistoryLoading: false,
  stepThinking: false,
  pendingCloudMessage: null,
};

const scrollToMock = vi.fn();

vi.mock("../../context", () => ({
  useChatState: () => mockChatState,
}));

vi.mock("../../hooks/use-streaming-message-buffer", () => ({
  useStreamingMessageBuffer: (input: { messages: MockMessage[] }) => ({
    staticMessages: input.messages,
    streamingMessage: null,
  }),
}));

vi.mock("../MessageItem", () => ({
  default: ({ message }: { message: MockMessage }) => (
    <div data-message-id={message.id}>{message.id}</div>
  ),
}));

vi.mock("../MessageHelper", () => ({
  default: () => <div>helper</div>,
}));

vi.mock("../MessageThinking", () => ({
  default: () => <div>thinking</div>,
}));

vi.mock("../PendingCloudLoginPrompt", () => ({
  default: () => <div>pending-cloud</div>,
}));

vi.mock("../tools/MessageError", () => ({
  default: () => <div>error</div>,
}));

vi.mock("@/lib/chat/message-visible", () => ({
  messageHasVisibleContent: () => true,
}));

vi.mock("@/lib/chat/chat-perf", () => ({
  incrementChatPerf: () => {},
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import MessageList from "../MessageList";

function createUserMessage(id: string): MockMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text: id }],
  };
}

function createAssistantMessage(id: string, text: string): MockMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
  };
}

describe("MessageList scroll anchor on new user message", () => {
  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      writable: true,
      value: scrollToMock,
    });
  });

  beforeEach(() => {
    scrollToMock.mockReset();
    mockChatState = {
      messages: [],
      status: "ready",
      error: undefined,
      isHistoryLoading: false,
      stepThinking: false,
      pendingCloudMessage: null,
    };
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    delete document.documentElement.dataset.uiAnimationLevel;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete document.documentElement.dataset.uiAnimationLevel;
  });

  it("anchors once when a new user message is added", () => {
    mockChatState = {
      ...mockChatState,
      status: "ready",
      messages: [createUserMessage("u1"), createAssistantMessage("a1", "hello")],
    };
    const { rerender } = render(<MessageList />);
    expect(scrollToMock).not.toHaveBeenCalled();

    mockChatState = {
      ...mockChatState,
      status: "submitted",
      messages: [
        createUserMessage("u1"),
        createAssistantMessage("a1", "hello"),
        createUserMessage("u2"),
      ],
    };
    rerender(<MessageList />);
    expect(scrollToMock).toHaveBeenCalledTimes(1);

    mockChatState = {
      ...mockChatState,
      status: "streaming",
      messages: [
        createUserMessage("u1"),
        createAssistantMessage("a1", "hello"),
        createUserMessage("u2"),
        createAssistantMessage("a2", "chunk-1"),
      ],
    };
    rerender(<MessageList />);
    expect(scrollToMock).toHaveBeenCalledTimes(1);

    mockChatState = {
      ...mockChatState,
      status: "streaming",
      messages: [
        createUserMessage("u1"),
        createAssistantMessage("a1", "hello"),
        createUserMessage("u2"),
        createAssistantMessage("a2", "chunk-2"),
      ],
    };
    rerender(<MessageList />);
    expect(scrollToMock).toHaveBeenCalledTimes(1);
  });

  it("uses smooth scroll when animation level is high", () => {
    mockChatState = {
      ...mockChatState,
      status: "ready",
      messages: [createUserMessage("u1")],
    };
    const { rerender } = render(<MessageList />);
    document.documentElement.dataset.uiAnimationLevel = "high";

    mockChatState = {
      ...mockChatState,
      status: "submitted",
      messages: [createUserMessage("u1"), createUserMessage("u2")],
    };
    rerender(<MessageList />);

    expect(scrollToMock).toHaveBeenCalledTimes(1);
    expect(scrollToMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: "smooth" })
    );
  });

  it("uses instant scroll when animation level is not high", () => {
    mockChatState = {
      ...mockChatState,
      status: "ready",
      messages: [createUserMessage("u1")],
    };
    const { rerender } = render(<MessageList />);
    document.documentElement.dataset.uiAnimationLevel = "medium";

    mockChatState = {
      ...mockChatState,
      status: "submitted",
      messages: [createUserMessage("u1"), createUserMessage("u2")],
    };
    rerender(<MessageList />);

    expect(scrollToMock).toHaveBeenCalledTimes(1);
    expect(scrollToMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ behavior: "auto" })
    );
  });

  it("skips anchor when history is loading", () => {
    mockChatState = {
      ...mockChatState,
      status: "ready",
      messages: [createUserMessage("u1")],
      isHistoryLoading: true,
    };
    const { rerender } = render(<MessageList />);

    mockChatState = {
      ...mockChatState,
      status: "submitted",
      isHistoryLoading: true,
      messages: [createUserMessage("u1"), createUserMessage("u2")],
    };
    rerender(<MessageList />);

    expect(scrollToMock).not.toHaveBeenCalled();
  });

  it("skips anchor when status is not submitted or streaming", () => {
    mockChatState = {
      ...mockChatState,
      status: "ready",
      messages: [createUserMessage("u1")],
    };
    const { rerender } = render(<MessageList />);

    mockChatState = {
      ...mockChatState,
      status: "ready",
      messages: [createUserMessage("u1"), createUserMessage("u2")],
    };
    rerender(<MessageList />);

    expect(scrollToMock).not.toHaveBeenCalled();
  });
});
