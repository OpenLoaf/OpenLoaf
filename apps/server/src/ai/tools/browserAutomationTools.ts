import { tool, zodSchema } from "ai";
import {
  browserActToolDef,
  browserExtractToolDef,
  browserObserveToolDef,
  browserSnapshotToolDef,
  browserWaitToolDef,
} from "@openloaf/api/types/tools/browserAutomation";
import { logger } from "@/common/logger";
import { getClientId, getSessionId } from "@/ai/shared/context/requestContext";
import { requireTabId } from "@/common/tabContext";
import { sendCdpCommand } from "@/modules/browser/cdpClient";
import { getActiveBrowserTargetId, tabSnapshotStore } from "@/modules/tab/TabSnapshotStoreAdapter";

// 页面文本截断上限，避免快照过大。
const MAX_TEXT_LENGTH = 10_000;
// 交互元素快照上限，优先覆盖弹窗/菜单等场景。
const MAX_SNAPSHOT_ELEMENTS = 120;

type SnapshotElement = {
  /** 元素选择器 */
  selector: string;
  /** 可见文本 */
  text: string;
  /** 标签名 */
  tag: string;
};

type SnapshotFrame = {
  /** iframe 地址 */
  src: string;
  /** iframe name 或 id */
  name?: string;
  /** iframe 标题 */
  title?: string;
  /** iframe 宽度 */
  width?: number;
  /** iframe 高度 */
  height?: number;
  /** 访问状态 */
  status: "same-origin" | "cross-origin";
  /** 同源文本内容 */
  text?: string;
  /** 同源可交互元素 */
  elements?: SnapshotElement[];
};

type SnapshotPayload = {
  /** 当前页面 URL */
  url: string;
  /** 当前页面标题 */
  title: string;
  /** 文档就绪状态 */
  readyState: string;
  /** 可见文本 */
  text: string;
  /** 可交互元素 */
  elements: SnapshotElement[];
  /** iframe 信息 */
  frames?: SnapshotFrame[];
};

/** Ensure sessionId is available for tab snapshot lookup. */
function requireSessionId(): string {
  const sessionId = getSessionId();
  if (!sessionId) throw new Error("sessionId is required.");
  return sessionId;
}

/** Ensure clientId is available for tab snapshot lookup. */
function requireClientId(): string {
  const clientId = getClientId();
  if (!clientId) throw new Error("clientId is required.");
  return clientId;
}

/** Resolve the latest available targetId for the current tab. */
function pickActiveTargetId(): string {
  const sessionId = requireSessionId();
  const clientId = requireClientId();
  const tabId = requireTabId();
  const tab = tabSnapshotStore.get({ sessionId, clientId, tabId });
  const targetId = getActiveBrowserTargetId(tab);
  if (!targetId) throw new Error("active browser tab cdpTargetId is not available.");
  return targetId;
}

/** Evaluate a JavaScript expression in the target context. */
async function evalInTarget<T>(targetId: string, expression: string): Promise<T> {
  const result = (await sendCdpCommand({
    targetId,
    method: "Runtime.evaluate",
    params: {
      expression,
      awaitPromise: true,
      returnByValue: true,
    },
  })) as {
    result?: { value?: T };
    exceptionDetails?: { text?: string };
  };

  if (result?.exceptionDetails) {
    const detail = result.exceptionDetails as {
      text?: string;
      exception?: { description?: string; stack?: string };
    };
    const description = detail.exception?.description ?? detail.text ?? "Runtime.evaluate failed";
    // 中文注释：打印更完整的异常细节，便于排查页面脚本报错原因。
    logger.warn({ targetId, description }, "[browser] Runtime.evaluate failed");
    const stack = detail.exception?.stack ?? "";
    const errorMessage = stack ? `${description}\n${stack}` : description;
    throw new Error(errorMessage);
  }

  return result?.result?.value as T;
}

/** Send a keyboard event through CDP. */
async function dispatchKeyEvent(targetId: string, key: string) {
  const normalized = String(key || "").trim();
  if (!normalized) throw new Error("key is required.");
  const upper = normalized.length === 1 ? normalized.toUpperCase() : normalized;
  const keyCode = normalized === "Enter" ? 13 : normalized.length === 1 ? upper.charCodeAt(0) : 0;
  const text = normalized.length === 1 ? normalized : normalized === "Enter" ? "\r" : "";
  const payload = {
    key: normalized,
    code: normalized === "Enter" ? "Enter" : normalized.length === 1 ? `Key${upper}` : normalized,
    text,
    unmodifiedText: text,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  };
  await sendCdpCommand({ targetId, method: "Input.dispatchKeyEvent", params: { type: "keyDown", ...payload } });
  await sendCdpCommand({ targetId, method: "Input.dispatchKeyEvent", params: { type: "keyUp", ...payload } });
}

