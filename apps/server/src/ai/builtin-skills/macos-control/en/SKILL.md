---
name: macos-control-skill
description: >
  Triggered when the user asks the AI to directly operate their macOS desktop: open an app, click a button, fill a form inside a native window, read what's currently on screen, automate a local GUI flow. Typical phrasing: "in Finder, please…", "click X in the Y app", "what's on my screen right now". **Available only in OpenLoaf Desktop (macOS)**; other platforms return a desktop-only error — fall back to `BrowserAct` or hand the task back to the user. **Not for**: in-page web interaction (→ `browser-ops-skill`), local file I/O (→ `Read`/`Edit`/`Write`).
tools: [MacosSurvey, MacosObserve, MacosAct, MacosListWindows, MacosCaptureWindow]
---

# macOS Desktop Control Guide

## Core mindset: understand first, then act

**Do not see an app and immediately click.** When a human opens an unfamiliar app they look around first — they notice which region is business UI, where the close button is, what entry points exist. You have to do the same.

Three-phase framework:

```
1. Survey    → MacosSurvey(app)  — get a mental model of the app
2. Plan      → pick a path from the "Recommended path order" the survey gives you
3. Act+Verify → MacosAct executes; MacosObserve confirms the result
```

**Skipping Survey and going straight to Act is the single most common failure mode.** WeChat / QQ / Feishu / DingTalk / Teams are self-drawn — their AX tree exposes only 3 window chrome buttons (close / min / zoom). A model that guesses `path=["0","0"]` lands on the red close button and kills the window. Survey will tell you in advance when you're in that trap.

## Tool inventory

| Tool | When |
|---|---|
| **`MacosSurvey(app)`** | **First call for every new app in a session.** Returns the mental model: known intents, AX richness, menu bar map, window list, recommended path order. Cached per session × app for 5 minutes. |
| `MacosObserve(appFilter?)` | Look at the **current** UI state — screenshot + AX tree + window list. Use after Survey and after every `MacosAct` to verify the result. |
| `MacosAct` | Execute an action. Supports `intent / launch_app / menu_click / applescript / key / click / type / scroll / drag / wait / ax_action`. |
| `MacosListWindows(appFilter?)` | Lighter than Observe — just enumerate windows. Useful when you need a specific window in a multi-window app. |
| `MacosCaptureWindow(windowID)` | Screenshot a specific window by id; covered / off-screen / minimized windows still capture (Window Server keeps the composition buffer). |

All tools are desktop-only. They aren't registered off-macOS; don't try to call them.

## Execution priority (Survey tells you this)

MacosSurvey's response contains a `Recommended path order` section, highest confidence first:

```
1. Known intents       MacosAct type="intent"         100% confidence
2. Menu navigation     MacosAct type="menu_click"     works on self-drawn apps too
3. Keyboard shortcut   MacosAct type="key"            read the shortcut from the menu tree
4. AX path click       MacosAct type="click" ref=...  only when Survey verdict is ax-rich
5. Coord click         MacosAct type="click" point=... last resort, read pixels off a screenshot
```

