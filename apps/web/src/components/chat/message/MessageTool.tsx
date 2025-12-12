"use client";

import { cn } from "@/lib/utils";

// MVP：这里只关心工具名称和返回结果，不做复杂的状态/交互
type AnyToolPart = {
  type: string; // `tool-xxx` / `dynamic-tool`
  toolName?: string;
  title?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function getToolName(part: AnyToolPart) {
  if (part.title) return part.title;
  if (part.toolName) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice("tool-".length);
  return part.type;
}

function safeStringify(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isEmptyInput(value: unknown) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/**
 * 工具调用消息组件（MVP）
 * - 默认折叠
 * - 展开后显示：输入参数 + 返回结果（output）
 */
export default function MessageTool({
  part,
  className,
}: {
  part: AnyToolPart;
  className?: string;
}) {
  const toolName = getToolName(part);
  const inputText = safeStringify(part.input);
  const outputText = safeStringify(part.output);
  const showInput = !isEmptyInput(part.input);

  return (
    <div className={cn("flex justify-start", className)}>
      <details className="max-w-[80%] w-full rounded-lg bg-muted/40 px-3 py-2 text-foreground">
        {/* summary 默认折叠展示：工具名称（MVP） */}
        <summary className="cursor-pointer select-none text-xs text-muted-foreground">
          工具：{toolName}
        </summary>

        {/* 展开后显示输入/输出 */}
        <div className="mt-2">
          {showInput ? (
            <>
              <div className="text-[11px] text-muted-foreground">输入参数</div>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 text-xs">
                {inputText}
              </pre>
            </>
          ) : null}

          <div
            className={cn(
              "text-[11px] text-muted-foreground",
              showInput ? "mt-2" : undefined
            )}
          >
            输出结果
          </div>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-background p-2 text-xs">
            {outputText ||
              (part.state && part.state !== "output-available"
                ? `（${part.state}）`
                : part.errorText
                  ? `（错误：${part.errorText}）`
                  : "（暂无返回结果）")}
          </pre>
        </div>
      </details>
    </div>
  );
}