/** Focus element before keyboard input. */
async function focusSelector(targetId: string, selector: string) {
  await evalInTarget<void>(
    targetId,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error('element not found');
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.focus && el.focus();
    })()`,
  );
}

/** Try to submit the closest form for a selector. */
async function submitClosestForm(targetId: string, selector: string) {
  await evalInTarget<void>(
    targetId,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return;
      const form = el.closest && el.closest('form');
      if (form && typeof form.requestSubmit === 'function') {
        form.requestSubmit();
        return;
      }
      if (form && typeof form.submit === 'function') {
        form.submit();
      }
    })()`,
  );
}

/** Merge main document and iframe snapshots with shared limits. */
export function mergeSnapshotData(
  payload: SnapshotPayload,
  limits: { maxTextLength: number; maxElements: number },
): SnapshotPayload {
  // 合并主文档与 iframe 内容，统一预算，保持顺序。
  const frames = payload.frames ?? [];
  let remainingText = limits.maxTextLength;
  const textChunks: string[] = [];
  const pushText = (value?: string) => {
    if (!value || remainingText <= 0) return;
    const slice = value.slice(0, remainingText);
    if (!slice) return;
    textChunks.push(slice);
    remainingText -= slice.length;
  };
  pushText(payload.text);
  for (const frame of frames) {
    if (remainingText <= 0) break;
    if (frame.status === "same-origin") pushText(frame.text);
  }

  const mergedElements: SnapshotElement[] = [];
  const pushElements = (items?: SnapshotElement[]) => {
    if (!items || mergedElements.length >= limits.maxElements) return;
    for (const item of items) {
      if (mergedElements.length >= limits.maxElements) break;
      mergedElements.push(item);
    }
  };
  pushElements(payload.elements);
  for (const frame of frames) {
    if (mergedElements.length >= limits.maxElements) break;
    if (frame.status === "same-origin") pushElements(frame.elements);
  }

  return {
    ...payload,
    text: textChunks.join("\n"),
    elements: mergedElements,
    frames,
  };
}

/** Build a minimal snapshot expression to run in the browser context. */
function buildSnapshotExpression() {
  return `(() => {
    const maxTextLength = ${MAX_TEXT_LENGTH};
    const maxElements = ${MAX_SNAPSHOT_ELEMENTS};
    const interactiveSelector = 'a,button,input,select,textarea,[role="button"],[role="link"],[role="menuitem"],[role="option"]';
    const getText = (doc) => {
      const body = doc && doc.body;
      const text = (body && (body.innerText || body.textContent) || '').toString();
      return text.length > maxTextLength ? text.slice(0, maxTextLength) : text;
    };
    const pickElements = (doc) => {
      const picked = [];
      const seen = new Set();
      const view = (doc && doc.defaultView) || window;
      const escapeCss = (value) => {
        if (!value) return '';
        if (view && view.CSS && typeof view.CSS.escape === 'function') return view.CSS.escape(value);
        // 中文注释：避免正则字面量在字符串中失效，手动转义特殊字符。
        const specials = ' !"#$%&\\\'()*+,./:;<=>?@[\\\\]^{|}~';
        let out = '';
        for (let i = 0; i < value.length; i += 1) {
          const ch = value[i];
          out += specials.indexOf(ch) !== -1 ? '\\\\' + ch : ch;
        }
        return out;
      };
      const isVisible = (el) => {
        if (!el || typeof el.getClientRects !== 'function') return false;
        const rects = el.getClientRects();
        if (!rects || rects.length === 0) return false;
        const style = view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(el) : null;
        if (!style) return true;
        return style.visibility !== 'hidden' && style.display !== 'none';
      };
      const pushElement = (el) => {
        if (!el || picked.length >= maxElements || seen.has(el)) return;
        if (!el.matches || !el.matches(interactiveSelector)) return;
        if (!isVisible(el)) return;
        seen.add(el);
        picked.push(el);
      };
      const walk = (root) => {
        if (!root || picked.length >= maxElements) return;
        const start = root.nodeType === 9 ? root.documentElement : root;
        if (!start) return;
        const stack = [start];
        while (stack.length && picked.length < maxElements) {
          const node = stack.pop();
          if (!node) continue;
          if (node.nodeType === 1) {
            const el = node;
            pushElement(el);
            if (el.shadowRoot) stack.push(el.shadowRoot);
          }
          const children = node.children || node.childNodes;
          if (children && children.length) {
            for (let i = children.length - 1; i >= 0; i -= 1) {
              const child = children[i];
              if (child && (child.nodeType === 1 || child.nodeType === 11)) {
                stack.push(child);
              }
            }
          }
        }
      };
      const modalRoots = doc
        ? Array.from(doc.querySelectorAll('[role="dialog"],[aria-modal="true"],[role="menu"],[role="listbox"]'))
        : [];
      for (const root of modalRoots) {
        walk(root);
        if (picked.length >= maxElements) break;
      }
      if (picked.length < maxElements && doc) {
        walk(doc);
      }
      return picked.map((el) => {
        const tag = (el.tagName || '').toLowerCase();
        const label = (el.innerText || el.value || el.getAttribute('aria-label') || '').toString().trim().slice(0, 80);
        let selector = '';
        if (el.id) selector = '#' + escapeCss(el.id);
        else if (el.name) selector = tag + '[name="' + escapeCss(el.name) + '"]';
        else selector = tag;
        return { selector, text: label, tag };
      });
    };
    const frames = [];
    const frameEls = Array.from(document.querySelectorAll('iframe'));
    for (const frame of frameEls) {
      const info = {
        src: frame.getAttribute('src') || '',
        name: frame.getAttribute('name') || frame.id || '',
        title: frame.getAttribute('title') || '',
        width: frame.clientWidth || frame.offsetWidth || 0,
        height: frame.clientHeight || frame.offsetHeight || 0,
      };
      try {
        const frameDoc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document);
        if (frameDoc && frameDoc.body) {
          frames.push({
            ...info,
            status: 'same-origin',
            text: getText(frameDoc),
            elements: pickElements(frameDoc),
          });
          continue;
        }
      } catch (err) {
        // ignore cross-origin access
      }
      frames.push({ ...info, status: 'cross-origin' });
    }
    const text = getText(document);
    const elements = pickElements(document);
    return {
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      text,
      elements,
      frames,
    };
  })()`;
}

