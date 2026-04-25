/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * macOS intent registry — known (app × intent) → deterministic execution
 * path. The point: for common asks like "open WeChat Moments" we shouldn't
 * be letting the model guess AX paths or read screenshot pixels when a
 * menu_click / AppleScript / URL scheme exists and works. Survey exposes
 * these to the model; MacosAct type="intent" routes them to the right
 * underlying action.
 *
 * Adding entries is cheap and reversible — keep them narrow (one intent
 * does one thing) and give every intent at least one fallback strategy so
 * a menu locale change or a weixin:// version drift doesn't kill it.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export type IntentStrategy =
  | {
      kind: 'menu_click'
      /** Menu path from menu bar down: ["View","Moments"] or ["视图","朋友圈"]. */
      path: string[]
      /** Additional paths to try if the first doesn't exist (locale fallback). */
      alt?: string[][]
    }
  | {
      kind: 'applescript'
      /** AppleScript source. `__<argName>__` placeholders are substituted from args. */
      code: string
    }
  | {
      kind: 'url'
      /** URL with `__<argName>__` placeholders (rare — most app URL schemes are unreliable). */
      url: string
    }
  | {
      kind: 'launch_app'
      /** Bundle id or display name — what MacosAct launch_app accepts. */
      app: string
    }

export type IntentArg = {
  name: string
  required: boolean
  describe?: string
}

export type IntentDefinition = {
  /** Stable machine-readable id (lower_snake). */
  id: string
  /** Human-readable one-line summary (shown in Survey output to the model). */
  label: string
  /** Ordered fallback list. First strategy that succeeds wins. */
  strategies: IntentStrategy[]
  /** Declare args that strategies substitute with __<name>__. */
  args?: IntentArg[]
}

export type AppEntry = {
  /** Bundle id, preferred match. */
  bundleId?: string
  /** Display name fallback match (case-insensitive). */
  displayName: string
  /** Human-readable aliases used to match user prompts ("微信", "WeChat"). */
  aliases?: string[]
  intents: IntentDefinition[]
}

/**
 * Built-in registry. Deliberately short — each entry is hand-verified on
 * recent macOS versions. Prefer menu_click over AppleScript (menu_click is
 * pure AX, doesn't need the Automation TCC prompt).
 */
export const BUILTIN_REGISTRY: AppEntry[] = [
  {
    bundleId: 'com.tencent.xinWeChat',
    displayName: 'WeChat',
    aliases: ['微信', 'wechat', 'weixin'],
    intents: [
      {
        id: 'open_moments',
        label: '打开朋友圈 / Open Moments feed',
        strategies: [
          { kind: 'menu_click', path: ['视图', '朋友圈'], alt: [['View', 'Moments']] },
        ],
      },
      {
        id: 'open_chats',
        label: '切换到聊天列表 / Switch to chats tab',
        strategies: [
          { kind: 'menu_click', path: ['视图', '聊天'], alt: [['View', 'Chats']] },
        ],
      },
      {
        id: 'open_contacts',
        label: '打开通讯录 / Open contacts',
        strategies: [
          { kind: 'menu_click', path: ['视图', '通讯录'], alt: [['View', 'Contacts']] },
        ],
      },
      {
        id: 'open_discover',
        label: '打开"发现"页 / Open Discover',
        strategies: [
          { kind: 'menu_click', path: ['视图', '发现'], alt: [['View', 'Discover']] },
        ],
      },
      {
        id: 'lock',
        label: '锁定微信 / Lock WeChat',
        strategies: [
          { kind: 'menu_click', path: ['文件', '锁定微信'], alt: [['File', 'Lock WeChat']] },
        ],
      },
    ],
  },
  {
    bundleId: 'com.apple.Safari',
    displayName: 'Safari',
    intents: [
      {
        id: 'new_tab',
        label: '新建标签页 / Open a new tab',
        strategies: [
          {
            kind: 'applescript',
            code: 'tell application "Safari" to tell front window to set current tab to (make new tab)',
          },
        ],
      },
      {
        id: 'open_url',
        label: '在新标签中打开 URL / Open URL in new tab',
        strategies: [
          {
            kind: 'applescript',
            code:
              'tell application "Safari"\n' +
              '  activate\n' +
              '  if (count of windows) is 0 then make new document\n' +
              '  tell front window to set current tab to (make new tab with properties {URL:"__url__"})\n' +
              'end tell',
          },
        ],
        args: [{ name: 'url', required: true, describe: 'Full URL starting with http(s)://' }],
      },
    ],
  },
  {
    bundleId: 'com.apple.finder',
    displayName: 'Finder',
    intents: [
      {
        id: 'reveal_path',
        label: '在 Finder 中定位文件 / Reveal a POSIX path',
        strategies: [
          {
            kind: 'applescript',
            code:
              'tell application "Finder"\n' +
              '  activate\n' +
              '  reveal POSIX file "__path__" as alias\n' +
              'end tell',
          },
        ],
        args: [{ name: 'path', required: true, describe: 'Absolute POSIX path to file or directory' }],
      },
    ],
  },
  {
    bundleId: 'com.apple.mail',
    displayName: 'Mail',
    intents: [
      {
        id: 'compose',
        label: '写新邮件 / Compose a new message',
        strategies: [
          {
            kind: 'applescript',
            code:
              'tell application "Mail"\n' +
              '  activate\n' +
              '  make new outgoing message with properties {subject:"__subject__", content:"__body__", visible:true}\n' +
              'end tell',
          },
        ],
        args: [
          { name: 'subject', required: false, describe: 'Email subject' },
          { name: 'body', required: false, describe: 'Email body (plain text)' },
        ],
      },
    ],
  },
  {
    bundleId: 'com.apple.iCal',
    displayName: 'Calendar',
    aliases: ['日历'],
    intents: [
      {
        id: 'open_today',
        label: '显示今日 / Show today',
        strategies: [{ kind: 'menu_click', path: ['View', 'Go to Today'], alt: [['显示', '跳转到今天']] }],
      },
    ],
  },
  {
    bundleId: 'com.apple.Notes',
    displayName: 'Notes',
    aliases: ['备忘录'],
    intents: [
      {
        id: 'new_note',
        label: '新建备忘录 / Create a new note',
        strategies: [
          {
            kind: 'applescript',
            code:
              'tell application "Notes"\n' +
              '  activate\n' +
              '  make new note with properties {body:"__body__"}\n' +
              'end tell',
          },
        ],
        args: [{ name: 'body', required: false, describe: 'Note contents (plain text)' }],
      },
    ],
  },
  {
    bundleId: 'com.apple.reminders',
    displayName: 'Reminders',
    aliases: ['提醒事项'],
    intents: [
      {
        id: 'add',
        label: '添加提醒 / Add a reminder',
        strategies: [
          {
            kind: 'applescript',
            code:
              'tell application "Reminders"\n' +
              '  activate\n' +
              '  make new reminder with properties {name:"__title__"}\n' +
              'end tell',
          },
        ],
        args: [{ name: 'title', required: true, describe: 'Reminder title' }],
      },
    ],
  },
]

