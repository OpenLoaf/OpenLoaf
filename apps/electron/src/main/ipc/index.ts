import { BrowserWindow, ipcMain } from 'electron';
import type { Logger } from '../logging/startupLogger';
import {
  createBrowserWindowForUrl,
  destroyWebContentsView,
  getWebContentsView,
  getWebContentsViewCount,
  upsertWebContentsView,
  type UpsertWebContentsViewArgs,
} from './webContentsViews';

let ipcHandlersRegistered = false;

type BrowserCommandPayload = {
  commandId: string;
  tabId: string;
  viewKey: string;
  cdpTargetId?: string;
  command: { kind: 'snapshot' | 'act' | 'observe' | 'extract' | 'wait'; input?: Record<string, unknown> };
};

/**
 * Get CDP targetId for a given webContents using Electron's debugger API.
 */
async function getCdpTargetId(webContents: Electron.WebContents): Promise<string | undefined> {
  const dbg = webContents.debugger;
  let attachedHere = false;
  try {
    if (!dbg.isAttached()) {
      dbg.attach('1.3');
      attachedHere = true;
    }
    // 通过 Target.getTargetInfo 获取当前 webContents 对应的 CDP targetId。
    const info = (await dbg.sendCommand('Target.getTargetInfo')) as {
      targetInfo?: { targetId?: string };
    };
    const id = String(info?.targetInfo?.targetId ?? '');
    return id || undefined;
  } catch {
    return undefined;
  } finally {
    if (attachedHere) {
      try {
        dbg.detach();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Execute a browser command on a WebContentsView (user-visible).
 */
async function runBrowserCommand(win: BrowserWindow, payload: BrowserCommandPayload) {
  const viewKey = String(payload?.viewKey ?? '').trim();
  if (!viewKey) throw new Error('Missing viewKey');

  const view = getWebContentsView(win, viewKey);
  const wc = view?.webContents;
  if (!wc) throw new Error('WebContentsView not found');

  const kind = payload?.command?.kind;
  const input = payload?.command?.input ?? {};

  /**
   * Evaluate a script in the page context and return the result.
   */
  const evalInPage = async <T>(expression: string): Promise<T> => {
    // MVP：仅做 DOM 读写，不注入第三方脚本。
    return (await wc.executeJavaScript(expression, true)) as T;
  };

  const toStr = (v: unknown) => (typeof v === 'string' ? v : '');

  /**
   * Read visible text from the current document body.
   */
  const readPageText = async () => {
    const text = await evalInPage<string>(
      `(() => (document.body && (document.body.innerText || document.body.textContent) || '').toString())()`,
    );
    // 控制文本体积，避免拖慢 SSE/上下文。
    return text.length > 10_000 ? text.slice(0, 10_000) : text;
  };

  /**
   * Collect a small set of interactive elements for guidance.
   */
  const listInteractiveElements = async () => {
    return await evalInPage<Array<{ selector: string; text?: string; tag: string }>>(
      `(() => {
        const pick = (el) => {
          const tag = (el.tagName || '').toLowerCase();
          const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').toString().trim().slice(0, 80);
          let selector = '';
          if (el.id) selector = '#' + CSS.escape(el.id);
          else if (el.name) selector = tag + '[name="' + CSS.escape(el.name) + '"]';
          else selector = tag;
          return { selector, text, tag };
        };
        const nodes = Array.from(document.querySelectorAll('a,button,input,select,textarea,[role="button"],[role="link"]'));
        return nodes.slice(0, 40).map(pick);
      })()`,
    );
  };

  /**
   * Build a minimal page snapshot for LLM tools.
   */
  const buildPageSnapshot = async () => {
    const url = wc.getURL();
    const title = wc.getTitle();
    const readyState = await evalInPage<string>('document.readyState');
    const text = await readPageText();
    const elements = await listInteractiveElements();
    return { ok: true, data: { url, title, readyState, text, elements } };
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });

  const waitUntil = async (opts: { timeoutMs: number; check: () => Promise<boolean> }) => {
    const start = Date.now();
    while (true) {
      if (await opts.check()) return;
      if (Date.now() - start >= opts.timeoutMs) throw new Error('wait timeout');
      await sleep(150);
    }
  };

  if (kind === 'snapshot') {
    return await buildPageSnapshot();
  }

  if (kind === 'extract') {
    // MVP 先不做“按 instruction 提取”，统一回传可读文本，让 Worker 自己总结/结构化。
    return await buildPageSnapshot();
  }

  if (kind === 'observe') {
    // MVP 先用 snapshot 的 elements 作为候选动作线索；observe 直接复用 snapshot。
    return await buildPageSnapshot();
  }

  if (kind === 'wait') {
    const type = toStr((input as any)?.type);
    const timeoutMs = Math.max(0, Math.min(120_000, Number((input as any)?.timeoutMs ?? 30_000)));
    const urlIncludes = toStr((input as any)?.url);
    const textIncludes = toStr((input as any)?.text);

    if (type === 'timeout') {
      await sleep(timeoutMs);
      return { ok: true, data: { waitedMs: timeoutMs } };
    }

    if (type === 'load') {
      await waitUntil({ timeoutMs, check: async () => (await evalInPage<string>('document.readyState')) === 'complete' });
      return { ok: true, data: { type } };
    }

    if (type === 'networkidle') {
      // MVP：没有网络事件 hook，先按 load 近似处理。
      await waitUntil({ timeoutMs, check: async () => (await evalInPage<string>('document.readyState')) === 'complete' });
      return { ok: true, data: { type, approx: 'load' } };
    }

    if (type === 'urlIncludes') {
      await waitUntil({ timeoutMs, check: async () => wc.getURL().includes(urlIncludes) });
      return { ok: true, data: { type, urlIncludes } };
    }

    if (type === 'textIncludes') {
      await waitUntil({
        timeoutMs,
        check: async () => {
          const text = await evalInPage<string>(
            `(() => (document.body && (document.body.innerText || document.body.textContent) || '').toString())()`,
          );
          return text.includes(textIncludes);
        },
      });
      return { ok: true, data: { type, textIncludes } };
    }

    throw new Error(`Unsupported wait type: ${type}`);
  }

  if (kind === 'act') {
    const action = toStr((input as any)?.action);
    const trimmed = action.trim();
    if (!trimmed) throw new Error('Missing action');

    // MVP 只支持“可解析的结构化动作格式”，避免自然语言歧义导致误操作。
    const clickMatch = /^click\s+css="([^"]+)"$/i.exec(trimmed);
    const typeMatch = /^type\s+css="([^"]+)"\s+text="([^"]*)"$/i.exec(trimmed);
    const fillMatch = /^fill\s+css="([^"]+)"\s+text="([^"]*)"$/i.exec(trimmed);
    const pressMatch = /^press\s+key="([^"]+)"$/i.exec(trimmed);
    const scrollMatch = /^scroll\s+y="(-?\d+)"$/i.exec(trimmed);

    if (clickMatch) {
      const sel = clickMatch[1]!;
      await evalInPage<void>(
        `(() => {
          const el = document.querySelector(${JSON.stringify(sel)});
          if (!el) throw new Error('element not found');
          el.scrollIntoView({ block: 'center', inline: 'center' });
          el.click();
        })()`,
      );
      return { ok: true, data: { action: 'click', selector: sel } };
    }

    if (typeMatch || fillMatch) {
      const sel = (typeMatch ?? fillMatch)![1]!;
      const text = (typeMatch ?? fillMatch)![2] ?? '';
      await evalInPage<void>(
        `(() => {
          const el = document.querySelector(${JSON.stringify(sel)});
          if (!el) throw new Error('element not found');
          el.scrollIntoView({ block: 'center', inline: 'center' });
          el.focus && el.focus();
          if ('value' in el) el.value = '';
          const v = ${JSON.stringify(text)};
          if ('value' in el) el.value = v;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        })()`,
      );
      return { ok: true, data: { action: typeMatch ? 'type' : 'fill', selector: sel, text } };
    }

    if (pressMatch) {
      const key = pressMatch[1]!;
      // MVP：简单 key 事件模拟；复杂组合键后续再补。
      await evalInPage<void>(
        `(() => {
          const k = ${JSON.stringify(key)};
          const el = document.activeElement;
          const down = new KeyboardEvent('keydown', { key: k, bubbles: true });
          const up = new KeyboardEvent('keyup', { key: k, bubbles: true });
          (el || document).dispatchEvent(down);
          (el || document).dispatchEvent(up);
        })()`,
      );
      return { ok: true, data: { action: 'press', key } };
    }

    if (scrollMatch) {
      const y = Number(scrollMatch[1] ?? 0);
      await evalInPage<void>(`window.scrollBy(0, ${Math.trunc(y)});`);
      return { ok: true, data: { action: 'scroll', y } };
    }

    throw new Error('Unsupported action format');
  }

  throw new Error(`Unsupported command kind: ${String(kind)}`);
}