/** Poll until a condition matches or a timeout occurs. */
async function waitUntil(input: { targetId: string; timeoutMs: number; check: () => Promise<boolean> }) {
  const start = Date.now();
  while (true) {
    if (await input.check()) return;
    if (Date.now() - start >= input.timeoutMs) throw new Error("wait timeout");
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
  }
}

export const browserSnapshotTool = tool({
  description: browserSnapshotToolDef.description,
  inputSchema: zodSchema(browserSnapshotToolDef.parameters),
  execute: async () => {
    const targetId = pickActiveTargetId();
    const data = await evalInTarget<SnapshotPayload>(targetId, buildSnapshotExpression());
    return { ok: true, data: mergeSnapshotData(data, { maxTextLength: MAX_TEXT_LENGTH, maxElements: MAX_SNAPSHOT_ELEMENTS }) };
  },
});

export const browserObserveTool = tool({
  description: browserObserveToolDef.description,
  inputSchema: zodSchema(browserObserveToolDef.parameters),
  execute: async ({ task }) => {
    const targetId = pickActiveTargetId();
    const data = await evalInTarget<SnapshotPayload>(targetId, buildSnapshotExpression());
    return {
      ok: true,
      data: {
        task,
        snapshot: mergeSnapshotData(data, { maxTextLength: MAX_TEXT_LENGTH, maxElements: MAX_SNAPSHOT_ELEMENTS }),
      },
    };
  },
});

export const browserExtractTool = tool({
  description: browserExtractToolDef.description,
  inputSchema: zodSchema(browserExtractToolDef.parameters),
  execute: async ({ query }) => {
    const targetId = pickActiveTargetId();
    const text = await evalInTarget<string>(
      targetId,
      `(() => (document.body && (document.body.innerText || document.body.textContent) || '').toString())()`,
    );
    const trimmed = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
    return { ok: true, data: { query, text: trimmed } };
  },
});

