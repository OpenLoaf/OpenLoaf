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
import { act, render } from "@testing-library/react";
import type { UIMessage } from "@ai-sdk/react";
import { describe, it, expect, vi } from "vitest";
import { useStreamingMessageBuffer } from "../use-streaming-message-buffer";

type TestMessage = {
  id: string;
  role: "user" | "assistant";
  parts?: Array<{ type?: string; text?: string }>;
};

const latestRef: {
  current: ReturnType<typeof useStreamingMessageBuffer> | null;
} = { current: null };

function Probe({
  messages,
  status,
  bufferMs,
}: {
  messages: TestMessage[];
  status: "ready" | "submitted" | "streaming" | "error";
  bufferMs: number;
}) {
  const result = useStreamingMessageBuffer({
    messages: messages as UIMessage[],
    status,
    isHistoryLoading: false,
    bufferMs,
  });
  React.useLayoutEffect(() => {
    latestRef.current = result;
  }, [result]);
  return null;
}

describe("useStreamingMessageBuffer", () => {
  it("returns full messages when not streaming", () => {
    const user: TestMessage = {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "hi" }],
    };

    render(<Probe messages={[user]} status="ready" bufferMs={32} />);

    expect(latestRef.current?.staticMessages).toHaveLength(1);
    expect(latestRef.current?.streamingMessage).toBeNull();
    expect(latestRef.current?.isStreamingActive).toBe(false);
  });

  it("returns the live assistant on the first streaming render", () => {
    const user: TestMessage = {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "hi" }],
    };
    const assistant: TestMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "H" }],
    };
    const renderSnapshots: Array<ReturnType<typeof useStreamingMessageBuffer>> = [];

    function RenderProbe({
      messages,
      status,
      bufferMs,
    }: {
      messages: TestMessage[];
      status: "ready" | "submitted" | "streaming" | "error";
      bufferMs: number;
    }) {
      const result = useStreamingMessageBuffer({
        messages: messages as UIMessage[],
        status,
        isHistoryLoading: false,
        bufferMs,
      });
      renderSnapshots.push(result);
      return null;
    }

    render(
      <RenderProbe messages={[user, assistant]} status="streaming" bufferMs={50} />,
    );

    expect(renderSnapshots.length).toBeGreaterThan(0);
    const firstSnapshot = renderSnapshots[0];
    expect(firstSnapshot?.staticMessages).toHaveLength(1);
    expect((firstSnapshot?.streamingMessage?.parts?.[0] as any)?.text).toBe("H");
    expect(firstSnapshot?.isStreamingActive).toBe(true);
  });

  it("buffers last assistant updates during streaming", () => {
    vi.useFakeTimers();
    const user: TestMessage = {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "hi" }],
    };
    const assistantFirst: TestMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "H" }],
    };
    const assistantNext: TestMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "He" }],
    };

    const { rerender, unmount } = render(
      <Probe messages={[user, assistantFirst]} status="streaming" bufferMs={50} />
    );

    expect(latestRef.current?.staticMessages).toHaveLength(1);
    expect((latestRef.current?.streamingMessage?.parts?.[0] as any)?.text).toBe("H");

    rerender(
      <Probe messages={[user, assistantNext]} status="streaming" bufferMs={50} />
    );
    expect((latestRef.current?.streamingMessage?.parts?.[0] as any)?.text).toBe("H");

    act(() => {
      vi.advanceTimersByTime(50);
    });

    expect((latestRef.current?.streamingMessage?.parts?.[0] as any)?.text).toBe("He");

    unmount();
    vi.useRealTimers();
  });

  it("keeps previous assistant visible across the next round transition", () => {
    const userFirst: TestMessage = {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "first" }],
    };
    const assistantFirst: TestMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "first answer" }],
    };
    const userSecond: TestMessage = {
      id: "u2",
      role: "user",
      parts: [{ type: "text", text: "second" }],
    };
    const assistantSecond: TestMessage = {
      id: "a2",
      role: "assistant",
      parts: [{ type: "text", text: "s" }],
    };
    const assistantSecondDone: TestMessage = {
      id: "a2",
      role: "assistant",
      parts: [{ type: "text", text: "second answer" }],
    };

    const { rerender } = render(
      <Probe messages={[userFirst, assistantFirst]} status="ready" bufferMs={50} />,
    );

    expect(latestRef.current?.staticMessages).toHaveLength(2);
    expect((latestRef.current?.staticMessages?.[1]?.parts?.[0] as any)?.text).toBe("first answer");

    rerender(
      <Probe
        messages={[userFirst, assistantFirst, userSecond]}
        status="submitted"
        bufferMs={50}
      />,
    );

    expect(latestRef.current?.streamingMessage).toBeNull();
    expect(latestRef.current?.staticMessages).toHaveLength(3);
    expect((latestRef.current?.staticMessages?.[1]?.parts?.[0] as any)?.text).toBe("first answer");

    rerender(
      <Probe
        messages={[userFirst, assistantFirst, userSecond, assistantSecond]}
        status="streaming"
        bufferMs={50}
      />,
    );

    expect(latestRef.current?.staticMessages).toHaveLength(3);
    expect((latestRef.current?.staticMessages?.[1]?.parts?.[0] as any)?.text).toBe("first answer");
    expect((latestRef.current?.streamingMessage?.parts?.[0] as any)?.text).toBe("s");

    rerender(
      <Probe
        messages={[userFirst, assistantFirst, userSecond, assistantSecondDone]}
        status="ready"
        bufferMs={50}
      />,
    );

    expect(latestRef.current?.streamingMessage).toBeNull();
    expect(latestRef.current?.staticMessages).toHaveLength(4);
    expect((latestRef.current?.staticMessages?.[1]?.parts?.[0] as any)?.text).toBe("first answer");
    expect((latestRef.current?.staticMessages?.[3]?.parts?.[0] as any)?.text).toBe("second answer");
  });

  it("achieves ~5x throttle ratio with 100 updates at 10ms intervals, 50ms buffer", () => {
    vi.useFakeTimers();
    const user: TestMessage = {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "hi" }],
    };

    let flushCount = 0;
    let prevText = "";

    function FlushCounter({
      messages,
      status,
      bufferMs,
    }: {
      messages: TestMessage[];
      status: "ready" | "submitted" | "streaming" | "error";
      bufferMs: number;
    }) {
      const result = useStreamingMessageBuffer({
        messages: messages as UIMessage[],
        status,
        isHistoryLoading: false,
        bufferMs,
      });
      const currentText = (result.streamingMessage?.parts?.[0] as any)?.text ?? "";
      React.useLayoutEffect(() => {
        if (currentText && currentText !== prevText) {
          flushCount += 1;
          prevText = currentText;
        }
      }, [currentText]);
      return null;
    }

    // First message — immediate flush (new assistant id)
    const firstMsg: TestMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "0" }],
    };
    const { rerender, unmount } = render(
      <FlushCounter messages={[user, firstMsg]} status="streaming" bufferMs={50} />,
    );
    flushCount = 0; // reset after initial

    // Simulate 100 rapid updates at ~10ms intervals
    for (let i = 1; i <= 100; i++) {
      const msg: TestMessage = {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: String(i) }],
      };
      act(() => {
        vi.advanceTimersByTime(10);
      });
      rerender(
        <FlushCounter messages={[user, msg]} status="streaming" bufferMs={50} />,
      );
    }

    // Flush any remaining
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // 100 updates over 1000ms with 50ms buffer → expect ~20 flushes (5x reduction)
    // Allow some tolerance: between 15 and 30
    expect(flushCount).toBeGreaterThanOrEqual(15);
    expect(flushCount).toBeLessThanOrEqual(30);

    unmount();
    vi.useRealTimers();
  });

  it("staticMessages reference stays stable during streaming", () => {
    vi.useFakeTimers();
    const user: TestMessage = {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "hi" }],
    };

    const staticRefs: any[] = [];

    function RefTracker({
      messages,
      status,
    }: {
      messages: TestMessage[];
      status: "ready" | "submitted" | "streaming" | "error";
    }) {
      const result = useStreamingMessageBuffer({
        messages: messages as UIMessage[],
        status,
        isHistoryLoading: false,
        bufferMs: 50,
      });
      staticRefs.push(result.staticMessages);
      return null;
    }

    const msg1: TestMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "H" }],
    };
    const { rerender, unmount } = render(
      <RefTracker messages={[user, msg1]} status="streaming" />,
    );

    // Stream more chunks — staticMessages (just [user]) should be referentially stable
    for (let i = 0; i < 5; i++) {
      const msg: TestMessage = {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: `Hello${i}` }],
      };
      act(() => {
        vi.advanceTimersByTime(50);
      });
      rerender(<RefTracker messages={[user, msg]} status="streaming" />);
    }

    // All staticMessages refs after the first should be the same reference
    for (let i = 2; i < staticRefs.length; i++) {
      expect(staticRefs[i]).toBe(staticRefs[1]);
    }

    unmount();
    vi.useRealTimers();
  });

  it("no residual buffer when transitioning streaming → ready", () => {
    vi.useFakeTimers();
    const user: TestMessage = {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "hi" }],
    };
    const assistant: TestMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "Done" }],
    };

    const { rerender, unmount } = render(
      <Probe messages={[user, assistant]} status="streaming" bufferMs={50} />,
    );

    expect(latestRef.current?.isStreamingActive).toBe(true);

    // Transition to ready
    rerender(
      <Probe messages={[user, assistant]} status="ready" bufferMs={50} />,
    );

    // Advance timers to ensure no pending flush fires
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(latestRef.current?.isStreamingActive).toBe(false);
    expect(latestRef.current?.streamingMessage).toBeNull();
    // All messages should be in staticMessages
    expect(latestRef.current?.staticMessages).toHaveLength(2);

    unmount();
    vi.useRealTimers();
  });
});