/**
 * User override file: `~/.openloaf/macos-intents.json`. Must be an array of
 * `AppEntry`. Loaded lazily on first access, cached for the process lifetime;
 * restart server to pick up edits. Missing / malformed files are ignored
 * (logged once to stderr). Entries merge by bundleId — user entries replace
 * built-ins with the same bundleId outright (not intent-level merge, too
 * surprising).
 */
let userOverridesCache: AppEntry[] | null = null
let userOverridesLoaded = false

async function loadUserOverrides(): Promise<AppEntry[]> {
  if (userOverridesLoaded) return userOverridesCache ?? []
  userOverridesLoaded = true
  const p = path.join(os.homedir(), '.openloaf', 'macos-intents.json')
  try {
    const raw = await fs.readFile(p, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      process.stderr.write(`[macosIntentRegistry] ${p} is not a JSON array, ignoring\n`)
      userOverridesCache = []
      return []
    }
    userOverridesCache = parsed as AppEntry[]
    return userOverridesCache
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      process.stderr.write(
        `[macosIntentRegistry] failed to load ${p}: ${err instanceof Error ? err.message : String(err)}\n`,
      )
    }
    userOverridesCache = []
    return []
  }
}

function normalizeAppKey(s: string): string {
  return s.trim().toLowerCase()
}

function appMatches(entry: AppEntry, query: string): boolean {
  const q = normalizeAppKey(query)
  if (entry.bundleId && normalizeAppKey(entry.bundleId) === q) return true
  if (normalizeAppKey(entry.displayName) === q) return true
  for (const alias of entry.aliases ?? []) {
    if (normalizeAppKey(alias) === q) return true
  }
  return false
}

/**
 * Return the registry entry for an app (merged: user overrides replace built-
 * ins by bundleId match). Returns null when the app isn't registered —
 * caller should fall back to generic menu_click / observe + click.
 */
export async function findAppEntry(appQuery: string): Promise<AppEntry | null> {
  const overrides = await loadUserOverrides()
  // Override precedence: if an override matches, return it directly.
  for (const entry of overrides) {
    if (appMatches(entry, appQuery)) return entry
  }
  for (const entry of BUILTIN_REGISTRY) {
    // Suppress built-in if an override targets the same bundleId.
    if (
      entry.bundleId &&
      overrides.some((u) => u.bundleId && normalizeAppKey(u.bundleId) === normalizeAppKey(entry.bundleId!))
    ) {
      continue
    }
    if (appMatches(entry, appQuery)) return entry
  }
  return null
}

export async function findIntent(
  appQuery: string,
  intentId: string,
): Promise<{ app: AppEntry; intent: IntentDefinition } | null> {
  const app = await findAppEntry(appQuery)
  if (!app) return null
  const intent = app.intents.find((i) => i.id === intentId)
  return intent ? { app, intent } : null
}

/**
 * Substitute `__<name>__` placeholders in a strategy body with user-supplied
 * args. Missing required args throw; unknown args are ignored so arg schema
 * can evolve without breaking.
 */
export function substituteArgs(
  template: string,
  args: Record<string, string> | undefined,
  argDefs: IntentArg[] | undefined,
): string {
  const provided = args ?? {}
  for (const def of argDefs ?? []) {
    if (def.required && !(def.name in provided)) {
      throw new Error(`Missing required intent arg: ${def.name}`)
    }
  }
  return template.replace(/__([a-zA-Z_][a-zA-Z0-9_]*)__/g, (_, name) => {
    const v = provided[name]
    return v == null ? '' : String(v)
  })
}
