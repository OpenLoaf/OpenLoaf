/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Translation for the Swift helper's WINDOW_CHROME_BLOCKED refusal.
 *
 * When the model tries to AXPress a ref that resolves to a window chrome
 * button (Close / Minimize / Zoom / FullScreen), the helper throws
 * HelperError.blocked(code: "WINDOW_CHROME_BLOCKED") and we end up here.
 * Rather than surface the raw Swift error text, present a short menu of
 * alternative paths — on self-drawn apps the AX tree often exposes *only*
 * those 3 chrome buttons, so the model (forced to pick something) picked
 * path=["0","0"] and closed the window. This reply teaches it the fallbacks.
 */
import type { Lang } from '@/ai/tools/macosCommon'

export function buildWindowChromeBlockedReply(lang: Lang, detail: string): string {
  if (lang === 'zh') {
    return [
      'MacosAct 拒绝：试图点击窗口的关闭/最小化/缩放按钮。',
      detail ? `（helper: ${detail}）` : '',
      '',
      '这通常意味着：你在看一个自绘 UI（微信/QQ/飞书/钉钉等），AX tree 只暴露了窗口 chrome 按钮，没有业务导航节点——直接按 AX path 点击只会关闭窗口。',
      '',
      '换一条路：',
      '  1. **菜单导航**：MacosAct type="menu_click" app="..." menuPath=["视图","朋友圈"]',
      '  2. **快捷键**：MacosAct type="key" keys=["cmd","1"]（从截图/AX tree 里读 shortcut）',
      '  3. **坐标点击**：直接从截图像素读目标位置，MacosAct type="click" point={x,y}',
      '  4. **URL scheme / AppleScript**：MacosAct type="launch_app" 或 type="applescript"',
      '',
      '如果确实要关窗/最小化/缩放（极少见），重试同一动作并加 confirm_window_chrome: true。',
    ].filter(Boolean).join('\n')
  }
  return [
    'MacosAct refused: attempted to click a window chrome button (close/minimize/zoom).',
    detail ? `(helper: ${detail})` : '',
    '',
    'This usually means the app is self-drawn (WeChat, QQ, Feishu, …) — its AX tree only exposes chrome buttons, and AXPress-ing path=["0","0"] just closes the window.',
    '',
    'Try instead:',
    '  1. **menu_click**: MacosAct type="menu_click" app="..." menuPath=["View","Moments"]',
    '  2. **key shortcut**: MacosAct type="key" keys=["cmd","1"] (read shortcut from screenshot / AX tree)',
    '  3. **coord click**: read pixel coords from the screenshot and MacosAct type="click" point={x,y}',
    '  4. **URL scheme / AppleScript**: MacosAct type="launch_app" or type="applescript"',
    '',
    'If you really do want to close/minimize/zoom (rare), retry the same action with confirm_window_chrome: true.',
  ].filter(Boolean).join('\n')
}
