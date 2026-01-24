"use client";

import React from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { useChatContext } from "../ChatProvider";
import { useChatSessions } from "@/hooks/use-chat-sessions";
import { useAutoHeight } from "@/hooks/use-auto-height";
import { MessageSquare } from "lucide-react";
import { motion } from "motion/react";

const SUGGESTIONS = [
  {
    label: "测试审批",
    value: "测试审批：请调用 test-approval 工具（用于测试 needsApproval 的审批流程），然后等待我在工具卡片里点击允许/拒绝。",
  },
  {
    label: "打开淘宝搜索手机贴膜",
    value: "打开淘宝，搜索手机贴膜，告诉我销售额前三的店铺名称",
  },
  {
    label: "工具全量自检",
    value: `你是“工具全量自检执行器”。必须在同一个对话回合内按顺序执行所有步骤。每一步先说明【本步要做什么】和【预期输出长什么样】再调用工具。若输出不符合预期，立即停止并输出 FAIL Step N - 原因，不再继续。

统一规则：
- 不使用绝对路径，不写死固定内容。
- 在当前项目根目录操作，路径仅使用当前目录或相对路径。
- 先生成随机文件名 TEMP_FILE 与随机标记 TOKEN，后续步骤复用；遇到占位符时用实际值替换（使用【TEMP_FILE】/【TOKEN】标识）。

步骤 1：shell（数组命令）
- 要做什么：在当前目录执行 pwd。
- 预期：输出为 JSON 字符串，包含 output 字段且非空，metadata.exit_code 为 0。
- 调用：shell 工具（优先 *-unix），command=["bash","-lc","pwd"]。

步骤 2：shell-command（字符串命令）
- 要做什么：生成 TEMP_FILE 与 TOKEN，把 TOKEN 写入 TEMP_FILE，并打印 TEMP_FILE 与 TOKEN。
- 预期：输出包含 Exit code: 0，并能看到 TEMP_FILE=【TEMP_FILE】 与 TOKEN=【TOKEN】。
- 调用：shell-command 工具（优先 *-unix），command="python - <<'PY'\\nimport secrets, string, pathlib\\nchars = string.ascii_lowercase + string.digits\\ntoken = ''.join(secrets.choice(chars) for _ in range(10))\\nname = ''.join(secrets.choice(chars) for _ in range(8)) + '.txt'\\npath = pathlib.Path(name)\\npath.write_text(token, encoding='utf-8')\\nprint(f'TEMP_FILE={name}')\\nprint(f'TOKEN={token}')\\nPY"。

步骤 3：exec-command（启动交互会话）
- 要做什么：启动一个可交互会话，保持进程不退出。
- 预期：输出包含 “Process running with session ID”，并记录 sessionId。
- 调用：exec-command 工具（优先 *-unix），cmd="cat"，tty=true，yieldTimeMs=500。

步骤 4：write-stdin（写入并读取）
- 要做什么：向步骤3的 sessionId 写入 TOKEN 并读取回显。
- 预期：Output 中包含 TOKEN。
- 调用：write-stdin 工具，sessionId=<步骤3的ID>，chars="【TOKEN】\\n"，yieldTimeMs=500。

步骤 5：read-file
- 要做什么：读取 TEMP_FILE 的前 20 行。
- 预期：内容包含 TOKEN。
- 调用：read-file 工具，path="【TEMP_FILE】"，offset=1，limit=20。

步骤 6：list-dir
- 要做什么：列出当前目录一级内容。
- 预期：列表中包含 TEMP_FILE。
- 调用：list-dir 工具，path=".", depth=1。

步骤 7：grep-files
- 要做什么：在当前目录查找包含 TOKEN 的文件。
- 预期：输出文件列表包含 TEMP_FILE。
- 调用：grep-files 工具，pattern="【TOKEN】"，path="."。

步骤 8：shell-command（清理）
- 要做什么：删除 TEMP_FILE。
- 预期：输出包含 Exit code: 0。
- 调用：shell-command 工具，command="rm -f 【TEMP_FILE】"。

全部通过后输出：ALL PASS，并简短列出每一步通过的证据摘要。`,
  },
  {
    label: "随机创建一个项目",
    value: "帮我随机创建一个测试项目",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.5,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

/** Minimum height for rendering the EmptyHeader without recent sessions. */
const MIN_HELPER_HEIGHT = 420;
/** Minimum height for rendering the EmptyHeader with recent sessions. */
const MIN_HELPER_HEIGHT_WITH_SESSIONS = 520;

export default function MessageHelper() {
  const { setInput, selectSession, tabId } = useChatContext();
  const { recentSessions } = useChatSessions({ tabId });
  const { ref: containerRef, height: containerHeight } = useAutoHeight([], {
    includeParentBox: false,
    includeSelfBox: true,
  });
  /** Whether the EmptyHeader should render based on available height. */
  const showHeader =
    // 中文注释：尺寸测量完成前先隐藏，避免空间不足时出现闪烁。
    containerHeight >=
    (recentSessions.length > 0 ? MIN_HELPER_HEIGHT_WITH_SESSIONS : MIN_HELPER_HEIGHT);

  const focusChatInput = React.useCallback(() => {
    // 点击建议后需要立刻聚焦到输入框，方便用户直接按 Enter 发送或继续编辑
    // 注意：输入框在 ChatInput.tsx 内部；这里通过 data attribute 定位，避免引入跨组件 ref 依赖
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-tenas-chat-input="true"]'
      );
      if (!el) return;
      el.focus();
      // 将光标移动到末尾，便于继续补充内容
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    });
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      <Empty className="flex-1">
        {showHeader ? (
          <EmptyHeader>
            <EmptyMedia>
              <div className="text-muted-foreground text-4xl">💬</div>
            </EmptyMedia>
            <EmptyTitle>开始对话</EmptyTitle>
            <EmptyDescription>
              输入你的问题或想法，我会尽力为你提供帮助
            </EmptyDescription>
          </EmptyHeader>
        ) : null}
        <EmptyContent>
          <div className="flex flex-col gap-2 max-w-md mx-auto mt-4">
            <p className="text-sm text-muted-foreground mb-2 text-center">
              你可以试着问我：
            </p>
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-stretch"
            >
              {SUGGESTIONS.map((suggestion) => (
                <motion.div key={suggestion.label} variants={item} className="h-full">
                  <Button
                    variant="outline"
                    className="justify-start items-start h-full py-3 px-4 text-left whitespace-normal font-normal w-full"
                    onClick={() => {
                      setInput(suggestion.value);
                      focusChatInput();
                    }}
                  >
                    {suggestion.label}
                  </Button>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </EmptyContent>
      </Empty>

      {/* 最近的对话固定显示在底部 */}
      {recentSessions.length > 0 && (
        <div className="mt-auto pt-6  border-border/30">
          <div className="grid grid-cols-1 gap-1 max-w-md mx-auto">
            {recentSessions.map((session) => {
              const date = new Date(session.updatedAt);
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <Button
                  key={session.id}
                  variant="ghost"
                  className="justify-start h-auto py-2 px-3 text-left font-normal text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
                  onClick={() => selectSession(session.id)}
                >
                  <MessageSquare className="mr-2 h-3.5 w-3.5 opacity-50 shrink-0" />
                  <div className="flex-1 truncate text-xs">{session.title}</div>
                  <span className="text-[10px] opacity-40 ml-2 shrink-0">
                    {isToday
                      ? date.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })
                      : date.toLocaleDateString()}
                  </span>
                </Button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
