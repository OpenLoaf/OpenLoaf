/**
 * 聚焦聊天输入框（textarea）
 * - 统一入口：避免各处散落 querySelector + focus 的实现细节
 * - 默认使用 data attribute 定位：`data-teatime-chat-input="true"`
 */
export function focusChatInput(options?: { root?: ParentNode | null }) {
  // 该方法可能在 SSR/预渲染阶段被调用，需确保只在浏览器执行
  if (typeof window === "undefined") return;

  // 优先在指定 root（例如 Chat 组件根节点）内查找，避免跨 tab/跨面板误聚焦
  const root: ParentNode | Document = options?.root ?? document;

  const doFocus = () => {
    const el = root.querySelector?.<HTMLTextAreaElement>(
      'textarea[data-teatime-chat-input="true"]'
    );
    if (!el) return;
    el.focus();
    // 将光标移动到末尾，便于继续补充内容或直接按 Enter 发送
    const end = el.value.length;
    try {
      el.setSelectionRange(end, end);
    } catch {
      // 某些浏览器/输入法场景可能不允许 setSelectionRange，忽略即可
    }
  };

  // 延迟到下一帧，确保面板切换/折叠动画更新后再聚焦
  if (typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(doFocus);
  } else {
    window.setTimeout(doFocus, 0);
  }
}

