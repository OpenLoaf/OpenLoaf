/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import { useTranslation } from 'react-i18next'
import {
  GlobeIcon,
  LoaderCircleIcon,
  XCircleIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'
import {
  asPlainObject,
  getToolName,
  isToolStreaming,
  normalizeToolInput,
  type AnyToolPart,
} from './shared/tool-utils'

/** i18n keys for BrowserWait type values. */
const WAIT_TYPE_KEYS: Record<string, string> = {
  timeout: 'tool.browser.waitType.timeout',
  load: 'tool.browser.waitType.load',
  networkidle: 'tool.browser.waitType.networkidle',
  urlIncludes: 'tool.browser.waitType.urlIncludes',
  textIncludes: 'tool.browser.waitType.textIncludes',
}

const WAIT_TYPE_DEFAULTS: Record<string, string> = {
  timeout: '延时',
  load: '加载完成',
  networkidle: '网络空闲',
  urlIncludes: 'URL 变化',
  textIncludes: '文本出现',
}

/** i18n keys for BrowserAct action values. */
const ACT_ACTION_KEYS: Record<string, string> = {
  'click-css': 'tool.browser.action.clickCss',
  'click-text': 'tool.browser.action.clickText',
  type: 'tool.browser.action.type',
  fill: 'tool.browser.action.fill',
  press: 'tool.browser.action.press',
  'press-on': 'tool.browser.action.pressOn',
  scroll: 'tool.browser.action.scroll',
}

const ACT_ACTION_DEFAULTS: Record<string, string> = {
  'click-css': '点击',
  'click-text': '点击文本',
  type: '输入',
  fill: '填写',
  press: '按键',
  'press-on': '按键',
  scroll: '滚动',
}

/**
 * Lightweight browser automation tool renderer (BrowserWait, BrowserAct, etc.)
 * Renders as a single collapsed line matching Grep/Shell style — no border, no card.
 */
export default function BrowserActionTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { t } = useTranslation('ai')
  const toolName = getToolName(part)
  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'
  const isDone = part.state === 'output-available'

  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const inlineHints: string[] = []
  if (typeof inputObj?.type === 'string') {
    const key = WAIT_TYPE_KEYS[inputObj.type]
    const def = WAIT_TYPE_DEFAULTS[inputObj.type]
    inlineHints.push(key ? t(key, { defaultValue: def ?? inputObj.type }) : inputObj.type)
  }
  if (typeof inputObj?.action === 'string') {
    const key = ACT_ACTION_KEYS[inputObj.action]
    const def = ACT_ACTION_DEFAULTS[inputObj.action]
    inlineHints.push(key ? t(key, { defaultValue: def ?? inputObj.action }) : inputObj.action)
  }
  if (typeof inputObj?.query === 'string') inlineHints.push(inputObj.query)
  if (typeof inputObj?.selector === 'string') inlineHints.push(inputObj.selector)
  if (typeof inputObj?.text === 'string') inlineHints.push(inputObj.text)
  if (typeof inputObj?.url === 'string') inlineHints.push(inputObj.url)
  const inlineText = inlineHints.join(' ')

  return (
    <div className={cn('min-w-0 text-xs', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex w-full items-center gap-1.5 rounded-full px-2.5 py-1',
              'transition-colors duration-150 hover:bg-muted/60',
            )}
          >
            <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground">{toolName}</span>
            {inlineText ? (
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
                {inlineText}
              </span>
            ) : null}
            {streaming ? (
              <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
            ) : hasError ? (
              <XCircleIcon className="size-3 shrink-0 text-destructive" />
            ) : isDone ? (
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-500/70" />
            ) : null}
          </div>
        </TooltipTrigger>
        {inlineText ? (
          <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap font-mono text-xs">
            {inlineText}
          </TooltipContent>
        ) : null}
      </Tooltip>
    </div>
  )
}