export const browserActTool = tool({
  description: browserActToolDef.description,
  inputSchema: zodSchema(browserActToolDef.parameters),
  execute: async (payload) => {
    const targetId = pickActiveTargetId();
    // 根据结构化 action 分发操作，避免字符串解析误差。
    switch (payload.action) {
      case "click-css": {
        const selector = payload.selector;
        if (!selector) throw new Error("selector is required for click-css.");
        await evalInTarget<void>(
          targetId,
          `(() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) throw new Error('element not found');
            el.scrollIntoView({ block: 'center', inline: 'center' });
            el.click();
          })()`,
        );
        return { ok: true, data: { action: "click", selector } };
      }
      case "click-text": {
        const text = payload.text;
        if (!text) throw new Error("text is required for click-text.");
        // 按可见文本匹配可交互元素，找到后执行点击。
        await evalInTarget<void>(
          targetId,
          `(() => {
            const normalize = (value) => (value || '').toString().replace(/\\s+/g, ' ').trim();
            const wanted = normalize(${JSON.stringify(text)});
            const candidates = Array.from(document.querySelectorAll('a,button,[role="button"],[role="link"],input[type="button"],input[type="submit"]'));
            const match = candidates.find((el) => {
              const label = normalize(el.innerText || el.value || el.getAttribute('aria-label') || '');
              return label.includes(wanted);
            });
            if (!match) throw new Error('element not found');
            match.scrollIntoView({ block: 'center', inline: 'center' });
            match.click();
          })()`,
        );
        return { ok: true, data: { action: "click", text } };
      }
      case "type":
      case "fill": {
        const { selector, text, action } = payload;
        if (text == null) throw new Error("text is required for type/fill.");
        // 中文注释：未指定 selector 时，尝试对当前聚焦元素进行输入。
        const targetExpr = selector
          ? `document.querySelector(${JSON.stringify(selector)})`
          : "document.activeElement";
        await evalInTarget<void>(
          targetId,
          `(() => {
            const el = ${targetExpr};
            if (!el) throw new Error('element not found');
            el.scrollIntoView({ block: 'center', inline: 'center' });
            el.focus && el.focus();
            const v = ${JSON.stringify(text)};
            if ('value' in el) {
              const current = typeof el.value === 'string' ? el.value : '';
              el.value = ${action === "fill" ? "''" : "current"} + v;
            } else if (el.isContentEditable) {
              const current = (el.textContent || '').toString();
              el.textContent = ${action === "fill" ? "''" : "current"} + v;
            } else {
              throw new Error('element is not editable');
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          })()`,
        );
        return { ok: true, data: { action, selector, text } };
      }
      case "press-on": {
        const { selector, key } = payload;
        if (!selector || !key) throw new Error("selector and key are required for press-on.");
        // 先聚焦目标元素，再走 CDP 触发按键，避免页面忽略非信任事件。
        await focusSelector(targetId, selector);
        await dispatchKeyEvent(targetId, key);
        if (String(key).toLowerCase() === "enter") {
          // Enter 无效时，兜底尝试提交最近的表单。
          await submitClosestForm(targetId, selector);
        }
        return { ok: true, data: { action: "press", selector, key } };
      }
      case "press": {
        const { key, selector } = payload;
        if (!key) throw new Error("key is required for press.");
        if (selector) {
          await focusSelector(targetId, selector);
        }
        await dispatchKeyEvent(targetId, key);
        return { ok: true, data: { action: "press", key } };
      }
      case "scroll": {
        const { y } = payload;
        if (typeof y !== "number") throw new Error("y is required for scroll.");
        await evalInTarget<void>(targetId, `window.scrollBy(0, ${Math.trunc(y)});`);
        return { ok: true, data: { action: "scroll", y } };
      }
      default:
        throw new Error("Unsupported action");
    }
  },
});

export const browserWaitTool = tool({
  description: browserWaitToolDef.description,
  inputSchema: zodSchema(browserWaitToolDef.parameters),
  execute: async ({ type, timeoutMs, url, text }) => {
    const targetId = pickActiveTargetId();
    const maxWait = Math.max(0, Math.min(120_000, Number(timeoutMs ?? 30_000)));

    if (type === "timeout") {
      await new Promise<void>((resolve) => setTimeout(resolve, maxWait));
      return { ok: true, data: { waitedMs: maxWait } };
    }

    if (type === "load") {
      await waitUntil({
        targetId,
        timeoutMs: maxWait,
        check: async () =>
          (await evalInTarget<string>(targetId, "document.readyState")) === "complete",
      });
      return { ok: true, data: { type } };
    }

    if (type === "networkidle") {
      // MVP：无网络事件 hook，先按 load 近似处理。
      await waitUntil({
        targetId,
        timeoutMs: maxWait,
        check: async () =>
          (await evalInTarget<string>(targetId, "document.readyState")) === "complete",
      });
      return { ok: true, data: { type, approx: "load" } };
    }

    if (type === "urlIncludes") {
      const keyword = String(url ?? "");
      if (!keyword) throw new Error("url is required for urlIncludes");
      await waitUntil({
        targetId,
        timeoutMs: maxWait,
        check: async () =>
          (await evalInTarget<string>(targetId, "location.href"))
            .includes(keyword),
      });
      return { ok: true, data: { type, urlIncludes: keyword } };
    }

    if (type === "textIncludes") {
      const keyword = String(text ?? "");
      if (!keyword) throw new Error("text is required for textIncludes");
      await waitUntil({
        targetId,
        timeoutMs: maxWait,
        check: async () => {
          const pageText = await evalInTarget<string>(
            targetId,
            `(() => (document.body && (document.body.innerText || document.body.textContent) || '').toString())()`,
          );
          return pageText.includes(keyword);
        },
      });
      return { ok: true, data: { type, textIncludes: keyword } };
    }

    throw new Error("Unsupported wait type");
  },
});