/**
 * 注册主进程 IPC handlers（只注册一次）：
 * - 渲染端通过 preload 暴露的 `window.teatimeElectron` 调用这些能力
 * - 这里保持 handler 数量尽量少、职责清晰
 */
export function registerIpcHandlers(args: { log: Logger }) {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  // 为用户输入的 URL 打开独立窗口（通常用于外部链接）。
  ipcMain.handle('teatime:open-browser-window', async (_event, payload: { url: string }) => {
    const win = createBrowserWindowForUrl(payload?.url ?? '');
    return { id: win.id };
  });

  // 在调用方的 BrowserWindow 内创建/更新 WebContentsView（用于嵌入式浏览面板）。
  ipcMain.handle('teatime:webcontents-view:upsert', async (event, payload: UpsertWebContentsViewArgs) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    upsertWebContentsView(win, payload);
    return { ok: true };
  });

  // 确保某个 viewKey 对应的 WebContentsView 已存在，并返回其 cdpTargetId，供 server attach 控制。
  ipcMain.handle('teatime:webcontents-view:ensure', async (event, payload: { key: string; url: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    const key = String(payload?.key ?? '').trim();
    const url = String(payload?.url ?? '').trim();
    if (!key) throw new Error('Missing view key');
    if (!url) throw new Error('Missing url');

    // 先创建/复用 view；bounds 由渲染端后续 upsert 时持续同步。
    upsertWebContentsView(win, { key, url, bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: false });

    const view = getWebContentsView(win, key);
    const wc = view?.webContents;
    if (!wc) return { ok: false as const };

    const cdpTargetId = await getCdpTargetId(wc);
    return {
      ok: true as const,
      webContentsId: wc.id,
      cdpTargetId,
    };
  });

  // 销毁先前通过 `upsert` 创建的 WebContentsView。
  ipcMain.handle('teatime:webcontents-view:destroy', async (event, payload: { key: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    destroyWebContentsView(win, String(payload?.key ?? ''));
    return { ok: true };
  });

  // 获取当前窗口内 WebContentsView 数量（渲染端用于展示/诊断）。
  ipcMain.handle('teatime:webcontents-view:count', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false as const };
    return { ok: true as const, count: getWebContentsViewCount(win) };
  });

  ipcMain.handle('teatime:browser-command', async (event, payload: BrowserCommandPayload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    return await runBrowserCommand(win, payload);
  });

  args.log('IPC handlers registered');
}
