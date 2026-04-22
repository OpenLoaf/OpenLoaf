import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import type { UIMessage } from "@ai-sdk/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MessageAiAction from "../MessageAiAction";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../context", () => ({
  useChatActions: () => ({
    retryAssistantMessage: vi.fn(),
    clearError: vi.fn(),
    sendMessage: vi.fn(),
    deleteMessageSubtree: vi.fn().mockResolvedValue(true),
    readOnly: false,
  }),
  useChatStatus: () => ({ status: "ready" }),
  useChatSession: () => ({
    leafMessageId: "msg-ai-1",
    sessionId: "session-1",
    projectId: "project-1",
  }),
}));

vi.mock("@/lib/utils", () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" "),
}));

vi.mock("@/lib/chat/message-text", () => ({
  getMessageTextWithToolCalls: () => "assistant reply",
}));

vi.mock("@/lib/chat/message-to-markdown", () => ({
  messageToMarkdown: () => "assistant reply",
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@openloaf/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ai-elements/message", () => ({
  MessageActions: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  MessageAction: ({
    children,
    className,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" className={className} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ai-elements/prompt-input", () => ({
  PromptInputButton: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  PromptInputHoverCard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PromptInputHoverCardTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PromptInputHoverCardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ai-elements/model-selector", () => ({
  ModelSelector: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ModelSelectorTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ModelSelectorContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../MessageBranchNav", () => ({
  default: () => null,
}));

vi.mock("../SaveMessageDialog", () => ({
  SaveMessageDialog: () => null,
}));

function createAssistantMessage(metadata: Record<string, unknown>): UIMessage {
  return {
    id: "msg-ai-1",
    role: "assistant",
    parts: [{ type: "text", text: "assistant reply" }],
    metadata,
  } as UIMessage;
}

describe("MessageAiAction", () => {
  afterEach(() => {
    cleanup();
  });

  it("在 SaaS assistant message 同时存在积分和 token 时展示两者", () => {
    const message = createAssistantMessage({
      openloaf: {
        creditsConsumed: 18,
      },
      totalUsage: {
        inputTokens: 1200,
        outputTokens: 300,
        totalTokens: 1500,
      },
      agent: {
        model: {
          provider: "openloaf-saas",
          modelId: "gpt-5.4",
        },
      },
    });

    render(<MessageAiAction message={message} />);

    const tokenSummary = screen.getByRole("button", { name: "ai:message.tokenUsage" });
    expect(screen.getByText("18")).toBeTruthy();
    expect(tokenSummary.textContent).toContain("1.5K");
    expect(screen.getByText("ai:message.tokenTotal")).toBeTruthy();
  });
});