**Go down the list in order.** Never skip ahead. On apps classified `self-drawn`, step 4 is off-limits — AX path clicks on window chrome buttons are refused (you'll get `WINDOW_CHROME_BLOCKED`).

## What a Survey response looks like

```
App: 微信 (WeChat.app) (com.tencent.xinWeChat, pid=86795)

AX profile: self-drawn — AXWindow children are only chrome buttons
  richness: 0.995 (203 nodes)
  windowChildRoles: [AXCloseButton, AXFullScreenButton, AXMinimizeButton]

Known intents (from registry):
  - id: open_moments    — Open Moments feed
  - id: open_chats      — Switch to chats tab
  - id: open_discover   — Open Discover tab
  ...

Menu bar (34 entries with shortcuts, sample):
  - File > Lock WeChat  (⌘L)
  - View > Chats  (⌘1)
  - View > Moments  (⌘⇧4)
  ...

Windows (2):
  - windowID=227474 visible 1060×859 "Weixin"  (main)
  - windowID=260481 hidden 710×831

Recommended path order:
  1. Known intents (highest confidence): MacosAct type="intent" — 5 registered
  2. Menu navigation: MacosAct type="menu_click" — 34 reachable entries
  3. Keyboard shortcut: MacosAct type="key"
  4. AX path click: **DO NOT USE** on this app.
  5. Coordinate click: last resort.
```

"Known intents" are paths that have been vetted for you. Use them first.

## Typical flows

### A. Open WeChat Moments

```
1. MacosAct { type: "launch_app", app: "WeChat" }
2. MacosSurvey { app: "WeChat" }
   → sees Known intents contains open_moments
3. MacosAct { type: "intent", app: "WeChat", intent: "open_moments" }
4. MacosObserve { appFilter: "WeChat" } — verify Moments is showing
```

Do NOT observe + click AX tree right after launch_app. That's the old path, and it lands on the close button.

### B. Open github.com in Safari

```
1. MacosSurvey { app: "Safari" }
   → Known intents has open_url (requires url arg)
2. MacosAct { type: "intent", app: "Safari", intent: "open_url", args: { url: "https://github.com" } }
3. MacosObserve { appFilter: "Safari" } — verify the page loads
```

### C. Read the screen

User asks "what's on my screen / what's in this app": one `MacosObserve` call — use the screenshot + AX tree to answer. No Survey, no Act needed.

### D. Unregistered intent on an ax-rich app

Survey returns `ax-rich` but no matching intent. Prefer menu_click or key, then AX path click:

```
1. MacosSurvey { app: "Finder" } → ax-rich; recommends menu_click / AX path click
2. Want a new Finder window → menu bar shows "File > New Finder Window (⌘N)"
3. MacosAct { type: "key", keys: ["cmd", "n"] } — shortcut beats click
4. MacosObserve to verify
```

### E. Multi-window (WeChat main + image preview)

```
1. MacosSurvey { app: "WeChat" } → Windows: 2 entries, windowIDs 227474/260481
2. MacosCaptureWindow { windowID: 227474 } — capture the main window directly (even if preview covers it)
3. Subsequent MacosAct click coords are now based on that window's image
```

### F. Native form (AppKit app, ax-rich)

```
1. MacosObserve { appFilter: "..." } to get the text field ref
2. MacosAct { type: "click", ref: { app, path: [...] } } to focus
3. MacosAct { type: "type", text: "..." }
4. MacosAct { type: "ax_action", ref: { app, path: [submit button] }, action: "AXPress" }
5. MacosObserve to verify
```

## When Survey doesn't have the intent you want

1. Look at Survey's `Menu bar` section — almost every app's menu bar is menu_click-able
2. If a menu item has `(⌘⇧X)`, `MacosAct type="key"` is more reliable than `click`
3. Last resort: observe the screenshot, then coord click
4. If none of these work, **stop and tell the user** "I don't have a safe path for this". Don't guess.

## Rules

1. **First contact with an app: Survey first.** Skipping Survey is the #1 failure, especially on self-drawn UIs.
2. **Prefer Survey's first-row recommendation** (Known intents). Going off-script usually crashes.
3. **Observe after every MacosAct.** UI has state; you can't predict the outcome. **Exception**: after a successful `intent` / `menu_click`, if no further action is needed you can skip the verify.
4. **AX path click only on `ax-rich` apps.** `mixed` = cautious; `self-drawn` = forbidden — chrome buttons are hard-blocked (WINDOW_CHROME_BLOCKED).
5. **Coord click is last resort.** Must follow a recent observe. After two coord clicks with no visible change, stop and say you failed to locate.
6. **Sensitive apps in foreground (password manager / bank / Keychain): stop immediately.** Let the user drive.
7. **When permissions are missing**: the settings pane was auto-opened. Tell the user (in prose) to enable OpenLoaf there, wait for confirmation. **Do not retry.**
8. **Non-macOS desktop**: return the desktop-only error, switch to `BrowserAct` or hand back.

## Permissions

First call prompts for missing permissions; the server auto-opens the matching System Settings pane. Required:

- `screen` — Screen Recording (Survey / Observe / CaptureWindow all need it)
- `accessibility` — Accessibility (AX tree + synthetic input)

Some system-level apps need an OpenLoaf Desktop restart after granting.

## Coordinate space (when falling back to point)

`point.{x,y}` refers to pixels on the most recent MacosObserve or MacosCaptureWindow screenshot — read them straight off the image. The tool converts to screen coords automatically; you don't handle retina scale, window offset, or multi-display yourself.

- The `Screenshot: window 2120×1718 px` line in observe/capture_window output is the coordinate range
- You must call observe / capture_window at least once before coord actions; otherwise the tool refuses

## Safety & privacy

- **Do not Survey / Observe / Act on password / bank / Keychain apps** in the foreground. Hand it back to the user.
- Screenshots live in the session asset dir and are cleaned with the session. Not uploaded, not trained on.
- When uncertain about current screen state, observe first. Don't guess.

## Error diagnosis

- `permissionsMissing` → settings pane already opened, prompt user, wait
- `desktop-only` → not running under OpenLoaf Desktop; switch platforms
- `WINDOW_CHROME_BLOCKED` → you clicked a chrome button. Pick one of the 4 suggested fallbacks (menu_click / key / coord / URL). Do NOT add `confirm_window_chrome:true` unless you really do mean to close the window.
- "intent not found" → call `MacosSurvey` to list available intents; otherwise degrade to menu_click.
- Click has no effect → re-observe; check whether the target is really actionable or was covered.
- Foreground switched mid-flow → observe's app no longer matches act's; `key cmd+tab` back first.
