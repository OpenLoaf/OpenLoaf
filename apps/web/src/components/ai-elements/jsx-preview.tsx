/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import type { ComponentProps, ReactNode } from "react";
import type { TProps as JsxParserProps } from "react-jsx-parser";

import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import JsxParser from "react-jsx-parser";

type JSXPreviewComponent =
  | React.ComponentType<any>
  | React.ExoticComponent<any>
  | (() => React.ReactNode);

type JSXPreviewComponents = Record<
  string,
  JSXPreviewComponent | Record<string, JSXPreviewComponent>
>;

interface JSXPreviewContextValue {
  jsx: string;
  processedJsx: string;
  isStreaming: boolean;
  error: Error | null;
  setError: (error: Error | null) => void;
  components: JSXPreviewComponents | undefined;
  bindings: JsxParserProps["bindings"];
  onErrorProp?: (error: Error) => void;
}

const JSXPreviewContext = createContext<JSXPreviewContextValue | null>(null);

const TAG_REGEX = /<\/?([a-zA-Z][a-zA-Z0-9]*)\s*([^>]*?)(\/)?>/;

export const useJSXPreview = () => {
  const context = useContext(JSXPreviewContext);
  if (!context) {
    throw new Error("JSXPreview components must be used within JSXPreview");
  }
  return context;
};

const matchJsxTag = (code: string) => {
  if (code.trim() === "") {
    return null;
  }

  const match = code.match(TAG_REGEX);

  if (!match || match.index === undefined) {
    return null;
  }

  const [fullMatch, tagName, attributes, selfClosing] = match;

  let type: "self-closing" | "closing" | "opening";
  if (selfClosing) {
    type = "self-closing";
  } else if (fullMatch.startsWith("</")) {
    type = "closing";
  } else {
    type = "opening";
  }

  return {
    attributes: attributes.trim(),
    endIndex: match.index + fullMatch.length,
    startIndex: match.index,
    tag: fullMatch,
    tagName,
    type,
  };
};

const completeJsxTag = (code: string) => {
  const stack: string[] = [];
  let result = "";
  let currentPosition = 0;

  while (currentPosition < code.length) {
    const match = matchJsxTag(code.slice(currentPosition));
    if (!match) {
      // No more tags found, append remaining content
      result += code.slice(currentPosition);
      break;
    }
    const { tagName, type, endIndex } = match;

    // Include any text content before this tag
    result += code.slice(currentPosition, currentPosition + endIndex);

    if (type === "opening") {
      stack.push(tagName);
    } else if (type === "closing") {
      stack.pop();
    }

    currentPosition += endIndex;
  }

  return (
    result +
    stack
      .toReversed()
      .map((tag) => `</${tag}>`)
      .join("")
  );
};

export type JSXPreviewProps = Omit<ComponentProps<"div">, "onError"> & {
  jsx: string;
  isStreaming?: boolean;
  components?: JSXPreviewComponents;
  bindings?: JsxParserProps["bindings"];
  onError?: (error: Error) => void;
};

export const JSXPreview = memo(
  ({
    jsx,
    isStreaming = false,
    components,
    bindings,
    onError,
    className,
    children,
    ...props
  }: JSXPreviewProps) => {
    const [prevJsx, setPrevJsx] = useState(jsx);
    const [error, setError] = useState<Error | null>(null);

    // Clear error when jsx changes (derived state pattern)
    if (jsx !== prevJsx) {
      setPrevJsx(jsx);
      setError(null);
    }

    // 渲染前 strip `{/* ... */}` JSX 注释 —— react-jsx-parser 把它解析成
    // JSXEmptyExpression 后抛 "The expression type 'JSXEmptyExpression' is
    // not supported."，整个卡片渲染为红色 error 卡。服务端 JsxCreate 工具
    // 已经在 execute 层剥掉，这里是对历史数据（旧 session 已经落盘的 .jsx 文件）
    // 和其他来源（非 JsxCreate 写入）的兜底，确保渲染层不会被注释爆掉。
    const processedJsx = useMemo(() => {
      const stripped = jsx.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
      return isStreaming ? completeJsxTag(stripped) : stripped;
    }, [jsx, isStreaming]);

    return (
      <JSXPreviewContext.Provider
        value={{
          bindings,
          components,
          error,
          isStreaming,
          jsx,
          onErrorProp: onError,
          processedJsx,
          setError,
        }}
      >
        <div className={cn("relative", className)} {...props}>
          {children}
        </div>
      </JSXPreviewContext.Provider>
    );
  }
);

