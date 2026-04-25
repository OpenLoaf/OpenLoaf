/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Intent-to-action router. When the model calls MacosAct type="intent",
 * this rewrites the payload into a concrete action (menu_click /
 * applescript / launch_app) using the registered strategies. The idea is
 * simple: common goals ("open WeChat Moments") should never involve the
 * model guessing AX paths or pixel coords.
 */
import {
  findIntent,
  substituteArgs,
  type IntentStrategy,
} from '@/ai/tools/macosIntentRegistry'
import type { Lang } from '@/ai/tools/macosCommon'

export type IntentActionInput = {
  app: string
  intent: string
  args?: Record<string, string>
}

export type IntentResolution =
  | {
      ok: true
      /** Rewritten action payload ready for the normal act dispatch. */
      rewritten: Record<string, unknown>
      /** Which strategy kind was picked — for logging / progress display. */
      strategyKind: IntentStrategy['kind']
    }
  | { ok: false; error: string }

/**
 * Resolve an intent action into the first registered strategy whose dry
 * check passes. "Dry check" is deliberately minimal — substituting args
 * and verifying required ones exist — because deeper validation (does
 * this menu item actually exist right now?) requires a round-trip to the
 * helper, and menu_click already fails loudly on its own. The point is to
 * catch shape errors early, not duplicate downstream error handling.
 */
export async function resolveIntent(
  params: IntentActionInput,
  lang: Lang,
): Promise<IntentResolution> {
  const hit = await findIntent(params.app, params.intent)
  if (!hit) {
    return {
      ok: false,
      error:
        lang === 'zh'
          ? `intent 未在注册表里找到：app="${params.app}" intent="${params.intent}"。先调 MacosSurvey 查可用 intent。`
          : `Intent not found in registry: app="${params.app}" intent="${params.intent}". Call MacosSurvey to see available intents.`,
    }
  }
  for (const strat of hit.intent.strategies) {
    try {
      switch (strat.kind) {
        case 'menu_click':
          return {
            ok: true,
            strategyKind: 'menu_click',
            rewritten: {
              type: 'menu_click',
              app: hit.app.bundleId ?? hit.app.displayName,
              menuPath: strat.path,
            },
          }
        case 'applescript': {
          const code = substituteArgs(strat.code, params.args, hit.intent.args).trim()
          if (!code) continue
          return {
            ok: true,
            strategyKind: 'applescript',
            rewritten: { type: 'applescript', code },
          }
        }
        case 'url': {
          const url = substituteArgs(strat.url, params.args, hit.intent.args).trim()
          if (!url) continue
          // URLs reuse launch_app's `open` pipeline — `open <url>` handles
          // registered URL schemes too.
          return {
            ok: true,
            strategyKind: 'url',
            rewritten: { type: 'launch_app', app: url },
          }
        }
        case 'launch_app':
          return {
            ok: true,
            strategyKind: 'launch_app',
            rewritten: { type: 'launch_app', app: strat.app },
          }
      }
    } catch (err) {
      // substituteArgs throws on missing required args — bubble as a
      // structured error rather than silently trying the next strategy.
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
  return {
    ok: false,
    error:
      lang === 'zh'
        ? `intent "${params.intent}" 注册表里没有可执行的策略（所有 strategy 都 dry-check 失败）。`
        : `Intent "${params.intent}" has no viable strategy — all dry checks failed.`,
  }
}