JSXPreview.displayName = "JSXPreview";

export type JSXPreviewContentProps = Omit<ComponentProps<"div">, "children">;

export const JSXPreviewContent = memo(
  ({ className, ...props }: JSXPreviewContentProps) => {
    const { processedJsx, isStreaming, components, bindings, setError, onErrorProp } =
      useJSXPreview();
    const errorReportedRef = useRef<string | null>(null);
    // 记录上一次成功渲染的 JSX，流式期间出错时回退到此内容
    const stableJsxRef = useRef<string | null>(null);
    // 标记当前 processedJsx 渲染是否触发了 onError
    const hasErrorThisRenderRef = useRef(false);

    // processedJsx 变化时重置标志位和 errorReportedRef
    // biome-ignore lint/correctness/useExhaustiveDependencies: processedJsx change should reset tracking
    useEffect(() => {
      errorReportedRef.current = null;
      hasErrorThisRenderRef.current = false;
    }, [processedJsx]);

    const handleError = useCallback(
      (err: Error) => {
        // Prevent duplicate error reports for the same jsx
        if (errorReportedRef.current === processedJsx) {
          return;
        }
        errorReportedRef.current = processedJsx;
        hasErrorThisRenderRef.current = true;

        // 流式期间：静默忽略错误，保持稳定内容不闪烁
        if (isStreaming) return;

        // 非流式真错：同步 console.error 一次，让 ai-browser-test 的
        // consoleLogs 能扫到（tool hasError 只覆盖 execute 层，渲染层 error
        // 原本是哑的红色卡片，无法进入自动断言）。消息里带 [jsx-preview]
        // 前缀便于 scripts/analyze-tool-calls.py 的 visualErrors 识别。
        console.error(`[jsx-preview] ${err.message}`);

        // 流式结束后：正常上报错误
        queueMicrotask(() => {
          setError(err);
          onErrorProp?.(err);
        });
      },
      [processedJsx, isStreaming, onErrorProp, setError]
    );

    // 若本次渲染没触发 onError，则认为渲染成功，更新稳定内容
    useLayoutEffect(() => {
      if (!hasErrorThisRenderRef.current) {
        stableJsxRef.current = processedJsx;
      }
    }, [processedJsx]);

    // 流式期间且本帧有错误：回退到上次稳定内容；否则使用当前内容
    const jsxToRender =
      isStreaming && hasErrorThisRenderRef.current && stableJsxRef.current !== null
        ? stableJsxRef.current
        : processedJsx;

    return (
      <div className={cn("jsx-preview-content", className)} {...props}>
        <JsxParser
          bindings={bindings}
          components={components as JsxParserProps["components"]}
          jsx={jsxToRender}
          onError={handleError}
          renderInWrapper={false}
        />
      </div>
    );
  }
);

JSXPreviewContent.displayName = "JSXPreviewContent";

export type JSXPreviewErrorProps = ComponentProps<"div"> & {
  children?: ReactNode | ((error: Error) => ReactNode);
};

const renderChildren = (
  children: ReactNode | ((error: Error) => ReactNode),
  error: Error
): ReactNode => {
  if (typeof children === "function") {
    return children(error);
  }
  return children;
};

export const JSXPreviewError = memo(
  ({ className, children, ...props }: JSXPreviewErrorProps) => {
    const { error } = useJSXPreview();

    if (!error) {
      return null;
    }

    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-3xl border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm",
          className
        )}
        {...props}
      >
        {children ? (
          renderChildren(children, error)
        ) : (
          <>
            <AlertCircle className="size-4 shrink-0" />
            <span>{error.message}</span>
          </>
        )}
      </div>
    );
  }
);

JSXPreviewError.displayName = "JSXPreviewError";
